import { computed, onScopeDispose, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'

/**
 * How wide an element is, kept up to date: its content box, which is what an
 * `@container (max-width: …)` measures. A page follows its own width, not the
 * window's, since the side bar takes from it (docs/CONVENTIONS.md); this is
 * for what a container query cannot switch, being the template's to choose:
 * how many columns el-descriptions lays out, which of a table's columns it
 * shows, a table or a card per row.
 *
 * Measure a part as wide as what is switched that no el-table changes the
 * size of: a card's title or its toolbar, not the card. An el-table lays
 * itself out again when its size changes, from a ResizeObserver of its own,
 * and the card around it would change height in that observer's callback, of
 * which this observer could not be told before the paint ("ResizeObserver
 * loop completed with undelivered notifications"). What follows the width may
 * change the measured part itself (a toolbar's row that wraps): that is never
 * done in an observer's callback, below.
 *
 * It is measured as soon as the element is there, before the page is first
 * painted, so that the page is never painted for a width it does not have;
 * and again as the window is resized, before the browser lays the page out
 * for its new size, so that what follows the width changes in that same
 * layout. A table is laid out once, as it would be by a media query: an
 * el-table lays itself out again, from a ResizeObserver of its own, and laid
 * out for the old width first it would be twice, the second time in a
 * cascade the browser reports as an error. Any other change of width (the
 * side bar opened or closed) is followed once the frame it was seen in is
 * over, for the same reason. null where the element is not laid out, and
 * where the browser cannot say (no ResizeObserver, as in the unit tests).
 */
export function useContainerWidth(target: Readonly<Ref<Element | null | undefined>>): Readonly<Ref<number | null>> {
  const width = ref<number | null>(null)
  if (typeof ResizeObserver === 'undefined') return width
  let later = 0
  const settle = (w: number | null) => {
    clearTimeout(later)
    width.value = w
  }
  const observer = new ResizeObserver((entries) => {
    const entry = entries.filter((e) => e.target === target.value).at(-1)
    if (!entry) return
    const w = entry.contentRect.width
    if (width.value === null) settle(w)
    else if (w !== width.value) {
      clearTimeout(later)
      later = window.setTimeout(() => settle(w))
    }
  })
  const onResize = () => {
    const el = target.value
    if (el) settle(laidOutWidth(el))
  }
  window.addEventListener('resize', onResize)
  watch(
    target,
    (el, _, onCleanup) => {
      settle(el ? laidOutWidth(el) : null)
      if (!el) return
      observer.observe(el)
      onCleanup(() => observer.unobserve(el))
    },
    { immediate: true, flush: 'post' },
  )
  onScopeDispose(() => {
    clearTimeout(later)
    window.removeEventListener('resize', onResize)
    observer.disconnect()
  })
  return width
}

/** The width of an element's content box as it is laid out now; null where it is not (or where nothing is, as in jsdom). */
function laidOutWidth(el: Element): number | null {
  const box = el.getBoundingClientRect().width
  if (!box) return null
  const s = getComputedStyle(el)
  const px = (v: string) => parseFloat(v) || 0
  return Math.max(0, box - px(s.paddingLeft) - px(s.paddingRight) - px(s.borderLeftWidth) - px(s.borderRightWidth))
}

/**
 * Whether an element is maxWidth px wide or less, as `@container (max-width:
 * <maxWidth>px)` would say of it: false until it is laid out, so that where
 * its width cannot be known the wide layout is shown.
 */
export function useContainerNarrow(
  target: Readonly<Ref<Element | null | undefined>>,
  maxWidth: MaybeRefOrGetter<number>,
): ComputedRef<boolean> {
  const width = useContainerWidth(target)
  return computed(() => width.value !== null && width.value <= toValue(maxWidth))
}
