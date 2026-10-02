// What the PDF view (PdfView.vue) zooms to: to the width of its pages area,
// by steps, by a pinch of two fingers (or a pinch of a touchpad, which comes
// as a wheel with Ctrl held), and when such a pinch ends near the width, to
// the width again.

/** CSS pixels to a PDF's point: 100 % shows a page at its printed size. */
export const CSS_UNITS = 96 / 72
/** The zoom steps, as a reader's are. */
export const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
/** How near the width's zoom a pinch may end and be taken as fitted to the width (a part of it). */
export const SNAP = 0.06

export const clampZoom = (z: number) => Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM)

/**
 * The zoom at which the widest page fills `available` CSS pixels (the pages
 * area's width less its gutters), rounded down so that it never overflows by
 * a rounding: 1 where nothing is known yet.
 */
export function fitWidthZoom(available: number, widest: number): number {
  if (!(widest > 0) || !(available > 0)) return 1
  return clampZoom(Math.floor((available / widest) * 1000) / 1000)
}

/** The width's zoom for the widest of `sizes` (each page at 100 %) in a pages area `clientWidth` wide with gutters of `gutters` in all. */
export function fitWidthOf(clientWidth: number, gutters: number, sizes: readonly { w: number }[]): number {
  const widest = sizes.reduce((m, s) => Math.max(m, s.w), 0)
  return fitWidthZoom(clientWidth - gutters, widest)
}

/** The next step in or out from `zoom`. */
export function zoomStep(zoom: number, dir: 'in' | 'out'): number {
  return dir === 'in'
    ? (ZOOMS.find((z) => z > zoom + 0.001) ?? ZOOMS.at(-1)!)
    : ([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? ZOOMS[0]!)
}

/** The zoom a pinch has come to: what it started at, as much larger as the fingers are further apart. */
export function pinchZoom(start: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return start
  return clampZoom(start * (distance / startDistance))
}

/**
 * The zoom a touchpad's pinch (a wheel with Ctrl held) comes to, by its delta
 * in pixels: as the browser would zoom the page by it, but no more than about
 * a quarter at a time, which a mouse's wheel with Ctrl held takes a notch.
 */
export function wheelZoom(zoom: number, deltaY: number): number {
  const d = Math.min(Math.max(deltaY, -25), 25)
  return clampZoom(zoom * Math.exp(-d / 100))
}

/** Whether a zoom a pinch ended at is near enough the width's to be fitted to it again. */
export function nearFit(zoom: number, fit: number): boolean {
  return fit > 0 && Math.abs(zoom - fit) / fit <= SNAP
}
