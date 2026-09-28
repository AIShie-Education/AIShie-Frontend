// Whether this server has the agent runtime's API, for the pages that offer
// to host an agent on it (M2). The front end's image is the same for every
// server, so this is asked of the server rather than built in: the hosting
// UI shows only once GET /runtime/api/v1/info has answered as the runtime
// does, and a 404, a gateway's 502, a page or no answer at all hides it.
// So does Core, when it turns out to make no assertions for the runtime's
// audience (a 404 or 400 when one is first asked for): the runtime client
// says so, and this takes it as the answer from then on.
//
// One answer serves the whole page: it is asked the first time anything
// uses this, once per page load, and every user shares it.
import { computed, ref, shallowRef, type ComputedRef } from 'vue'
import type { ApiError } from '@/api/http'
import { onRuntimeStatus, runtimeStatus, type RuntimeInfo, type RuntimeStatus } from '@/api/runtime'

const info = shallowRef<RuntimeInfo | null>(null)
const error = shallowRef<ApiError | null>(null)
const checked = ref(false)
let asked: Promise<boolean> | null = null

function apply(s: RuntimeStatus) {
  info.value = s.available ? s.info : null
  error.value = s.available ? null : s.error
  checked.value = true
}

/** Takes the answer p will give, unless a newer question has been asked meanwhile. */
function take(p: Promise<RuntimeStatus>): Promise<boolean> {
  const mine: Promise<boolean> = p.then((s) => {
    if (asked === mine) apply(s)
    return s.available
  })
  asked = mine
  return mine
}

// The runtime found absent after all: that stands over any answer on its way.
onRuntimeStatus((s) => {
  asked = Promise.resolve(s.available)
  apply(s)
})

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
