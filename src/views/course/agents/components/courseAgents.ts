// What the course's agents page works out from the member list: which seats
// are agents and whose, what each is there for, how its replies go out, and
// where the students' own settings stand. Only for display: Core decides.
import { read } from '@/api/http'
import { AUTONOMY_LEVELS, type AutonomyLevel, type MemberSummary, type Preset } from '@/api/types'
import { seatPurpose, type SeatPurpose } from '@/utils/agents'

/** Where a level sits on the ladder: denied 0 … autonomous 3; anything unknown counts as denied. */
export function levelRank(l: string | null | undefined): number {
  const i = AUTONOMY_LEVELS.indexOf(l as AutonomyLevel)
  return i < 0 ? 0 : i
}

/** The lower of two levels. */
export function minLevel(a: string | null | undefined, b: string | null | undefined): AutonomyLevel {
  return AUTONOMY_LEVELS[Math.min(levelRank(a), levelRank(b))]!
}

/** A level as Core sent it, or denied when it sent nothing (fails closed). */
export function levelOf(perms: Record<string, string | undefined> | null | undefined, p: string): AutonomyLevel {
  const v = perms?.[p]
  return AUTONOMY_LEVELS.includes(v as AutonomyLevel) ? (v as AutonomyLevel) : 'denied'
}

/** A seat that still counts: not removed, and not past its end. */
export function isLive(m: Pick<MemberSummary, 'status' | 'expires_at'>, now = Date.now()): boolean {
  if (m.status === 'removed') return false
  return !m.expires_at || new Date(m.expires_at).getTime() > now
}

/**
 * Which group an agent's seat is shown in: a course agent (students may ask
 * it), someone's personal assistant, or an agent nobody owns (registered by
 * an administrator and seated with member.add, such as a grader).
 */
export type AgentGroup = 'course' | 'personal' | 'unowned'
export const AGENT_GROUPS: AgentGroup[] = ['course', 'personal', 'unowned']

export interface CourseAgentRow {
  member: MemberSummary
  /** The built-in preset's name, or a department preset's, when the seat's preset is known. */
  presetName: string | null
  purpose: SeatPurpose | null
  group: AgentGroup
  /** The seat whose delegate it is (its owner's), when that seat is in the list. */
  principal: MemberSummary | null
  live: boolean
  /** conversation_answer as set on the seat: what member.update_perms changes. */
  ownAnswer: AutonomyLevel
  /**
   * conversation_answer as it works now: a delegate's is capped by its
   * owner's conversation_ask (its owner asking, at one remove), and nothing
   * answers while the seat, or its owner's, does not count.
   */
  answer: AutonomyLevel
  /** The owner's seat caps the answer below what is set on the agent's own. */
  answerCapped: boolean
}

/**
 * The agents seated in a course, from member.list, sorted: live seats first,
 * then course agents, personal assistants and unowned agents, then by name.
 */
export function agentRows(
  members: MemberSummary[],
  presetsById: Map<string, Pick<Preset, 'name' | 'dept_id'>>,
  now = Date.now(),
): CourseAgentRow[] {
  const byId = new Map(members.map((m) => [m.id, m]))
  const rows: CourseAgentRow[] = []
  for (const m of members) {
    if (m.kind !== 'agent') continue
    const preset = m.preset_id ? presetsById.get(m.preset_id) : undefined
    // Only a built-in preset's name says what the seat is for; a department's
    // own may share a built-in's name and mean something else.
    const presetName = preset?.name ?? null
    const principal = m.principal_member_id ? (byId.get(m.principal_member_id) ?? null) : null
    const purpose = m.principal_member_id && preset && !preset.dept_id ? seatPurpose({ preset: preset.name }) : null
    const group: AgentGroup = !m.principal_member_id
      ? 'unowned'
      : (purpose ?? (principal && principal.role !== 'student' ? 'course' : 'personal'))
    const live = isLive(m, now)
    const ownAnswer = levelOf(m.perms, 'conversation_answer')
    let answer = m.status === 'active' && live ? ownAnswer : 'denied'
    if (m.principal_member_id) {
      if (!principal)
        answer = ownAnswer // the owner's seat is not in the list: shown as set
      else if (principal.status !== 'active' || !isLive(principal, now)) answer = 'denied'
      else answer = minLevel(answer, levelOf(principal.perms, 'conversation_ask'))
    }
    rows.push({
      member: m,
      presetName,
      purpose,
      group,
      principal,
      live,
      ownAnswer,
      answer,
      answerCapped: levelRank(answer) < levelRank(ownAnswer) && m.status === 'active' && live,
    })
  }
  const order = (r: CourseAgentRow) => AGENT_GROUPS.indexOf(r.group)
  return rows.sort(
    (a, b) =>
      Number(b.live) - Number(a.live) ||
      order(a) - order(b) ||
      a.member.display_name.localeCompare(b.member.display_name),
  )
}

/** How the seats with one role hold one permission. */
export interface LevelTally {
  /** Live seats with that role (the ones member.update_perms_bulk changes, less the caller's). */
  total: number
  counts: Partial<Record<AutonomyLevel, number>>
  /** The level most of them hold; null when there are none, or two levels tie. */
  majority: AutonomyLevel | null
  /** How many hold something other than the majority. */
  others: number
}

export function tallyLevels(
  members: MemberSummary[],
  role: string,
  perm: string,
  opts: { exceptId?: string | null; now?: number } = {},
): LevelTally {
  const counts: Partial<Record<AutonomyLevel, number>> = {}
  let total = 0
  for (const m of members) {
    if (m.role !== role || m.id === opts.exceptId || !isLive(m, opts.now)) continue
    const l = levelOf(m.perms, perm)
    counts[l] = (counts[l] ?? 0) + 1
    total++
  }
  let majority: AutonomyLevel | null = null
  let best = 0
  let tie = false
  for (const l of AUTONOMY_LEVELS) {
    const n = counts[l] ?? 0
    if (n > best) {
      best = n
      majority = l
      tie = false
    } else if (n > 0 && n === best) tie = true
  }
  if (tie) majority = null
  return { total, counts, majority, others: total - best }
}

/** Whether students may bring their own agents: agent_delegate on their seats. */
export type StudentAgentPolicy = 'off' | 'approval' | 'allowed'
export const STUDENT_AGENT_POLICIES: StudentAgentPolicy[] = ['off', 'approval', 'allowed']
export const POLICY_LEVEL: Record<StudentAgentPolicy, AutonomyLevel> = {
  off: 'denied',
  approval: 'confirm_required',
  allowed: 'autonomous',
}
/** The policy a level amounts to; pending_review (seated, and reviewed after) has no choice of its own. */
export function policyOf(level: string | null | undefined): StudentAgentPolicy | null {
  switch (level) {
    case 'denied':
      return 'off'
    case 'confirm_required':
      return 'approval'
    case 'autonomous':
      return 'allowed'
  }
  return null
}

/** How an agent's replies go out: its conversation_answer, from most to least supervised. */
export const REPLY_LEVELS: AutonomyLevel[] = ['autonomous', 'pending_review', 'confirm_required', 'denied']

/**
 * Every live seat in a course, page after page (member.list pages by 200).
 * `complete` is false when there were more than `maxPages` pages.
 */
export async function loadAllMembers(
  courseId: string,
  maxPages = 25,
): Promise<{ members: MemberSummary[]; complete: boolean }> {
  const members: MemberSummary[] = []
  let after: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const out = await read('member.list', { course_id: courseId, limit: 200, after })
    members.push(...(out.members ?? []))
    if (!out.next) return { members, complete: true }
    after = out.next
  }
  return { members, complete: false }
}

/**
 * What is known of when an agent was last connected: from agent.list for the
 * caller's own agents (by actor id), and from conversation.respondents for
 * those the caller may ask (by member id). `known` is false when neither says,
 * which is not the same as never.
 */
export function presenceFor(
  m: Pick<MemberSummary, 'id' | 'actor_id'>,
  mine: Map<string, string | null>,
  askable: Map<string, string | null>,
): { known: boolean; value: string | null } {
  if (askable.has(m.id)) return { known: true, value: askable.get(m.id) ?? null }
  if (mine.has(m.actor_id)) return { known: true, value: mine.get(m.actor_id) ?? null }
  return { known: false, value: null }
}
