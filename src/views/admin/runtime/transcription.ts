// The transcriber of documents' text versions (文字版), as the runtime's
// administrators set it on AI and documents → Documents: its settings'
// form, the words and colours of its states, and the one button that gives
// it the credential it calls Core with (runtime-transcribe-api.md §2).
//
// That credential is a service's (Core's service.issue_credential, scope
// document_text), issued here by an administrator and handed straight to the
// runtime (PUT admin/transcription/credential), which keeps it sealed. Its
// token lives in one local variable of handOverServiceCredential, from Core's
// answer until the runtime has it, and is blanked in a finally: it is in no
// reactive state, no storage, no log and no error. Core's answer is taken
// straight from http.ts's write, not useWrite, so that it is kept nowhere
// else either (as hostingFlow.ts does with an agent's token).
import { ApiError, newIdempotencyKey, read, write } from '@/api/http'
import { ensureRuntimeAssertion, isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type {
  TranscriptionBlockedReason,
  TranscriptionCredential,
  TranscriptionCredentialStatus,
  TranscriptionJobStatus,
  TranscriptionOfferStatus,
  TranscriptionPatch,
  TranscriptionSettings,
  TranscriptionState,
} from '@/api/runtime-types'
import type { ListItem } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { isDefinitive, type TagType } from '@/views/account/components/agents/hosting'
import { adminErrorText } from './runtimeAdmin'

type T = (key: string, params?: Record<string, unknown>) => string

/** The service Core issues the transcriber's credentials for. */
export const SERVICE_SCOPE = 'document_text'
/** How many live credentials Core lets the service hold without replace. */
export const MAX_LIVE_CREDENTIALS = 5

/** A credential of the service, as Core lists it: never its secret. */
export type ServiceCredential = ListItem<'service.list_credentials', 'credentials'>

/** The label a credential issued here is given in Core's list: the runtime it is for. */
export function credentialLabel(host = typeof window !== 'undefined' ? window.location.host : ''): string {
  return host ? `runtime ${host}` : 'runtime'
}

// --- The one button ------------------------------------------------------------------

/** Revokes one of the service's credentials in Core; false when that failed. */
export async function revokeServiceCredential(credentialId: string): Promise<boolean> {
  try {
    await write(
      'service.revoke_credential',
      { scope: SERVICE_SCOPE, credential_id: credentialId },
      { idempotencyKey: newIdempotencyKey() },
    )
    return true
  } catch {
    return false
  }
}

/** Issues one credential of the service, under a new key; Core's answer, or its refusal. */
async function issueOnce(label: string, replace: boolean) {
  const out = await write(
    'service.issue_credential',
    { scope: SERVICE_SCOPE, label, ...(replace ? { replace: true } : {}) },
    { idempotencyKey: newIdempotencyKey() },
  )
  if (out.status !== 'executed') {
    throw new ApiError({ status: 409, code: 'failed_precondition', message: 'the credential was not issued' })
  }
  return out.result
}

/** The service's live credentials, as Core lists them. */
export async function liveServiceCredentials(): Promise<ServiceCredential[]> {
  const out = await read('service.list_credentials', { scope: SERVICE_SCOPE })
  return (out.credentials ?? []).filter((c) => c.live)
}

/**
 * Whether the runtime's refusal of a credential is final: a 4xx (not 401,
 * which says nothing of the credential, nor 412), or Core not reached to
 * try it (core_unavailable: nothing was kept), or its store down.
 */
function refusedForGood(e: unknown): boolean {
  if (isDefinitive(e)) return true
  return isRuntimeError(e) && (e.reason === 'core_unavailable' || e.reason === 'store_unavailable')
}

export interface HandedOver {
  /** The transcriber's settings, with the credential it holds now. */
  settings: TranscriptionSettings
  /** Core's id of the credential it holds. */
  credentialId: string
  /** The service's other credentials, revoked: by the issue (replace) or after it. */
  revoked: number
  /** Others that could not be revoked: still live in Core. */
  unrevoked: number
}

/**
 * Issues a credential for the transcriber in Core and hands it to the
 * runtime, as the contract's §2 says:
 *
 * 1. an assertion first, so that a runtime that cannot be called stops the
 *    flow before a credential exists; then the service's live credentials;
 * 2. service.issue_credential without replace; with five live already,
 *    only once confirmReplaceAll says so, and with replace (which revokes
 *    them all, the runtime's too, in the same call); a replay of an
 *    earlier issue comes back without the token, and that credential is
 *    revoked and one more issued under a new key;
 * 3. PUT admin/transcription/credential with the token (and Core's id),
 *    which the runtime tries against Core before it keeps it;
 * 4. taken: the service's other live credentials are revoked, so that only
 *    the runtime's is left. Refused (a 4xx, or Core not reached from the
 *    runtime): the one just issued is revoked, and the refusal thrown. No
 *    answer, or a server's failure: the runtime's settings say whether it
 *    has it after all; it is revoked only when it plainly does not.
 *
 * Resolves null when the administrator did not confirm; rejects with the
 * error that stopped it.
 */
export async function handOverServiceCredential(opts: {
  label?: string
  confirmReplaceAll: (live: number) => Promise<boolean>
}): Promise<HandedOver | null> {
  await ensureRuntimeAssertion()
  const live = await liveServiceCredentials()
  const replace = live.length >= MAX_LIVE_CREDENTIALS
  if (replace && !(await opts.confirmReplaceAll(live.length))) return null

  let token = ''
  let credentialId: string
  let revokedByIssue = 0
  try {
    let out = await issueOnce(opts.label ?? credentialLabel(), replace)
    // A replay of an earlier issue comes back without the token: that one is revoked, and one more issued.
    if (!out.token) {
      await revokeServiceCredential(out.credential_id)
      out = await issueOnce(opts.label ?? credentialLabel(), replace)
    }
    token = out.token ?? ''
    out.token = ''
    credentialId = out.credential_id
    revokedByIssue = out.revoked?.length ?? 0
    if (!token) {
      await revokeServiceCredential(credentialId)
      throw new ApiError({
        status: 409,
        code: 'failed_precondition',
        message: 'Core issued the credential without showing it',
      })
    }
  } catch (e) {
    token = ''
    throw e
  }

  let settings: TranscriptionSettings
  try {
    settings = (await runtimeAdmin.setTranscriptionCredential({ token, credential_id: credentialId })).data
  } catch (e) {
    token = ''
    if (refusedForGood(e)) {
      await revokeServiceCredential(credentialId)
      throw e
    }
    let now: TranscriptionSettings | undefined
    try {
      now = (await runtimeAdmin.settings()).data.transcription
    } catch {
      // Whether the runtime has it cannot be told: leave it, listed in Core; the next issue revokes it.
      throw e
    }
    if (now?.credential.credential_id !== credentialId) {
      await revokeServiceCredential(credentialId)
      throw e
    }
    settings = now
  } finally {
    token = ''
  }

  let revoked = revokedByIssue
  let unrevoked = 0
  if (!replace) {
    for (const c of live) {
      if (c.id === credentialId) continue
      if (await revokeServiceCredential(c.id)) revoked++
      else unrevoked++
    }
  }
  return { settings, credentialId, revoked, unrevoked }
}

/**
 * The public part of a token the runtime shows ("aissvc_ab12cd34ef56…"):
 * Core's token_prefix, which its list names each credential by; '' for none.
 */
export function prefixOfHint(hint: string | null | undefined): string {
  const m = /^aissvc_([A-Za-z0-9]{4,})/.exec(hint ?? '')
  return m ? m[1] : ''
}

/**
 * Takes the credential away from the runtime (DELETE), then revokes it in
 * Core: by the id the runtime was given, or the live credential whose prefix
 * its hint shows. coreRevoked: true when Core revoked it, false when that
 * failed (it may still work), null when Core has no live one to revoke.
 */
export async function withdrawServiceCredential(
  held: TranscriptionCredential,
): Promise<{ settings: TranscriptionSettings; coreRevoked: boolean | null }> {
  const settings = (await runtimeAdmin.deleteTranscriptionCredential()).data
  let id = held.credential_id
  if (!id) {
    const prefix = prefixOfHint(held.hint)
    try {
      id = (prefix && (await liveServiceCredentials()).find((c) => c.token_prefix === prefix)?.id) || null
    } catch {
      return { settings, coreRevoked: false }
    }
  }
  if (!id) return { settings, coreRevoked: null }
  return { settings, coreRevoked: await revokeServiceCredential(id) }
}

/**
 * The words for what stopped a credential's hand-over or withdrawal: the
 * runtime's refusals as the page words them (Core refused the credential it
 * tried: revoked or expired, or not the service's), Core's in its own.
 */
export function credentialErrorText(e: unknown, t: T): string {
  if (isRuntimeError(e)) {
    if (e.reason === 'credential_rejected')
      return t(`runtimeAdmin.transcription.credential.refused.${e.details?.status === 403 ? 'notService' : 'rejected'}`)
    return adminErrorText(e, t)
  }
  return errorMessage(e, { reasons: 'runtimeAdmin.transcription.coreRefusal' })
}

// --- How things stand -----------------------------------------------------------------

export const STATE_TAG: Record<TranscriptionState, TagType> = {
  off: 'info',
  running: 'success',
  standby: 'primary',
  blocked: 'warning',
}

export const CREDENTIAL_TAG: Record<TranscriptionCredentialStatus, TagType> = {
  none: 'info',
  ok: 'success',
  untested: 'warning',
  rejected: 'danger',
}

export const OFFER_STATUS_TAG: Record<TranscriptionOfferStatus, TagType> = {
  ok: 'success',
  not_found: 'danger',
  disabled: 'warning',
  no_file_input: 'danger',
  not_priced: 'warning',
}

export const JOB_STATUS_TAG: Record<TranscriptionJobStatus, TagType> = {
  working: 'primary',
  done: 'success',
  failed: 'danger',
  skipped: 'warning',
  dropped: 'info',
}

/** A blocked reason this page has words for, or null for one it does not know (said generically). */
export function blockedReason(s: TranscriptionSettings): TranscriptionBlockedReason | 'other' | null {
  if (s.state !== 'blocked') return null
  const known: readonly string[] = [
    'no_credential',
    'credential_rejected',
    'no_offer',
    'offer_unavailable',
    'quota_exhausted',
  ]
  return s.blocked_reason && known.includes(s.blocked_reason) ? s.blocked_reason : 'other'
}

// --- The form ---------------------------------------------------------------------------

export const MAX_PAGES_LIMIT = 5000
export const PER_DAY_PAGES_LIMIT = 1_000_000
export const CONCURRENCY_LIMIT = 8

/** What the settings' form holds: the offer, and the three numbers; per_day_pages null for no limit. */
export interface TranscriptionForm {
  offer: string | null
  maxPages: number | null
  perDayPages: number | null
  concurrency: number | null
}

export function formOf(s: TranscriptionSettings): TranscriptionForm {
  return { offer: s.offer, maxPages: s.max_pages, perDayPages: s.per_day_pages, concurrency: s.concurrency }
}

const whole = (v: number | null, lo: number, hi: number) => v !== null && Number.isInteger(v) && v >= lo && v <= hi

/** What is wrong with the form, by field, as message keys; empty when nothing is. */
export function formProblems(f: TranscriptionForm): Partial<Record<keyof TranscriptionForm, string>> {
  const out: Partial<Record<keyof TranscriptionForm, string>> = {}
  if (!whole(f.maxPages, 1, MAX_PAGES_LIMIT)) out.maxPages = 'runtimeAdmin.transcription.invalid.maxPages'
  if (f.perDayPages !== null && !whole(f.perDayPages, 1, PER_DAY_PAGES_LIMIT))
    out.perDayPages = 'runtimeAdmin.transcription.invalid.perDayPages'
  if (!whole(f.concurrency, 1, CONCURRENCY_LIMIT)) out.concurrency = 'runtimeAdmin.transcription.invalid.concurrency'
  return out
}

/** The change, as a merge-patch: only what differs from the settings as read. */
export function patchFrom(s: TranscriptionSettings, f: TranscriptionForm): TranscriptionPatch {
  const p: TranscriptionPatch = {}
  if (f.offer !== s.offer) p.offer = f.offer
  if (f.maxPages !== s.max_pages && f.maxPages !== null) p.max_pages = f.maxPages
  if (f.perDayPages !== s.per_day_pages) p.per_day_pages = f.perDayPages
  if (f.concurrency !== s.concurrency && f.concurrency !== null) p.concurrency = f.concurrency
  return p
}

/** The field of the form a JSON Pointer from the runtime names (details.field), or null. */
export function formFieldOf(pointer: unknown): keyof TranscriptionForm | null {
  switch (pointer) {
    case '/transcription/offer':
      return 'offer'
    case '/transcription/max_pages':
      return 'maxPages'
    case '/transcription/per_day_pages':
      return 'perDayPages'
    case '/transcription/concurrency':
      return 'concurrency'
  }
  return null
}
