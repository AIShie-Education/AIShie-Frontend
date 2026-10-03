<script setup lang="ts">
// An invite link put up for a class, over the whole screen (and the browser's
// full screen, where it offers one): the course, a QR code as large as the
// screen allows, and how long the link has left, big enough to read from the
// back of a room. When its time is up it says so, and offers a new one,
// which is put up in its place. Escape, back, or the button, takes it down.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QrCode from '@/components/QrCode.vue'
import { useBackCloses } from '@/composables/useBackCloses'
import { useCountdown } from '@/composables/useCountdown'
import { countdownParts } from '@/utils/countdown'
import { courseCodeText } from '@/utils/parts'

const props = defineProps<{
  url: string
  expiresAt: string
  code: string
  section?: string | null
  title?: string | null
  renewing?: boolean
  blocked?: string | null
}>()
const emit = defineEmits<{ close: []; renew: [] }>()
const { t } = useI18n()
// Up while it is mounted: back takes it down, leaving the dialog it came from.
useBackCloses(true, () => emit('close'))

const root = ref<HTMLElement>()
const closeButton = ref<{ $el: HTMLElement }>()
const { text: left, remaining, ended } = useCountdown(() => props.expiresAt)
const spoken = computed(() => {
  const { minutes, seconds } = countdownParts(remaining.value)
  return t('join.links.created.timeLeftSpoken', { m: minutes, s: seconds })
})
const courseLabel = computed(() => courseCodeText(props.code, props.section))

// The code is as large as the screen leaves room for, beside the words above
// and below it.
const viewport = ref({ w: window.innerWidth, h: window.innerHeight })
// About 370 px go to the course above it, the countdown and the address
// below it, the gaps between and the page's padding.
const qrSize = computed(() => Math.max(160, Math.min(viewport.value.h - 370, viewport.value.w - 48, 880)))
function measure() {
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
}

/** Whether this took the browser's full screen, which leaving it gives back. */
let tookFullscreen = false
function onFullscreenChange() {
  if (document.fullscreenElement) return
  // Left by the browser's own Escape: taken down here too.
  if (tookFullscreen) {
    tookFullscreen = false
    emit('close')
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(async () => {
  window.addEventListener('resize', measure)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('keydown', onKey, true)
  await nextTick()
  closeButton.value?.$el?.focus()
  try {
    if (root.value?.requestFullscreen && !document.fullscreenElement) {
      await root.value.requestFullscreen()
      tookFullscreen = true
    }
  } catch {
    /* no full screen here (a phone's browser, say): the page's own will do */
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('keydown', onKey, true)
  if (tookFullscreen && document.fullscreenElement) {
    tookFullscreen = false
    void document.exitFullscreen().catch(() => undefined)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="join-fs"
      :class="{ 'is-ended': ended }"
      role="dialog"
      aria-modal="true"
      :aria-label="t('join.links.fullscreen.label')"
    >
      <el-button ref="closeButton" class="join-fs__close" size="large" @click="emit('close')">
        <el-icon><Close /></el-icon>
        <span>{{ t('join.links.fullscreen.exit') }}</span>
      </el-button>

      <header class="join-fs__course">
        <div class="join-fs__code">
          {{ code }}<template v-if="code && section"><span class="app-sep">·</span></template>{{ section }}
        </div>
        <div v-if="title" class="join-fs__title">{{ title }}</div>
      </header>

      <div class="join-fs__qr">
        <QrCode :value="url" :size="qrSize" level="M" :label="t('join.links.created.qrLabel', { course: courseLabel })" />
        <div v-if="ended" class="join-fs__veil">{{ t('join.links.status.expired') }}</div>
      </div>

      <template v-if="!ended">
        <div class="join-fs__scan">{{ t('join.links.fullscreen.scan') }}</div>
        <div class="join-fs__clock" role="timer" :aria-label="spoken">
          <el-icon aria-hidden="true"><Timer /></el-icon>
          <span aria-hidden="true">{{ left }}</span>
        </div>
        <div class="join-fs__url">{{ url }}</div>
      </template>
      <template v-else>
        <div class="join-fs__scan" role="status">{{ t('join.links.created.expired') }}</div>
        <el-button type="primary" size="large" :loading="renewing" :disabled="!!blocked" @click="emit('renew')">
          <el-icon><RefreshRight /></el-icon>
          <span>{{ t('join.links.created.renew') }}</span>
        </el-button>
        <p v-if="blocked" class="join-fs__blocked">{{ blocked }}</p>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.join-fs {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  box-sizing: border-box;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  overflow: auto;
}
.join-fs__close {
  position: absolute;
  top: 16px;
  right: 16px;
}
.join-fs__course {
  text-align: center;
}
.join-fs__code {
  font-size: clamp(24px, 4vw, 44px);
  font-weight: var(--app-heading-weight);
  letter-spacing: 0.02em;
  color: var(--el-color-primary);
}
.join-fs__title {
  font-size: clamp(16px, 2.2vw, 26px);
  color: var(--el-text-color-regular);
}
.join-fs__qr {
  position: relative;
  padding: 8px;
  background: #ffffff;
  border-radius: 12px;
}
.is-ended .join-fs__qr :deep(.qr-code) {
  opacity: 0.1;
}
.join-fs__veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(28px, 5vw, 56px);
  font-weight: var(--app-heading-weight);
  color: #303133;
}
.join-fs__scan {
  font-size: clamp(18px, 2.6vw, 30px);
  font-weight: var(--app-heading-weight);
}
.join-fs__clock {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: clamp(36px, 6vw, 72px);
  line-height: 1;
  font-weight: var(--app-heading-weight);
  font-variant-numeric: tabular-nums;
}
.join-fs__blocked {
  max-width: 560px;
  margin: 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.join-fs__url {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
  word-break: break-all;
  text-align: center;
  max-width: 90vw;
}
</style>
