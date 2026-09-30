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
  KeyTrialFailure,
  OfferCreate,
  OfferPatch,
  OfferStatus,
  PlanOffer,
  PlanQuotas,
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
])

/** The words for a refusal of one of this page's calls, in the reader's language. */
export function adminErrorText(e: unknown, t: T, opts: { provider?: string; model?: string } = {}): string {
  if (!isRuntimeError(e)) return hostingErrorText(e, t, opts)
  if (isVersionMismatch(e)) return t('runtimeAdmin.errors.version_mismatch')
  if (e.reason === 'offer_exists') {
    const source = e.details?.source === 'config' ? 'config' : 'site'
    return t(`runtimeAdmin.errors.offer_exists.${source}`)
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
  return a.per_owner_day === b.per_owner_day && a.per_asker_day === b.per_asker_day && a.per_day === b.per_day
}
