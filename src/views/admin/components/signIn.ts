// How an actor can sign in, from what actor.get and actor.list say of them
// (has_password, has_sso, invite_expires_at), and Core's rules for changing
// that, mirrored to say why a control is off. Core decides: these only
// explain.
import type { Actor } from '@/api/types'

export type InviteState = 'none' | 'pending' | 'expired'

export interface SignIn {
  /** They can sign in with a password: they have one, and the email it is entered with. */
  password: boolean
  /** An identity at the identity provider is linked. */
  sso: boolean
  /** The invitation not yet taken up, if any, and whether it still works. */
  invite: InviteState
  inviteExpiresAt: string | null
  /** They have a way in now. */
  canSignIn: boolean
}

type SignInFields = Pick<Actor, 'kind' | 'email' | 'has_password' | 'has_sso' | 'invite_expires_at'>

/**
 * How a person can sign in; null for an agent or the system actor, which
 * sign in with API tokens or not at all. A password is entered with an email
 * (auth.Login finds the account by it), so one kept by someone who has no
 * email is no way in.
 */
export function signInState(a: SignInFields, now: number = Date.now()): SignIn | null {
  if (a.kind !== 'human') return null
  const password = !!a.has_password && !!a.email
  const sso = !!a.has_sso
  const at = a.invite_expires_at ?? null
  const invite: InviteState = !at ? 'none' : new Date(at).getTime() > now ? 'pending' : 'expired'
  return { password, sso, invite, inviteExpiresAt: at, canSignIn: password || sso }
}

/** The one signed in, as the rules below need them. */
export interface Caller {
  id: string | undefined
  isRoot: boolean
}

type RuleFields = Pick<Actor, 'id' | 'kind' | 'platform_role'>

/**
 * Why correcting an actor's name or email (actor.update) is not offered:
 * nobody changes the system actor, and only root acts on a holder of a
 * platform role. One's own record is always one's own to correct.
 */
export function editBlocker(a: RuleFields, caller: Caller): 'system' | 'role' | null {
  if (a.kind === 'system') return 'system'
  if (a.id !== caller.id && a.platform_role && !caller.isRoot) return 'role'
  return null
}

export type InviteBlocker = 'self' | 'system' | 'role' | 'agent' | 'noEmail' | 'suspended'

/**
 * Why inviting someone (actor.invite) is not offered, in the order Core
 * checks: not oneself (whose password is set on the Account page), nor the
 * system actor, only root for a holder of a platform role; then someone with
 * an email to sign in with, who is not suspended. That it is a person is the
 * front end's own steering, not Core's rule: an agent is given a token.
 */
export function inviteBlocker(a: RuleFields & Pick<Actor, 'email' | 'status'>, caller: Caller): InviteBlocker | null {
  if (a.id === caller.id) return 'self'
  if (a.kind === 'system') return 'system'
  if (a.platform_role && !caller.isRoot) return 'role'
  if (a.kind !== 'human') return 'agent'
  if (!a.email) return 'noEmail'
  if (a.status !== 'active') return 'suspended'
  return null
}

/**
 * What making an invitation does for them, which the button says: replaces
 * a link still waiting ('renew'), gives someone with a password a way to
 * choose a new one ('reset'), or is their first way in ('first').
 */
export function inviteMode(a: SignInFields, now: number = Date.now()): 'first' | 'renew' | 'reset' {
  const s = signInState(a, now)
  if (s?.invite === 'pending') return 'renew'
  if (a.has_password) return 'reset'
  return 'first'
}

/** The invitation lengths offered, in days; Core takes 1 to 30, and 7 unless told. */
export const INVITE_DAYS = [1, 3, 7, 14, 30] as const
export const DEFAULT_INVITE_DAYS = 7
