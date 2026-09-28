// The caller's own agents (agent.list), by actor id: for telling an action of
// one of them from anyone else's, and for naming it where the course's member
// list cannot be read — an agent's owner without member_read finds their
// agents' proposals in the queues all the same. Read once per caller and
// page, and never for an agent, which owns none.
import { computed, shallowRef } from 'vue'
import { read } from '@/api/http'
import { useSessionStore } from '@/stores/session'

const held = shallowRef<{ caller: string; agents: Map<string, string> } | null>(null)
let pending: Promise<void> | null = null

/** Forgets what was read (for tests; signing out loads the page afresh anyway). */
export function forgetMyAgents() {
  held.value = null
  pending = null
}

export function useMyAgents() {
  const session = useSessionStore()
  const caller = computed(() => (session.me?.kind === 'human' ? (session.me.id ?? null) : null))

  function ensure(): Promise<void> {
    const me = caller.value
    if (!me || held.value?.caller === me) return Promise.resolve()
    if (pending) return pending
    pending = read('agent.list', {})
      .then((o) => {
        held.value = { caller: me, agents: new Map((o.agents ?? []).map((a) => [a.actor_id, a.display_name])) }
      })
      .catch(() => {
        // Not known: nothing is taken for one's own agent by this, and the
        // member list or the queue still tell.
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  /** The caller's agents' names, by actor id; empty until read. */
  const names = computed(() =>
    held.value && held.value.caller === caller.value ? held.value.agents : new Map<string, string>(),
  )

  function has(actorId: string | null | undefined): boolean {
    return !!actorId && names.value.has(actorId)
  }
  function nameOf(actorId: string | null | undefined): string | null {
    return (actorId && names.value.get(actorId)) || null
  }
  return { ensure, names, has, nameOf }
}
