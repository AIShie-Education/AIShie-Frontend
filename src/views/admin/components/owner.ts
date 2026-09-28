// An agent's owner, as the administration pages show it and give it when the
// agent is registered (actor.register's owner_actor_id), the one time it is
// given: nobody changes it or takes it away afterwards. Core's rules are
// mirrored here only to say beforehand why someone cannot be chosen: the
// owner is an active person, and an administrator makes only root, or
// themself, the owner of an agent when the person holds a platform role
// (the rule for acting on holders of one). Core has the last word.
import type { Actor } from '@/api/types'

/** Why a person cannot be made an agent's owner. */
export type OwnerBlock = 'notHuman' | 'suspended' | 'role'

export function ownerBlocker(
  candidate: Pick<Actor, 'id' | 'kind' | 'status' | 'platform_role'>,
  me: { id?: string | null; isRoot: boolean },
): OwnerBlock | null {
  if (candidate.kind !== 'human') return 'notHuman'
  if (candidate.status !== 'active') return 'suspended'
  if (me.id && candidate.id.toLowerCase() === me.id.toLowerCase()) return null
  if (candidate.platform_role && !me.isRoot) return 'role'
  return null
}

/**
 * Who made an actor's current suspension: its owner (who may lift it), an
 * administrator, or nobody recorded (one made before Core kept it, which
 * counts as an administrator's). Null when it is not suspended.
 */
export type SuspendedBy = 'owner' | 'admin' | 'unrecorded'

export function suspendedBy(
  actor: Pick<Actor, 'status' | 'owner_actor_id' | 'suspended_by_actor_id'>,
): SuspendedBy | null {
  if (actor.status !== 'suspended') return null
  const by = actor.suspended_by_actor_id?.toLowerCase()
  if (!by) return 'unrecorded'
  return actor.owner_actor_id && by === actor.owner_actor_id.toLowerCase() ? 'owner' : 'admin'
}

/** The owner an agent was registered with, for the page that says what comes next. */
export interface OwnerPick {
  id: string
  display_name: string
}
