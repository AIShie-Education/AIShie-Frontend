// What the pages that host an agent on the school's runtime (M2, F2 and F3)
// work out from what the runtime and Core say: the words for each error
// reason and status, a seat's sentences, which token is the runtime's and
// which others are in use, and the model form's choice. For display only:
// the runtime and Core decide, and their refusals are shown by reason.
import { ApiError } from '@/api/http'
import { isRuntimeError } from '@/api/runtime'
import type {
  EndpointOffer,
  HostedStatus,
  OwnModel,
  OwnModelChoice,
  ProviderOffer,
  ReasoningEffort,
  Seat,
} from '@/api/runtime-types'
import { REASONING_EFFORTS } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { credentialState } from '../credentials'

type T = (key: string, params?: Record<string, unknown>) => string

/** The label of the token this page issues for the runtime, in Core's Tokens list. */
export const RUNTIME_TOKEN_LABEL = 'AIShie runtime'

/**
 * How recent a use of one of the agent's other tokens counts as something
 * else running it now. Core notes a use at most once a minute, and a runtime
 * that is running asks for work at least every minute or two; ten minutes
 * leaves room for a quiet spell without taking a runtime stopped an hour ago
 * for one still running.
 */
export const RECENT_USE_MS = 10 * 60_000

/**
 * What the wizard does with the token it issues: host the agent (connect),
 * or give a hosted one a new token (replace; reconnect, when AIShie refused
 * the one it had).
 */
export type HostMode = 'connect' | 'replace' | 'reconnect'

/** An agent token as Core makes it: what inspect and connect take (§5.5). */
export const AGENT_TOKEN_SHAPE = /^ais_[a-z2-7]{12}_[A-Za-z0-9_-]{32,128}$/

// --- Errors ------------------------------------------------------------------------

/**
 * The message key for a reason, under hosting (§9.5), or null for one that
 * gets the app's generic words (the request itself was wrong: a bug here,
 * not something the person can mend).
 */
const REASON_KEY: Record<string, string> = {
  assertion_missing: 'errors.assertion',
  assertion_malformed: 'errors.assertion',
  assertion_invalid: 'errors.assertion',
  assertion_expired: 'errors.assertion',
  keys_unavailable: 'errors.unavailable',
  store_unavailable: 'errors.unavailable',
  runtime_unavailable: 'errors.unavailable',
  invalid_response: 'errors.unavailable',
  network: 'errors.network',
  account_refused: 'unavailable.account',
  runtime_absent: 'unavailable.absent',
  core_unavailable: 'errors.core_unavailable',
  rate_limited: 'errors.rate_limited',
  token_malformed: 'errors.token_malformed',
  token_refused: 'errors.token_refused',
  token_not_agent: 'errors.token_not_agent',
  agent_suspended: 'errors.agent_suspended',
  token_other_agent: 'errors.token_other_agent',
  agent_unowned: 'errors.agent_unowned',
  not_owner: 'errors.not_owner',
  core_too_old: 'errors.core_too_old',
  already_hosted: 'errors.already_hosted',
  operator_agent: 'errors.operator_agent',
  agent_not_found: 'errors.agent_not_found',
  version_mismatch: 'errors.version_mismatch',
  school_key_not_offered: 'errors.school_key_not_offered',
  own_key_required: 'errors.own_key_required',
  own_key_provider_mismatch: 'errors.own_key_provider_mismatch',
  model_denied: 'errors.model_denied',
  settings_rejected: 'errors.settings_rejected',
  key_malformed: 'errors.key_malformed',
  unknown_provider: 'errors.unknown_provider',
  adapter_not_offered: 'errors.adapter_not_offered',
  unknown_endpoint: 'errors.unknown_endpoint',
  invalid_field: 'errors.invalid_field',
  // The runtime reads a member only by exactly its name, and takes no query
  // but DELETE's revoke_token (A.3.1, A.3.2): this page never sends another,
  // so one refused is a page older or newer than the runtime. Worded with
  // the name refused, when the runtime gave one.
  unknown_field: 'errors.unknown_field',
  unknown_parameter: 'errors.unknown_parameter',
}

/** Reasons worded with the name the runtime refused (details.field), and generically without one. */
const NAMED_REASONS: ReadonlySet<string> = new Set(['unknown_field', 'unknown_parameter'])

/** Reasons whose words belong on one field of the model form (details.field names it). */
export const FIELD_REASONS: ReadonlySet<string> = new Set([
  'unknown_provider',
  'adapter_not_offered',
  'unknown_endpoint',
  'invalid_field',
  'key_malformed',
])

/** The full message key (hosting.…) for an error's reason, or null for the generic words. */
export function hostingErrorKey(e: unknown): string | null {
  if (!isRuntimeError(e)) return null
  if (NAMED_REASONS.has(e.reason) && !fieldNamed(e)) return null
  const k = REASON_KEY[e.reason]
  return k ? `hosting.${k}` : null
}

/** The member or parameter an error names (details.field), or '' when it names none. */
function fieldNamed(e: ApiError): string {
  const f = e.details?.field
  return typeof f === 'string' ? f : ''
}

/**
 * The words for an error from hosting, in the person's language: by the
 * runtime's reason where §9.5 has words for it, and the app's generic words
 * (with the runtime's message) otherwise. provider names the provider for
 * the reasons that say it.
 */
export function hostingErrorText(e: unknown, t: T, opts: { provider?: string } = {}): string {
  const key = hostingErrorKey(e)
  if (!key) return errorMessage(e)
  const err = e as ApiError
  const wait = Number(err.details?.retry_after_seconds)
  return t(key, {
    seconds: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 10,
    provider: opts.provider ?? '',
    field: fieldNamed(err),
  })
}

/** The runtime's already-redacted list of what is wrong with the settings (settings_rejected). */
export function problemsOf(e: unknown): string[] {
  if (!(e instanceof ApiError)) return []
  const p = e.details?.problems
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
}

/** Whether an error is final for the request (a refusal), as the wizard's revoke rule counts it (§9.2). */
export function isDefinitive(e: unknown): boolean {
  return e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401
}

/** Whether nothing can be said of what became of the request: no answer, or the server's failure. */
export function isIndeterminate(e: unknown): boolean {
  return e instanceof ApiError && (e.isNetwork || e.status >= 500 || e.status === 401)
}

// --- Status ------------------------------------------------------------------------

export type TagType = 'success' | 'primary' | 'warning' | 'danger' | 'info'

export const STATUS_TAG: Record<HostedStatus, TagType> = {
  needs_model: 'warning',
  starting: 'primary',
  running: 'success',
  paused: 'info',
  needs_token: 'warning',
  error: 'danger',
  stopped: 'primary',
}

/** Statuses the card watches closely, since they end by themselves soon. */
export function isTransitional(s: HostedStatus): boolean {
  return s === 'starting' || s === 'stopped'
}

/**
 * How long the card waits before asking again (§9.4): every 3 s while the
 * agent is starting or restarting, every 15 s once that has gone on for two
 * minutes, and every 30 s otherwise.
 */
export function pollInterval(status: HostedStatus, transitionalForMs: number): number {
  if (!isTransitional(status)) return 30_000
  return transitionalForMs < 2 * 60_000 ? 3_000 : 15_000
}

// --- Seats --------------------------------------------------------------------------

/** A course as a seat names it: its code, and its section when there is one. */
export function courseLabel(s: Pick<Seat, 'course_code' | 'section'>): string {
  return s.section ? `${s.course_code} · ${s.section}` : s.course_code
}

export type Reads = 'both' | 'material' | 'work' | 'nothing'

export function seatReads(s: Pick<Seat, 'reads_work' | 'reads_material'>): Reads {
  if (s.reads_material && s.reads_work) return 'both'
  if (s.reads_material) return 'material'
  if (s.reads_work) return 'work'
  return 'nothing'
}

export type Silence = 'seatPaused' | 'courseArchived' | 'answeringOff'

/** Why a seat does not answer now, or null when it does. */
export function seatSilence(s: Pick<Seat, 'answers' | 'seat_status' | 'course_status' | 'answer_level'>): Silence | null {
  if (s.answers) return null
  if (s.seat_status !== 'active') return 'seatPaused'
  if (s.course_status === 'archived') return 'courseArchived'
  return 'answeringOff'
}

/**
 * A seat in sentences, built from its structured facts (never the runtime's
 * English): what it is there and what it reads, then whether it answers now
 * and whether its answers wait for approval.
 */
export function seatSentences(s: Seat, t: T): string[] {
  const course = courseLabel(s)
  const reads = t(`hosting.seat.reads.${seatReads(s)}`)
  const kind = s.kind === 'course_tutor' ? 'tutor' : s.kind === 'delegate' ? 'delegate' : 'member'
  const out = [t(`hosting.seat.${kind}`, { course, reads })]
  const silence = seatSilence(s)
  if (silence) out.push(t('hosting.seat.silent', { why: t(`hosting.seat.why.${silence}`) }))
  else if (s.answer_level === 'confirm_required') out.push(t('hosting.seat.waitsApproval'))
  return out
}

// --- Tokens --------------------------------------------------------------------------

/** The credential in Core's list that is the runtime's token, by its prefix, whatever its state. */
export function credentialByPrefix(
  creds: readonly AgentCredential[] | null | undefined,
  prefix: string | null | undefined,
): AgentCredential | undefined {
  if (!prefix) return undefined
  return (creds ?? []).find((c) => c.kind === 'api_token' && c.token_prefix === prefix)
}

/**
 * The credential the owner revokes themselves when the runtime could not
 * (§9.4's fallback): an API token with that prefix, not revoked yet.
 */
export function ownerFallbackCredential(
  creds: readonly AgentCredential[] | null | undefined,
  prefix: string | null | undefined,
): AgentCredential | undefined {
  if (!prefix) return undefined
  return (creds ?? []).find((c) => c.kind === 'api_token' && c.token_prefix === prefix && !c.revoked_at)
}

/** Whether a token was used within RECENT_USE_MS of now (a use in the future counts). */
export function usedRecently(c: Pick<AgentCredential, 'last_used_at'>, now = Date.now()): boolean {
  if (!c.last_used_at) return false
  const at = Date.parse(c.last_used_at)
  return Number.isFinite(at) && now - at <= RECENT_USE_MS
}

/**
 * The one-brain rule: the agent's live tokens other than except (the
 * runtime's own, or the one being handed to it) that were used recently.
 * Any of them means something else is running the agent now, and hosting it
 * too would give it two brains that both answer.
 */
export function otherRecentTokens(
  creds: readonly AgentCredential[] | null | undefined,
  except: string | null | undefined,
  now = Date.now(),
): AgentCredential[] {
  return (creds ?? []).filter(
    (c) =>
      c.kind === 'api_token' &&
      credentialState(c, now) === 'active' &&
      (!except || c.token_prefix !== except) &&
      usedRecently(c, now),
  )
}

// --- The model form -----------------------------------------------------------------

export const MODEL_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/
export const RESOURCE_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
export const REGION_SHAPE = /^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]{1,2}$/
export const MAX_OUTPUT_TOKENS = { min: 256, max: 32000 }

/** What the model form holds, apart from the key (which is never kept beside it). */
export interface ModelForm {
  provider: string
  adapter: string
  /** A choice id, for endpoint kind "choice". */
  endpoint: string
  /** For endpoint kind "azure_resource". */
  resource: string
  /** For endpoint kind "bedrock_region". */
  region: string
  model: string
  maxOutputTokens: number | null
  reasoningEffort: ReasoningEffort | ''
}

export function emptyModelForm(): ModelForm {
  return {
    provider: '',
    adapter: '',
    endpoint: '',
    resource: '',
    region: '',
    model: '',
    maxOutputTokens: null,
    reasoningEffort: '',
  }
}

export function offerFor(offers: readonly ProviderOffer[], provider: string): ProviderOffer | undefined {
  return offers.find((o) => o.provider === provider)
}

export function providerLabel(offers: readonly ProviderOffer[] | null | undefined, provider: string): string {
  return offerFor(offers ?? [], provider)?.label ?? provider
}

/** The form's defaults for a provider: its first API style and first endpoint choice. */
export function defaultsFor(form: ModelForm, offer: ProviderOffer | undefined): ModelForm {
  const out = { ...form, provider: offer?.provider ?? form.provider }
  out.adapter = offer?.adapters[0] ?? ''
  out.endpoint = offer?.endpoint.kind === 'choice' ? (offer.endpoint.choices[0]?.id ?? '') : ''
  out.resource = ''
  out.region = offer?.endpoint.kind === 'bedrock_region' ? (offer.endpoint.suggested[0] ?? '') : ''
  return out
}

/** The form for the model an agent has, or empty when it has none (or one of a provider not offered). */
export function formFromModel(own: OwnModel | null | undefined, offers: readonly ProviderOffer[]): ModelForm {
  if (!own) return emptyModelForm()
  const offer = offerFor(offers, own.provider)
  const form = defaultsFor({ ...emptyModelForm(), provider: own.provider }, offer)
  if (offer?.adapters.includes(own.adapter)) form.adapter = own.adapter
  if (own.endpoint) form.endpoint = own.endpoint
  if (own.resource) form.resource = own.resource
  if (own.region) form.region = own.region
  form.model = own.model
  form.maxOutputTokens = own.max_output_tokens ?? null
  form.reasoningEffort = (REASONING_EFFORTS as readonly string[]).includes(own.reasoning_effort ?? '')
    ? (own.reasoning_effort as ReasoningEffort)
    : ''
  return form
}

function endpointMembers(form: ModelForm, endpoint: EndpointOffer): Partial<OwnModelChoice> {
  switch (endpoint.kind) {
    case 'choice':
      return form.endpoint ? { endpoint: form.endpoint } : {}
    case 'azure_resource':
      return { resource: form.resource.trim() }
    case 'bedrock_region':
      return { region: form.region.trim() }
    default:
      return {}
  }
}

/**
 * The choice the runtime is sent: only the members that apply to the
 * provider's endpoint kind (another is a 400 invalid_field), and the
 * optional ones only when set.
 */
export function choiceFrom(form: ModelForm, offer: ProviderOffer): OwnModelChoice {
  const c: OwnModelChoice = { provider: offer.provider, model: form.model.trim() }
  if (form.adapter) c.adapter = form.adapter
  Object.assign(c, endpointMembers(form, offer.endpoint))
  if (form.maxOutputTokens !== null && form.maxOutputTokens !== undefined) c.max_output_tokens = form.maxOutputTokens
  if (form.reasoningEffort) c.reasoning_effort = form.reasoningEffort
  return c
}

/** A stable string for a choice, to tell whether the last key test was of exactly these inputs. */
export function choiceKey(c: OwnModelChoice): string {
  return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k as keyof OwnModelChoice]]))
}

export type FormField = 'provider' | 'adapter' | 'endpoint' | 'resource' | 'region' | 'model' | 'maxOutputTokens' | 'reasoningEffort' | 'key'

/** The form field a JSON Pointer from the runtime names (details.field), or null. */
export function fieldOfPointer(pointer: unknown): FormField | null {
  // /provider or /model/own/provider, /key or /own_key/value: the last segment says which.
  if (typeof pointer !== 'string') return null
  const leaf = pointer.split('/').pop()
  switch (leaf) {
    case 'provider':
    case 'adapter':
    case 'endpoint':
    case 'resource':
    case 'region':
    case 'model':
      return leaf
    case 'max_output_tokens':
      return 'maxOutputTokens'
    case 'reasoning_effort':
      return 'reasoningEffort'
    case 'key':
    case 'value':
      return 'key'
  }
  return null
}

/** What is wrong with the form as it stands, by field, as message keys (hosting.…); empty when nothing. */
export function formProblems(form: ModelForm, offer: ProviderOffer | undefined): Partial<Record<FormField, string>> {
  const out: Partial<Record<FormField, string>> = {}
  if (!offer) {
    out.provider = 'hosting.model.invalid.required'
    return out
  }
  if (!form.model.trim()) out.model = 'hosting.model.invalid.required'
  else if (!MODEL_SHAPE.test(form.model.trim())) out.model = 'hosting.model.invalid.model'
  if (offer.endpoint.kind === 'azure_resource' && !RESOURCE_SHAPE.test(form.resource.trim())) {
    out.resource = form.resource.trim() ? 'hosting.model.invalid.resource' : 'hosting.model.invalid.required'
  }
  if (offer.endpoint.kind === 'bedrock_region' && !REGION_SHAPE.test(form.region.trim())) {
    out.region = form.region.trim() ? 'hosting.model.invalid.region' : 'hosting.model.invalid.required'
  }
  if (offer.endpoint.kind === 'choice' && form.endpoint && !offer.endpoint.choices.some((c) => c.id === form.endpoint)) {
    out.endpoint = 'hosting.errors.unknown_endpoint'
  }
  const n = form.maxOutputTokens
  if (n !== null && (!Number.isInteger(n) || n < MAX_OUTPUT_TOKENS.min || n > MAX_OUTPUT_TOKENS.max)) {
    out.maxOutputTokens = 'hosting.model.invalid.maxOutputTokens'
  }
  return out
}

/**
 * A Core token or invitation anywhere in a string, as Core makes them: ais_
 * or aisinv_, a 12-character public prefix, _ and the secret. The runtime
 * looks for the same (A.3.7).
 */
const CORE_TOKEN_INSIDE = /ais(?:inv)?_[a-z2-7]{12}_[A-Za-z0-9_-]{16,}/

/**
 * Whether what was pasted as a provider's key is an AIShie token instead, a
 * person's or an agent's: one that begins as a Core token or invitation
 * does, or holds one anywhere (in quotes, or after other text). The runtime
 * refuses it as key_malformed, and it must never go to a provider.
 */
export function isAishieToken(key: string): boolean {
  return key.startsWith('ais_') || key.startsWith('aisinv_') || CORE_TOKEN_INSIDE.test(key)
}

/**
 * Whether a key could be one the runtime takes (§5.4): 8 to 4096 printable
 * ASCII characters with no whitespace, and never an AIShie token, which
 * must never go to a provider (nor, as a key, to the runtime).
 */
export function isKeyShaped(key: string): boolean {
  if (key.length < 8 || key.length > 4096) return false
  if (!/^[\x21-\x7e]+$/.test(key)) return false
  return !isAishieToken(key)
}

/**
 * The message key (hosting.…) for what is wrong with a key, or null when
 * nothing is: an AIShie token pasted in its place is said to be one, so
 * that its owner knows to paste the provider's key instead.
 */
export function keyProblem(key: string): string | null {
  if (isAishieToken(key)) return 'hosting.errors.key_is_aishie_token'
  return isKeyShaped(key) ? null : 'hosting.errors.key_malformed'
}
