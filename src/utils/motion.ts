/** The reader's system-level request for less non-essential motion. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Read at the moment motion starts, so a changed system preference takes effect. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true
}

/** A scroll's behaviour, smooth only when requested and the reader allows it. */
export function scrollBehavior(smooth = true): ScrollBehavior {
  return smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
}
