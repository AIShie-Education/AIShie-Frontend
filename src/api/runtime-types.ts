// The objects of the AIshie Agent Runtime's API v1 (M2), written by hand from
// its contract (m2.api.spec.md §4 and §5), and those of its administrators'
// routes (OCR and the school's plan, at the end). Generating them
// (gen:runtime-api) is a follow-up once the runtime publishes a schema.
// Answers may gain members within v1; what is not named here is ignored.

/** What a hosted agent is doing, as the runtime works it out (§6.2). */
export type HostedStatus = 'needs_model' | 'starting' | 'running' | 'paused' | 'needs_token' | 'error' | 'stopped'

export const HOSTED_STATUSES: readonly HostedStatus[] = [
  'needs_model',
  'starting',
  'running',
  'paused',
  'needs_token',
  'error',
  'stopped',
]

/** Why a hosted agent needs a token or does not run (problem.reason). */
export type ProblemReason =
  | 'token_refused'
  | 'settings_rejected'
  | 'runtime_misconfigured'
  | 'operator_agent'
  | 'actor_in_use'
  | 'token_other_agent'
  | 'token_not_agent'
  | 'owner_changed'
  | 'core_too_old'
  | 'agent_suspended'
  | 'failing'
  /** On an offer of the school's plan that is gone, with no model of the owner's behind it. */
  | 'offer_withdrawn'

export const PROBLEM_REASONS: readonly ProblemReason[] = [
  'token_refused',
  'settings_rejected',
  'runtime_misconfigured',
  'operator_agent',
  'actor_in_use',
  'token_other_agent',
  'token_not_agent',
  'owner_changed',
  'core_too_old',
  'agent_suspended',
  'failing',
  'offer_withdrawn',
]

/**
 * What became of an agent token the runtime was asked to revoke in Core
 * (§7.3): revoked, or already not working (nothing to do); failed, when the
 * token may still work and its owner is offered to revoke it (§9.4); or
 * not attempted (kept on purpose, or a replay of the same token).
 */
export type Revocation = 'revoked' | 'already_invalid' | 'failed' | 'not_attempted'

export const REVOCATIONS: readonly Revocation[] = ['revoked', 'already_invalid', 'failed', 'not_attempted']

/**
 * Why a revocation failed: the agent is suspended in Core, Core could not be
 * reached, or Core refused the token the runtime asked with (core_refused:
 * after two replacements at once, the newer one revoked it first; A.3.5).
 */
export type RevocationProblem = 'agent_suspended' | 'core_unavailable' | 'core_refused'

export const REVOCATION_PROBLEMS: readonly RevocationProblem[] = ['agent_suspended', 'core_unavailable', 'core_refused']

/** An agent token as the runtime shows it: never more than its public part. */
export interface TokenInfo {
  /** Such as "ais_k7v2m4qhx3ab…". */
  hint: string
  /** The 12-character public prefix, Core's credential token_prefix. */
  prefix: string
}

/** One of a hosted agent's seats, as structured facts (the UI words them). */
export interface Seat {
  course_id: string
  course_code: string
  course_title: string
  /** "" when none. */
  section: string
  /** Core's member status: active, paused, … */
  seat_status: string
  /** active, archived, …; null when not recorded. */
  course_status: string | null
  kind: 'delegate' | 'course_tutor' | 'member'
  /** Whether it answers there now. */
  answers: boolean
  answer_level: 'autonomous' | 'pending_review' | 'confirm_required' | 'denied'
  /** It may read students' work or grades. */
  reads_work: boolean
  /** It may read the course material. */
  reads_material: boolean
  proposals_waiting: number
  seen_at: string
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high']

/** The model an owner chooses, on their own key (PATCH and POST /keys/test). */
export interface OwnModelChoice {
  /** One of GET /models' own_key.providers. */
  provider: string
  /** Default: the provider's adapters[0]. */
  adapter?: string
  model: string
  /** Only for endpoint.kind "choice": a choice id. */
  endpoint?: string
  /** Required exactly for endpoint.kind "azure_resource". */
  resource?: string
  /** Required exactly for endpoint.kind "bedrock_region". */
  region?: string
  /** 256 to 32000; default the runtime's. */
  max_output_tokens?: number
  reasoning_effort?: ReasoningEffort
}

/** The model a hosted agent has, as the runtime answers it. */
export interface OwnModel {
  provider: string
  adapter: string
  model: string
  endpoint: string | null
  resource: string | null
  region: string | null
  max_output_tokens: number | null
  reasoning_effort: string | null
  /** The runtime's price table knows this model today. */
  price_known: boolean
}

/**
 * The offer of the school's plan a hosted agent is on (D8): the school
 * provides the model and pays for it, on a key of its own that nobody sees.
 */
export interface SchoolModel {
  /** The offer's id, as GET /models lists it. */
  offer: string
  /** What people are shown; the id when the school no longer offers it. */
  label: string
  /** "" when the school no longer offers it. */
  model: string
  provider: string
  /** False when the school withdrew the offer: the agent then does not run. */
  offered: boolean
  /** The owner's own model and key stand behind it, for when the plan's quota is spent. */
  fallback: boolean
}

/**
 * The owner's use of the school's plan since 00:00 UTC, across all of their
 * agents (scope "owner"), against the plan's quota per person; and the most
 * one person asking may have of one agent in a course each day.
 */
export interface SchoolUse {
  scope: 'owner'
  used: number
  limit: number
  used_usd: string
  /** Null when the quota is in answers alone. */
  limit_usd: string | null
  per_asker_limit: number
}

export interface HostedProblem {
  reason: ProblemReason
  /** English, already redacted by the runtime; for a "Details" disclosure. */
  detail: string
  since: string
}

/** An agent the school's runtime hosts. */
export interface HostedAgent {
  /** agt_… */
  id: string
  /** Moves on with every write; the ETag is "<version>". */
  version: number
  core_actor_id: string
  owner_actor_id: string
  display_name: string
  status: HostedStatus
  /** Non-null exactly for needs_token and error. */
  problem: HostedProblem | null
  paused: boolean
  token: TokenInfo
  /** On the school's plan, own is the fallback behind it. */
  model: { own: OwnModel | null; school: SchoolModel | null }
  own_key: null | { hint: string; provider: string | null }
  seats: Seat[]
  seats_as_of: string | null
  proposals_waiting: number
  /** school: the owner's use of the plan, on it; null (or absent, from an older runtime) otherwise. */
  today: { since: string; answers: number; cost_usd: string; school?: SchoolUse | null }
  created_at: string
  updated_at: string
}

/**
 * What the runtime offers, by GET /info. Each is a boolean the runtime
 * works out as it starts, not a constant: connect_by_token and own_key are
 * true where it was given a Core and a vault to seal with (in any
 * deployment, as the contract's §5.1 and A.2.1 say), and false otherwise;
 * school_key is true where the operator offers models on the school's plan.
 * The page offers what each names only while it is true.
 */
export interface RuntimeFeatures {
  /** Agents may be connected by a token (inspect, POST /agents, PUT /token). */
  connect_by_token: boolean
  /** An owner may give a model and their own key (GET /models, keys/test, PATCH). */
  own_key: boolean
  /** The school's plan (D8): models the school provides and pays for (GET /models' school_key). */
  school_key: boolean
}

/** What the runtime says of itself, publicly (GET /info). */
export interface RuntimeInfo {
  api: 'aishie-runtime'
  api_version: 1
  version: string
  commit: string
  /** The audience Core's assertions for this runtime name. */
  audience: string
  /** The Core whose assertions it trusts. */
  issuer: string
  features: RuntimeFeatures
}

/** GET /me. */
export interface RuntimeMe {
  actor_id: string
  display_name: string
  is_admin: boolean
  hosted_agents: number
}

export type EndpointOffer =
  | { kind: 'fixed'; base_url: string }
  | { kind: 'choice'; choices: { id: string; label: string; base_url: string }[] }
  | { kind: 'azure_resource'; pattern: string; example: string }
  | { kind: 'bedrock_region'; pattern: string; suggested: string[] }

/** A provider an owner may bring their own key for, on its official endpoints only. */
export interface ProviderOffer {
  provider: string
  label: string
  /** [0] is the default. */
  adapters: string[]
  endpoint: EndpointOffer
  /** A hint for the form, never enforced. */
  key_prefix: string | null
  suggested_models: { model: string; priced: boolean }[]
}

/** One model of the school's plan: never its key. */
export interface SchoolOffer {
  /** What PATCH names (model.school.offer). */
  id: string
  label: string
  provider: string
  model: string
  /** The runtime's price table knows it today. */
  priced: boolean
}

/** GET /models. */
export interface ModelsAnswer {
  own_key: { offered: boolean; providers: ProviderOffer[] }
  school_key: {
    offered: boolean
    offers: SchoolOffer[]
    /** The plan's quotas in answers a UTC day; absent from an older runtime. */
    limits?: { per_owner_day: number; per_asker_day: number }
  }
}

export type KeyTestResult = 'ok' | 'key_refused' | 'model_not_found' | 'key_accepted' | 'unreachable'
export const KEY_TEST_RESULTS: readonly KeyTestResult[] = [
  'ok',
  'key_refused',
  'model_not_found',
  'key_accepted',
  'unreachable',
]

/** POST /keys/test: a choice and the key to try it with, once; the key is never stored. */
export interface KeyTestRequest extends OwnModelChoice {
  key: string
}

export interface KeyTestAnswer {
  result: KeyTestResult
  http_status: number | null
  provider_code: string | null
  latency_ms: number
}

/** POST /agents/inspect and POST /agents. */
export interface TokenRequest {
  token: string
  /** The agent the caller means. */
  core_actor_id?: string
}

/**
 * PUT /agents/{id}/token: the token alone. The agent is the one hosted
 * there, so a core_actor_id member is refused (400 unknown_field,
 * /core_actor_id; the contract's A.2.3).
 */
export interface ReplaceTokenRequest {
  token: string
}

/**
 * One of the agent's other live API tokens in Core (the contract's A.1):
 * never the token being inspected or connected, nor the one the runtime
 * holds for it. Nothing of it is secret: it is what Core shows the owner.
 */
export interface OtherToken {
  /** Core's token_prefix, 12 characters; shown as `ais_${prefix}…`. */
  prefix: string
  /** The label it was issued with, if any. */
  label: string | null
  created_at: string
  /** Null: never used. */
  last_used_at: string | null
  /** Null: it does not expire. */
  expires_at: string | null
  /** Last used within window_seconds of when the runtime asked Core. */
  recent: boolean
}

/**
 * The one-brain warning (A.1): an agent has one brain at a time, and a
 * token of its used lately means something may run it somewhere else now.
 * The runtime only says so; connecting is not refused, and it never
 * revokes a token it was not given.
 */
export interface OtherTokens {
  /** Some token below is recent: warn. */
  in_use: boolean
  /** How recent "recent" is, in seconds (900). */
  window_seconds: number
  /** At most 20: the most recently used first, never-used ones last (newest first). */
  tokens: OtherToken[]
}

/** POST /agents/inspect: what a token is. */
export interface InspectAnswer {
  core_actor_id: string
  display_name: string
  owner_actor_id: string
  token: TokenInfo
  seats: Seat[]
  hosted: null | { agent_id: string | null; by_you: boolean; same_token: boolean }
  /** The agent's other live tokens; null when Core would not list them (nothing is known, and nothing failed). */
  other_tokens: OtherTokens | null
}

/**
 * POST /agents, 201 and its 200 replay: the agent, and its other live
 * tokens beside its members (A.1). Only these two answers carry
 * other_tokens; GET, PATCH, PUT /token, pause and resume do not.
 */
export interface ConnectAnswer extends HostedAgent {
  other_tokens: OtherTokens | null
}

/**
 * PATCH /agents/{id}, merge-patch: an absent member is unchanged, null clears it.
 * On the school's plan, model.own is optional: the fallback behind it.
 */
export interface AgentPatch {
  model?: { own?: OwnModelChoice | null; school?: { offer: string } | null }
  own_key?: { value: string } | null
}

/** The token a replacement or a deletion left behind, and whether Core revoked it. */
export interface RevokedToken extends TokenInfo {
  revocation: Revocation
  problem: RevocationProblem | null
}

/** PUT /agents/{id}/token. */
export interface ReplaceTokenAnswer {
  agent: HostedAgent
  previous_token: RevokedToken
}

/** DELETE /agents/{id}. */
export interface DeleteAnswer {
  deleted: { id: string; core_actor_id: string }
  token: RevokedToken
}

/** The closed list of details.reason the runtime answers errors with (§2.3). */
export const RUNTIME_ERROR_REASONS = [
  // Any request
  'no_route',
  'method_not_allowed',
  'cross_origin',
  'not_json',
  'body_too_large',
  'malformed_json',
  'unknown_field',
  'missing_field',
  'invalid_field',
  'unknown_parameter',
  'bad_if_match',
  'rate_limited',
  'store_unavailable',
  'internal',
  // Sign-in
  'assertion_missing',
  'assertion_malformed',
  'assertion_invalid',
  'assertion_expired',
  'keys_unavailable',
  // A hosted agent
  'agent_not_found',
  'version_required',
  'version_mismatch',
  // Tokens
  'token_malformed',
  'token_refused',
  'token_not_agent',
  'agent_suspended',
  'token_other_agent',
  'core_too_old',
  'agent_unowned',
  'not_owner',
  'already_hosted',
  'operator_agent',
  'core_unavailable',
  // Models and keys
  'unknown_provider',
  'adapter_not_offered',
  'unknown_endpoint',
  'key_malformed',
  'school_key_not_offered',
  'unknown_offer',
  'own_key_required',
  'own_key_provider_mismatch',
  'model_denied',
  'settings_rejected',
  // Administrators' routes
  'not_admin',
  'ocr_unavailable',
  'offer_not_found',
  'offer_exists',
  'offer_read_only',
  'offer_not_priced',
  'key_required',
  'key_test_failed',
  // Pricing
  'model_not_priced',
  'price_not_found',
  'price_exists',
  'price_read_only',
] as const

export type RuntimeErrorReason = (typeof RUNTIME_ERROR_REASONS)[number]

/**
 * Reasons this front end gives errors the runtime did not word: no answer
 * at all, a gateway's error page, an answer that is not the runtime's, Core
 * refusing to vouch for this account, and no runtime to call after all.
 */
export const CLIENT_ERROR_REASONS = [
  'network',
  'runtime_unavailable',
  'invalid_response',
  'account_refused',
  'runtime_absent',
] as const

export type ClientErrorReason = (typeof CLIENT_ERROR_REASONS)[number]

// ---------------------------------------------------------------------------
// The administrators' routes (admin/…): the runtime's administrators alone,
// Core's root and admins (narrowed by the runtime's ADMIN_ACTOR_IDS), as
// GET /me's is_admin says; anyone else is refused 403 not_admin.
// ---------------------------------------------------------------------------

/** Why OCR cannot run here whatever the site says: the operator's OCR=off, or its programs or languages missing. */
export type OcrUnavailableReason = 'operator_off' | 'not_installed'

export const OCR_UNAVAILABLE_REASONS: readonly OcrUnavailableReason[] = ['operator_off', 'not_installed']

/** Reading scanned files and images (OCR), as the site sets it within what the operator allows. */
export interface OcrSettings {
  /** The operator's environment lets OCR run on this runtime. */
  available: boolean
  /** Why not, when available is false; null otherwise. */
  unavailable_reason: OcrUnavailableReason | null
  /** What is missing, in English for administrators; null when nothing is. */
  unavailable_detail: string | null
  /** The site's switch (true by default). OCR runs when available and enabled. */
  enabled: boolean
  /** The languages OCR reads in, in tesseract's order: the site's choice, or default_languages. */
  languages: string[]
  /** The operator's languages (OCR_LANGUAGES). */
  default_languages: string[]
  /** The languages installed here, which languages is chosen from; [] when not available. */
  available_languages: string[]
  /** The site's setting's last write; both null when it was never set. */
  updated_at: string | null
  /** A Core actor id. */
  updated_by: string | null
}

/** GET and PATCH admin/settings. */
export interface RuntimeSettings {
  ocr: OcrSettings
}

/** PATCH admin/settings, merge-patch: a member left out is unchanged. */
export interface RuntimeSettingsPatch {
  ocr?: {
    /** Never null. */
    enabled?: boolean
    /** 1 to 8 of available_languages, no repeats; null goes back to default_languages. */
    languages?: string[] | null
  }
}

/**
 * How an offer of the school's plan stands: offered to owners, turned off,
 * shadowed by a runtime.yaml offer of the same id, or its model no longer
 * allowed by runtime.yaml's model lists (the last two, site offers only).
 */
export type OfferStatus = 'offered' | 'disabled' | 'id_taken' | 'model_not_allowed'

export const OFFER_STATUSES: readonly OfferStatus[] = ['offered', 'disabled', 'id_taken', 'model_not_allowed']

/** The operator's (runtime.yaml, read-only here), or the site's (made here). */
export type OfferSource = 'config' | 'site'

/** Whether a site offer's key passed a trial of its model when it was given. */
export type OfferKeyStatus = 'tested' | 'untested'

/** One model of the school's plan, as its administrators see it: never its key. */
export interface PlanOffer {
  /** Letters, digits, _ and -, at most 64: what owners' agents name (model.school.offer). */
  id: string
  source: OfferSource
  /** One line, at most 80 characters: what owners are shown. */
  label: string
  provider: string
  adapter: string
  model: string
  /** As OwnModel has them; null where the provider takes none. */
  endpoint: string | null
  resource: string | null
  region: string | null
  /** The endpoint called; null for the adapter's own default. Read-only. */
  base_url: string | null
  /** Null: the runtime's default. */
  max_output_tokens: number | null
  reasoning_effort: ReasoningEffort | null
  /** The administrators' switch; always true for runtime.yaml's. */
  enabled: boolean
  /** Always offered for runtime.yaml's. */
  status: OfferStatus
  /** The runtime's price table prices this model today. */
  priced: boolean
  /** Hosted agents whose settings name this offer (on it now, or held or falling back while it is withdrawn). */
  agents: number
  // The site's offers only; null for runtime.yaml's:
  /** What may be shown of the school's key, such as "sk-…3f9a". */
  key_hint: string | null
  key_status: OfferKeyStatus | null
  /** Moves on with every write; the ETag is "<version>". */
  version: number | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
}

/** Dollars as the runtime writes them: a decimal string of six places, "2.500000". */
export type USD = string

/** Dollars as they are sent: a decimal string ("2.5") or a number; more than 0, at most 1,000,000, six places at most. */
export type USDInput = string | number

/**
 * Quotas per UTC day, in answers and in dollars. The dollar members are
 * absent from a runtime from before the site set them (null: none).
 */
export interface PlanQuotas {
  /** Per owner, across all of their agents. */
  per_owner_day: number
  /** Per asker, per agent and course. */
  per_asker_day: number
  /** Across the whole school's key; null for no ceiling. */
  per_day: number | null
  per_owner_day_usd?: USD | null
  per_asker_day_usd?: USD | null
  per_day_usd?: USD | null
}

/** GET admin/school-plan, and the answer of the quotas' PUT and DELETE. */
export interface SchoolPlan {
  /** runtime.yaml's offers first (their order), then the site's by id. */
  offers: PlanOffer[]
  /** In force now. */
  quotas: PlanQuotas
  /** runtime.yaml's (or the built-in ones): what DELETE quotas goes back to. */
  quota_defaults: PlanQuotas
  /** The site has set the quotas, in place of quota_defaults. */
  quotas_set: boolean
  quotas_updated_at: string | null
  quotas_updated_by: string | null
}

/** POST admin/school-plan/offers: the model as OwnModelChoice has it, and the school's key for it. */
export interface OfferCreate extends OwnModelChoice {
  id: string
  label: string
  /** Default true. */
  enabled?: boolean
  /** Write-only: never answered, logged or audited (only its hint). */
  key: string
  /** Keep the key without trying it (key_status untested). */
  skip_key_test?: boolean
}

/** PATCH admin/school-plan/offers/{id}, merge-patch: a member left out is unchanged, null goes back to the default. */
export interface OfferPatch {
  label?: string
  enabled?: boolean
  /** Another provider needs a key and a model too. */
  provider?: string
  adapter?: string | null
  model?: string
  endpoint?: string | null
  resource?: string | null
  region?: string | null
  max_output_tokens?: number | null
  reasoning_effort?: ReasoningEffort | null
  /** A new key: tried (unless skip_key_test), and the old one destroyed. */
  key?: string
  skip_key_test?: boolean
}

/** DELETE admin/school-plan/offers/{id}. */
export interface OfferDeleted {
  deleted: { id: string }
  /** Hosted agents that were on it: on their owners' own models now, or held (offer_withdrawn). */
  agents: number
}

/**
 * PUT admin/school-plan/quotas: the three in answers, whole numbers from 1
 * to 1,000,000 (per_day null for no ceiling); those in dollars each
 * optional, null for none, and left out kept as they are in force.
 */
export interface QuotasPut {
  per_owner_day: number
  per_asker_day: number
  per_day: number | null
  per_owner_day_usd?: USDInput | null
  per_asker_day_usd?: USDInput | null
  per_day_usd?: USDInput | null
}

/** What failed when a key was tried before it was kept (key_test_failed's details.result). */
export type KeyTrialFailure = 'key_refused' | 'model_not_found' | 'unreachable'

export const KEY_TRIAL_FAILURES: readonly KeyTrialFailure[] = ['key_refused', 'model_not_found', 'unreachable']

/** Billable answers and model calls on the school's key, and their cost in dollars (six places). */
export interface PlanUse {
  answers: number
  model_calls: number
  cost_usd: string
}

/**
 * One tenant's use of the school's plan today: a hosted agent's owner's,
 * with their actor id and the name the runtime last saw, or a tenant of the
 * operator's own agents, with neither.
 */
export interface OwnerPlanUse extends PlanUse {
  tenant_id: string
  owner_actor_id: string | null
  display_name: string | null
}

/** GET admin/school-plan/usage: today's use of the school's key since 00:00 UTC, and the quotas in force. */
export interface SchoolPlanUsage {
  since: string
  limits: PlanQuotas
  total: PlanUse
  owners: OwnerPlanUse[]
}

// ---------------------------------------------------------------------------
// Pricing: the price table, tenants' quotas, agents' budgets, and costs
// ---------------------------------------------------------------------------

/** A price in dollars per million tokens as it is sent: a decimal string or number, 0 or more, six places at most. */
export type USDPerMTokInput = string | number

/** A quota a UTC day, in answers and dollars, each null for none. */
export interface DailyQuota {
  answers: number | null
  usd: USD | null
}

/** A quota as it is sent: both members, each null for none. */
export interface DailyQuotaInput {
  answers: number | null
  usd: USDInput | null
}

/** The operator's price file (read-only here), or the site's. */
export type PriceSource = 'site' | 'file'

/** One row of the price table: a provider's model (or a glob of models) from a day on, in dollars per million tokens. */
export interface PriceRow {
  /** What names the row in the ledger's versions; a file's row without one is its index. */
  id: string
  source: PriceSource
  /** As the ledger names providers (openai, anthropic, …; openai_compatible for an endpoint of the operator's). */
  provider: string
  /** Exactly, or a glob where * is any text (glob). */
  model: string
  glob: boolean
  /** YYYY-MM-DD (UTC): the day the price starts. */
  from: string
  /** Exact, with no more places than needed ("0.4", "15"). */
  usd_per_mtok: { input: string; cache_read: string; cache_write: string; output: string }
  /** What a cost priced by it is recorded under, "site-20260930T101500Z/haiku-4-5". */
  version: string
  /** A file's row a site's row of the same provider, model and from stands before. */
  overridden: boolean
  // A site's row only; null for the file's:
  /** The ETag is "<row_version>". */
  row_version: number | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
}

/** An offer of the plan no row prices today: a quota in dollars cannot hold it. */
export interface UnpricedOffer {
  id: string
  source: OfferSource
  provider: string
  model: string
  enabled: boolean
}

/** GET admin/prices, and DELETE admin/prices/{id}'s answer. */
export interface PriceTable {
  /** The table in force: "<file>+<site>", either alone, or null with none at all. */
  version: string | null
  file_version: string | null
  site_version: string | null
  site_changed_at: string | null
  /** The site's rows first (by id), then the file's (in its order). */
  rows: PriceRow[]
  unpriced_offers: UnpricedOffer[]
}

/** POST admin/prices. The id never changes: it names the row in the ledger. */
export interface PriceCreate {
  id: string
  provider: string
  model: string
  from: string
  usd_per_mtok: {
    input: USDPerMTokInput
    output: USDPerMTokInput
    /** Default: input. */
    cache_read?: USDPerMTokInput
    cache_write?: USDPerMTokInput
  }
}

/** PATCH admin/prices/{id}, merge-patch: a price left out is kept as stored. */
export interface PricePatch {
  provider?: string
  model?: string
  from?: string
  usd_per_mtok?: Partial<PriceCreate['usd_per_mtok']>
}

/** runtime.yaml's (the operator's), the site's, or none of its own. */
export type TenantSource = 'site' | 'config' | 'none'

/** A tenant's quota on the school's key a UTC day, across all its agents. */
export interface TenantQuota {
  tenant_id: string
  /** Where the tenant is a person's (ten_<actor id>), and their name as the runtime last saw it. */
  owner_actor_id: string | null
  display_name: string | null
  source: TenantSource
  /** In force. */
  per_day: DailyQuota
  /** runtime.yaml's, which DELETE goes back to; null where it has none. */
  config_per_day: DailyQuota | null
  agents: number
  updated_at: string | null
  updated_by: string | null
}

/** GET admin/tenants: a page, by tenant id. */
export interface TenantList {
  tenants: TenantQuota[]
  /** The next page's after; null after the last. */
  next: string | null
}

/** PUT admin/tenants/{tenant_id}: not both null. */
export interface TenantPut {
  per_day: DailyQuotaInput
}

/** Hosted agents' daily budgets by default, per agent and per asker, on whichever key they answer. */
export interface AgentBudgets {
  per_agent_day: DailyQuota
  per_asker_day: DailyQuota
  /** runtime.yaml's. */
  defaults: { per_agent_day: DailyQuota; per_asker_day: DailyQuota }
  /** The site sets them. */
  set: boolean
  updated_at: string | null
  updated_by: string | null
}

export interface AgentBudgetsPut {
  per_agent_day: DailyQuotaInput
  per_asker_day: DailyQuotaInput
}

export type CostGroupBy = 'day' | 'tenant' | 'agent' | 'model' | 'key_source' | 'total'

export const COST_GROUPS: readonly CostGroupBy[] = ['day', 'tenant', 'agent', 'model', 'key_source', 'total']

/** The school's key (the plan's offers), or owners' own keys. */
export type KeySource = 'school' | 'own'

/** One kind of cost: model calls today; another kind (transcription) comes as a line of its own. */
export interface CostLine {
  kind: string
  calls: number
  /** Calls no price held when they were recorded, counted as 0. */
  unpriced_calls: number
  tokens: { input: number; cache_read: number; cache_write: number; output: number } | null
  cost_usd: USD
}

export interface CostSum {
  cost_usd: USD
  lines: CostLine[]
}

/** One group of the report: a day, a tenant, an agent, a model, a key source, or the whole. */
export interface CostGroup extends CostSum {
  key: string
  day: string | null
  tenant_id: string | null
  owner_actor_id: string | null
  display_name: string | null
  agent_id: string | null
  agent_name: string | null
  key_source: KeySource | null
  provider: string | null
  model: string | null
  /** group=model on the school's key: the plan's offers of this model now. */
  offers: string[] | null
}

/** GET admin/costs: what the ledger recorded, in dollars, as it was priced then. */
export interface CostReport {
  since: string
  until: string
  group: CostGroupBy
  key_source: KeySource | null
  /** The whole span, every page. */
  total: CostSum
  rows: CostGroup[]
  next: string | null
}

/** GET admin/costs' parameters, each optional. */
export interface CostQuery {
  since?: string
  until?: string
  group?: CostGroupBy
  key_source?: KeySource
  limit?: number
  after?: string
}
