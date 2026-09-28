// Whether this server has the agent runtime's API, for the pages that offer
// to host an agent on it (M2). The front end's image is the same for every
// server, so this is asked of the server rather than built in: the hosting
// UI shows only once GET /runtime/api/v1/info has answered as the runtime
// does, and a 404, a gateway's 502, a page or no answer at all hides it.
//
// One answer serves the whole page: it is asked the first time anything
// uses this, once per page load, and every user shares it.
import { computed, ref, shallowRef, type ComputedRef } from 'vue'
import type { ApiError } from '@/api/http'
import { runtimeStatus, type RuntimeInfo, type RuntimeStatus } from '@/api/runtime'

const info = shallowRef<RuntimeInfo | null>(null)
const error = shallowRef<ApiError | null>(null)
const checked = ref(false)
let asked: Promise<boolean> | null = null

/** Takes the answer p will give, unless a newer question has been asked meanwhile. */
function take(p: Promise<RuntimeStatus>): Promise<boolean> {
  const mine: Promise<boolean> = p.then((s) => {
    if (asked === mine) {
      info.value = s.available ? s.info : null
      error.value = s.available ? null : s.error
      checked.value = true
    }
    return s.available
  })
  asked = mine
  return mine
}

export interface UseRuntime {
  /** The runtime's API is there: offer hosting. False until it has answered. */
  available: ComputedRef<boolean>
  /** What it says of itself, while available. */
  info: ComputedRef<RuntimeInfo | null>
  /** Why it is not available, once asked: its answer as an ApiError. */
  error: ComputedRef<ApiError | null>
  /** It has answered (or not) at least once: until then, show neither the feature nor its absence. */
  checked: ComputedRef<boolean>
  /** Asks again, and resolves to whether it is available now. */
  refresh: () => Promise<boolean>
}

export function useRuntime(): UseRuntime {
  if (!asked) void take(runtimeStatus())
  return {
    available: computed(() => info.value !== null),
    info: computed(() => info.value),
    error: computed(() => error.value),
    checked: computed(() => checked.value),
    refresh: () => take(runtimeStatus({ refresh: true })),
  }
}
