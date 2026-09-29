import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { usePolling } from './usePolling'

let visibility: 'visible' | 'hidden' = 'visible'
function setVisibility(v: 'visible' | 'hidden') {
  visibility = v
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => {
  vi.useRealTimers()
})

/** Runs usePolling inside a scope that can be torn down, as a component's is. */
function inScope<T>(make: () => T) {
  const scope = effectScope()
  const out = scope.run(make)!
  return { out, dispose: () => scope.stop() }
}

describe('usePolling', () => {
  it('polls at once, then every interval, timed from the end of each poll', async () => {
    const fn = vi.fn(() => new Promise<void>((r) => setTimeout(r, 500)))
    const { dispose } = inScope(() => usePolling(fn, { intervalMs: 1000 }))
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500) // the first poll ends
    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    // Never two at once: the next waits for this one's end.
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(fn).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('backs off after failures, up to the maximum, and recovers after a success', async () => {
    let fail = true
    const fn = vi.fn(async () => {
      if (fail) throw new Error('down')
    })
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 1000, maxIntervalMs: 5000 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(out.failures.value).toBe(1)
    expect(out.lastError.value).toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1) // 2 s after one failure
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000) // 4 s after two
    expect(fn).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5000) // capped at 5 s after three
    expect(fn).toHaveBeenCalledTimes(4)
    fail = false
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(5)
    expect(out.failures.value).toBe(0)
    expect(out.lastError.value).toBeNull()
    await vi.advanceTimersByTimeAsync(1000) // back to the interval
    expect(fn).toHaveBeenCalledTimes(6)
    dispose()
  })

  it('pauses while the page is hidden, and polls at once when it is shown', async () => {
    const fn = vi.fn(async () => undefined)
    const { dispose } = inScope(() => usePolling(fn, { intervalMs: 1000 }))
    await vi.advanceTimersByTimeAsync(0)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('slows down while hidden when told how often', async () => {
    const fn = vi.fn(async () => undefined)
    const { dispose } = inScope(() => usePolling(fn, { intervalMs: 1000, hiddenIntervalMs: 30_000 }))
    await vi.advanceTimersByTimeAsync(0)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('stops when its scope goes away', async () => {
    const fn = vi.fn(async () => undefined)
    const { dispose } = inScope(() => usePolling(fn, { intervalMs: 1000 }))
    await vi.advanceTimersByTimeAsync(0)
    dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    setVisibility('hidden')
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('follows enabled', async () => {
    const on = ref(false)
    const fn = vi.fn(async () => undefined)
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 1000, enabled: on }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).not.toHaveBeenCalled()
    on.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(out.active.value).toBe(true)
    on.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('polls now when asked, once more after one under way, and restarts the wait', async () => {
    let finish!: () => void
    const fn = vi.fn(() => new Promise<void>((r) => (finish = r)))
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 1000 }))
    expect(fn).toHaveBeenCalledTimes(1)
    const done = out.pollNow() // while the first is under way
    expect(fn).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    finish()
    await done
    await vi.advanceTimersByTimeAsync(999)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(3)
    finish()
    dispose()
  })

  it('polls again at once with an interval of 0 (a long poll), and still backs off after failures', async () => {
    let fail = false
    const fn = vi.fn(async () => {
      if (fail) throw new Error('down')
      await new Promise((r) => setTimeout(r, 25_000))
    })
    const { out, dispose } = inScope(() =>
      usePolling(fn, { intervalMs: 0, failureIntervalMs: 3000, maxIntervalMs: 48_000 }),
    )
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(25_000)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    fail = true
    await vi.advanceTimersByTimeAsync(25_000)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(out.failures.value).toBe(1)
    // 6 s after one failure, 12 s after two, as with an interval of 3 s.
    await vi.advanceTimersByTimeAsync(5999)
    expect(fn).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(11_999)
    expect(fn).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(5)
    // Three failures: 24 s; then one that answers, after its wait, and the next at once.
    fail = false
    await vi.advanceTimersByTimeAsync(24_000)
    expect(fn).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(25_000)
    await vi.advanceTimersByTimeAsync(1)
    expect(out.failures.value).toBe(0)
    expect(fn).toHaveBeenCalledTimes(7)
    dispose()
  })

  it('gives each poll a signal, aborted when polling stops, pauses for the hidden page, or goes away', async () => {
    const signals: AbortSignal[] = []
    const fn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((_, reject) => {
          signals.push(signal)
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const on = ref(true)
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 0, enabled: on }))
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(1)
    expect(signals[0]!.aborted).toBe(false)

    on.value = false
    await nextTick()
    expect(signals[0]!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    // Cut short is no failure.
    expect(out.failures.value).toBe(0)
    expect(out.lastError.value).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)

    on.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(2)
    setVisibility('hidden')
    expect(signals[1]!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(out.failures.value).toBe(0)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(3)

    dispose()
    expect(signals[2]!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('keeps a poll under way while hidden when it polls while hidden', async () => {
    const signals: AbortSignal[] = []
    const fn = vi.fn(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal)
      return new Promise<void>((r) => setTimeout(r, 1000))
    })
    const { dispose } = inScope(() => usePolling(fn, { intervalMs: 1000, hiddenIntervalMs: 30_000 }))
    setVisibility('hidden')
    expect(signals[0]!.aborted).toBe(false)
    dispose()
  })

  it('cuts the poll under way short for pollNow({ interrupt: true }), and polls again at once', async () => {
    let n = 0
    const signals: AbortSignal[] = []
    const fn = vi.fn(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal)
      // The first waits long; the next answers at once.
      if (n++ > 0) return Promise.resolve()
      return new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 25_000)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    })
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 3000 }))
    expect(fn).toHaveBeenCalledTimes(1)
    let done = false
    const p = out.pollNow({ interrupt: true }).then(() => (done = true))
    expect(signals[0]!.aborted).toBe(true)
    await p
    expect(done).toBe(true)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(out.failures.value).toBe(0)
    // And the wait starts again from there.
    await vi.advanceTimersByTimeAsync(2999)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('waits for start() when manual, and polls once for pollNow() while stopped', async () => {
    const fn = vi.fn(async () => undefined)
    const { out, dispose } = inScope(() => usePolling(fn, { intervalMs: 1000, manual: true }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).not.toHaveBeenCalled()
    await out.pollNow()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)
    out.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    dispose()
  })
})
