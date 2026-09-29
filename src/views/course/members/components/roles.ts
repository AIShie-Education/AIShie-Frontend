// A seat's roster role (member.set_role), and who may be offered a change of
// it. The role is a roster fact: who is on the gradebook, who hands work in.
// It grants nothing, so a change of it leaves the seat's permissions and reach
// as they are. These only say what the page offers; Core decides.
import type { Member } from '@/api/types'

/** The roles a person's seat is moved between on the members page. */
export const ROSTER_ROLES = ['student', 'ta', 'instructor'] as const
export type RosterRole = (typeof ROSTER_ROLES)[number]

/**
 * What a change of role does to the roster, for the words beside it: a
 * student made anything else leaves the roster (keeping what they handed in
 * and were given); anyone made a student joins it; otherwise only the name
 * on the roster changes.
 */
export type RoleEffect = 'leavesRoster' | 'joinsRoster' | 'nameOnly'

export function roleChangeEffect(from: string, to: string): RoleEffect | null {
  if (from === to) return null
  if (from === 'student') return 'leavesRoster'
  if (to === 'student') return 'joinsRoster'
  return 'nameOnly'
}

/**
 * Why a seat's role is not offered for change: the caller's own seat (nobody
 * manages their own), an agent's (a delegate's is always assistant, on no
 * roster, delegate_seat; an agent nobody owns is on no roster either), or,
 * for a caller who is itself someone's delegate, its principal's seat and its
 * principal's other agents' (not_your_principal). A seat removed or ended
 * offers nothing. Null: it is offered.
 */
export type RoleBlock = 'self' | 'agent' | 'delegateSeat' | 'notYourPrincipal' | 'gone'

export function roleChangeBlock(
  m: Pick<Member, 'id' | 'kind' | 'principal_member_id'>,
  caller: { memberId: string | null; principalMemberId: string | null },
  live: boolean,
): RoleBlock | null {
  if (!live) return 'gone'
  if (m.id === caller.memberId) return 'self'
  if (m.principal_member_id) return 'delegateSeat'
  if (m.kind === 'agent') return 'agent'
  if (caller.principalMemberId && m.id === caller.principalMemberId) return 'notYourPrincipal'
  return null
}

/**
 * Whether a student's password is offered for reset here (member.reset_password),
 * and why not. It is hidden where Core would refuse and the page can tell for
 * good: a seat removed or ended, the caller's own, an agent's, anyone's but a
 * student's, and for a caller who is an agent or does not manage members.
 * It is greyed out, with why, where the caller could be given what it takes:
 * member_manage without approval (not_autonomous), or the seat resumed
 * (seat_not_active). What only Core knows (their seats elsewhere, a platform
 * role, a linked identity) it says when it refuses.
 */
export type ResetOffer = 'hide' | 'notAutonomous' | 'seatNotActive' | 'offer'

export function resetPasswordOffer(
  m: Pick<Member, 'id' | 'kind' | 'role' | 'status' | 'principal_member_id'>,
  caller: { memberId: string | null; isPerson: boolean; level: string | null },
  live: boolean,
): ResetOffer {
  if (!live || m.id === caller.memberId) return 'hide'
  if (m.kind !== 'human' || m.principal_member_id || m.role !== 'student') return 'hide'
  if (!caller.isPerson || caller.level === 'denied') return 'hide'
  if (caller.level === 'confirm_required' || caller.level === 'pending_review') return 'notAutonomous'
  if (m.status !== 'active') return 'seatNotActive'
  return 'offer'
}
