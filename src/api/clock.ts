// Core's clock, as this browser can tell it. A time Core gives (when a join
// link stops working, say) is on Core's clock, and a countdown to it on this
// browser's would be wrong by however far this browser's clock is off: a
// classroom computer's often is, by minutes. Every answer from Core carries
// a Date header, what its clock read as it answered, and each one moves the
// estimate here.

/**
 * Differences smaller than this are the header's own rounding (it is whole
 * seconds) and the time the answer took to arrive, not a clock that is off:
 * they are taken as none, so that a countdown does not jump a second back
 * and forth from one answer to the next. So is an answer that differs by
 * less than this from what is known already, when the clocks do differ: a
 * computer ten minutes off is still ten minutes off, and a link's last
 * second, once shown run out, does not come back with the next answer.
 */
export const CORE_SKEW_FLOOR_MS = 2000

let offsetMs = 0

/**
 * Takes what Core's Date header said, as an answer arrived at receivedAt
 * (this browser's clock). The header is rounded down to the second, so
 * Core's clock read half a second more, on average.
 */
export function noteCoreDate(date: string | null | undefined, receivedAt = Date.now()): void {
  if (!date) return
  const at = Date.parse(date)
  if (!Number.isFinite(at)) return
  const d = at + 500 - receivedAt
  if (Math.abs(d - offsetMs) < CORE_SKEW_FLOOR_MS) return
  offsetMs = Math.abs(d) < CORE_SKEW_FLOOR_MS ? 0 : d
}

/** How far Core's clock is ahead of this browser's, in milliseconds (behind, when negative). */
export function coreClockOffset(): number {
  return offsetMs
}

/** The time now on Core's clock, as far as this browser can tell. */
export function coreNow(): number {
  return Date.now() + offsetMs
}

/** Forgets what was learnt (for tests). */
export function resetCoreClock(): void {
  offsetMs = 0
}
