// Asking Core again and again for what may have changed: Core pushes nothing,
// so a chat, an inbox or a "last seen" is kept fresh by polling, or by a long
// poll, a read that Core holds until there is news (wait_s).
//
//   const { pollNow } = usePolling(() => loadNewer(), { intervalMs: 3000, enabled: () => open.value })
//
// One poll at a time: the next is timed from the end of the one before, so a
// slow Core is never asked twice at once. A poll that throws doubles the wait
// before the next (up to maxIntervalMs), and a poll that succeeds brings it
// back. While the page is hidden, polling pauses (or slows to
// hiddenIntervalMs); when it is shown again, it polls at once. It stops when
// the component (or effect scope) that started it goes away.
//
// A long poll is polled again at once (intervalMs 0), and waits after a
// failure all the same (failureIntervalMs). Each poll is given a signal,
// aborted when polling stops or pauses while the poll is under way, or when
// pollNow({ interrupt: true }) cuts it short: a read that waits passes it on,
// so that nothing is left waiting for a page that no longer wants the answer.
// A poll cut short is neither a failure nor a success.
import { getCurrentScope, onScopeDispose, readonly, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface PollingOptions {
  /**
   * How long to wait between the end of one poll and the start of the next;
   * read before each wait, so a getter may change it. 0 polls again at once
   * (a long poll).
   */
  intervalMs: number
  /**
   * What the wait after failures doubles from (one failure waits twice it,
   * two four times…) when it is more than intervalMs: a long poll, polled
   * again at once, still backs off.
   */
  failureIntervalMs?: number
  /** The longest wait after failures; by default sixteen times intervalMs (or failureIntervalMs). */
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

/** What each poll is given. */
export interface PollContext {
  /**
   * Aborted when polling stops, or pauses for the hidden page, while this
   * poll is under way, or when pollNow({ interrupt: true }) cuts it short.
   */
  signal: AbortSignal
}

export function usePolling(fn: (ctx: PollContext) => unknown, opts: PollingOptions) {
  const active = ref(false)
  const inFlight = ref(false)
  /** Polls that have failed in a row. */
  const failures = ref(0)
  const lastError = shallowRef<unknown>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let current: Promise<void> | null = null
  /** The poll under way's, to cut it short. */
  let cut: AbortController | null = null
  let again = false

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  function clear() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** Cuts the poll under way short, if there is one. */
  function abort() {
    cut?.abort()
  }

  /** The wait before the next poll, or null for none while hidden. */
  function nextDelay(): number | null {
    const base = hidden() ? (opts.hiddenIntervalMs ?? null) : opts.intervalMs
    if (base === null) return null
    if (!failures.value) return base
    const step = Math.max(base, opts.failureIntervalMs ?? 0)
    const max = Math.max(step, opts.maxIntervalMs ?? Math.max(opts.intervalMs, opts.failureIntervalMs ?? 0) * 16)
    return Math.min(step * 2 ** failures.value, max)
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
    const ctrl = new AbortController()
    cut = ctrl
    const p = (async () => {
      try {
        await fn({ signal: ctrl.signal })
        if (!ctrl.signal.aborted) {
          failures.value = 0
          lastError.value = null
        }
      } catch (e) {
        // Cut short: nothing went wrong.
        if (!ctrl.signal.aborted) {
          failures.value++
          lastError.value = e
        }
      } finally {
        inFlight.value = false
        current = null
        if (cut === ctrl) cut = null
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
    abort()
  }

  /**
   * Polls now, whatever the timer says (after sending something, say), and
   * resolves once that poll is done. While one is under way, one more
   * straight after it; with interrupt, the one under way is cut short first
   * (a long poll, which could otherwise wait for its news for as long as it
   * may). While polling is stopped, it polls once.
   */
  function pollNow(o: { interrupt?: boolean } = {}): Promise<void> {
    if (o.interrupt && current) {
      again = true
      abort()
      return current
    }
    return run()
  }

  function onVisibility() {
    if (!active.value) return
    if (hidden()) {
      schedule()
      // Paused: nothing is left waiting for a page nobody sees.
      if (opts.hiddenIntervalMs == null) abort()
    } else void run()
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
    /** Whether a poll is under way (a long poll, waiting for news, included). */
    inFlight: readonly(inFlight),
    failures: readonly(failures),
    /** What the last poll threw, until one succeeds. */
    lastError,
    start,
    stop,
    pollNow,
  }
}
