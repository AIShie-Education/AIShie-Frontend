<script setup lang="ts">
// An image in the viewer, from an object URL of its bytes (the page lets
// images come from blob:), always as an <img>: an SVG among them, which so
// runs no script and loads nothing. It opens fitted to the window, and zooms
// in and out by steps, to its actual size, or back to fit; zoomed past the
// window it scrolls.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatPct } from '@/utils/format'

defineProps<{
  src: string
  /** The file's name, the image's text alternative. */
  name: string
}>()
const emit = defineEmits<{ failed: [] }>()
const { t } = useI18n()

const ZOOMS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8]

const img = ref<HTMLImageElement | null>(null)
const stage = ref<HTMLElement | null>(null)
/** Bumped as the stage changes size, which changes what fitting comes to. */
const laidOut = ref(0)
let resizer: ResizeObserver | null = null
onMounted(() => {
  if (!stage.value || typeof ResizeObserver === 'undefined') return
  resizer = new ResizeObserver(() => laidOut.value++)
  resizer.observe(stage.value)
})
onBeforeUnmount(() => resizer?.disconnect())
const natural = ref<{ w: number; h: number } | null>(null)
/** Fitted to the window, or at a zoom of its own (1 = its actual size). */
const fit = ref(true)
const zoom = ref(1)

function onLoad() {
  const i = img.value
  if (!i) return
  // An SVG with no size of its own is drawn at the stage's.
  natural.value = { w: i.naturalWidth || 300, h: i.naturalHeight || 150 }
}

/** The zoom it is shown at now: fitted, what that comes to. */
function shownZoom(): number {
  const i = img.value
  if (!fit.value || !i || !natural.value) return zoom.value
  return i.clientWidth / natural.value.w || 1
}
const percent = computed(() => {
  // Read again whenever what it depends on changes.
  void natural.value
  void fit.value
  void laidOut.value
  return Math.round((fit.value ? shownZoom() : zoom.value) * 100)
})

function zoomIn() {
  const from = shownZoom()
  zoom.value = ZOOMS.find((z) => z > from + 0.001) ?? ZOOMS.at(-1)!
  fit.value = false
}
function zoomOut() {
  const from = shownZoom()
  zoom.value = [...ZOOMS].reverse().find((z) => z < from - 0.001) ?? ZOOMS[0]!
  fit.value = false
}
function toFit() {
  fit.value = true
}
function actualSize() {
  zoom.value = 1
  fit.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  if (e.key === '+' || e.key === '=') zoomIn()
  else if (e.key === '-' || e.key === '_') zoomOut()
  else if (e.key === '0') toFit()
  else if (e.key === '1') actualSize()
  else return
  e.preventDefault()
}

const sized = computed(() =>
  fit.value || !natural.value
    ? undefined
    : {
        width: `${Math.round(natural.value.w * zoom.value)}px`,
        height: `${Math.round(natural.value.h * zoom.value)}px`,
      },
)

defineExpose({ zoomIn, zoomOut, toFit, actualSize, fit, zoom })
</script>

<template>
  <div class="image-view">
    <div class="image-view__bar" role="toolbar" :aria-label="t('preview.image.toolbar')">
      <el-button text size="small" :aria-label="t('preview.zoom.out')" :title="t('preview.zoom.out')" @click="zoomOut">
        <el-icon><ZoomOut /></el-icon>
      </el-button>
      <button
        type="button"
        class="image-view__percent"
        :aria-label="t('preview.zoom.actual', { n: formatPct(percent / 100) })"
        :title="t('preview.zoom.actualTip')"
        @click="actualSize"
      >
        {{ formatPct(percent / 100) }}
      </button>
      <el-button text size="small" :aria-label="t('preview.zoom.in')" :title="t('preview.zoom.in')" @click="zoomIn">
        <el-icon><ZoomIn /></el-icon>
      </el-button>
      <el-button
        text
        size="small"
        :aria-pressed="fit ? 'true' : 'false'"
        :class="{ 'is-pressed': fit }"
        class="image-view__fit"
        @click="toFit"
      >
        <el-icon><FullScreen /></el-icon>
        <span>{{ t('preview.zoom.fit') }}</span>
      </el-button>
    </div>
    <div
      ref="stage"
      class="image-view__stage"
      :class="{ 'is-fit': fit }"
      tabindex="0"
      data-arrows
      :aria-label="t('preview.image.stage', { name })"
      @keydown="onKey"
    >
      <img
        ref="img"
        class="image-view__img"
        :src="src"
        :alt="name"
        :style="sized"
        draggable="false"
        @load="onLoad"
        @error="emit('failed')"
      />
    </div>
  </div>
</template>

<style scoped>
.image-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.image-view__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--app-line);
  background: var(--el-bg-color);
  font-size: 13px;
}
.image-view__bar .el-button + .el-button {
  margin-left: 0;
}
.image-view__percent {
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
.image-view__percent:hover {
  background: var(--el-fill-color-light);
}
.image-view__fit.is-pressed {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.image-view__stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  /* A checkerboard under what is transparent. */
  background-color: var(--app-ground-2);
  background-image:
    linear-gradient(45deg, var(--app-line-soft) 25%, transparent 25%),
    linear-gradient(-45deg, var(--app-line-soft) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--app-line-soft) 75%),
    linear-gradient(-45deg, transparent 75%, var(--app-line-soft) 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
  outline: none;
}
.image-view__stage:focus-visible {
  box-shadow: inset 0 0 0 2px var(--app-focus);
}
.image-view__img {
  display: block;
  flex-shrink: 0;
  max-width: none;
  /* In the middle while it is smaller than the window, from its top left once it is larger (and scrolls). */
  margin: auto;
  box-shadow: 0 1px 4px rgb(0 0 0 / 14%);
}
.image-view__stage {
  display: flex;
}
/* Fitted: as large as the window holds it whole. */
.image-view__stage.is-fit .image-view__img {
  flex-shrink: 1;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
@media (max-width: 640px) {
  .image-view__stage {
    padding: 8px;
  }
}
</style>
