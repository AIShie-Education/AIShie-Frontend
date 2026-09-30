// What the runtime's administrators' page (AI and documents) works out from
// what the runtime says: whether a section is there at all (a runtime from
// before its routes answers 404), the words for each refusal, the names of
// OCR's languages, and the forms for an offer of the school's plan and its
// quotas. For display only: the runtime decides, and its refusals are shown
// by reason. The offer's model is chosen as an owner's own model is, with the
// hosting pages' pieces (hosting.ts).
import { ApiError, read } from '@/api/http'
import { isRuntimeError, isVersionMismatch } from '@/api/runtime'
import type {
  DailyQuota,
  DailyQuotaInput,
  KeyTrialFailure,
  OfferCreate,
  OfferPatch,
  OfferStatus,
  PlanOffer,
  PlanQuotas,
  PriceCreate,
  PricePatch,
  PriceRow,
  ProviderOffer,
} from '@/api/runtime-types'
import { KEY_TRIAL_FAILURES } from '@/api/runtime-types'
import {
  choiceFrom,
  fieldOfPointer,
  formFromModel,
  formProblems,
  hostingErrorText,
  keyProblem,
  type FormField,
  type ModelForm,
  type TagType,
} from '@/views/account/components/agents/hosting'

type T = (key: string, params?: Record<string, unknown>) => string

// --- Is it there? -------------------------------------------------------------------

/**
 * Whether the runtime has no such route: one from before it answers 404
 * (no_route), or 405 for a path it has with other methods alone. Not an
 * offer or agent it has no such one of, nor Core refusing to vouch for the
 * runtime's audience after all (runtime_absent, the whole runtime gone).
 */
export function isNotOffered(e: unknown): boolean {
  if (!isRuntimeError(e)) return false
  if (e.status === 405) return true
  return e.status === 404 && !['offer_not_found', 'agent_not_found', 'runtime_absent'].includes(e.reason)
}

/** Whether the runtime did not answer, or could not: no answer, a gateway's error, or its own 5xx. */
export function isUnreachable(e: unknown): boolean {
  return e instanceof ApiError && (e.isNetwork || e.status >= 500)
}

/** Whether the runtime refused because the caller is not one of its administrators. */
export function isNotAdmin(e: unknown): boolean {
  return isRuntimeError(e) && e.reason === 'not_admin'
}

// --- Who changed it ------------------------------------------------------------------

const names = new Map<string, Promise<string | null>>()

/**
 * The name in AIshie of whoever the runtime says changed something (a Core
 * actor id), asked of Core once per page (actor.get); null when it cannot be
 * read. Kept for the page's life, which ends when the person signs out.
 */
export function actorName(id: string): Promise<string | null> {
  let p = names.get(id)
  if (!p) {
    p = read('actor.get', { actor_id: id }).then(
      (a) => a.display_name || null,
      () => null,
    )
    names.set(id, p)
  }
  return p
}

// --- Refusals ------------------------------------------------------------------------

/**
 * Reasons this page has words of its own for (runtimeAdmin.errors.…),
 * asked before the hosting pages' words, which it shares for the rest
 * (no answer, a rate limit, a key that is not one, a provider not offered).
 */
const ADMIN_REASONS: ReadonlySet<string> = new Set([
  'not_admin',
  'ocr_unavailable',
  'offer_not_found',
  'offer_read_only',
  'offer_not_priced',
  'key_required',
  'model_denied',
  'version_mismatch',
  'bad_if_match',
  'model_not_priced',
  'price_not_found',
  'price_read_only',
])

/** The words for a refusal of one of this page's calls, in the reader's language. */
export function adminErrorText(e: unknown, t: T, opts: { provider?: string; model?: string } = {}): string {
  if (!isRuntimeError(e)) return hostingErrorText(e, t, opts)
  if (isVersionMismatch(e)) return t('runtimeAdmin.errors.version_mismatch')
  if (e.reason === 'offer_exists') {
    const source = e.details?.source === 'config' ? 'config' : 'site'
    return t(`runtimeAdmin.errors.offer_exists.${source}`)
  }
  if (e.reason === 'price_exists') {
    return t(`runtimeAdmin.errors.price_exists.${e.details?.field === '/from' ? 'from' : 'id'}`, {
      id: typeof e.details?.id === 'string' ? e.details.id : '',
    })
  }
  if (e.reason === 'key_test_failed') {
    const trial = keyTrialOf(e)
    return trial
      ? keyTrialText(trial, t, { provider: opts.provider ?? '', model: opts.model ?? '' })
      : t('runtimeAdmin.errors.key_test_failed')
  }
  if (e.reason === 'missing_field' || e.reason === 'invalid_field') {
    const field = typeof e.details?.field === 'string' ? e.details.field : ''
    if (field) return t(`runtimeAdmin.errors.${e.reason}`, { field })
  }
  if (ADMIN_REASONS.has(e.reason)) return t(`runtimeAdmin.errors.${e.reason}`, { provider: opts.provider ?? '' })
  return hostingErrorText(e, t, opts)
}

/** How a key's trial failed (key_test_failed's details), or null for any other error. */
export interface KeyTrial {
  result: KeyTrialFailure
  httpStatus: number | null
  providerCode: string | null
}

export function keyTrialOf(e: unknown): KeyTrial | null {
  if (!isRuntimeError(e) || e.reason !== 'key_test_failed') return null
  const d = e.details ?? {}
  const result = (KEY_TRIAL_FAILURES as readonly string[]).includes(d.result as string)
    ? (d.result as KeyTrialFailure)
    : 'key_refused'
  const status = Number(d.http_status)
  return {
    result,
    httpStatus: d.http_status !== null && Number.isInteger(status) ? status : null,
    providerCode: typeof d.provider_code === 'string' && d.provider_code ? d.provider_code : null,
  }
}

/** What the trial found, in the hosting pages' words for a key test, after this page's lead. */
export function keyTrialText(trial: KeyTrial, t: T, opts: { provider: string; model: string }): string {
  const what = t(`hosting.keyTest.${trial.result}`, { provider: opts.provider, model: opts.model })
  return t('runtimeAdmin.offer.trialFailed', { what })
}

/** The provider's own answer to the trial, for whoever looks: its HTTP status and error code, as given. */
export function keyTrialDetail(trial: KeyTrial, t: T): string {
  const parts: string[] = []
  if (trial.httpStatus !== null) parts.push(t('runtimeAdmin.offer.trialStatus', { status: trial.httpStatus }))
  if (trial.providerCode) parts.push(t('runtimeAdmin.offer.trialCode', { code: trial.providerCode }))
  return parts.join(' · ')
}

// --- OCR's languages -------------------------------------------------------------------

/**
 * Tesseract's languages by their own names, as a language menu lists them:
 * the same in every language of the page. One not named here is shown by its
 * code; a vertical script's (chi_tra_vert) is its language's, said to be
 * vertical.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  chi_tra: '繁體中文',
  chi_sim: '简体中文',
  eng: 'English',
  jpn: '日本語',
  kor: '한국어',
  fra: 'Français',
  deu: 'Deutsch',
  spa: 'Español',
  por: 'Português',
  ita: 'Italiano',
  nld: 'Nederlands',
  rus: 'Русский',
  ukr: 'Українська',
  pol: 'Polski',
  tur: 'Türkçe',
  ara: 'العربية',
  heb: 'עברית',
  hin: 'हिन्दी',
  ben: 'বাংলা',
  tha: 'ไทย',
  vie: 'Tiếng Việt',
  ind: 'Bahasa Indonesia',
  msa: 'Bahasa Melayu',
  fil: 'Filipino',
  lat: 'Latina',
  ell: 'Ελληνικά',
}

/** A language of OCR's, by its name, or its code when it has none here. */
export function languageName(code: string, t: T): string {
  if (code === 'osd' || code === 'equ') return t(`runtimeAdmin.ocr.special.${code}`)
  const vertical = code.endsWith('_vert')
  const base = vertical ? code.slice(0, -'_vert'.length) : code
  const name = LANGUAGE_NAMES[base]
  if (!name) return code
  return vertical ? t('runtimeAdmin.ocr.vertical', { name }) : name
}

/** Whether two lists of languages are the same, order and all (OCR reads them in that order). */
export function sameLanguages(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** At most this many languages at once. */
export const OCR_MAX_LANGUAGES = 8

// --- Offers ---------------------------------------------------------------------------

export const OFFER_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/
export const OFFER_LABEL_MAX = 80

export const OFFER_STATUS_TAG: Record<OfferStatus, TagType> = {
  offered: 'success',
  disabled: 'info',
  id_taken: 'warning',
  model_not_allowed: 'danger',
}

/** An offer's model as the own-model form holds it. */
export function formFromOffer(o: PlanOffer, providers: readonly ProviderOffer[]): ModelForm {
  return formFromModel({ ...o, price_known: o.priced }, providers)
}

export type OfferField = FormField | 'id' | 'label' | 'enabled'

/** The field of the offer's form a JSON Pointer from the runtime names (details.field), or null. */
export function offerFieldOf(pointer: unknown): OfferField | null {
  if (pointer === '/id') return 'id'
  if (pointer === '/label') return 'label'
  if (pointer === '/enabled') return 'enabled'
  return fieldOfPointer(pointer)
}

/** What an offer's dialog holds beside the model: the key is in its field alone, never here. */
export interface OfferMeta {
  id: string
  label: string
  enabled: boolean
}

/**
 * What is wrong with the offer's form as it stands, by field, as message
 * keys (for t with the provider's name); empty when nothing is. A key is
 * checked where one is to be sent (sendingKey), and an id where one is made.
 */
export function offerProblems(opts: {
  meta: OfferMeta
  form: ModelForm
  provider: ProviderOffer | undefined
  creating: boolean
  takenIds: readonly string[]
  sendingKey: boolean
  key: string
}): Partial<Record<OfferField, string>> {
  const out: Partial<Record<OfferField, string>> = { ...formProblems(opts.form, opts.provider) }
  if (opts.creating) {
    const id = opts.meta.id.trim()
    if (!id) out.id = 'hosting.model.invalid.required'
    else if (!OFFER_ID_SHAPE.test(id)) out.id = 'runtimeAdmin.offer.invalid.id'
    else if (opts.takenIds.includes(id)) out.id = 'runtimeAdmin.offer.invalid.idTaken'
  }
  const label = opts.meta.label.trim()
  if (!label) out.label = 'hosting.model.invalid.required'
  else if (label.length > OFFER_LABEL_MAX || /[\r\n]/.test(label)) out.label = 'runtimeAdmin.offer.invalid.label'
  if (opts.sendingKey) {
    const problem = opts.key ? keyProblem(opts.key) : 'runtimeAdmin.offer.invalid.keyRequired'
    if (problem) out.key = problem
  }
  return out
}

/** A new offer, as POST admin/school-plan/offers takes it: the model's members for its provider alone. */
export function offerCreateFrom(opts: {
  meta: OfferMeta
  form: ModelForm
  provider: ProviderOffer
  key: string
  skipKeyTest: boolean
}): OfferCreate {
  const body: OfferCreate = {
    id: opts.meta.id.trim(),
    label: opts.meta.label.trim(),
    ...choiceFrom(opts.form, opts.provider),
    enabled: opts.meta.enabled,
    key: opts.key,
  }
  if (opts.skipKeyTest) body.skip_key_test = true
  return body
}

/**
 * The change to an offer, as a merge-patch: only what differs from the form
 * as it was read (initial), so that a label changed alone keeps the key's
 * trial, and a model the form merely shows the same way is never sent. A
 * provider changed sends the new one's model and endpoint as its kind takes
 * them; key is a new key, or null to keep the one kept.
 */
export function offerPatchFrom(opts: {
  offer: PlanOffer
  initial: ModelForm
  meta: OfferMeta
  form: ModelForm
  provider: ProviderOffer | undefined
  key: string | null
  skipKeyTest: boolean
}): OfferPatch {
  const { offer, initial, form, provider } = opts
  const p: OfferPatch = {}
  const label = opts.meta.label.trim()
  if (label !== offer.label) p.label = label
  if (opts.meta.enabled !== offer.enabled) p.enabled = opts.meta.enabled
  if (provider) {
    const c = choiceFrom(form, provider)
    if (form.provider !== offer.provider) {
      p.provider = c.provider
      p.model = c.model
      if (c.adapter) p.adapter = c.adapter
      if (c.endpoint !== undefined) p.endpoint = c.endpoint
      if (c.resource !== undefined) p.resource = c.resource
      if (c.region !== undefined) p.region = c.region
    } else {
      if (form.adapter !== initial.adapter && c.adapter) p.adapter = c.adapter
      if (form.model.trim() !== initial.model.trim()) p.model = c.model
      const kind = provider.endpoint.kind
      if (kind === 'choice' && form.endpoint !== initial.endpoint) p.endpoint = c.endpoint ?? null
      if (kind === 'azure_resource' && form.resource.trim() !== initial.resource.trim()) p.resource = c.resource
      if (kind === 'bedrock_region' && form.region.trim() !== initial.region.trim()) p.region = c.region
    }
  }
  if (form.maxOutputTokens !== initial.maxOutputTokens) p.max_output_tokens = form.maxOutputTokens ?? null
  if (form.reasoningEffort !== initial.reasoningEffort) p.reasoning_effort = form.reasoningEffort || null
  if (opts.key !== null) {
    p.key = opts.key
    if (opts.skipKeyTest) p.skip_key_test = true
  }
  return p
}

/** Whether a patch changes what the key was tried with (its model, provider or endpoint), without a new key. */
export function retestsKey(p: OfferPatch): boolean {
  if (p.key !== undefined) return false
  return ['provider', 'adapter', 'model', 'endpoint', 'resource', 'region'].some((k) => k in p)
}

// --- Quotas ---------------------------------------------------------------------------

export const QUOTA_MAX = 1_000_000

/** A quota as its field holds it: a whole number from 1 to 1,000,000, or null (per_day alone may be). */
export function quotaProblem(v: number | null | undefined, required: boolean): string | null {
  if (v === null || v === undefined) return required ? 'hosting.model.invalid.required' : null
  if (!Number.isInteger(v) || v < 1 || v > QUOTA_MAX) return 'runtimeAdmin.quotas.invalid'
  return null
}

export function sameQuotas(a: PlanQuotas, b: PlanQuotas): boolean {
  return (
    a.per_owner_day === b.per_owner_day &&
    a.per_asker_day === b.per_asker_day &&
    a.per_day === b.per_day &&
    sameUsd(a.per_owner_day_usd, b.per_owner_day_usd) &&
    sameUsd(a.per_asker_day_usd, b.per_asker_day_usd) &&
    sameUsd(a.per_day_usd, b.per_day_usd)
  )
}

// --- Dollars -----------------------------------------------------------------------------

/** A decimal of at most six places, with no sign or exponent: what the forms take. */
const DECIMAL = /^[0-9]{1,7}(\.[0-9]{1,6})?$/

/** Dollars as a person reads them: the runtime's six places, trimmed to what is needed, and at least cents. */
export function usdShown(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const [whole, frac = ''] = v.split('.')
  const kept = frac.replace(/0+$/, '')
  return `${whole}.${kept.length >= 2 ? kept : kept.padEnd(2, '0')}`
}

/** Dollars as a form field holds them: no trailing zeros ("2.500000" → "2.5"); '' for none. */
export function usdField(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v
}

/** Whether two amounts are the same, whatever places they are written with; none is none. */
export function sameUsd(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a === undefined || a === null || a === '' ? null : Number(a)
  const y = b === undefined || b === null || b === '' ? null : Number(b)
  return x === y
}

/**
 * What is wrong with an amount of dollars typed for a quota, as a message
 * key, or null: empty is none; else more than 0, at most 1,000,000, six
 * places at most, no exponent.
 */
export function usdProblem(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  if (!DECIMAL.test(s) || Number(s) <= 0 || Number(s) > QUOTA_MAX) return 'runtimeAdmin.money.invalidUsd'
  return null
}

/** What is wrong with a price per million tokens typed, as a message key, or null: 0 or more, six places at most. */
export function priceProblem(v: string, required: boolean): string | null {
  const s = v.trim()
  if (!s) return required ? 'hosting.model.invalid.required' : null
  return DECIMAL.test(s) ? null : 'runtimeAdmin.prices.invalid.price'
}

/** An amount typed, as it is sent: the decimal string, or null for none. */
export function usdSent(v: string): string | null {
  return v.trim() || null
}

/** A daily quota as its two fields hold it. */
export interface QuotaFields {
  answers: number | null
  usd: string
}

export function quotaFieldsOf(q: DailyQuota | null | undefined): QuotaFields {
  return { answers: q?.answers ?? null, usd: usdField(q?.usd) }
}

export function quotaInputOf(f: QuotaFields): DailyQuotaInput {
  return { answers: f.answers ?? null, usd: usdSent(f.usd) }
}

/** What is wrong with a daily quota's two fields, by field; empty when nothing. */
export function quotaFieldsProblems(
  f: QuotaFields,
  opts: { oneAtLeast?: boolean } = {},
): { answers?: string; usd?: string } {
  const out: { answers?: string; usd?: string } = {}
  const a = quotaProblem(f.answers, false)
  if (a) out.answers = a
  const u = usdProblem(f.usd)
  if (u) out.usd = u
  if (opts.oneAtLeast && f.answers === null && !f.usd.trim() && !a && !u)
    out.answers = 'runtimeAdmin.tenants.oneAtLeast'
  return out
}

// --- The price table ---------------------------------------------------------------------

export const PRICE_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
export const PRICE_PROVIDER_SHAPE = /^[a-z0-9_]{1,64}$/
export const PRICE_MODEL_SHAPE = /^[^\s]{1,200}$/
const DAY = /^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/

/** Today, UTC, as YYYY-MM-DD: the day a price takes effect from by default. */
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** An id for a new row, from its model and day, as the ledger names rows: "gpt-4.1-mini-2026-09-30". */
export function priceIdFor(model: string, from: string): string {
  const base = `${model.replace(/\*/g, 'x')}-${from}`
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
  return base.slice(0, 64).replace(/[-.]+$/, '')
}

/** What the price dialog holds. */
export interface PriceForm {
  id: string
  provider: string
  model: string
  from: string
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
}

export function emptyPriceForm(today = utcToday()): PriceForm {
  return { id: '', provider: '', model: '', from: today, input: '', output: '', cacheRead: '', cacheWrite: '' }
}

/** A row as the dialog holds it; cache prices the same as input show as empty ("same as input"). */
export function priceFormOf(r: PriceRow): PriceForm {
  const p = r.usd_per_mtok
  const same = (x: string) => (Number(x) === Number(p.input) ? '' : x)
  return {
    id: r.id,
    provider: r.provider,
    model: r.model,
    from: r.from,
    input: p.input,
    output: p.output,
    cacheRead: same(p.cache_read),
    cacheWrite: same(p.cache_write),
  }
}

export type PriceField = keyof PriceForm

/** What is wrong with the price dialog as it stands, by field, as message keys; empty when nothing. */
export function priceProblems(
  f: PriceForm,
  opts: { creating: boolean; takenIds: readonly string[] },
): Partial<Record<PriceField, string>> {
  const out: Partial<Record<PriceField, string>> = {}
  if (opts.creating) {
    const id = f.id.trim()
    if (!id) out.id = 'hosting.model.invalid.required'
    else if (!PRICE_ID_SHAPE.test(id)) out.id = 'runtimeAdmin.prices.invalid.id'
    else if (opts.takenIds.includes(id)) out.id = 'runtimeAdmin.prices.invalid.idTaken'
  }
  const provider = f.provider.trim()
  if (!provider) out.provider = 'hosting.model.invalid.required'
  else if (!PRICE_PROVIDER_SHAPE.test(provider)) out.provider = 'runtimeAdmin.prices.invalid.provider'
  const model = f.model.trim()
  if (!model) out.model = 'hosting.model.invalid.required'
  else if (!PRICE_MODEL_SHAPE.test(model)) out.model = 'runtimeAdmin.prices.invalid.model'
  if (!DAY.test(f.from)) out.from = f.from ? 'runtimeAdmin.prices.invalid.from' : 'hosting.model.invalid.required'
  for (const [k, required] of [
    ['input', true],
    ['output', true],
    ['cacheRead', false],
    ['cacheWrite', false],
  ] as const) {
    const p = priceProblem(f[k], required)
    if (p) out[k] = p
  }
  return out
}

/** A new row, as POST admin/prices takes it: the cache prices only where they differ from input. */
export function priceCreateFrom(f: PriceForm): PriceCreate {
  const usd: PriceCreate['usd_per_mtok'] = { input: f.input.trim(), output: f.output.trim() }
  if (f.cacheRead.trim()) usd.cache_read = f.cacheRead.trim()
  if (f.cacheWrite.trim()) usd.cache_write = f.cacheWrite.trim()
  return { id: f.id.trim(), provider: f.provider.trim(), model: f.model.trim(), from: f.from, usd_per_mtok: usd }
}

/**
 * The change to a row, as a merge-patch: only what differs from the row as
 * read. A cache price emptied is the input's again, sent as that.
 */
export function pricePatchFrom(r: PriceRow, f: PriceForm): PricePatch {
  const p: PricePatch = {}
  if (f.provider.trim() !== r.provider) p.provider = f.provider.trim()
  if (f.model.trim() !== r.model) p.model = f.model.trim()
  if (f.from !== r.from) p.from = f.from
  const input = f.input.trim()
  const usd: NonNullable<PricePatch['usd_per_mtok']> = {}
  const was = r.usd_per_mtok
  if (Number(input) !== Number(was.input)) usd.input = input
  if (Number(f.output.trim()) !== Number(was.output)) usd.output = f.output.trim()
  const cacheRead = f.cacheRead.trim() || input
  const cacheWrite = f.cacheWrite.trim() || input
  if (Number(cacheRead) !== Number(was.cache_read)) usd.cache_read = cacheRead
  if (Number(cacheWrite) !== Number(was.cache_write)) usd.cache_write = cacheWrite
  if (Object.keys(usd).length) p.usd_per_mtok = usd
  return p
}

/** The field of the price dialog a JSON Pointer names. */
export function priceFieldOf(pointer: unknown): PriceField | null {
  switch (pointer) {
    case '/id':
      return 'id'
    case '/provider':
      return 'provider'
    case '/model':
      return 'model'
    case '/from':
      return 'from'
    case '/usd_per_mtok/input':
      return 'input'
    case '/usd_per_mtok/output':
      return 'output'
    case '/usd_per_mtok/cache_read':
      return 'cacheRead'
    case '/usd_per_mtok/cache_write':
      return 'cacheWrite'
  }
  return null
}

// --- Costs ---------------------------------------------------------------------------------

/** The longest span a cost report takes, in days. */
export const COST_SPAN_DAYS = 366

/** The runtime's own default span: the thirty days to until, inclusive. */
export function costRange(until: string): [string, string] {
  const d = new Date(`${until}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 29)
  return [d.toISOString().slice(0, 10), until]
}

/** A model of the plan without a price, as a notice lists it. */
export interface UnpricedItem {
  /** The offer's id. */
  id: string
  /** Its name, where it is known. */
  label?: string
  provider: string
  model: string
}

/**
 * The offers a refusal names (offer_not_priced's details.offers) as the
 * notice lists them: by the plan's offers, and by extra for one not in it
 * yet (the one being added); one not found is left out.
 */
export function unpricedItems(
  ids: readonly string[],
  offers: readonly PlanOffer[],
  extra: UnpricedItem[] = [],
): UnpricedItem[] {
  const out: UnpricedItem[] = []
  for (const id of ids) {
    const o = offers.find((x) => x.id === id && x.status !== 'id_taken') ?? offers.find((x) => x.id === id)
    const item = o ? { id, label: o.label, provider: o.provider, model: o.model } : extra.find((x) => x.id === id)
    if (item && !out.some((x) => x.id === id)) out.push(item)
  }
  return out
}

/** The offers a refusal says have no price (offer_not_priced's details.offers), or []. */
export function unpricedIds(e: unknown): string[] {
  if (!isRuntimeError(e) || e.reason !== 'offer_not_priced') return []
  const o = e.details?.offers
  return Array.isArray(o) ? o.filter((x): x is string => typeof x === 'string') : []
}
