// What the "My agents" pages work out from what Core says of a person's
// agents: whether an agent is theirs to reactivate, how many count against
// the limit, which of their courses they may bring one into, what a seat
// reaches, and how far along connecting a runtime is. For display only:
// Core decides what is allowed, and its refusals are shown as they come.
import { ref } from 'vue'
import { isApiError } from '@/api/http'
import {
  AUTONOMY_LEVELS,
  PERMS,
  type AgentCredential,
  type AgentFull,
  type AgentSummary,
  type AutonomyLevel,
  type Membership,
  type Perm,
  type PermLevels,
} from '@/api/types'
import { credentialState } from '../credentials'

// --- Standing -------------------------------------------------------------------

/**
 * active; suspendedByMe: the owner's own suspension, theirs to lift;
 * suspendedByAdmin: an administrator's (or one made before Core recorded who
 * suspended), which only an administrator lifts.
 */
export type AgentStanding = 'active' | 'suspendedByMe' | 'suspendedByAdmin'

export function agentStanding(a: Pick<AgentSummary, 'status' | 'suspended_by_me'>): AgentStanding {
  if (a.status !== 'suspended') return 'active'
  return a.suspended_by_me ? 'suspendedByMe' : 'suspendedByAdmin'
}

/** How many agents count against the per-person limit: those not suspended. */
export function countedAgents(list: readonly Pick<AgentSummary, 'status'>[] | null | undefined): number {
  return (list ?? []).filter((a) => a.status !== 'suspended').length
}

// --- The limit ------------------------------------------------------------------
// Core does not say how many agents a person may have (AGENT_MAX_PER_OWNER,
// five unless the installation says otherwise) until it refuses one more:
// the refusal carries it as details.limit. It is kept for the page's life
// (a new caller in this tab starts the page afresh).

/** The limit from a refusal of agent.create or agent.reactivate, if it is one. */
export function limitFromError(e: unknown): number | null {
  if (!isApiError(e) || e.code !== 'failed_precondition') return null
  const n = e.details?.limit
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

const limit = ref<number | null>(null)
/** The most agents that are not suspended the caller may have, once Core has said. */
export const knownAgentLimit = limit

/** Notes the limit from a refusal; true when the error was that refusal. */
export function noteAgentLimit(e: unknown): boolean {
  const n = limitFromError(e)
  if (n !== null) limit.value = n
  return n !== null
}

// --- Bringing an agent into a course --------------------------------------------

/** Why one of the caller's courses is not offered for bringing an agent in. */
export type CourseBlock =
  | 'archived' // an archived course takes no changes
  | 'paused' // the caller's own seat is paused: it may do nothing now
  | 'delegate' // the caller is someone's delegate there (never so for a person)
  | 'noPerm' // agent_delegate is denied on the caller's seat
  | 'seated' // the agent has a seat there already
  | 'requested' // a request to seat it there waits for a decision

export interface CourseChoice {
  membership: Membership
  blocked: CourseBlock | null
  /** Bringing it in becomes a request an instructor approves (agent_delegate at confirm_required); null when not known. */
  needsApproval: boolean | null
  /** The caller may seat a course agent students ask: they manage the course's members. Unknown counts as yes. */
  canCourseAgent: boolean
}

function level(perms: Membership['perms'] | null | undefined, p: Perm): AutonomyLevel | undefined {
  const v = perms?.[p]
  return v && (AUTONOMY_LEVELS as string[]).includes(v) ? (v as AutonomyLevel) : undefined
}

/**
 * The caller's courses, each with whether this agent can be brought into it
 * and why not: the ones it can first, then by code and section. A seat's
 * permissions are exact where Core reports them (me.memberships); where it
 * does not, the course is offered and Core decides.
 */
export function courseChoices(
  memberships: readonly Membership[],
  agent: Pick<AgentFull, 'seats' | 'requests'> | null | undefined,
): CourseChoice[] {
  const seated = new Set((agent?.seats ?? []).map((s) => s.course_id))
  const requested = new Set((agent?.requests ?? []).map((r) => r.course_id))
  const out = memberships
    .filter((m) => m.status !== 'removed')
    .map((m): CourseChoice => {
      const delegate = level(m.perms, 'agent_delegate')
      let blocked: CourseBlock | null = null
      if (m.course_status === 'archived') blocked = 'archived'
      else if (m.status === 'paused') blocked = 'paused'
      else if (m.principal_member_id) blocked = 'delegate'
      else if (delegate === 'denied') blocked = 'noPerm'
      else if (seated.has(m.course_id)) blocked = 'seated'
      else if (requested.has(m.course_id)) blocked = 'requested'
      const manage = level(m.perms, 'member_manage')
      return {
        membership: m,
        blocked,
        needsApproval: delegate === undefined ? null : delegate === 'confirm_required',
        canCourseAgent: manage === undefined ? !m.perms : manage !== 'denied',
      }
    })
  const key = (c: CourseChoice) => `${c.membership.code}\u0000${c.membership.section}`
  return out.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || key(a).localeCompare(key(b)))
}

// --- What a seat reaches ----------------------------------------------------------

export type StudentReach = { kind: 'all' } | { kind: 'nobody' } | { kind: 'you' } | { kind: 'listed'; n: number }

/**
 * Which students a seat reaches, said from the owner's side: the whole class,
 * nobody, just the owner (a student's own assistant), or a number of them.
 */
export function studentReach(
  scope: string,
  listed: readonly string[] | null | undefined,
  myMemberId?: string | null,
): StudentReach {
  if (scope === 'all') return { kind: 'all' }
  const ids = listed ?? []
  if (!ids.length) return { kind: 'nobody' }
  if (ids.length === 1 && myMemberId && ids[0].toLowerCase() === myMemberId.toLowerCase()) return { kind: 'you' }
  return { kind: 'listed', n: ids.length }
}

export type AssignmentReach = { kind: 'all' } | { kind: 'nobody' } | { kind: 'listed'; n: number }

export function assignmentReach(scope: string, listed: readonly string[] | null | undefined): AssignmentReach {
  if (scope === 'all') return { kind: 'all' }
  const n = (listed ?? []).length
  return n ? { kind: 'listed', n } : { kind: 'nobody' }
}

// --- Permissions ------------------------------------------------------------------

/** Core's map of levels, keeping only the permissions and levels this app knows. */
export function toPermLevels(perms: Record<string, string | undefined> | null | undefined): PermLevels {
  const out: PermLevels = {}
  for (const p of PERMS) {
    const v = perms?.[p]
    if (v && (AUTONOMY_LEVELS as string[]).includes(v)) out[p] = v as AutonomyLevel
  }
  return out
}

/** The permissions a seat holds at all (anything but denied), in the usual order. */
export function grantedPerms(
  perms: Record<string, string | undefined> | null | undefined,
): { perm: Perm; level: AutonomyLevel }[] {
  const levels = toPermLevels(perms)
  return PERMS.filter((p) => levels[p] && levels[p] !== 'denied').map((p) => ({ perm: p, level: levels[p]! }))
}

// --- Connecting a runtime -----------------------------------------------------------

export type StepState = 'done' | 'waiting' | 'todo'

export interface SetupProgress {
  /** A token that still works has been issued. */
  token: StepState
  /** Something has used one of its tokens: a runtime has connected. */
  connected: StepState
  /** It is seated in a course (waiting: a request to seat it is pending). */
  course: StepState
}

/**
 * How far along an agent is: issued a token, connected with it, brought into
 * a course. "Connected" waits while there is a token but no use of it yet.
 */
export function setupProgress(input: {
  credentials: readonly AgentCredential[] | null | undefined
  lastSeenAt: string | null | undefined
  seats: readonly unknown[] | null | undefined
  requests: readonly unknown[] | null | undefined
  now?: number
}): SetupProgress {
  const liveToken = (input.credentials ?? []).some(
    (c) => c.kind === 'api_token' && credentialState(c, input.now) === 'active',
  )
  const seen = !!input.lastSeenAt
  return {
    token: liveToken ? 'done' : 'todo',
    connected: seen ? 'done' : liveToken ? 'waiting' : 'todo',
    course: (input.seats ?? []).length ? 'done' : (input.requests ?? []).length ? 'waiting' : 'todo',
  }
}

/** The environment a runtime is started with: where Core's MCP endpoint is, and the agent's token. */
export function runtimeEnv(endpoint: string, token: string): string {
  return `CORE_MCP_URL=${endpoint}\nAISHITERU_TOKEN=${token}`
}
