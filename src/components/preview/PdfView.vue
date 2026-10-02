<script setup lang="ts">
// A PDF in the page, with pdf.js (pdfjs.ts), loaded only when one is opened
// (FileViewer loads this component asynchronously). Its pages run one under
// the other, as in a reader, each drawn on a canvas once it is near the
// screen and let go once it is far from it, so that a long one costs no more
// than the few pages around where it is read. Over each page lies its text,
// transparent, to be selected and copied (pdf.js's text layer).
//
// The bar above says which page is read and goes to another (the previous,
// the next, or one typed), and zooms: in and out by steps, and to the
// width of the window, which is how it opens and which it keeps as the
// window changes until it is zoomed by hand. It opens at its first page, or
// at the one it is given (the page an answer relied on).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { openPdf, TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from './pdfjs'

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
}>()
const { t, n } = useI18n()

/** CSS pixels to a PDF's point: 100 % shows a page at its printed size. */
const CSS_UNITS = 96 / 72
/** The zoom steps, as a reader's are. */
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
/** The most pixels a page's canvas holds: past it, it is drawn at less than the screen's density. */
const MAX_CANVAS_PIXELS = 1 << 24
/** Room left above a page gone to, in CSS pixels. */
const GUTTER = 16

const scroller = ref<HTMLElement | null>(null)
const doc = shallowRef<PDFDocumentProxy | null>(null)
const pageCount = ref(0)
/** Each page's size at 100 %, in CSS pixels; the first page's until a page is read. */
const sizes = ref<{ w: number; h: number }[]>([])
const zoom = ref(1)
/** Zoomed to the window's width, kept so as it changes. */
const fitWidth = ref(true)
const current = ref(1)
const pageInput = ref('1')
const loading = ref(true)

const percent = computed(() => Math.round(zoom.value * 100))
const canPrev = computed(() => current.value > 1)
const canNext = computed(() => current.value < pageCount.value)

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
    sizes.value[page - 1] = { w, h }
    await nextTick()
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

/** The page at the top third of the screen. */
function pageInView(): number {
  const el = scroller.value
  if (!el) return 1
  const mark = el.scrollTop + el.clientHeight / 3
  const slots = el.querySelectorAll<HTMLElement>('.pdf-page')
  let lo = 0
  let hi = slots.length - 1
  let found = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (slots[mid]!.offsetTop <= mark) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found + 1
}
let tracking = 0
function onScroll() {
  if (tracking) return
  tracking = requestAnimationFrame(() => {
    tracking = 0
    const page = pageInView()
    if (page !== current.value) current.value = page
  })
}
watch(current, (page) => (pageInput.value = String(page)))

/** Goes to a page, its top at the top of the screen. */
function goTo(page: number) {
  const target = Math.min(Math.max(1, Math.round(page)), pageCount.value || 1)
  const slot = slotOf(target)
  if (slot && scroller.value) scroller.value.scrollTop = slot.offsetTop - GUTTER
  current.value = target
  pageInput.value = String(target)
}
function goToTyped() {
  const page = Number(pageInput.value)
  if (Number.isFinite(page) && page >= 1) goTo(page)
  else pageInput.value = String(current.value)
}

// --- Zoom ----------------------------------------------------------------------------------

/** The zoom at which the widest page fills the window's width, within its gutters. */
function widthZoom(): number {
  const el = scroller.value
  const widest = sizes.value.reduce((m, s) => Math.max(m, s.w), 0)
  if (!el || !widest) return 1
  const style = getComputedStyle(el)
  const gutters = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  return Math.max(0.1, Math.floor(((el.clientWidth - gutters) / widest) * 1000) / 1000)
}

let redraw = 0
/** Sets the zoom, keeping the page read where it was on the screen; the pages are drawn again once it settles. */
async function setZoom(next: number) {
  const el = scroller.value
  const z = Math.min(Math.max(next, 0.1), 8)
  if (!el || Math.abs(z - zoom.value) < 0.001) return
  const page = current.value
  const slot = slotOf(page)
  const within = slot ? (el.scrollTop - slot.offsetTop) / Math.max(1, slot.offsetHeight) : 0
  zoom.value = z
  for (const s of el.querySelectorAll('.pdf-page.is-drawn')) s.classList.add('is-stale')
  await nextTick()
  const after = slotOf(page)
  if (after) el.scrollTop = after.offsetTop + within * after.offsetHeight
  clearTimeout(redraw)
  redraw = window.setTimeout(schedule, 150)
}
function zoomIn() {
  fitWidth.value = false
  void setZoom(ZOOMS.find((z) => z > zoom.value + 0.001) ?? ZOOMS.at(-1)!)
}
function zoomOut() {
  fitWidth.value = false
  void setZoom([...ZOOMS].reverse().find((z) => z < zoom.value - 0.001) ?? ZOOMS[0]!)
}
function toFitWidth() {
  fitWidth.value = true
  void setZoom(widthZoom())
}
function actualSize() {
  fitWidth.value = false
  void setZoom(1)
}

// --- Opening it ------------------------------------------------------------------------------

onMounted(async () => {
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
  zoom.value = widthZoom()
  loading.value = false
  await nextTick()
  if (props.page && props.page > 1) goTo(props.page)
  observe()
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizer = new ResizeObserver(() => {
      if (fitWidth.value) void setZoom(widthZoom())
    })
    resizer.observe(scroller.value)
  }
})

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  resizer?.disconnect()
  cancelAnimationFrame(scheduled)
  cancelAnimationFrame(tracking)
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
  <div class="pdf-view">
    <div class="pdf-view__bar" role="toolbar" :aria-label="t('preview.pdf.toolbar')">
      <div class="pdf-view__group">
        <el-button
          text
          size="small"
          :disabled="!canPrev"
          :aria-label="t('preview.pdf.prevPage')"
          :title="t('preview.pdf.prevPage')"
          class="pdf-view__prev"
          @click="goTo(current - 1)"
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
          @keydown.enter.prevent="goToTyped"
          @blur="goToTyped"
        />
        <span class="pdf-view__of">{{ t('preview.pdf.of', { total: n(pageCount) }) }}</span>
        <el-button
          text
          size="small"
          :disabled="!canNext"
          :aria-label="t('preview.pdf.nextPage')"
          :title="t('preview.pdf.nextPage')"
          class="pdf-view__next"
          @click="goTo(current + 1)"
        >
          <el-icon><ArrowDown /></el-icon>
        </el-button>
      </div>
      <div class="pdf-view__group">
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
          type="button"
          class="pdf-view__percent"
          :disabled="!pageCount"
          :aria-label="t('preview.zoom.actual', { n: percent })"
          :title="t('preview.zoom.actualTip')"
          @click="actualSize"
        >
          {{ percent }} %
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
          :class="{ 'is-pressed': fitWidth }"
          class="pdf-view__fit"
          @click="toFitWidth"
        >
          <el-icon><ScaleToOriginal /></el-icon>
          <span>{{ t('preview.zoom.fitWidth') }}</span>
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
}
.pdf-view__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.pdf-view__group .el-button + .el-button {
  margin-left: 0;
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
@media (max-width: 640px) {
  .pdf-view__pages {
    padding: 8px;
  }
  .pdf-view__fit span {
    display: none;
  }
}
</style>
