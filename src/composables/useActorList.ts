// actor.list: everyone registered on the platform, for administrators. Core
// gained it after the version this front end was first built against. An
// older Core answers its route, GET /v1/actors, with 405 method_not_allowed
// (POST /v1/actors, registering, is there), and something in front of Core
// that knows no such route may answer 404. The pages that search for people
// then fall back to what they did before: an actor id, pasted in.
import { readonly, ref } from 'vue'
import { ApiError, read, type ToolIn, type ToolOut } from '@/api/http'
import type { Actor } from '@/api/types'

/**
 * Whether this Core has actor.list: null until a call has said. It is a fact
 * about the Core, not about who asks, so it is kept for the page's life.
 */
const available = ref<boolean | null>(null)

/** Whether an error from actor.list means this Core has no such tool. */
export function lacksActorList(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 405 || e.status === 404 || e.code === 'method_not_allowed')
}

/** actor.list, noting on the way whether this Core has it. */
export async function listActors(args: ToolIn<'actor.list'>): Promise<ToolOut<'actor.list'>> {
  try {
    const out = await read('actor.list', args)
    available.value = true
    return out
  } catch (e) {
    if (lacksActorList(e)) available.value = false
    throw e
  }
}

/**
 * Whom to offer for a seat, out of what actor.list gave: people and agents,
 * never the system actor, which is seated nowhere; the active before the
 * suspended, whom Core does not seat; otherwise in Core's order.
 */
export function forSeating(actors: readonly Actor[] | null | undefined): Actor[] {
  const offered = (actors ?? []).filter((a) => a.kind === 'human' || a.kind === 'agent')
  return [...offered.filter((a) => a.status === 'active'), ...offered.filter((a) => a.status !== 'active')]
}

let probing: Promise<void> | null = null

/**
 * Whether searching by name can be offered. probe() asks Core for one row,
 * once, when nothing has said yet; a failure that says nothing about the tool
 * (the network, say) leaves it unknown for the next probe or search.
 */
export function useActorList() {
  function probe(): Promise<void> {
    if (available.value !== null) return Promise.resolve()
    probing ??= listActors({ limit: 1 })
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => (probing = null))
    return probing
  }
  return { available: readonly(available), probe }
}
