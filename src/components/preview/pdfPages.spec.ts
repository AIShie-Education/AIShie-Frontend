import { describe, expect, it } from 'vitest'
import {
  atEnd,
  atTop,
  maxScroll,
  nextPage,
  pageAt,
  pageInView,
  prevPage,
  scrollFor,
  type PagesScrolled,
} from './pdfPages'

const GUTTER = 16

/**
 * Pages laid out as the PDF view lays them out: `heights` one under the
 * other, 16 px apart, in an area `clientHeight` tall with `top` px of padding
 * above them and `bottom` below (on a phone, the room left the bar, `under`).
 */
function pages(
  heights: number[],
  {
    clientHeight,
    top = 8,
    bottom = 76,
    under = bottom,
  }: { clientHeight: number; top?: number; bottom?: number; under?: number },
) {
  const tops: number[] = []
  let y = top
  for (const h of heights) {
    tops.push(y)
    y += h + 16
  }
  const scrollHeight = y - 16 + bottom
  return (scrollTop: number): PagesScrolled => ({
    count: heights.length,
    topOf: (page) => tops[page - 1]!,
    scrollTop,
    clientHeight,
    scrollHeight,
    under,
  })
}

// The slide deck of e2e/pdf-phone.spec.ts on a phone of 390 × 844: eight
// slides 210 px tall, fitted to the width, in an area 746 px tall, scrolled
// at most 1130 px; slides 6 (top 1138), 7 (1364) and 8 (1590) are on the
// screen at the end, and 7 and 8 never come to its top.
const deck = pages(Array(8).fill(210), { clientHeight: 746 })
// The same deck on a taller phone (390 × 1000): the top third of the screen
// falls on the second slide at the top.
const tallDeck = pages(Array(8).fill(210), { clientHeight: 902 })

describe('where the pages are', () => {
  it('scroll at most to show the foot of the last page and the room under it', () => {
    expect(maxScroll(deck(0))).toBe(1130)
    expect(atTop(deck(0))).toBe(true)
    expect(atTop(deck(1))).toBe(false)
    expect(atEnd(deck(1130))).toBe(true)
    expect(atEnd(deck(1129.5))).toBe(true)
    expect(atEnd(deck(1128))).toBe(false)
  })

  it('have no end of their own where they do not scroll at all', () => {
    const two = pages([200, 200], { clientHeight: 900 })
    expect(maxScroll(two(0))).toBe(0)
    expect(atEnd(two(0))).toBe(false)
  })

  it('goes to a page with its top a gutter below the top of the screen, as far as the pages scroll', () => {
    expect(scrollFor(deck(0), 1, GUTTER)).toBe(0)
    expect(scrollFor(deck(0), 3, GUTTER)).toBe(460 - 16)
    expect(scrollFor(deck(0), 6, GUTTER)).toBe(1122)
    expect(scrollFor(deck(0), 7, GUTTER)).toBe(1130)
    expect(scrollFor(deck(0), 8, GUTTER)).toBe(1130)
    expect(scrollFor(deck(0), 99, GUTTER)).toBe(1130)
  })
})

describe('the page at a mark', () => {
  it('is the last whose top is at or above it, the first above them all', () => {
    const s = deck(0)
    expect(pageAt(s, 0)).toBe(1)
    expect(pageAt(s, 233)).toBe(1)
    expect(pageAt(s, 234)).toBe(2)
    expect(pageAt(s, 1363)).toBe(6)
    expect(pageAt(s, 5000)).toBe(8)
    expect(pageAt({ count: 0, topOf: () => 0 }, 100)).toBe(1)
  })
})

describe('the page read', () => {
  it('is the first at the top, even where the top third of the screen falls on the second', () => {
    // Without the rule of the top, the second: 0 + (902 − 76) / 3 = 275 is below its top, 234.
    expect(pageAt(tallDeck(0), (902 - 76) / 3)).toBe(2)
    expect(pageInView(tallDeck(0))).toBe(1)
    expect(pageInView(tallDeck(0.5))).toBe(1)
  })

  it('is the last at the end, where the last pages are all on the screen', () => {
    // Without the rule of the end, the sixth: 1130 + (746 − 76) / 3 = 1353, above the seventh's top.
    expect(pageAt(deck(1130), 1130 + (746 - 76) / 3)).toBe(6)
    expect(pageInView(deck(1130))).toBe(8)
    expect(pageInView(deck(1129.5))).toBe(8)
  })

  it('is otherwise the one at the top third of the screen, not at its top', () => {
    // At 446 px the second slide is at the top of the screen, and the third at its top third (669).
    expect(pageAt(deck(446), 446)).toBe(2)
    expect(pageInView(deck(446))).toBe(3)
    expect(pageInView(deck(900))).toBe(5)
  })

  it('measures that third above the bar laid over the foot of the pages, which is not read', () => {
    // 446 + 746 / 3 = 695 would be past the fourth slide's top (686); above the bar, 446 + 670 / 3 = 669 is not.
    expect(pageInView({ ...deck(446), under: 0 })).toBe(4)
    expect(pageInView(deck(446))).toBe(3)
  })

  it('is the first of pages that do not scroll, and of none', () => {
    const two = pages([200, 200], { clientHeight: 900 })
    expect(pageInView(two(0))).toBe(1)
    expect(pageInView({ count: 0, topOf: () => 0, scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toBe(1)
  })
})

describe('the previous page button', () => {
  it('goes to the page before', () => {
    expect(prevPage(deck(scrollFor(deck(0), 4, GUTTER)), 4, GUTTER)).toBe(3)
    expect(prevPage(deck(446), 3, GUTTER)).toBe(2)
    expect(prevPage(deck(scrollFor(deck(0), 2, GUTTER)), 2, GUTTER)).toBe(1)
  })

  it('from the end, goes back past the pages that cannot come to the top, to the last the pages move for', () => {
    // The seventh cannot come to the top: going there would leave the pages where they are, at the end.
    expect(scrollFor(deck(1130), 7, GUTTER)).toBe(1130)
    expect(prevPage(deck(1130), 8, GUTTER)).toBe(6)
    // Gone to the seventh (kept as the page read there), the same.
    expect(prevPage(deck(1130), 7, GUTTER)).toBe(6)
  })

  it('goes to the page before where nothing would move the pages, as they do not scroll', () => {
    const two = pages([200, 200], { clientHeight: 900 })
    expect(prevPage(two(0), 2, GUTTER)).toBe(1)
    expect(prevPage(two(0), 1, GUTTER)).toBe(1)
  })
})

describe('the next page button', () => {
  it('goes to the page after', () => {
    expect(nextPage(deck(0), 1, GUTTER)).toBe(2)
    expect(nextPage(deck(446), 3, GUTTER)).toBe(4)
  })

  it('goes to the last page where the one after lies at the end with it, which the end reads', () => {
    // From the sixth, gone to: the seventh lies at the end, which reads the eighth.
    expect(nextPage(deck(1122), 6, GUTTER)).toBe(8)
    expect(pageInView(deck(scrollFor(deck(0), 8, GUTTER)))).toBe(8)
    expect(nextPage(deck(1130), 8, GUTTER)).toBe(8)
  })

  it('goes to the page after where the pages do not scroll', () => {
    const two = pages([200, 200], { clientHeight: 900 })
    expect(nextPage(two(0), 1, GUTTER)).toBe(2)
  })
})
