// Countdowns to a time on Core's clock (an invite link's end, say), as
// minutes and seconds.

/** Milliseconds from now until `until`, never below zero; zero for a time that cannot be read. */
export function remainingMs(until: string | number | Date | null | undefined, now: number): number {
  if (until === null || until === undefined) return 0
  const end = until instanceof Date ? until.getTime() : typeof until === 'number' ? until : Date.parse(until)
  if (!Number.isFinite(end)) return 0
  return Math.max(0, end - now)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * What is left as a clock shows it: mm:ss, and h:mm:ss from an hour up. It
 * counts whole seconds up, as a countdown does, so that 00:00 is shown only
 * once the time has come: 10:00 for the first second of ten minutes.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * The countdown as a screen reader should say it, in whole minutes and
 * seconds, counted as formatCountdown counts them.
 */
export function countdownParts(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000))
  return { minutes: Math.floor(total / 60), seconds: total % 60 }
}
