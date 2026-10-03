<script setup lang="ts">
// The files attached to a message not yet sent, as chips inside the
// composer's box: each with its icon by type, its name and size, its
// progress while it uploads (a line along its bottom), and buttons named for
// it to cancel it, try it again (where that can help) or remove it. Why one
// failed is said under the chips, and to a screen reader, as what was added,
// uploaded or failed is.
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UploadItem } from '@/composables/useUploadQueue'
import { useUploadText } from '@/composables/useUploadText'
import { formatBytes } from '@/utils/format'
import { FILE_ICON, fileKind, REFUSAL_SCOPE, type ChatAttachments } from './attachments'

const props = defineProps<{
  attachments: ChatAttachments
  /** Nothing can be changed now (sending, or the composer is off). */
  disabled?: boolean
}>()
const { t } = useI18n()
const { percent, statusText, failText } = useUploadText({
  maxBytes: () => props.attachments.limits.value?.maxBytes,
  reasons: REFUSAL_SCOPE,
})

const items = computed(() => props.attachments.items)
const failures = computed(() => items.value.filter((i) => i.status === 'failed'))
const icon = (item: UploadItem) => FILE_ICON[fileKind(item.file.type, item.name)]
const moving = (item: UploadItem) => item.status === 'queued' || item.status === 'uploading'

// --- Said to a screen reader ---------------------------------------------------------
const announcement = ref('')
function announce(message: string) {
  announcement.value = ''
  void nextTick(() => (announcement.value = message))
}
// Each file's state, as last said; what was there before the chips were shown is not said again.
const said = new Map<number, string>(items.value.map((i) => [i.id, i.status]))
watch(
  () => items.value.map((i) => `${i.id}:${i.status}`),
  () => {
    const lines: string[] = []
    const present = new Set<number>()
    let added = 0
    for (const item of items.value) {
      present.add(item.id)
      const before = said.get(item.id)
      said.set(item.id, item.status)
      if (before === item.status) continue
      if (before === undefined) added++
      if (item.status === 'done') lines.push(t('common.upload.announce.done', { name: item.name }))
      else if (item.status === 'failed')
        lines.push(t('common.upload.announce.failed', { name: item.name, reason: failText(item) }))
      else if (item.status === 'cancelled') lines.push(t('common.upload.announce.cancelled', { name: item.name }))
    }
    for (const k of [...said.keys()]) {
      if (present.has(k)) continue
      said.delete(k)
    }
    if (added) lines.unshift(t('common.upload.announce.added', { n: added }, added))
    if (lines.length) announce(lines.join(' '))
  },
)
</script>

<template>
  <div class="chat-chips">
    <ul v-if="items.length" class="chat-chips__list" :aria-label="t('chat.attach.chips')">
      <li
        v-for="item in items"
        :key="item.id"
        class="chat-chip"
        :class="`is-${item.status}`"
        :data-file="item.name"
        :title="`${item.name} · ${statusText(item)}`"
      >
        <span class="chat-chip__icon" aria-hidden="true">
          <el-icon v-if="item.status === 'uploading' || item.status === 'queued'" class="is-loading"
            ><Loading
          /></el-icon>
          <el-icon v-else-if="item.status === 'failed'" class="is-bad"><WarningFilled /></el-icon>
          <el-icon v-else><component :is="icon(item)" /></el-icon>
        </span>
        <span class="chat-chip__main">
          <span class="chat-chip__name">{{ item.name }}</span>
          <span class="chat-chip__meta">
            {{ formatBytes(item.size)
            }}<template v-if="moving(item)"> · {{ t('common.upload.percent', { n: percent(item) }) }}</template
            ><template v-else-if="item.status === 'cancelled'"> · {{ t('common.upload.status.cancelled') }}</template>
          </span>
        </span>
        <button
          v-if="(item.status === 'failed' || item.status === 'cancelled') && !item.tooLarge"
          type="button"
          class="chat-chip__action"
          :disabled="disabled"
          :aria-label="t('common.upload.actions.retryFile', { name: item.name })"
          :title="t('common.upload.actions.retry')"
          @click="attachments.retry(item.id)"
        >
          <el-icon aria-hidden="true"><RefreshRight /></el-icon>
        </button>
        <button
          type="button"
          class="chat-chip__action"
          :disabled="disabled"
          :aria-label="
            moving(item)
              ? t('common.upload.actions.cancelFile', { name: item.name })
              : t('common.upload.actions.removeFile', { name: item.name })
          "
          :title="moving(item) ? t('common.upload.actions.cancel') : t('common.upload.actions.remove')"
          @click="attachments.remove(item.id)"
        >
          <el-icon aria-hidden="true"><Close /></el-icon>
        </button>
        <span
          v-if="moving(item)"
          class="chat-chip__progress"
          role="progressbar"
          :aria-label="t('common.upload.progressOf', { name: item.name })"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="percent(item)"
          :style="{ width: `${Math.max(4, percent(item))}%` }"
        />
      </li>
    </ul>
    <p v-for="item in failures" :key="`e-${item.id}`" class="chat-chips__error" :data-file="item.name">
      {{ t('common.upload.announce.failed', { name: item.name, reason: failText(item) }) }}
    </p>
    <div class="chat-chips__announce" role="status" aria-live="polite">{{ announcement }}</div>
  </div>
</template>

<style scoped>
.chat-chips__list {
  list-style: none;
  margin: 0;
  padding: 8px 8px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chat-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 4px 0 8px;
  overflow: hidden;
  border: 1px solid var(--app-line);
  border-radius: 8px;
  background: var(--app-ground-2);
  font-size: var(--app-text-xs);
  line-height: 1.3;
}
.chat-chip.is-failed {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.chat-chip.is-cancelled {
  opacity: 0.75;
}
.chat-chip__icon {
  flex-shrink: 0;
  display: inline-flex;
  font-size: var(--app-text-lg);
  color: var(--app-ink-3);
}
.chat-chip__icon .is-bad {
  color: var(--el-color-danger);
}
.chat-chip__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 200px;
}
.chat-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-ink);
  font-weight: 500;
}
.chat-chip__meta {
  color: var(--app-ink-3);
  font-size: var(--app-text-mark);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.chat-chip__action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-ink-3);
  cursor: pointer;
}
.chat-chip__action:hover:not(:disabled) {
  background: var(--app-line);
  color: var(--app-ink);
}
.chat-chip__action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.chat-chip__action:focus-visible {
  outline-offset: -2px;
}
/* How far it has come, along its bottom. */
.chat-chip__progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: var(--el-color-primary);
  transition: width 0.2s;
}
.chat-chips__error {
  margin: 6px 10px 0;
  font-size: var(--app-text-xs);
  line-height: 1.4;
  color: var(--el-color-danger);
  overflow-wrap: anywhere;
}
.chat-chips__announce {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .chat-chip__main {
    max-width: 150px;
  }
}
</style>
