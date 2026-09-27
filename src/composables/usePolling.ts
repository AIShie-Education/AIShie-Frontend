// Asking Core again and again for what may have changed: Core pushes nothing,
// so a chat, an inbox or a "last seen" is kept fresh by polling.
//
//   const { pollNow } = usePolling(() => loadNewer(), { intervalMs: 3000, enabled: () => open.value })
//
// One poll at a time: the next is timed from the end of the one before, so a
// slow Core is never asked twice at once. A poll that throws doubles the wait
// before the next (up to maxIntervalMs), and a poll that succeeds brings it
// back. While the page is hidden, polling pauses (or slows to
// hiddenIntervalMs); when it is shown again, it polls at once. It stops when
// the component (or effect scope) that started it goes away.
import { getCurrentScope, onScopeDispose, readonly, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface PollingOptions {
  /** How long to wait between the end of one poll and the start of the next. */
  intervalMs: number
  /** The longest wait after failures; by default sixteen times intervalMs. */
  maxIntervalMs?: number
  /** While the page is hidden: poll this often, or (null, the default) not at all. */
  hiddenIntervalMs?: number | null
  /** Poll as soon as polling starts (default), or only after the first wait. */
  immediate?: boolean
  /**
   * Whether to poll, followed as it changes. Without it, polling starts at
   * once (or, with manual, only when start() is called).
   */
  enabled?: MaybeRefOrGetter<boolean>
  manual?: boolean
}

export function usePolling(fn: () => unknown, opts: PollingOptions) {
  const active = ref(false)
  const inFlight = ref(false)
  /** Polls that have failed in a row. */
  const failures = ref(0)
  const lastError = shallowRef<unknown>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let current: Promise<void> | null = null
  let again = false

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** The wait before the next poll, or null for none while hidden. */
  function nextDelay(): number | null {
    const base = hidden() ? (opts.hiddenIntervalMs ?? null) : opts.intervalMs
    if (base === null) return null
    if (!failures.value) return base
    const max = Math.max(base, opts.maxIntervalMs ?? opts.intervalMs * 16)
    return Math.min(base * 2 ** failures.value, max)
  }

  function schedule() {
    clear()
    if (!active.value) return
    const d = nextDelay()
    if (d === null) return
    timer = setTimeout(() => void run(), d)
  }

  function run(): Promise<void> {
    if (current) {
      // Asked for while one is under way: one more straight after it.
      again = true
      return current
    }
    clear()
    inFlight.value = true
    const p = (async () => {
      try {
        await fn()
        failures.value = 0
        lastError.value = null
      } catch (e) {
        failures.value++
        lastError.value = e
      } finally {
        inFlight.value = false
        current = null
      }
      if (again) {
        again = false
        if (active.value) return run()
      }
      schedule()
    })()
    current = p
    return p
  }

  function start() {
    if (active.value) return
    active.value = true
    if (opts.immediate === false) schedule()
    else void run()
  }

  function stop() {
    active.value = false
    again = false
    clear()
  }

  /**
   * Polls now, whatever the timer says (after sending something, say), and
   * resolves once that poll is done. While polling is stopped, it polls once.
   */
  function pollNow(): Promise<void> {
    return run()
  }

  function onVisibility() {
    if (!active.value) return
    if (hidden()) schedule()
    else void run()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  if (opts.enabled !== undefined) {
    watch(
      () => toValue(opts.enabled),
      (on) => (on ? start() : stop()),
      { immediate: true },
    )
  } else if (!opts.manual) {
    start()
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  return {
    /** Whether polling is on (it may be paused while the page is hidden). */
    active: readonly(active),
    /** Whether a poll is under way. */
    inFlight: readonly(inFlight),
    failures: readonly(failures),
    /** What the last poll threw, until one succeeds. */
    lastError,
    start,
    stop,
    pollNow,
  }
}
