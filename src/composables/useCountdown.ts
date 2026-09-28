// A live countdown to a time on Core's clock: what is left, as mm:ss, and
// whether the time has come. Every countdown on the page moves with one
// timer, a few times a second, so that each second is shown as it turns.
import { computed, onScopeDispose, readonly, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { coreNow } from '@/api/clock'
import { formatCountdown, remainingMs } from '@/utils/countdown'

const TICK_MS = 250
const now = ref(coreNow())
let users = 0
let timer: ReturnType<typeof setInterval> | null = null

/** Core's time now (clock.ts), moving on four times a second while anything uses it. */
export function useCoreNow(): Readonly<Ref<number>> {
  now.value = coreNow()
  users++
  if (!timer) timer = setInterval(() => (now.value = coreNow()), TICK_MS)
  onScopeDispose(() => {
    users--
    if (!users && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return readonly(now)
}

/**
 * The countdown to `until` (an RFC 3339 time on Core's clock): `remaining`
 * in milliseconds, `text` as mm:ss, and `ended` once it has come. Nothing
 * to count to is a countdown that has ended.
 */
export function useCountdown(until: MaybeRefOrGetter<string | null | undefined>) {
  const clock = useCoreNow()
  const remaining = computed(() => remainingMs(toValue(until), clock.value))
  const text = computed(() => formatCountdown(remaining.value))
  const ended = computed(() => remaining.value <= 0)
  return { remaining, text, ended, now: clock }
}
