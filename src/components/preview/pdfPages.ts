// Which page the PDF view (PdfView.vue) reads, and where its previous and
// next page buttons go, by where its pages lie and how far they are
// scrolled, as measured there.
//
// A page gone to has its top at the top of the screen, but for a gutter. The
// last pages may never get there: the pages scroll no further than to show
// the last one's foot, and those whose top lies lower are all on the screen
// at once, there, at the end. So the end is one stop: what is read there is
// the last page, Next goes to it from before them, and Prev from it goes
// back to the last page the pages move for. Pages that do not scroll at all
// (a short document, or one zoomed out) are all on the screen at once, at
// the top: one stop, where the first is read and neither button has anywhere
// to take them. The previous and next page buttons always move the pages,
// or are disabled.

/** Where the pages lie and how far they are scrolled, in CSS pixels. */
export interface PagesScrolled {
  /** How many pages there are. */
  count: number
  /** A page's top, from 1, down the pages (its `offsetTop`); asked only of the few pages needed. */
  topOf: (page: number) => number
  /** How far the pages are scrolled down (`scrollTop`). */
  scrollTop: number
  /** The height of the pages area seen (`clientHeight`). */
  clientHeight: number
  /** The height of all the pages, with the area's padding (`scrollHeight`). */
  scrollHeight: number
  /** How much of the area's foot a bar lies over (a phone's), which is not read. */
  under?: number
}

/** How far the pages scroll down at most. */
export function maxScroll(s: PagesScrolled): number {
  return Math.max(0, s.scrollHeight - s.clientHeight)
}

/** Whether the pages scroll at all: where they do not, they are all on the screen at once, and nothing moves them. */
export function scrolls(s: PagesScrolled): boolean {
  return maxScroll(s) >= 1
}

/** Scrolled to the top (or as good as: within a pixel). */
export function atTop(s: PagesScrolled): boolean {
  return s.scrollTop < 1
}

/** Scrolled to the end, where the pages scroll no further. Pages that do not scroll at all have no end of their own. */
export function atEnd(s: PagesScrolled): boolean {
  return scrolls(s) && s.scrollTop >= maxScroll(s) - 1
}

/** The page at `mark` px down the pages: the last whose top is at or above it; the first above them all. */
export function pageAt(s: Pick<PagesScrolled, 'count' | 'topOf'>, mark: number): number {
  let lo = 1
  let hi = s.count
  let found = 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (s.topOf(mid) <= mark) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * The page read: at the top, the first; at the end, the last; otherwise the
 * page at the top third of what is seen of the pages, above the bar laid
 * over their foot.
 */
export function pageInView(s: PagesScrolled): number {
  if (s.count < 1 || atTop(s)) return 1
  if (atEnd(s)) return s.count
  const seen = Math.max(0, s.clientHeight - (s.under ?? 0))
  return pageAt(s, s.scrollTop + seen / 3)
}

/** How far going to `page` scrolls the pages: its top `gutter` px below the top of the screen, as far as they go. */
export function scrollFor(s: PagesScrolled, page: number, gutter: number): number {
  const top = s.count < 1 ? 0 : s.topOf(Math.min(Math.max(1, page), s.count))
  return Math.min(Math.max(0, top - gutter), maxScroll(s))
}

/** Whether going to `page` would move the pages from where they are. */
function moves(s: PagesScrolled, page: number, gutter: number): boolean {
  return Math.abs(scrollFor(s, page, gutter) - s.scrollTop) >= 1
}

/**
 * Where the previous page button goes from `current`: the page before it, or,
 * where going there would not move the pages (the last pages, from the end),
 * the last page before it that would.
 */
export function prevPage(s: PagesScrolled, current: number, gutter: number): number {
  for (let page = current - 1; page >= 1; page--) if (moves(s, page, gutter)) return page
  return Math.max(1, current - 1)
}

/**
 * Where the next page button goes from `current`: the page after it, or,
 * where that page cannot come to the top (it lies at the end, with the pages
 * after it), the last page, which is what the end reads.
 */
export function nextPage(s: PagesScrolled, current: number, gutter: number): number {
  const page = Math.min(current + 1, s.count)
  const max = maxScroll(s)
  return max >= 1 && scrollFor(s, page, gutter) >= max - 1 ? s.count : page
}
