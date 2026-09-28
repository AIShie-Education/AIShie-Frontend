// The objects of the AIShie Agent Runtime's API v1 (M2), written by hand from
// its contract (m2.api.spec.md §4 and §5). Generating them (gen:runtime-api)
// is a follow-up once the runtime publishes a schema. Answers may gain
// members within v1; what is not named here is ignored.

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
]

/** What became of an agent token the runtime was asked to revoke in Core (§7.3). */
export type Revocation = 'revoked' | 'already_invalid' | 'failed' | 'not_attempted'

/** Why a revocation failed. */
export type RevocationProblem = 'agent_suspended' | 'core_unavailable' | 'core_refused'

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
  model: { own: OwnModel | null; school: null }
  own_key: null | { hint: string; provider: string | null }
  seats: Seat[]
  seats_as_of: string | null
  proposals_waiting: number
  today: { since: string; answers: number; cost_usd: string }
  created_at: string
  updated_at: string
}

/** What the runtime offers, by GET /info. */
export interface RuntimeFeatures {
  connect_by_token: boolean
  own_key: boolean
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

/** GET /models. */
export interface ModelsAnswer {
  own_key: { offered: boolean; providers: ProviderOffer[] }
  school_key: { offered: boolean; offers: unknown[] }
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

/** POST /agents/inspect: what a token is. */
export interface InspectAnswer {
  core_actor_id: string
  display_name: string
  owner_actor_id: string
  token: TokenInfo
  seats: Seat[]
  hosted: null | { agent_id: string | null; by_you: boolean; same_token: boolean }
}

/** PATCH /agents/{id}, merge-patch: an absent member is unchanged, null clears it. */
export interface AgentPatch {
  model?: { own?: OwnModelChoice | null; school?: null }
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
  'own_key_required',
  'own_key_provider_mismatch',
  'model_denied',
  'settings_rejected',
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
