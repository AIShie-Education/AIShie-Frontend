// Exporting conversations for audit (conversation.export, and
// conversation.export_file for a file of one again): what the page offers
// whom, what it sends, how it keeps the idempotency key of an export not yet
// answered, the links it holds to download the files, and the exports this
// browser remembers for each administrator.
//
// Root and the platform's administrators export a course's conversations, a
// department's (and those beneath it) or the whole site's; a department's
// administrator a course or a department of theirs, never the whole site.
// Core decides: this only decides what is offered.
//
// An export can take minutes, and its answer is given once: the links to its
// files (downloads) come with the first answer alone, last about fifteen
// minutes and are never kept by Core. A call that got no answer (the network,
// a gateway, a rate limit) is sent again under the same key, in this tab even
// after a reload, so that Core gives what it made rather than exporting twice;
// its answer then has no links, and the files are asked for again
// (conversation.export_file) until the export's own expires_at, when its files
// are deleted.
import { reactive, shallowRef } from 'vue'
import dayjs from 'dayjs'
import { ApiError, blobUrl, newIdempotencyKey, read, write, type ToolIn, type ToolOut } from '@/api/http'
import { coreNow } from '@/api/clock'
import { errorMessage } from '@/composables/useErrors'
import type { DepartmentNode } from '@/api/types'
import { administeredRoots, childrenOf, type DeptTree, type Destination } from '@/utils/departmentTree'
import { formatBytes, formatNumber } from '@/utils/format'
import { i18n } from '@/i18n'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})

/**
 * Where this browser remembers each administrator's exports
 * (aishie.conversationExports.<actor id>, localStorage), each until its files
 * are deleted, and the export a tab asked for and got no answer to
 * (aishie.conversationExportPending.<actor id>, sessionStorage), until Core
 * answers it. Each is the caller's alone: another administrator signed in
 * here reads their own.
 */
export const CONVERSATION_EXPORTS_PREFIX = 'aishie.conversationExports.'
export const CONVERSATION_EXPORT_PENDING_PREFIX = 'aishie.conversationExportPending.'

export type ExportArgs = ToolIn<'conversation.export'>
export type ExportResult = ToolOut<'conversation.export'>
export type ExportFileOut = ToolOut<'conversation.export_file'>
export type ExportFile = NonNullable<ExportResult['files']>[number]
export type ExportFormat = 'jsonl' | 'csv'
/** The files of an export, in the order Core lists them. */
export const FORMATS: readonly ExportFormat[] = ['jsonl', 'csv']

// --- Who may export what ---------------------------------------------------------------------

/** What an export is about: a course, a department and everything beneath it, or the whole site. */
export type ScopeKind = 'course' | 'department' | 'site'

/**
 * The scopes the caller is offered: all three for root and the platform's
 * administrators; a course or a department for a department's
 * administrator, who never exports the whole site; nothing for anyone else.
 */
export function scopeChoices(caller: { isAdmin: boolean; isDeptAdmin: boolean }): ScopeKind[] {
  if (caller.isAdmin) return ['course', 'department', 'site']
  if (caller.isDeptAdmin) return ['course', 'department']
  return []
}

/**
 * The departments a caller may export, as a tree to choose from: those they
 * administer, from where their appointments begin (every one, for a platform
 * administrator), each with those beneath it.
 */
export function departmentChoices(tree: DeptTree): Destination[] {
  const build = (n: DepartmentNode, seen: Set<string>): Destination => {
    seen.add(n.id)
    const kids = childrenOf(tree, n.id)
      .filter((c) => c.administers && !seen.has(c.id))
      .map((c) => build(c, seen))
    const d: Destination = { value: n.id, label: n.name, disabled: false }
    if (kids.length) d.children = kids
    return d
  }
  const seen = new Set<string>()
  return administeredRoots(tree).map((r) => build(r, seen))
}

// --- The form ---------------------------------------------------------------------------------

export interface ExportForm {
  scope: ScopeKind
  /** The course, for scope course. */
  courseId: string
  /** The department, for scope department: its courses and those of every department beneath it. */
  deptId: string
  /** Only the conversations this person asked in or this agent answered: '' for everyone's. */
  participantId: string
  /** The first day, YYYY-MM-DD on this browser's calendar; '' for no start. */
  fromDate: string
  /** The last day, included, YYYY-MM-DD on this browser's calendar; '' for no end. */
  toDate: string
}

/** What the form shows of what was chosen, to be said again where the ids alone would not do. */
export interface ExportLabels {
  /** The course's code, section and title, or the department's path. */
  scope?: string
  participant?: string
}

export function emptyForm(scope: ScopeKind = 'course'): ExportForm {
  return { scope, courseId: '', deptId: '', participantId: '', fromDate: '', toDate: '' }
}

/** What stops the form being sent: a scope not offered, no course or department chosen, or a last day before the first. */
export type FormProblem = 'scope' | 'course' | 'department' | 'dates'

export function formProblems(form: ExportForm, choices: readonly ScopeKind[]): FormProblem[] {
  const out: FormProblem[] = []
  if (!choices.includes(form.scope)) out.push('scope')
  else if (form.scope === 'course' && !form.courseId) out.push('course')
  else if (form.scope === 'department' && !form.deptId) out.push('department')
  if (form.fromDate && form.toDate && form.toDate < form.fromDate) out.push('dates')
  return out
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Midnight at the start of a day on this browser's calendar, as RFC 3339 with
 * the offset of this browser's time zone on that day:
 * 2026-09-01 → 2026-09-01T00:00:00+08:00.
 */
export function startOfDay(date: string): string {
  if (!DATE.test(date)) throw new Error(`not a date: ${date}`)
  return dayjs(date).startOf('day').format()
}

/**
 * The end of a day, included, as Core's exclusive `before`: midnight at the
 * start of the next day on this browser's calendar, with that day's offset
 * (which is not the first's where the clocks change between them).
 */
export function endOfDayExclusive(date: string): string {
  if (!DATE.test(date)) throw new Error(`not a date: ${date}`)
  return dayjs(date).add(1, 'day').startOf('day').format()
}

/** What conversation.export is sent for the form: only what was chosen, and the days as instants with their offsets. */
export function exportArgs(form: ExportForm): ExportArgs {
  const args: ExportArgs = {}
  if (form.scope === 'course') args.course_id = form.courseId
  if (form.scope === 'department') args.within_dept_id = form.deptId
  if (form.participantId) args.participant_actor_id = form.participantId
  if (form.fromDate) args.from = startOfDay(form.fromDate)
  if (form.toDate) args.before = endOfDayExclusive(form.toDate)
  return args
}

/** This browser's time zone, as the reader knows it (Asia/Hong_Kong), and its offset now (+08:00). */
export function timeZone(): { name: string; offset: string } {
  let name = ''
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    /* an engine without time zones: the offset alone */
  }
  return { name, offset: dayjs().format('Z') }
}

// --- The key of an export not yet answered ----------------------------------------------------

/**
 * An export asked for and not yet answered: its key, what it asked (as sent,
 * to tell whether a new ask is the same), and the form and labels it was
 * asked from, to show it again after a reload.
 */
export interface PendingExport {
  key: string
  args: string
  form: ExportForm
  labels: ExportLabels
  /** When it was asked, on this browser's clock. */
  at: string
}

const pendingKey = (actorId: string) => CONVERSATION_EXPORT_PENDING_PREFIX + actorId
/** Kept in memory as well, for a browser that refuses storage. */
const pendingHeld = new Map<string, PendingExport>()

function isPending(v: unknown): v is PendingExport {
  const p = v as PendingExport
  return (
    !!p &&
    typeof p.key === 'string' &&
    typeof p.args === 'string' &&
    typeof p.at === 'string' &&
    !!p.form &&
    typeof p.form.scope === 'string'
  )
}

/** The export this caller asked for in this tab and got no answer to, if any. */
export function pendingExport(actorId: string): PendingExport | null {
  const held = pendingHeld.get(actorId)
  if (held) return held
  try {
    const raw = sessionStorage.getItem(pendingKey(actorId))
    const v = raw ? JSON.parse(raw) : null
    if (isPending(v)) {
      pendingHeld.set(actorId, v)
      return v
    }
  } catch {
    /* no storage, or not ours: nothing pending */
  }
  return null
}

/**
 * The idempotency key to ask for this export under: the one it was asked
 * under before, while Core has not answered that ask and the export asked is
 * the same; otherwise a new one, kept (in this tab, through a reload) until
 * Core answers.
 */
export function keyFor(
  actorId: string,
  args: ExportArgs,
  from: { form: ExportForm; labels: ExportLabels },
  now = new Date(),
): string {
  const sent = JSON.stringify(args)
  const before = pendingExport(actorId)
  if (before && before.args === sent) return before.key
  const p: PendingExport = {
    key: newIdempotencyKey(),
    args: sent,
    form: { ...from.form },
    labels: { ...from.labels },
    at: now.toISOString(),
  }
  pendingHeld.set(actorId, p)
  try {
    sessionStorage.setItem(pendingKey(actorId), JSON.stringify(p))
  } catch {
    /* no storage: kept for this page's life */
  }
  return p.key
}

/** Whether nothing came back from Core: no answer, a gateway, the server, a rate limit. Sent again, it is the same ask. */
export function unanswered(e: unknown): boolean {
  return e instanceof ApiError && (e.isNetwork || e.status >= 500 || e.code === 'rate_limited')
}

/**
 * Core has answered the ask (with an export, or a refusal, which the same key
 * would only repeat): its key is done with. Without an answer (e, unanswered)
 * it is kept, for the same ask again.
 */
export function settleKey(actorId: string, e?: unknown) {
  if (e !== undefined && unanswered(e)) return
  forgetPending(actorId)
}

/** Forgets the export asked and not answered: the key, and what the form showed. */
export function forgetPending(actorId: string) {
  pendingHeld.delete(actorId)
  try {
    sessionStorage.removeItem(pendingKey(actorId))
  } catch {
    /* no storage: nothing kept there */
  }
}

// --- Running an export ------------------------------------------------------------------------

/** An export as the page holds it: Core's answer, and whether it was the answer to an ask made before (no links then). */
export interface Exported {
  result: ExportResult
  replayed: boolean
}

/**
 * Exports, under the key keyFor gives. Rejects with Core's refusal, or with
 * no answer (the key is kept for the same ask again).
 */
export async function runExport(
  actorId: string,
  args: ExportArgs,
  from: { form: ExportForm; labels: ExportLabels },
): Promise<Exported> {
  const key = keyFor(actorId, args, from)
  try {
    const out = await write('conversation.export', args, { idempotencyKey: key })
    settleKey(actorId)
    // An export is carried out at once or refused, never proposed: should
    // a Core ever answer otherwise, nothing was exported yet, and that is said.
    if (out.status !== 'executed') {
      throw new ApiError({ status: 202, code: 'proposed', message: 'the export waits for approval' })
    }
    holdLinks(out.result)
    return { result: out.result, replayed: out.replayed }
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'proposed')) settleKey(actorId, e)
    throw e
  }
}

// --- The export under way, and the last one made ------------------------------------------------

/**
 * The last export this page asked for, and what became of it: under way, made
 * (with Core's answer), or refused. It is kept for the page's life, outside
 * the page's view, so that going to another page while it runs and coming
 * back shows it still running, or what came of it.
 */
export interface ExportRun {
  actorId: string
  form: ExportForm
  labels: ExportLabels
  args: ExportArgs
  /** When it was asked, on this browser's clock (Date.now()). */
  startedAt: number
  state: 'running' | 'done' | 'failed'
  exported?: Exported
  error?: ApiError
}

export const lastRun = shallowRef<ExportRun | null>(null)
let running: Promise<ExportRun> | null = null

/**
 * Exports what the form chooses, unless an export of this caller's is under
 * way already (that one is given back): the key of an ask not answered
 * before is used again for the same export, its answer remembered in this
 * browser, and its links held.
 */
export function startExport(actorId: string, form: ExportForm, labels: ExportLabels): Promise<ExportRun> {
  const now = lastRun.value
  if (running && now?.state === 'running' && now.actorId === actorId) return running
  const args = exportArgs(form)
  const run: ExportRun = {
    actorId,
    form: { ...form },
    labels: { ...labels },
    args,
    startedAt: Date.now(),
    state: 'running',
  }
  lastRun.value = run
  const p: Promise<ExportRun> = runExport(actorId, args, { form: run.form, labels: run.labels }).then(
    (exported) => {
      // As it was asked: the form may have been changed meanwhile.
      rememberExport(actorId, exported.result, { scope: run.form.scope, labels: run.labels, args })
      return { ...run, state: 'done' as const, exported }
    },
    (e) => ({
      ...run,
      state: 'failed' as const,
      error: e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) }),
    }),
  )
  running = p.then((done) => {
    if (lastRun.value === run) lastRun.value = done
    running = null
    return done
  })
  return running
}

// --- Links to the files -----------------------------------------------------------------------

export interface DownloadLink {
  url: string
  /** When the link stops working, on Core's clock. */
  expiresAt: string
}

/**
 * A link is taken for gone this long before Core says it stops working: a
 * click on the last second would otherwise start a download the store
 * refuses.
 */
export const LINK_MARGIN_MS = 30_000

/** The links held, by export and format: in memory alone, for this page's life, since each is the means to read the file. */
const links = reactive(new Map<string, DownloadLink>())
const linkKey = (exportId: string, format: string) => `${exportId}/${format}`

/** Holds the links an export's first answer came with. */
export function holdLinks(result: Pick<ExportResult, 'export_id' | 'downloads'>) {
  for (const d of result.downloads ?? []) {
    links.set(linkKey(result.export_id, d.format), { url: d.download_url, expiresAt: d.expires_at })
  }
}

/** The link held for a file of an export, if any (live or not). */
export function heldLink(exportId: string, format: string): DownloadLink | null {
  return links.get(linkKey(exportId, format)) ?? null
}

/** Whether a link still works, on Core's clock, with LINK_MARGIN_MS to spare. */
export function linkLive(link: DownloadLink | null | undefined, now = coreNow()): link is DownloadLink {
  if (!link) return false
  const end = Date.parse(link.expiresAt)
  return Number.isFinite(end) && end - LINK_MARGIN_MS > now
}

/** Asks Core for a new link to a file of an export (conversation.export_file), and holds it. */
export async function freshLink(exportId: string, format: ExportFormat): Promise<ExportFileOut> {
  const out = await read('conversation.export_file', { export_id: exportId, format })
  links.set(linkKey(exportId, format), { url: out.download_url, expiresAt: out.expires_at })
  return out
}

/** A link that works now: the one held while it does, or a new one. */
export async function liveLink(exportId: string, format: ExportFormat): Promise<DownloadLink> {
  const held = heldLink(exportId, format)
  if (linkLive(held)) return held
  await freshLink(exportId, format)
  return heldLink(exportId, format)!
}

/**
 * Saves a file from its link, as Core says to: the browser goes to the URL,
 * which serves the file as an attachment under its name, and nothing is
 * fetched into the page. Through this origin the download attribute names
 * it too; an object store's URL, another origin, opens in a tab of its own,
 * so that a link that no longer works never takes this page's place.
 */
export function saveFile(link: DownloadLink, filename: string) {
  const a = document.createElement('a')
  a.href = blobUrl(link.url)
  if (new URL(a.href, window.location.href).origin === window.location.origin) {
    a.download = filename
  } else {
    a.rel = 'noopener'
    a.target = '_blank'
  }
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Whether an export's files are still kept, on Core's clock. */
export function exportLive(expiresAt: string | null | undefined, now = coreNow()): boolean {
  const end = expiresAt ? Date.parse(expiresAt) : NaN
  return Number.isFinite(end) && end > now
}

// --- The exports this browser remembers -------------------------------------------------------

/**
 * An export as this browser remembers it for its maker, until its files are
 * deleted: what Core said of it (never a link), and what it was about, in the
 * words the form showed.
 */
export interface RememberedExport {
  export_id: string
  as_of: string
  expires_at: string
  conversations: number
  messages: number
  retracted: number
  attachments: number
  proposals: number
  text_bytes: number
  files: ExportFile[]
  scope: ScopeKind
  scope_label?: string
  participant_label?: string
  from?: string
  before?: string
}

/** How many exports are remembered at most, the newest. */
export const REMEMBERED_MAX = 20

const rememberedKey = (actorId: string) => CONVERSATION_EXPORTS_PREFIX + actorId

function isRemembered(v: unknown): v is RememberedExport {
  const r = v as RememberedExport
  return (
    !!r &&
    typeof r.export_id === 'string' &&
    typeof r.as_of === 'string' &&
    typeof r.expires_at === 'string' &&
    typeof r.conversations === 'number' &&
    typeof r.messages === 'number' &&
    Array.isArray(r.files) &&
    r.files.every((f) => !!f && typeof f.format === 'string' && typeof f.filename === 'string')
  )
}

/**
 * What this page made, in memory as well, read instead of storage where the
 * browser refuses to read it, or refused to keep the last list written.
 */
const rememberedHeld = new Map<string, RememberedExport[]>()
const unstored = new Set<string>()

/**
 * The exports remembered for this caller whose files are still kept, newest
 * first. A browser that refuses storage remembers only what this page made;
 * what storage holds that is not such a list is nothing.
 */
export function rememberedExports(actorId: string, now = coreNow()): RememberedExport[] {
  let list: RememberedExport[]
  try {
    if (unstored.has(actorId)) throw new Error('the last list was not kept')
    const raw = localStorage.getItem(rememberedKey(actorId))
    let v: unknown = null
    try {
      v = raw === null ? [] : JSON.parse(raw)
    } catch {
      v = []
    }
    list = Array.isArray(v) ? v.filter(isRemembered) : []
  } catch {
    list = rememberedHeld.get(actorId) ?? []
  }
  return list.filter((r) => exportLive(r.expires_at, now)).sort((a, b) => b.as_of.localeCompare(a.as_of))
}

function keep(actorId: string, list: RememberedExport[]) {
  rememberedHeld.set(actorId, list)
  try {
    if (list.length) localStorage.setItem(rememberedKey(actorId), JSON.stringify(list))
    else localStorage.removeItem(rememberedKey(actorId))
    unstored.delete(actorId)
  } catch {
    // No storage, or full: remembered for this page's life.
    unstored.add(actorId)
  }
}

/** What the page says of an export, and remembers of it: Core's answer without its links, and what it was about. */
export function exportRecord(
  result: ExportResult,
  about: { scope: ScopeKind; labels: ExportLabels; args: ExportArgs },
): RememberedExport {
  return {
    export_id: result.export_id,
    as_of: result.as_of,
    expires_at: result.expires_at,
    conversations: result.conversations,
    messages: result.messages,
    retracted: result.retracted,
    attachments: result.attachments,
    proposals: result.proposals,
    text_bytes: result.text_bytes,
    files: (result.files ?? []).map((f) => ({ ...f })),
    scope: about.scope,
    scope_label: about.labels.scope,
    participant_label: about.labels.participant,
    from: about.args.from ?? undefined,
    before: about.args.before ?? undefined,
  }
}

/** Remembers an export (once, whatever its answer was), for its maker, until its files are deleted. */
export function rememberExport(
  actorId: string,
  result: ExportResult,
  about: { scope: ScopeKind; labels: ExportLabels; args: ExportArgs },
  now = coreNow(),
): RememberedExport[] {
  const entry = exportRecord(result, about)
  const list = [entry, ...rememberedExports(actorId, now).filter((r) => r.export_id !== entry.export_id)].slice(
    0,
    REMEMBERED_MAX,
  )
  keep(actorId, list)
  return list
}

/** Forgets an export: its maker took it off the list, or its files are gone. */
export function forgetExport(actorId: string, exportId: string, now = coreNow()): RememberedExport[] {
  const list = rememberedExports(actorId, now).filter((r) => r.export_id !== exportId)
  keep(actorId, list)
  for (const f of FORMATS) links.delete(linkKey(exportId, f))
  return list
}

/** The files an export lists, by format, in the order FORMATS has them. */
export function filesByFormat(files: readonly ExportFile[] | null | undefined): ExportFile[] {
  const all = files ?? []
  return FORMATS.map((f) => all.find((x) => x.format === f)).filter((x): x is ExportFile => !!x)
}

/** A day as the reader writes it, on this browser's calendar: 1 September 2026, 2026年9月1日. */
const day = (at: string) => dayjs(at).format('LL')

/**
 * The span of time an export chose, in words, on this browser's calendar:
 * from its first day, up to and including the day before its exclusive end
 * (an end at midnight is the end of the day before it).
 */
export function spanWords(from: string | null | undefined, before: string | null | undefined): string {
  const last = before ? day(dayjs(before).subtract(1, 'millisecond').toISOString()) : ''
  if (from && before) return t('auditExport.span.both', { from: day(from), to: last })
  if (from) return t('auditExport.span.from', { from: day(from) })
  if (before) return t('auditExport.span.to', { to: last })
  return t('auditExport.span.all')
}

// --- Refusals ---------------------------------------------------------------------------------

/** The page's words for Core's refusals, by reason. */
export const REFUSALS = 'auditExport.refusal'

export function reasonOf(e: unknown): string | undefined {
  const r = e instanceof ApiError ? e.details?.reason : undefined
  return typeof r === 'string' ? r : undefined
}

/** Whether Core refused because the export would be past its limits. */
export const isTooLarge = (e: unknown) => reasonOf(e) === 'export_too_large'
/** Whether the export's files have been deleted, as every export's are once it is a while old. */
export const isExpired = (e: unknown) => reasonOf(e) === 'export_expired'

/** How much an export Core refused as too large would have held, and its limits, as Core said them. */
export interface TooLarge {
  conversations: number | null
  messages: number | null
  textBytes: number | null
  maxMessages: number | null
  maxBytes: number | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function tooLargeOf(e: unknown): TooLarge | null {
  if (!isTooLarge(e)) return null
  const d = (e as ApiError).details ?? {}
  return {
    conversations: num(d.conversations),
    messages: num(d.messages),
    textBytes: num(d.text_bytes),
    maxMessages: num(d.max_messages),
    maxBytes: num(d.max_bytes),
  }
}

/** A count for a sentence, in the reader's way of writing numbers. */
export const count = (n: number | null | undefined) => (typeof n === 'number' ? formatNumber(n, 0) : '—')

/**
 * A refusal of an export, or of a file of one, in the reader's language: this
 * page's words by reason (too large says how much, and the limits), then for
 * what was not found, then the app's.
 */
export function exportErrorText(e: unknown, of: 'export' | 'file' = 'export'): string {
  const big = tooLargeOf(e)
  if (big) {
    return t('auditExport.refusal.export_too_large', {
      messages: count(big.messages),
      text: formatBytes(big.textBytes),
      conversations: count(big.conversations),
      maxMessages: count(big.maxMessages),
      maxText: formatBytes(big.maxBytes),
    })
  }
  if (e instanceof ApiError && e.isNotFound && !reasonOf(e)) {
    return of === 'file' ? t('auditExport.refusal.fileNotFound') : t('auditExport.refusal.notFound')
  }
  if (e instanceof ApiError && e.code === 'proposed') return t('auditExport.refusal.proposed')
  return errorMessage(e, { reasons: REFUSALS })
}
