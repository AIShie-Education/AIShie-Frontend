<script setup lang="ts">
// An invite link just created, shown the one time it can be (Core keeps only
// its token's hash), for the ten minutes it works: its address, to copy; a
// QR code, to show a class, save as an image, or put up full screen; and how
// long it has left. When its time is up it says so, and offers a new one.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import QrCode from '@/components/QrCode.vue'
import { useCountdown } from '@/composables/useCountdown'
import { countdownParts } from '@/utils/countdown'
import { downloadQrPng } from '@/utils/qr'
import { qrFileName } from '@/utils/joinLink'
import { formatNumber } from '@/utils/format'
import { courseCodeText } from '@/utils/parts'

const props = defineProps<{
  /** The whole link, https://<site>/join/<token>. */
  url: string
  /** When it stops working, on Core's clock. */
  expiresAt: string
  code: string
  section?: string | null
  title?: string | null
  maxUses?: number | null
  domains?: string[] | null
  /** A new link is being created in its place. */
  renewing?: boolean
  /** Why no new link can be created now, when none can. */
  blocked?: string | null
}>()
const emit = defineEmits<{ renew: []; other: []; fullscreen: [] }>()
const { t } = useI18n()

const { text: left, remaining, ended } = useCountdown(() => props.expiresAt)
const spoken = computed(() => {
  const { minutes, seconds } = countdownParts(remaining.value)
  return t('join.links.created.timeLeftSpoken', { m: minutes, s: seconds })
})
const copied = ref(false)
const downloading = ref(false)
const courseLabel = computed(() => courseCodeText(props.code, props.section))

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* clipboard refused: the link is still there to select */
  }
}

async function download() {
  downloading.value = true
  try {
    await downloadQrPng(props.url, qrFileName(props.code, props.section))
  } catch {
    // The browser could not draw the image (no canvas, or no PNG made of
    // it). What it says is in English and of no use to a teacher; the code
    // is still on the page to show full screen or take a picture of.
    ElMessage({ type: 'error', message: t('join.links.created.downloadFailed'), showClose: true })
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="join-reveal" :class="{ 'is-ended': ended }">
    <figure class="join-reveal__qr">
      <div class="join-reveal__code">
        <QrCode :value="url" :size="280" :label="t('join.links.created.qrLabel', { course: courseLabel })" />
        <div v-if="ended" class="join-reveal__veil">{{ t('join.links.status.expired') }}</div>
      </div>
      <figcaption class="join-reveal__caption">
        <strong
          >{{ code }}<template v-if="code && section"><span class="app-sep">·</span></template
          >{{ section }}</strong
        >
        <span v-if="title">{{ title }}</span>
      </figcaption>
    </figure>

    <div class="join-reveal__side">
      <!-- How long it has left, or that it has none -->
      <div v-if="!ended" class="join-reveal__timer" role="timer" :aria-label="spoken">
        <span class="join-reveal__timer-label">{{ t('join.links.created.timeLeft') }}</span>
        <span class="join-reveal__clock" aria-hidden="true">{{ left }}</span>
      </div>
      <div v-else class="join-reveal__ended" role="status">
        <strong>{{ t('join.links.created.expired') }}</strong>
        <span>{{ t('join.links.created.expiredHint') }}</span>
        <el-tooltip :content="blocked ?? ''" :disabled="!blocked" placement="top">
          <span>
            <el-button type="primary" :loading="renewing" :disabled="!!blocked" @click="emit('renew')">
              <el-icon><RefreshRight /></el-icon>
              <span>{{ t('join.links.created.renew') }}</span>
            </el-button>
          </span>
        </el-tooltip>
      </div>

      <label class="join-reveal__label" for="join-link-url">{{ t('join.links.created.link') }}</label>
      <div class="join-reveal__url-row">
        <el-input
          id="join-link-url"
          :model-value="url"
          readonly
          class="join-reveal__url"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <el-button :disabled="ended" @click="copy">
          <el-icon><CopyDocument /></el-icon>
          <span>{{ copied ? t('common.actions.copied') : t('common.actions.copy') }}</span>
        </el-button>
      </div>

      <div class="join-reveal__actions">
        <el-button type="primary" :disabled="ended" @click="emit('fullscreen')">
          <el-icon><FullScreen /></el-icon>
          <span>{{ t('join.links.created.fullscreen') }}</span>
        </el-button>
        <el-button :loading="downloading" :disabled="ended" @click="download">
          <el-icon><Download /></el-icon>
          <span>{{ t('join.links.created.download') }}</span>
        </el-button>
      </div>

      <dl class="join-reveal__facts">
        <div>
          <dt>{{ t('join.links.form.maxUses') }}</dt>
          <dd>{{ maxUses ? t('join.links.upTo', { n: formatNumber(maxUses, 0) }) : t('join.links.noLimit') }}</dd>
        </div>
        <div>
          <dt>{{ t('join.links.list.domains') }}</dt>
          <dd>
            <template v-if="domains?.length">
              <el-tag v-for="d in domains" :key="d" size="small" type="info">@{{ d }}</el-tag>
            </template>
            <span v-else>{{ t('join.links.anyEmail') }}</span>
          </dd>
        </div>
      </dl>
      <p class="app-form-hint join-reveal__hint">{{ t('join.links.created.how') }}</p>
      <p class="app-form-hint join-reveal__hint">{{ t('join.links.created.shownOnce') }}</p>
      <el-button link type="primary" class="join-reveal__other" @click="emit('other')">
        {{ t('join.links.created.otherSettings') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.join-reveal {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.join-reveal__qr {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.join-reveal__code {
  position: relative;
}
.join-reveal__code :deep(.qr-code) {
  border: 1px solid var(--el-border-color-lighter);
}
.is-ended .join-reveal__code :deep(.qr-code) {
  opacity: 0.12;
}
.join-reveal__veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--app-text-2xl);
  font-weight: var(--app-weight-strong);
  color: var(--el-text-color-primary);
}
.join-reveal__caption {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: var(--app-text-sm);
  line-height: 1.4;
  text-align: center;
  max-width: 280px;
  color: var(--el-text-color-regular);
}
.join-reveal__side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.join-reveal__timer {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.join-reveal__timer-label {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.join-reveal__clock {
  font-size: var(--app-text-4xl);
  line-height: 1.1;
  font-weight: var(--app-heading-weight);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--el-color-primary);
}
.join-reveal__ended {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-color-info-light-9);
  width: 100%;
  box-sizing: border-box;
}
.join-reveal__ended span {
  color: var(--el-text-color-regular);
  font-size: var(--app-text-sm);
}
.join-reveal__label {
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
}
.join-reveal__url-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.join-reveal__url {
  flex: 1;
  min-width: 0;
}
.join-reveal__url :deep(input) {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-sm);
}
.join-reveal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.join-reveal__actions .el-button + .el-button {
  margin-left: 0;
}
.join-reveal__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px 16px;
  margin: 4px 0 0;
  font-size: var(--app-text-sm);
  width: 100%;
}
.join-reveal__facts dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.join-reveal__facts dd {
  margin: 2px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.join-reveal__hint {
  margin: 0;
}
.join-reveal__other {
  padding: 0;
}
@media (max-width: 640px) {
  .join-reveal {
    flex-direction: column;
    align-items: stretch;
  }
  .join-reveal__qr {
    align-self: center;
  }
}
</style>
