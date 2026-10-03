<script setup lang="ts">
// A PDF in the page, with pdf.js (pdfjs.ts), loaded only when one is opened
// (FileViewer loads this component asynchronously). Its pages run one under
// the other, as in a reader, each drawn on a canvas once it is near the
// screen and let go once it is far from it, so that a long one costs no more
// than the few pages around where it is read. Over each page lies its text,
// transparent, to be selected and copied (pdf.js's text layer).
//
// The bar says which page is read and goes to another (the previous, the
// next, or one typed), where there is more than one, and zooms: in and out by
// steps, and to the width of the pages, which is how it opens and which it
// keeps as they change until it is zoomed by hand. It opens at its first
// page, or at the one it is given (the page an answer relied on). The page
// read is the first at the top, the last at the end, and otherwise the one
// at the top third of the screen; a page gone to is read until the reader
// scrolls the pages from there or zooms them, and is gone to again as the
// viewer moves them: as the pages area changes size (a phone turned on its
// side, a window made shorter), the zoom fitted to its new width or kept as
// set by hand, and as a page turns out to be of another size than the first.
// The previous and next page buttons move the pages or are disabled: Next at
// the end, both where the pages do not scroll (pdfPages.ts). Two fingers,
// anywhere on it, the bar too, pinch the pages larger or smaller (a
// touchpad's pinch, which comes as a wheel with Ctrl held, too), about the
// point between them, and the browser does not zoom the screen as well; a
// pinch that ends near the width fits it again.
//
// Where the view is narrow (a phone, 640 px or less of its own width, as the
// viewer is the whole screen up to a window that wide) or short (a phone on
// its side, 400 px or less of its own height), the bar is a compact one at
// the bottom, within a thumb's reach, over the pages, which scroll clear of
// it; fitted to the width it says so rather than its per cent, which it says
// again once zoomed by hand. Narrower still (360 px or less), its buttons are
// a little smaller. Where it still has no room for all it holds (a long
// document, a language whose words are longer, zoomed by hand), it leaves out
// one thing after another until it fits: its buttons a little smaller, then
// its per cent (the Fit width button says whether it is fitted), then the
// count of pages (still in the pages' name to a screen reader); never a digit
// cut short, which would read as another number.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContainerWidth } from '@/composables/useContainerWidth'
import { formatPct } from '@/utils/format'
import { atEnd, nextPage, pageAt, pageInView, prevPage, scrolls, type PagesScrolled } from './pdfPages'
import { openPdf, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from './pdfjs'
import { clampZoom, CSS_UNITS, fitWidthOf, nearFit, pinchZoom, wheelZoom, zoomStep } from './pdfZoom'

const props = defineProps<{
  /** The PDF's bytes: handed to pdf.js's worker, which takes them (the array is empty afterwards). */
  data: Uint8Array
  /** The file's name, which names the pages to a screen reader. */
  name: string
  /** The page to open at, from 1; past the last, the last. */
  page?: number | null
}>()
const emit = defineEmits<{
  /** It cannot be shown: protected by a password, or not a PDF this can read. */
  failed: [reason: 'password' | 'invalid']
  /** Its count of pages, once it is read: the bar counts them where there is more than one. */
  pages: [count: number]
}>()
const { t, n, locale } = useI18n()

/** The most pixels a page's canvas holds: past it, it is drawn at less than the screen's density. */
const MAX_CANVAS_PIXELS = 1 << 24
/** Room left above a page gone to, in CSS pixels. */
const GUTTER = 16

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const bar = ref<HTMLElement | null>(null)
/** The view's own width (null until it is laid out), as `@container (max-width: …)` would measure it. */
const width = useContainerWidth(root)
/** A phone's view, upright (its own width) or on its side (its own height): the compact bar at the bottom. */
const narrow = computed(() => width.value !== null && width.value <= 640)
/** A small phone's (320 or 360 px): the compact bar's buttons a little smaller, to keep within it. */
const tight = computed(() => width.value !== null && width.value <= 360)
/** The view's own height, measured once it is laid out; null until then. */
const height = ref<number | null>(null)
const short = computed(() => height.value !== null && height.value <= 400)
const compact = computed(() => narrow.value || short.value)
const doc = shallowRef<PDFDocumentProxy | null>(null)
const pageCount = ref(0)
/** Each page's size at 100 %, in CSS pixels; the first page's until a page is read. */
const sizes = ref<{ w: number; h: number }[]>([])
const zoom = ref(1)
/** Zoomed to the pages area's width, kept so as it changes. */
const fitWidth = ref(true)
const current = ref(1)
const pageInput = ref('1')
const loading = ref(true)

const percent = computed(() => Math.round(zoom.value * 100))
/**
 * How much the compact bar leaves out to fit, measured (fitBar): 0, nothing;
 * 1, its buttons are a little smaller; 2, its per cent is left out too; 3,
 * the count of pages as well.
 */
const give = ref(0)
/** Scrolled to the end, which reads the last page: the next page button has nowhere to take the pages. */
const end = ref(false)
/** The pages do not scroll at all, all on the screen at once: neither page button has anywhere to take them. */
const still = ref(false)
const canPrev = computed(() => current.value > 1 && !still.value)
const canNext = computed(() => current.value < pageCount.value && !end.value && !still.value)

let loadingTask: ReturnType<typeof openPdf> | null = null
let disposed = false

// --- What is drawn, page by page -----------------------------------------------------

interface Drawn {
  zoom: number
  task: RenderTask | null
  text: TextLayer | null
}
/** The pages drawn, or being drawn, and at what zoom. */
const drawn = new Map<number, Drawn>()
/** The pages near the screen. */
const near = new Set<number>()
let observer: IntersectionObserver | null = null
let resizer: ResizeObserver | null = null
let sizer: ResizeObserver | null = null

const slotOf = (page: number) => scroller.value?.querySelector<HTMLElement>(`.pdf-page[data-page="${page}"]`) ?? null

function outputScale(width: number, height: number): number {
  const dpr = window.devicePixelRatio || 1
  const area = width * height * dpr * dpr
  return area > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / (width * height)) : dpr
}

/** Lets a page go: its drawing stopped, its canvas emptied, its text taken off. */
function release(page: number) {
  const d = drawn.get(page)
  if (!d) return
  d.task?.cancel()
  d.text?.cancel()
  drawn.delete(page)
  const slot = slotOf(page)
  if (!slot) return
  for (const c of slot.querySelectorAll('canvas')) {
    c.width = 0
    c.height = 0
    c.remove()
  }
  slot.querySelector('.textLayer')?.replaceChildren()
  slot.classList.remove('is-drawn')
}

/** Draws a page at the zoom there is, over what it showed before, and its text over it. */
async function draw(page: number) {
  const pdf = doc.value
  const slot = slotOf(page)
  if (!pdf || !slot) return
  const at = zoom.value
  const old = drawn.get(page)
  old?.task?.cancel()
  old?.text?.cancel()
  const entry: Drawn = { zoom: at, task: null, text: null }
  drawn.set(page, entry)
  let p: PDFPageProxy
  try {
    p = await pdf.getPage(page)
  } catch {
    return
  }
  if (drawn.get(page) !== entry || disposed) return
  const viewport = p.getViewport({ scale: at * CSS_UNITS })
  // The page's own size, where it is not the first page's.
  const s = sizes.value[page - 1]
  const w = viewport.width / at
  const h = viewport.height / at
  if (s && (Math.abs(s.w - w) > 0.5 || Math.abs(s.h - h) > 0.5)) {
    // The pages after it move as it takes its own size, and where they end
    // with them: a page gone to is gone to again, where they now put it, as
    // when the area changes size (resized). Left where it was, it would be
    // read off the screen; or, where the browser keeps what it shows in place
    // as they move (scroll anchoring), let go, and another page read.
    const held = holding()
    sizes.value[page - 1] = { w, h }
    await nextTick()
    if (held !== null) goTo(held)
    // The pages have moved, and where they end with them.
    onScroll()
    if (drawn.get(page) !== entry || disposed) return
  }
  const ratio = outputScale(viewport.width, viewport.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * ratio)
  canvas.height = Math.floor(viewport.height * ratio)
  canvas.className = 'pdf-page__canvas'
  canvas.setAttribute('aria-hidden', 'true')
  const task = p.render({
    canvas,
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
  })
  entry.task = task
  try {
    await task.promise
  } catch {
    // Cancelled (a new zoom, the page gone from the screen), or a page that cannot be drawn.
    canvas.width = 0
    canvas.height = 0
    return
  }
  if (drawn.get(page) !== entry || disposed) {
    canvas.width = 0
    canvas.height = 0
    return
  }
  entry.task = null
  // The new drawing takes the old one's place.
  for (const c of slot.querySelectorAll('canvas')) {
    c.width = 0
    c.height = 0
    c.remove()
  }
  slot.prepend(canvas)
  slot.style.setProperty('--scale-factor', String(viewport.scale))
  slot.style.setProperty('--user-unit', String(viewport.userUnit ?? 1))
  slot.classList.add('is-drawn')
  slot.classList.remove('is-stale')

  // Its text, to be selected.
  const layer = slot.querySelector<HTMLElement>('.textLayer')
  if (!layer) return
  layer.replaceChildren()
  const text = new TextLayer({
    textContentSource: p.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
    container: layer,
    viewport,
  })
  entry.text = text
  try {
    await text.render()
  } catch {
    // Cancelled, or a page whose text cannot be read: it is still shown.
  }
}

// Drawing goes one page at a time, nearest the page read first.
let drawing = false
let scheduled = 0
function schedule() {
  if (scheduled || disposed) return
  scheduled = requestAnimationFrame(() => {
    scheduled = 0
    void drawNext()
  })
}
async function drawNext() {
  if (drawing || disposed) return
  // Far from the screen: let go.
  for (const page of [...drawn.keys()]) if (!near.has(page)) release(page)
  const want = [...near]
    .filter((page) => drawn.get(page)?.zoom !== zoom.value)
    .sort((a, b) => Math.abs(a - current.value) - Math.abs(b - current.value))
  const page = want[0]
  if (page === undefined) return
  drawing = true
  try {
    await draw(page)
  } finally {
    drawing = false
  }
  schedule()
}

function observe() {
  observer?.disconnect()
  near.clear()
  if (!scroller.value) return
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const page = Number((e.target as HTMLElement).dataset.page)
        if (e.isIntersecting) near.add(page)
        else near.delete(page)
      }
      schedule()
    },
    // A screen's height above and below.
    { root: scroller.value, rootMargin: '100% 0px' },
  )
  for (const slot of scroller.value.querySelectorAll('.pdf-page')) observer.observe(slot)
}

// --- Where it is read --------------------------------------------------------------------

/**
 * Where the pages lie and how far they are scrolled, as laid out now (each
 * page's top read only as it is asked for): on a phone, with the room they
 * leave the bar laid over their foot, which is not read.
 */
function measured(): PagesScrolled | null {
  const el = scroller.value
  if (!el) return null
  const slots = el.querySelectorAll<HTMLElement>('.pdf-page')
  return {
    count: slots.length,
    topOf: (page) => slots[page - 1]?.offsetTop ?? 0,
    scrollTop: el.scrollTop,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    under: compact.value ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0,
  }
}
let tracking = 0
/**
 * Where going to a page left the pages scrolled: a page near the end, which
 * cannot come to the top of the screen, is still the page read until they
 * are scrolled from there or zoomed (setZoom), and gone to again as the
 * pages area changes size (resized) or a page turns out to be of another
 * size than the first (draw). Pages that do not scroll stay where they were
 * as they are zoomed in, at the top: kept, the page gone to would be read
 * where it is not, and Prev would change the number without moving them.
 */
let heldAt: number | null = null
/** The page gone to, while the pages are where going to it left them (heldAt); null once they are not. */
function holding(): number | null {
  const el = scroller.value
  return heldAt !== null && el && Math.abs(el.scrollTop - heldAt) < 1 ? current.value : null
}
/** Reads, at the next frame, where the pages are: the page read (pageInView), whether they are at the end, and whether they scroll at all. */
function onScroll() {
  if (tracking) return
  tracking = requestAnimationFrame(() => {
    tracking = 0
    const s = measured()
    if (!s) return
    end.value = atEnd(s)
    still.value = !scrolls(s)
    if (heldAt !== null && Math.abs(s.scrollTop - heldAt) < 1) return
    heldAt = null
    const page = pageInView(s)
    if (page !== current.value) current.value = page
  })
}
watch(current, (page) => (pageInput.value = String(page)))

/** The previous page: one the pages move for (pdfPages.ts). */
function goToPrev() {
  const s = measured()
  goTo(s ? prevPage(s, current.value, GUTTER) : current.value - 1)
}
/** The next page, or, where that lies at the end with the pages after it, the last. */
function goToNext() {
  const s = measured()
  goTo(s ? nextPage(s, current.value, GUTTER) : current.value + 1)
}

/** Goes to a page, its top at the top of the screen. */
function goTo(page: number) {
  const target = Math.min(Math.max(1, Math.round(page)), pageCount.value || 1)
  const slot = slotOf(target)
  const el = scroller.value
  if (slot && el) {
    el.scrollTop = slot.offsetTop - GUTTER
    heldAt = el.scrollTop
  }
  current.value = target
  pageInput.value = String(target)
}
function goToTyped() {
  const page = Number(pageInput.value)
  if (Number.isFinite(page) && page >= 1) goTo(page)
  else pageInput.value = String(current.value)
}

// --- Zoom ----------------------------------------------------------------------------------

/** The zoom at which the widest page fills the pages area's width, within its gutters. */
function widthZoom(): number {
  const el = scroller.value
  if (!el) return 1
  const style = getComputedStyle(el)
  const gutters = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  return fitWidthOf(el.clientWidth, gutters, sizes.value)
}

let redraw = 0
/**
 * Sets the zoom, keeping where it is read where it was on the screen: the
 * point `at` (in the window's pixels), a pinch's, or else the top of the
 * screen in the page read. The pages are drawn again once it settles.
 */
async function setZoom(next: number, at?: { x: number; y: number }) {
  const el = scroller.value
  const z = clampZoom(next)
  if (!el || Math.abs(z - zoom.value) < 0.001) return
  // Zoomed, the pages are read where they are, whether or not they moved: a
  // page gone to is let go (resized, the viewer's own zoom, goes to it again).
  heldAt = null
  const box = at ? el.getBoundingClientRect() : null
  const ax = at && box ? at.x - box.left - el.clientLeft : 0
  const ay = at && box ? at.y - box.top - el.clientTop : 0
  const s = at ? measured() : null
  const page = s ? pageAt(s, el.scrollTop + ay) : current.value
  const slot = slotOf(page)
  const down = slot ? (el.scrollTop + ay - slot.offsetTop) / Math.max(1, slot.offsetHeight) : 0
  const across = slot && at ? (el.scrollLeft + ax - slot.offsetLeft) / Math.max(1, slot.offsetWidth) : null
  zoom.value = z
  for (const s of el.querySelectorAll('.pdf-page.is-drawn')) s.classList.add('is-stale')
  await nextTick()
  const after = slotOf(page)
  if (after) {
    el.scrollTop = after.offsetTop + down * after.offsetHeight - ay
    if (across !== null) el.scrollLeft = after.offsetLeft + across * after.offsetWidth - ax
  }
  // Where the pages end has moved, scrolled or not.
  onScroll()
  clearTimeout(redraw)
  redraw = window.setTimeout(schedule, 150)
}
/**
 * The pages area has changed size (a window made narrower or shorter, a phone
 * turned on its side, a scroll bar come): fitted to the width, the zoom is
 * fitted to it again. It is the viewer's doing, not the reader's, so a page
 * gone to is gone to again, where the pages now put it (at the end, for one
 * that cannot come to the top), and is still the page read, whether the zoom
 * is fitted again or was set by hand. Kept where it was instead, a page near
 * the end would be read off the screen: the zoom keeps the top of the screen
 * as far from the page's top, in its heights, and at the end that is pages
 * above it; and the end of a shorter area lies further down, so that a page
 * left where it was is below the screen, or under the bar.
 */
async function resized() {
  const held = holding()
  if (fitWidth.value) await setZoom(widthZoom())
  if (held !== null) goTo(held)
  // Taller or shorter, the pages end elsewhere on the screen.
  onScroll()
}
function zoomIn() {
  fitWidth.value = false
  void setZoom(zoomStep(zoom.value, 'in'))
}
function zoomOut() {
  fitWidth.value = false
  void setZoom(zoomStep(zoom.value, 'out'))
}
function toFitWidth() {
  fitWidth.value = true
  void setZoom(widthZoom())
}
function actualSize() {
  fitWidth.value = false
  void setZoom(1)
}

// --- Pinching ---------------------------------------------------------------------------

/** A zoom a pinch has come to, set at the next frame: a frame's moves are one zoom. */
let queued: { zoom: number; at: { x: number; y: number } } | null = null
let queuedFrame = 0
function queueZoom(z: number, at: { x: number; y: number }) {
  queued = { zoom: z, at }
  if (queuedFrame) return
  queuedFrame = requestAnimationFrame(() => {
    queuedFrame = 0
    const q = queued
    queued = null
    if (q) void setZoom(q.zoom, q.at)
  })
}
/** Sets at once the zoom a pinch has come to, if a frame has not yet. */
async function flushZoom() {
  cancelAnimationFrame(queuedFrame)
  queuedFrame = 0
  const q = queued
  queued = null
  if (q) await setZoom(q.zoom, q.at)
}

/** Two fingers on the pages: how far apart they began, and the zoom then. */
let pinch: { distance: number; zoom: number } | null = null
const apart = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)
const between = (t: TouchList) => ({ x: (t[0]!.clientX + t[1]!.clientX) / 2, y: (t[0]!.clientY + t[1]!.clientY) / 2 })

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 2 || !pageCount.value) return
  pinch = { distance: apart(e.touches), zoom: queued?.zoom ?? zoom.value }
}
function onTouchMove(e: TouchEvent) {
  if (!pinch || e.touches.length !== 2) return
  // The pages zoom, not the screen (the pages area's touch-action stops most browsers; this, the rest).
  if (e.cancelable) e.preventDefault()
  const z = pinchZoom(pinch.zoom, pinch.distance, apart(e.touches))
  if (Math.abs(z - zoom.value) < 0.001 && !queued) return
  fitWidth.value = false
  queueZoom(z, between(e.touches))
}
async function onTouchEnd(e: TouchEvent) {
  if (!pinch || e.touches.length >= 2) return
  pinch = null
  await flushZoom()
  if (fitWidth.value) return
  // Ended about the width: fitted to it again, and kept so.
  const fit = widthZoom()
  if (nearFit(zoom.value, fit)) {
    fitWidth.value = true
    await setZoom(fit)
  }
}
/** A touchpad's pinch comes as a wheel with Ctrl held: it zooms the pages, not the page they are in. */
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey || !pageCount.value) return
  e.preventDefault()
  fitWidth.value = false
  // A wheel that counts in lines (Firefox's mouse) is taken at a line's pixels.
  const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY
  queueZoom(wheelZoom(queued?.zoom ?? zoom.value, delta), { x: e.clientX, y: e.clientY })
}

// --- The compact bar's room ------------------------------------------------------------------

let fitting = 0
/**
 * Leaves out of the compact bar, one after the other, what it has no room
 * for (`give`), from all it holds: measured before the browser paints, so
 * that nothing is ever shown cut short.
 */
async function fitBar() {
  const run = ++fitting
  give.value = 0
  if (!compact.value) return
  await nextTick()
  while (run === fitting && give.value < 3 && bar.value && bar.value.scrollWidth > bar.value.clientWidth) {
    give.value++
    await nextTick()
  }
}
// What changes what it holds, or its room: the view's size, the per cent's
// digits, whether it is shown (fitted or not), the count's digits, the language.
watch([compact, width, fitWidth, () => String(percent.value).length, pageCount, locale], () => void fitBar(), {
  flush: 'post',
})

// --- Opening it ------------------------------------------------------------------------------

onMounted(async () => {
  const box = root.value
  if (box && typeof ResizeObserver !== 'undefined') {
    // Its height as laid out (a dialog's coming in moves it, not its size).
    height.value = box.offsetHeight || null
    sizer = new ResizeObserver((entries) => {
      height.value = entries.at(-1)!.contentRect.height || null
    })
    sizer.observe(box)
  }
  // The bar's words are measured again in the font they are shown in, once it has come.
  void document.fonts?.ready.then(() => {
    if (!disposed) void fitBar()
  })
  if (box) {
    // On all of it, the bar as well as the pages, so that a pinch begun on the bar zooms them too.
    // Not passive: a pinch's moves, and a touchpad's, are kept from the browser.
    box.addEventListener('touchstart', onTouchStart, { passive: true })
    box.addEventListener('touchmove', onTouchMove, { passive: false })
    box.addEventListener('touchend', onTouchEnd)
    box.addEventListener('touchcancel', onTouchEnd)
    box.addEventListener('wheel', onWheel, { passive: false })
  }
  loadingTask = openPdf(props.data)
  let pdf: PDFDocumentProxy
  try {
    pdf = await loadingTask.promise
  } catch (e) {
    if (disposed) return
    loading.value = false
    emit('failed', (e as { name?: string })?.name === 'PasswordException' ? 'password' : 'invalid')
    return
  }
  if (disposed) return
  doc.value = pdf
  let first: { w: number; h: number } = { w: 612 * CSS_UNITS, h: 792 * CSS_UNITS }
  try {
    const p1 = await pdf.getPage(1)
    const v = p1.getViewport({ scale: CSS_UNITS })
    first = { w: v.width, h: v.height }
  } catch {
    // The first page cannot be read: a letter page stands in.
  }
  if (disposed) return
  sizes.value = Array.from({ length: pdf.numPages }, () => ({ ...first }))
  pageCount.value = pdf.numPages
  emit('pages', pdf.numPages)
  zoom.value = widthZoom()
  loading.value = false
  await nextTick()
  if (props.page && props.page > 1) goTo(props.page)
  observe()
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizer = new ResizeObserver(() => void resized())
    resizer.observe(scroller.value)
  }
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  resizer?.disconnect()
  sizer?.disconnect()
  cancelAnimationFrame(scheduled)
  cancelAnimationFrame(tracking)
  cancelAnimationFrame(queuedFrame)
  clearTimeout(redraw)
  for (const page of [...drawn.keys()]) release(page)
  // Its document and its worker go with it.
  void loadingTask?.destroy()
  loadingTask = null
  doc.value = null
})

defineExpose({ goTo, zoomIn, zoomOut, toFitWidth, current, pageCount, zoom })
</script>

<template>
  <div ref="root" class="pdf-view" :class="{ 'is-compact': compact, 'is-tight': compact && (tight || give >= 1) }">
    <div ref="bar" class="pdf-view__bar" role="toolbar" :aria-label="t('preview.pdf.toolbar')">
      <div v-if="pageCount !== 1" class="pdf-view__group pdf-view__paging">
        <el-button
          text
          size="small"
          :disabled="!canPrev"
          :aria-label="t('preview.pdf.prevPage')"
          :title="t('preview.pdf.prevPage')"
          class="pdf-view__prev"
          @click="goToPrev"
        >
          <el-icon><ArrowUp /></el-icon>
        </el-button>
        <input
          v-model="pageInput"
          class="pdf-view__page-input"
          inputmode="numeric"
          :aria-label="t('preview.pdf.pageInput')"
          :disabled="!pageCount"
          :size="Math.max(2, String(pageCount).length)"
          :style="{ '--digits': Math.max(2, String(pageCount).length) }"
          @keydown.enter.prevent="goToTyped"
          @blur="goToTyped"
        />
        <span v-if="!compact || give < 3" class="pdf-view__of">{{ t('preview.pdf.of', { total: n(pageCount) }) }}</span>
        <el-button
          text
          size="small"
          :disabled="!canNext"
          :aria-label="t('preview.pdf.nextPage')"
          :title="t('preview.pdf.nextPage')"
          class="pdf-view__next"
          @click="goToNext"
        >
          <el-icon><ArrowDown /></el-icon>
        </el-button>
      </div>
      <div class="pdf-view__group pdf-view__zoom">
        <el-button
          text
          size="small"
          :disabled="!pageCount"
          :aria-label="t('preview.zoom.out')"
          :title="t('preview.zoom.out')"
          @click="zoomOut"
        >
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <button
          v-if="!compact || (!fitWidth && give < 2)"
          type="button"
          class="pdf-view__percent"
          :disabled="!pageCount"
          :aria-label="t('preview.zoom.actual', { n: formatPct(percent / 100) })"
          :title="t('preview.zoom.actualTip')"
          @click="actualSize"
        >
          {{ formatPct(percent / 100) }}
        </button>
        <el-button
          text
          size="small"
          :disabled="!pageCount"
          :aria-label="t('preview.zoom.in')"
          :title="t('preview.zoom.in')"
          @click="zoomIn"
        >
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button
          text
          size="small"
          :disabled="!pageCount"
          :aria-pressed="fitWidth ? 'true' : 'false'"
          :aria-label="t('preview.zoom.fitWidth')"
          :title="compact ? t('preview.zoom.fitWidth') : undefined"
          :class="{ 'is-pressed': fitWidth }"
          class="pdf-view__fit"
          @click="toFitWidth"
        >
          <el-icon><ScaleToOriginal /></el-icon>
          <span v-if="!compact">{{ t('preview.zoom.fitWidth') }}</span>
        </el-button>
      </div>
    </div>
    <div
      ref="scroller"
      class="pdf-view__pages"
      tabindex="0"
      role="document"
      :aria-label="t('preview.pdf.pages', { name, page: current, total: pageCount })"
      :aria-busy="loading ? 'true' : undefined"
      @scroll.passive="onScroll"
    >
      <div v-if="loading" class="pdf-view__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <div
        v-for="page in pageCount"
        :key="page"
        class="pdf-page"
        :data-page="page"
        :style="{
          width: `${Math.floor((sizes[page - 1]?.w ?? 0) * zoom)}px`,
          height: `${Math.floor((sizes[page - 1]?.h ?? 0) * zoom)}px`,
        }"
      >
        <div class="textLayer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-view {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.pdf-view__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--app-line);
  background: var(--el-bg-color);
  font-size: 13px;
  /* Nothing to scroll here, and two fingers zoom the pages (onTouchMove, on all of the view), not the screen. */
  touch-action: none;
}
.pdf-view__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.pdf-view__group .el-button + .el-button {
  margin-left: 0;
}
.pdf-view__zoom {
  margin-left: auto;
}
.pdf-view__page-input {
  width: auto;
  min-width: 2.5em;
  padding: 2px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--app-ink);
  font: inherit;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
/* On a touch screen, 16 px, below which iOS zooms into a field it focuses. */
@media (pointer: coarse) {
  .pdf-view__page-input {
    font-size: 16px;
  }
}
.pdf-view__page-input:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 1px;
}
.pdf-view__of {
  margin: 0 4px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pdf-view__percent {
  min-width: 4.2em;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--app-ink-2);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.pdf-view__percent:hover:not(:disabled) {
  background: var(--el-fill-color-light);
}
.pdf-view__fit.is-pressed {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.pdf-view__pages {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: var(--app-ground-2);
  outline: none;
  /* Two fingers zoom the pages (onTouchMove), not the screen: the browser only scrolls here. */
  touch-action: pan-x pan-y;
}
.pdf-view__pages:focus-visible {
  box-shadow: inset 0 0 0 2px var(--app-focus);
}
.pdf-view__loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
  font-size: 24px;
  color: var(--app-ink-3);
}
.pdf-page {
  /* pdf.js's text layer sizes itself by these (see its pdf_viewer.css). */
  --scale-factor: 1;
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor) * var(--user-unit));
  --scale-round-x: 1px;
  --scale-round-y: 1px;
  position: relative;
  margin: 0 auto 16px;
  background: #fff;
  box-shadow:
    0 1px 3px rgb(0 0 0 / 12%),
    0 0 0 1px rgb(0 0 0 / 6%);
  overflow: hidden;
}
.pdf-page:last-child {
  margin-bottom: 0;
}
.pdf-page :deep(.pdf-page__canvas) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
/* Zoomed and not yet drawn again: the old drawing stretched, its text hidden until it fits again. */
.pdf-page.is-stale :deep(.textLayer) {
  visibility: hidden;
}

/* pdf.js's text layer: each run of text, transparent, over where it is drawn (from its pdf_viewer.css). */
.pdf-page :deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-align: initial;
  letter-spacing: normal;
  word-spacing: normal;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.pdf-page :deep(.textLayer :is(span, br)) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
}
.pdf-page :deep(.textLayer > :not(.markedContent)),
.pdf-page :deep(.textLayer .markedContent span:not(.markedContent)) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pdf-page :deep(.textLayer .markedContent) {
  display: contents;
}
.pdf-page :deep(.textLayer ::selection) {
  background: color-mix(in srgb, AccentColor, transparent 60%);
  color: transparent;
}
.pdf-page :deep(.textLayer br::selection) {
  background: transparent;
}
.pdf-page :deep(.textLayer .endOfContent) {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  cursor: default;
  user-select: none;
}
.pdf-page :deep(.textLayer.selecting .endOfContent) {
  top: 0;
}

/*
 * A phone's: the bar a compact one at the bottom, over the pages, within a
 * thumb's reach and above the screen's safe area, its buttons big enough to
 * touch; the pages scroll clear of it, and keep narrower gutters.
 */
.pdf-view.is-compact .pdf-view__pages {
  padding: 8px 8px calc(76px + env(safe-area-inset-bottom, 0px));
}
.pdf-view.is-compact .pdf-view__bar {
  position: absolute;
  z-index: 2;
  /* As wide as what it holds, centred, and never wider than the view less 8 px a side. */
  left: 8px;
  right: 8px;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  width: fit-content;
  max-width: calc(100% - 16px);
  margin: 0 auto;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 0;
  padding: 4px;
  border: 1px solid var(--app-line);
  border-radius: 999px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  font-size: 15px;
}
.pdf-view.is-compact .pdf-view__zoom {
  margin-left: 0;
}
.pdf-view.is-compact .pdf-view__paging + .pdf-view__zoom {
  margin-left: 4px;
  padding-left: 4px;
  border-left: 1px solid var(--app-line);
}
.pdf-view.is-compact .pdf-view__bar .el-button {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 999px;
  font-size: 18px;
}
.pdf-view.is-compact .pdf-view__page-input {
  /* 16 px, or a phone's browser zooms the screen to it as it is focused. */
  font-size: 16px;
  /* As wide as the count's digits (tabular, each 1ch), and no narrower than a button. */
  box-sizing: border-box;
  width: calc(var(--digits, 2) * 1ch + 16px);
  min-width: 36px;
  padding: 4px 6px;
}
.pdf-view.is-compact .pdf-view__of {
  margin: 0 2px 0 4px;
}
/* Nothing shrinks, and nothing is cut short: what has no room is left out (fitBar). */
.pdf-view.is-compact .pdf-view__group,
.pdf-view.is-compact .pdf-view__bar .el-button,
.pdf-view.is-compact .pdf-view__page-input,
.pdf-view.is-compact .pdf-view__of,
.pdf-view.is-compact .pdf-view__percent {
  flex-shrink: 0;
}
/* As tall as the buttons beside it, and no narrower, to be touched as easily. */
.pdf-view.is-compact .pdf-view__percent {
  min-width: 40px;
  height: 40px;
  padding: 0 4px;
  border-radius: 999px;
}
.pdf-view.is-tight .pdf-view__bar .el-button {
  width: 36px;
  height: 36px;
}
.pdf-view.is-tight .pdf-view__percent {
  min-width: 36px;
  height: 36px;
}
.pdf-view.is-tight .pdf-view__group {
  gap: 0;
}
.pdf-view.is-tight .pdf-view__paging + .pdf-view__zoom {
  margin-left: 2px;
  padding-left: 2px;
}
.pdf-view.is-tight .pdf-view__page-input {
  width: calc(var(--digits, 2) * 1ch + 12px);
  padding: 4px;
}
.pdf-view.is-tight .pdf-view__of {
  margin: 0 2px;
}
.pdf-view.is-tight .pdf-view__percent {
  padding: 0 2px;
}
</style>
