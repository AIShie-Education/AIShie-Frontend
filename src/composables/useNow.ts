// The time now, as a ref that moves on every so often: for text that ages
// ("online", "3 minutes ago") without each instance keeping its own timer.
import { onScopeDispose, readonly, ref, type Ref } from 'vue'

const TICK_MS = 30_000
const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | null = null

/** Date.now(), updated every thirty seconds while anything uses it. */
export function useNow(): Readonly<Ref<number>> {
  now.value = Date.now()
  users++
  if (!timer) timer = setInterval(() => (now.value = Date.now()), TICK_MS)
  onScopeDispose(() => {
    users--
    if (!users && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return readonly(now)
}
