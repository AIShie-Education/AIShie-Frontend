// Finding an actor for a form: by a piece of their name or email in the
// directory (actor.list, which answers platform administrators), or by a
// pasted ID (actor.get).
//
// A Core from before the directory answers GET /v1/actors with 405
// method_not_allowed (POST /v1/actors, registering, is there), and something
// in front of Core that knows no such route may answer 404. That is a fact
// about the Core, not about who asks, so it is noted once for the page's life,
// and the pages fall back to what they did before: an ID, pasted in.
import { readonly, ref } from 'vue'
import { isApiError, read, type ToolIn, type ToolOut } from '@/api/http'
import type { Actor } from '@/api/types'
import { errorMessage } from '@/composables/useErrors'
import { isUuid } from '@/utils/format'

/** Whether an error from actor.list says this Core has no such tool. */
export function lacksActorList(e: unknown): boolean {
  return isApiError(e) && (e.status === 405 || e.status === 404 || e.code === 'method_not_allowed')
}

const known = ref<boolean | null>(null)

/** Whether this Core has actor.list: null until a call has said. */
export const hasActorList = readonly(known)

/** actor.list, noting on the way whether this Core has it. */
export async function listActors(args: ToolIn<'actor.list'>): Promise<ToolOut<'actor.list'>> {
  try {
    const out = await read('actor.list', args)
    known.value = true
    return out
  } catch (e) {
    if (lacksActorList(e)) known.value = false
    throw e
  }
}

let probing: Promise<void> | null = null

/**
 * Asks Core for one row of the directory, so that a form can offer search or
 * the fallback before anyone types. Once anything has said, it asks nothing;
 * a failure that says nothing about the tool (the network, a refusal) leaves
 * it unknown, for the next probe or search.
 */
export function probeActorList(): Promise<void> {
  if (known.value !== null) return Promise.resolve()
  probing ??= listActors({ limit: 1 })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => (probing = null))
  return probing
}

/** The active first, then the suspended, whom Core does not seat; otherwise in Core's order. */
export function activeFirst<T extends Pick<Actor, 'status'>>(actors: readonly T[] | null | undefined): T[] {
  const all = actors ?? []
  return [...all.filter((a) => a.status === 'active'), ...all.filter((a) => a.status !== 'active')]
}

/**
 * A remote search for a select: `search(text)` finds people and agents whose
 * name or email holds the text (the start of the directory for none), or the
 * one actor whose whole ID it is. On a Core without the directory only the ID
 * works: other text finds nobody, and `hasActorList` is false for the form to
 * say so, once, rather than as a failure.
 */
export function useActorSearch(limit = 20) {
  const options = ref<Actor[]>([])
  const searching = ref(false)
  const error = ref<string | null>(null)
  // Typing fast starts one search after another: only the latest counts.
  let seq = 0

  async function search(query: string) {
    const mine = ++seq
    const needle = query.trim()
    searching.value = true
    error.value = null
    try {
      let found: Actor[]
      if (isUuid(needle)) {
        found = await read('actor.get', { actor_id: needle.toLowerCase() }).then(
          (a) => [a],
          (e) => {
            if (isApiError(e) && e.isNotFound) return []
            throw e
          },
        )
      } else if (known.value === false) {
        found = []
      } else {
        found = activeFirst((await listActors({ search: needle || undefined, limit })).actors)
      }
      if (mine === seq) options.value = found
    } catch (e) {
      if (mine === seq) {
        options.value = []
        if (!lacksActorList(e)) error.value = errorMessage(e)
      }
    } finally {
      if (mine === seq) searching.value = false
    }
  }

  /** The first time the list opens, it shows the start of the directory. */
  function onVisible(open: boolean) {
    if (open && !options.value.length && !searching.value) void search('')
  }

  return { options, searching, error, search, onVisible, hasActorList }
}
