// Single sign-on's identity providers, as root and the platform's
// administrators set them up on 「登入方式」 (the sso tools): what the page and
// its dialog make of Core's answers, and what they send.
//
// Two kinds of provider are listed. The operator's (source "operator") is set
// in the server's environment (OIDC_*), is read-only here, and always comes
// first. The site's (source "site") are added, changed, switched on and off,
// tested and deleted here, each change over the version read. Their client
// secret is write-only: it is typed into its field and nowhere else, sent
// only when given, and never shown again but as its hint (…abcd).
import { ApiError, newIdempotencyKey, read, write, type ToolIn, type ToolOut } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'

export type SsoList = ToolOut<'sso.list'>
export type SsoProvider = ToolOut<'sso.get'>
export type SsoReport = ToolOut<'sso.test'>
export type SsoStatus = 'offered' | 'disabled' | 'id_taken' | 'secret_unavailable' | 'issuer_address_not_allowed'

/** Where Core's refusals of the sso tools are put in words, by reason (details.reason). */
export const REFUSALS = 'ssoAdmin.refusal'

/** A provider's id: 1 to 64 of a-z, 0-9 and -, beginning and ending with a letter or a digit. */
export const PROVIDER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
export const DISPLAY_NAME_MAX = 64
/** What Core takes of an issuer, a client id and a client secret, in bytes. */
export const FIELD_MAX_BYTES = 500
export const POSITION_MAX = 10000
export const SCOPES_MAX = 20
export const DOMAINS_MAX = 50
export const DEFAULT_SCOPES: readonly string[] = ['openid', 'profile', 'email']
export const DEFAULT_SUBJECT_CLAIM = 'sub'
/** The email claim a provider that links by email reads when none is named. */
export const DEFAULT_EMAIL_CLAIM = 'email'

// A scope token (RFC 6749: printable ASCII but space, " and \) and a claim's name.
const SCOPE = /^[\x21\x23-\x5b\x5d-\x7e]+$/
const CLAIM = /^[\x21-\x7e]{1,100}$/
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/
// A domain as Core compares them: lower case, labels of letters, digits and hyphens.
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/

/** The providers in the order the sign-in page offers them: the operator's first, then by position, then by id. */
export function ordered(providers: readonly SsoProvider[] | null | undefined): SsoProvider[] {
  return [...(providers ?? [])].sort((a, b) => {
    const op = Number(b.source === 'operator') - Number(a.source === 'operator')
    return op || a.position - b.position || a.id.localeCompare(b.id)
  })
}

export const isOperator = (p: Pick<SsoProvider, 'source'>) => p.source === 'operator'

/**
 * Whether the page may change it: a site's provider whose id the operator's
 * does not have. Every write to one that does is refused (set_by_operator).
 */
export const isEditable = (p: Pick<SsoProvider, 'source' | 'status' | 'read_only'>) =>
  p.source === 'site' && !p.read_only && p.status !== 'id_taken'

/**
 * Whether its secret was sealed by a key other than the one sealing now: the
 * operator rotated SECRETS_KEY and has not yet run `aishie-core secrets
 * rewrap`. It still opens, with the old key kept as SECRETS_KEY_PREVIOUS.
 */
export function sealedByOlderKey(p: SsoProvider, secretsKeyId: string | null | undefined): boolean {
  return (
    p.source === 'site' &&
    p.status !== 'secret_unavailable' &&
    !!p.client_secret_key_id &&
    !!secretsKeyId &&
    p.client_secret_key_id !== secretsKeyId
  )
}

// --- The form ------------------------------------------------------------------------------

/** What the dialog edits. The client secret is not in it: it is kept apart, in its field alone. */
export interface ProviderForm {
  id: string
  displayName: string
  issuer: string
  clientId: string
  scopes: string[]
  subjectClaim: string
  emailClaim: string
  linkByEmail: boolean
  allowedEmailDomains: string[]
  /** Its place on the sign-in page; null for after every other (a new one) or as it is. */
  position: number | null
}

export type FormField = keyof ProviderForm | 'clientSecret'

export function emptyForm(): ProviderForm {
  return {
    id: '',
    displayName: '',
    issuer: '',
    clientId: '',
    scopes: [...DEFAULT_SCOPES],
    subjectClaim: DEFAULT_SUBJECT_CLAIM,
    emailClaim: '',
    linkByEmail: false,
    allowedEmailDomains: [],
    position: null,
  }
}

export function formFrom(p: SsoProvider): ProviderForm {
  return {
    id: p.id,
    displayName: p.display_name ?? '',
    issuer: p.issuer,
    clientId: p.client_id,
    scopes: p.scopes?.length ? [...p.scopes] : [...DEFAULT_SCOPES],
    subjectClaim: p.subject_claim || DEFAULT_SUBJECT_CLAIM,
    emailClaim: p.email_claim ?? '',
    linkByEmail: p.link_by_email,
    allowedEmailDomains: [...(p.allowed_email_domains ?? [])],
    position: p.position,
  }
}

/** A domain as Core keeps it: trimmed, lower case, without a leading @. */
export function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^@+/, '')
}

/** This machine, in IPv4 (127.0.0.0/8), as the URL parser writes it. */
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const bytes = (s: string) => new TextEncoder().encode(s).length
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Whether an issuer is one Core may take: https, or http for this machine
 * alone (localhost, 127.0.0.0/8, ::1), with no user, query or fragment. Core
 * says the same, and the test says more. A Core that holds the site's
 * providers to public addresses also refuses one on this machine or a private
 * network, unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS
 * (issuer_address_not_allowed): that is left to it, since this page cannot
 * tell how it is set, nor where a name resolves.
 */
export function issuerProblem(issuer: string): 'required' | 'url' | 'https' | 'long' | null {
  const v = issuer.trim()
  if (!v) return 'required'
  if (bytes(v) > FIELD_MAX_BYTES) return 'long'
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return 'url'
  }
  if (u.username || u.password || u.search || u.hash || v.includes('#') || v.includes('?')) return 'url'
  if (u.protocol === 'https:') return null
  const local = u.hostname === 'localhost' || u.hostname === '[::1]' || LOOPBACK_V4.test(u.hostname)
  if (u.protocol === 'http:' && local) return null
  return 'https'
}

/**
 * What would be refused before it is sent, as message keys (ssoAdmin.form.invalid.*) by field. Core
 * checks the same and more; what it refuses is said on its field too (fieldOf).
 */
export function formProblems(
  f: ProviderForm,
  opts: { creating: boolean; sendingSecret: boolean; secret: string; takenIds: readonly string[] },
): Partial<Record<FormField, string>> {
  const out: Partial<Record<FormField, string>> = {}
  const k = (x: string) => `ssoAdmin.form.invalid.${x}`
  if (opts.creating) {
    const id = f.id.trim()
    if (!id) out.id = k('required')
    else if (!PROVIDER_ID.test(id)) out.id = k('id')
    else if (opts.takenIds.includes(id)) out.id = k('idTaken')
  }
  const name = f.displayName.trim()
  if (!name) out.displayName = k('required')
  else if ([...name].length > DISPLAY_NAME_MAX) out.displayName = k('displayNameLong')
  else if (/[\p{Cc}\p{Cf}]/u.test(name)) out.displayName = k('printable')
  const issuer = issuerProblem(f.issuer)
  if (issuer) out.issuer = k(issuer === 'required' ? 'required' : `issuer_${issuer}`)
  const clientId = f.clientId.trim()
  if (!clientId) out.clientId = k('required')
  else if (!PRINTABLE_ASCII.test(clientId)) out.clientId = k('ascii')
  else if (bytes(clientId) > FIELD_MAX_BYTES) out.clientId = k('long')
  if (opts.sendingSecret) {
    // The secret is sent as it was typed: a space at either end may be part of it.
    if (!opts.secret) out.clientSecret = k('required')
    else if (!PRINTABLE_ASCII.test(opts.secret)) out.clientSecret = k('ascii')
    else if (bytes(opts.secret) > FIELD_MAX_BYTES) out.clientSecret = k('long')
  }
  if (!f.scopes.includes('openid')) out.scopes = k('openid')
  else if (f.scopes.length > SCOPES_MAX) out.scopes = k('scopesMany')
  else if (f.scopes.some((s) => !SCOPE.test(s))) out.scopes = k('scope')
  if (!f.subjectClaim.trim()) out.subjectClaim = k('required')
  else if (!CLAIM.test(f.subjectClaim.trim())) out.subjectClaim = k('claim')
  if (f.emailClaim.trim() && !CLAIM.test(f.emailClaim.trim())) out.emailClaim = k('claim')
  if (f.linkByEmail) {
    if (!f.allowedEmailDomains.length) out.allowedEmailDomains = k('domainsRequired')
    else if (f.allowedEmailDomains.length > DOMAINS_MAX) out.allowedEmailDomains = k('domainsMany')
    else if (f.allowedEmailDomains.some((d) => !DOMAIN.test(d))) out.allowedEmailDomains = k('domain')
  }
  if (f.position !== null && (!Number.isInteger(f.position) || f.position < 0 || f.position > POSITION_MAX)) {
    out.position = k('position')
  }
  return out
}

/** The email claim to send: the one named, or with link by email and none named, email. */
function emailClaimOf(f: ProviderForm): string {
  return f.emailClaim.trim() || (f.linkByEmail ? DEFAULT_EMAIL_CLAIM : '')
}

/** sso.create's arguments: switched off (Core's default), to be tested and switched on from the list. */
export function createArgs(f: ProviderForm, secret: string): ToolIn<'sso.create'> {
  const args: ToolIn<'sso.create'> = {
    id: f.id.trim(),
    display_name: f.displayName.trim(),
    issuer: f.issuer.trim(),
    client_id: f.clientId.trim(),
    client_secret: secret,
    scopes: [...f.scopes],
    subject_claim: f.subjectClaim.trim(),
    link_by_email: f.linkByEmail,
  }
  const email = emailClaimOf(f)
  if (email) args.email_claim = email
  if (f.linkByEmail || f.allowedEmailDomains.length) args.allowed_email_domains = [...f.allowedEmailDomains]
  if (f.position !== null) args.position = f.position
  return args
}

/**
 * sso.update's arguments: what changed from the form as it was read, over the
 * version read, and the secret only when a new one was typed (null: kept as it
 * is; the hint is never sent back). Null when nothing changed.
 */
export function updateArgs(
  base: SsoProvider,
  initial: ProviderForm,
  f: ProviderForm,
  secret: string | null,
): ToolIn<'sso.update'> | null {
  const args: ToolIn<'sso.update'> = { provider_id: base.id, version: base.version ?? 0 }
  let changed = false
  const put = <K extends keyof ToolIn<'sso.update'>>(k: K, v: ToolIn<'sso.update'>[K]) => {
    args[k] = v
    changed = true
  }
  if (f.displayName.trim() !== initial.displayName.trim()) put('display_name', f.displayName.trim())
  if (f.issuer.trim() !== initial.issuer.trim()) put('issuer', f.issuer.trim())
  if (f.clientId.trim() !== initial.clientId.trim()) put('client_id', f.clientId.trim())
  if (!sameList(f.scopes, initial.scopes)) put('scopes', [...f.scopes])
  if (f.subjectClaim.trim() !== initial.subjectClaim.trim()) put('subject_claim', f.subjectClaim.trim())
  // An empty email claim is sent as "", which clears it.
  if (emailClaimOf(f) !== emailClaimOf(initial)) put('email_claim', emailClaimOf(f))
  if (f.linkByEmail !== initial.linkByEmail) put('link_by_email', f.linkByEmail)
  if (!sameList(f.allowedEmailDomains, initial.allowedEmailDomains)) {
    put('allowed_email_domains', [...f.allowedEmailDomains])
  }
  if (f.position !== null && f.position !== initial.position) put('position', f.position)
  if (secret) put('client_secret', secret)
  return changed ? args : null
}

/** sso.test's arguments for an issuer the form names, with the scopes and claims it would ask for. */
export function testArgs(f: ProviderForm): ToolIn<'sso.test'> {
  const args: ToolIn<'sso.test'> = {
    issuer: f.issuer.trim(),
    scopes: [...f.scopes],
    subject_claim: f.subjectClaim.trim() || DEFAULT_SUBJECT_CLAIM,
  }
  const email = emailClaimOf(f)
  if (email) args.email_claim = email
  return args
}

/** Core's name of a field (details.field) as the form's. */
export function fieldOf(field: unknown): FormField | null {
  switch (field) {
    case 'id':
      return 'id'
    case 'display_name':
      return 'displayName'
    case 'issuer':
      return 'issuer'
    case 'client_id':
      return 'clientId'
    case 'client_secret':
      return 'clientSecret'
    case 'scopes':
      return 'scopes'
    case 'subject_claim':
      return 'subjectClaim'
    case 'email_claim':
      return 'emailClaim'
    case 'allowed_email_domains':
      return 'allowedEmailDomains'
    case 'position':
      return 'position'
    default:
      return null
  }
}

// --- Refusals ------------------------------------------------------------------------------

export function reasonOf(e: unknown): string | undefined {
  const r = e instanceof ApiError ? e.details?.reason : undefined
  return typeof r === 'string' ? r : undefined
}

/** The provider changed since it was read (409, version_mismatch, with current_version). */
export const isVersionMismatch = (e: unknown) => reasonOf(e) === 'version_mismatch'
/** Deleted meanwhile, or never there. */
export const isGone = (e: unknown) => reasonOf(e) === 'sso_provider_not_found'

/** A refusal in the reader's language: this page's words by reason, then the app's. */
export function ssoErrorText(e: unknown): string {
  return errorMessage(e, { reasons: REFUSALS })
}

/**
 * A refusal of a field (400, details.field): Core's own words, which name the
 * rule, without the field's name it begins with, since it is said on the field.
 */
export function fieldRefusalText(e: ApiError): string {
  const field = typeof e.details?.field === 'string' ? e.details.field : ''
  return field && e.message.startsWith(`${field}: `) ? e.message.slice(field.length + 2) : e.message
}

/** Reasons sso.test names in its problems, in brackets, that this page has words for. */
const REPORT_REASONS = ['issuer_address_not_allowed'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/**
 * The reason a problem of sso.test's names, of those this page has words for
 * (ssoAdmin.test.reason.*): a URL of the provider's, the issuer or one its
 * discovery document names, at an address the server does not reach for a
 * provider of the site's (issuer_address_not_allowed). Core writes the reason
 * in brackets at the end of its words.
 */
export function problemReason(problem: string): ReportReason | null {
  return REPORT_REASONS.find((r) => problem.includes(`(${r})`)) ?? null
}

/**
 * How much of the issuer sso.test read, for its verdict
 * (ssoAdmin.test.read.*): nothing when the issuer itself was refused (no
 * discovery_url); nothing when its discovery document was not read, which
 * Core's problem for it begins by naming (an address the server does not
 * reach, a timeout, an HTTP error); the document but not the keys when the
 * key set was not; and otherwise both.
 */
export function reportRead(report: Pick<SsoReport, 'discovery_url' | 'problems'>): 'all' | 'issuer' | 'document' | 'keys' {
  if (!report.discovery_url) return 'issuer'
  const problems = report.problems ?? []
  if (problems.some((p) => p.startsWith('the discovery document:'))) return 'document'
  if (problems.some((p) => p.startsWith('the key set:'))) return 'keys'
  return 'all'
}

// --- Calls ---------------------------------------------------------------------------------

/**
 * The idempotency key of one intended write from a form that holds a secret.
 * It is kept only to send the same thing again when Core did not answer (the
 * network, a gateway, a rate limit), and dropped once Core has answered or
 * anything in the form changes (forget), so that nothing that was sent, the
 * secret included, is kept to tell whether it changed.
 */
export function writeKey() {
  let key: string | null = null
  return {
    get: (): string => (key ??= newIdempotencyKey()),
    /** Core answered (or not: e is an error that may be tried again under the same key). */
    settled(e?: unknown) {
      const unanswered = e instanceof ApiError && (e.isNetwork || e.status >= 500 || e.code === 'rate_limited')
      if (!unanswered) key = null
    },
    forget() {
      key = null
    },
  }
}

export async function listProviders(): Promise<SsoList> {
  return read('sso.list', {})
}

export async function getProvider(id: string): Promise<SsoProvider> {
  return read('sso.get', { provider_id: id })
}

export async function testProvider(args: ToolIn<'sso.test'>): Promise<SsoReport> {
  return read('sso.test', args)
}

/** sso.create, under the key given. */
export async function createProvider(args: ToolIn<'sso.create'>, idempotencyKey: string): Promise<SsoProvider> {
  const out = await write('sso.create', args, { idempotencyKey })
  if (out.status !== 'executed') throw proposedError()
  return out.result
}

/** sso.update, under the key given. */
export async function updateProvider(args: ToolIn<'sso.update'>, idempotencyKey: string): Promise<SsoProvider> {
  const out = await write('sso.update', args, { idempotencyKey })
  if (out.status !== 'executed') throw proposedError()
  return out.result
}

// Administrators act outright: the sso tools are never proposed. Should a
// Core ever answer otherwise, nothing was done yet, and that is said.
function proposedError(): ApiError {
  return new ApiError({ status: 202, code: 'proposed', message: 'the change waits for approval' })
}
