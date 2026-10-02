import { describe, expect, it } from 'vitest'
import {
  CSS_UNITS,
  fitWidthOf,
  fitWidthZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  nearFit,
  pinchZoom,
  wheelZoom,
  zoomStep,
} from './pdfZoom'

// A page's size at 100 %, in CSS pixels.
const LETTER = { w: 612 * CSS_UNITS, h: 792 * CSS_UNITS }
const A4 = { w: 595 * CSS_UNITS, h: 842 * CSS_UNITS }
const SLIDE = { w: 960 * CSS_UNITS, h: 540 * CSS_UNITS }

describe('the zoom that fits the width', () => {
  it.each([
    // A phone, 390 px of pages area with 8 px gutters a side.
    ['a handout on a phone', 390, 16, [A4], 0.471],
    ['a slide deck on a phone', 390, 16, [SLIDE], 0.292],
    // A phone on its side.
    ['a slide deck on a phone on its side', 844, 16, [SLIDE], 0.646],
    // The desktop's viewer, 1200 px wide with 16 px gutters a side.
    ['a letter page on a desktop', 1200, 32, [LETTER], 1.431],
  ])('%s', (_, width, gutters, sizes, zoom) => {
    const z = fitWidthOf(width, gutters, sizes)
    expect(z).toBe(zoom)
    // It fills the width, and never overflows it by a rounding.
    const widest = sizes.reduce((m, s) => Math.max(m, s.w), 0)
    expect(widest * z).toBeLessThanOrEqual(width - gutters)
    expect(widest * z).toBeGreaterThan(width - gutters - 2)
  })

  it('fits the widest page, where they differ: a handout with a wide page in it', () => {
    expect(fitWidthOf(390, 16, [A4, { w: A4.h, h: A4.w }, A4])).toBe(fitWidthZoom(374, A4.h))
    expect(A4.h * fitWidthOf(390, 16, [A4, { w: A4.h, h: A4.w }])).toBeLessThanOrEqual(374)
  })

  it('is 100 % while nothing is known: no pages, or no width yet', () => {
    expect(fitWidthOf(390, 16, [])).toBe(1)
    expect(fitWidthOf(0, 0, [A4])).toBe(1)
    expect(fitWidthOf(10, 16, [A4])).toBe(1)
    expect(fitWidthZoom(374, 0)).toBe(1)
  })

  it('keeps within the zoom there is', () => {
    expect(fitWidthZoom(10, 10_000)).toBe(MIN_ZOOM)
    expect(fitWidthZoom(100_000, 100)).toBe(MAX_ZOOM)
  })
})

describe('zooming', () => {
  it('steps in and out from a zoom between the steps, as from one on them', () => {
    expect(zoomStep(0.471, 'in')).toBe(0.5)
    expect(zoomStep(0.471, 'out')).toBe(0.33)
    expect(zoomStep(1, 'in')).toBe(1.1)
    expect(zoomStep(1, 'out')).toBe(0.9)
    expect(zoomStep(5, 'in')).toBe(5)
    expect(zoomStep(0.25, 'out')).toBe(0.25)
  })

  it('pinches as much larger as the fingers are further apart, within the zoom there is', () => {
    expect(pinchZoom(0.5, 80, 160)).toBe(1)
    expect(pinchZoom(1, 160, 80)).toBe(0.5)
    expect(pinchZoom(2, 10, 1000)).toBe(MAX_ZOOM)
    expect(pinchZoom(0.2, 1000, 10)).toBe(MIN_ZOOM)
    // Fingers on one spot say nothing.
    expect(pinchZoom(0.7, 0, 50)).toBe(0.7)
  })

  it('takes a touchpad’s pinch, a wheel with Ctrl held, in and out alike', () => {
    // As the browser would zoom the page: Chrome gives a pinch to 110 % as -100 · ln 1.1.
    expect(wheelZoom(1, -100 * Math.log(1.1))).toBeCloseTo(1.1)
    expect(wheelZoom(wheelZoom(0.8, -12), 12)).toBeCloseTo(0.8)
    expect(wheelZoom(1, 0)).toBe(1)
    // A mouse's notch (100 px) is a step of about a quarter, not a leap.
    expect(wheelZoom(1, -100)).toBeCloseTo(Math.exp(0.25))
    expect(wheelZoom(1, 100)).toBeCloseTo(Math.exp(-0.25))
  })

  it('fits the width again where a pinch ends near it', () => {
    expect(nearFit(0.48, 0.471)).toBe(true)
    expect(nearFit(0.45, 0.471)).toBe(true)
    expect(nearFit(0.51, 0.471)).toBe(false)
    expect(nearFit(0.42, 0.471)).toBe(false)
    expect(nearFit(1, 0)).toBe(false)
  })
})
