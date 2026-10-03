<script setup lang="ts">
// An export's two files, each with its button to download it: JSON Lines (the
// conversations, one to a line, for a program) and CSV (the messages, one to a
// row, for a spreadsheet). A file is saved from a link Core gives, which works
// for about fifteen minutes: the one the export came with while it works, or
// a new one (conversation.export_file) once it does not, or where there is
// none (an export remembered from before, or one Core gave again). Until its
// files are deleted (the export's expires_at); then nothing is offered, and
// the page is told (gone).
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCoreNow, useCountdown } from '@/composables/useCountdown'
import { formatBytes } from '@/utils/format'
import {
  LINK_MARGIN_MS,
  exportErrorText,
  exportLive,
  filesByFormat,
  freshLink,
  heldLink,
  isExpired,
  linkLive,
  liveLink,
  saveFile,
  type ExportFile,
  type ExportFormat,
} from './conversationExport'

const props = defineProps<{
  exportId: string
  files: readonly ExportFile[] | null | undefined
  /** When the export's files are deleted. */
  expiresAt: string
  compact?: boolean
}>()
const emit = defineEmits<{ gone: [] }>()
const { t } = useI18n()

const listed = computed(() => filesByFormat(props.files))
const busy = reactive<Record<string, boolean>>({})
const refreshing = ref(false)
const error = ref<string | null>(null)
const removed = ref(false)

const now = useCoreNow()
const held = computed(() => listed.value.map((f) => heldLink(props.exportId, f.format)))
/** The links held that still work. */
const live = computed(() => held.value.filter((l) => linkLive(l, now.value)))
/** When the first of them stops working: what the countdown counts to. */
const firstEnd = computed(() => live.value.map((l) => l!.expiresAt).sort()[0] ?? null)
// It counts to when the page stops using a link (LINK_MARGIN_MS before Core says it stops working).
const countdown = useCountdown(() =>
  firstEnd.value ? new Date(Date.parse(firstEnd.value) - LINK_MARGIN_MS).toISOString() : null,
)
/** Some link held still works: what is left of it is shown. A file with none gets one when it is downloaded. */
const anyLive = computed(() => live.value.length > 0)
/** Links were held, and none works now: they expired. None held at all is said otherwise. */
const someHeld = computed(() => held.value.some((l) => !!l))
const kept = computed(() => !removed.value && exportLive(props.expiresAt, now.value))

function gone(e: unknown) {
  removed.value = true
  error.value = exportErrorText(e, 'file')
  emit('gone')
}

async function download(f: ExportFile) {
  error.value = null
  busy[f.format] = true
  try {
    const link = await liveLink(props.exportId, f.format as ExportFormat)
    saveFile(link, f.filename)
  } catch (e) {
    if (isExpired(e)) gone(e)
    else error.value = exportErrorText(e, 'file')
  } finally {
    busy[f.format] = false
  }
}

/** New links to both files, the countdown starting again. */
async function refresh() {
  error.value = null
  refreshing.value = true
  try {
    for (const f of listed.value) await freshLink(props.exportId, f.format as ExportFormat)
  } catch (e) {
    if (isExpired(e)) gone(e)
    else error.value = exportErrorText(e, 'file')
  } finally {
    refreshing.value = false
  }
}

const formatName = (f: string) => t(`auditExport.files.format.${f === 'csv' ? 'csv' : 'jsonl'}`)
/** A checksum shortened for showing: its kind and the first twelve of its hex digits. */
const shortSum = (s: string) => {
  const [kind, hex] = s.includes(':') ? s.split(':', 2) : ['', s]
  return `${kind ? `${kind}:` : ''}${hex.slice(0, 12)}…`
}
</script>

<template>
  <div class="export-files" :class="{ 'is-compact': compact }">
    <ul class="export-files__list">
      <li v-for="f in listed" :key="f.format" class="export-file" :data-format="f.format">
        <div class="export-file__text">
          <div class="export-file__head">
            <strong class="export-file__kind">{{ formatName(f.format) }}</strong>
            <span class="export-file__size">{{ formatBytes(f.byte_size) }}</span>
          </div>
          <div class="export-file__name app-mono">{{ f.filename }}</div>
          <div v-if="!compact" class="export-file__about app-form-hint">
            {{ t(`auditExport.files.about.${f.format === 'csv' ? 'csv' : 'jsonl'}`) }}
          </div>
          <div v-if="!compact && f.checksum" class="export-file__sum app-form-hint">
            {{ t('auditExport.files.checksum') }}
            <code class="app-mono" :title="f.checksum">{{ shortSum(f.checksum) }}</code>
          </div>
        </div>
        <el-button
          class="export-file__download"
          :type="compact ? 'default' : 'primary'"
          :size="compact ? 'small' : 'default'"
          :loading="!!busy[f.format]"
          :disabled="!kept"
          @click="download(f)"
        >
          <el-icon v-if="!busy[f.format]"><Download /></el-icon>
          <span>{{ t('auditExport.files.download', { format: formatName(f.format) }) }}</span>
        </el-button>
      </li>
    </ul>

    <div v-if="kept" class="export-files__links" aria-live="polite">
      <span v-if="anyLive" class="export-files__countdown">
        {{ t('auditExport.files.linksLive', { time: countdown.text.value }) }}
      </span>
      <template v-else>
        <span class="export-files__stale">
          {{ someHeld ? t('auditExport.files.linksExpired') : t('auditExport.files.linksNone') }}
        </span>
        <el-button class="export-files__refresh" size="small" :loading="refreshing" @click="refresh">
          <el-icon v-if="!refreshing"><Refresh /></el-icon>
          <span>{{ t('auditExport.files.refresh') }}</span>
        </el-button>
      </template>
    </div>
    <div v-else-if="!error" class="export-files__links export-files__stale">{{ t('auditExport.files.deleted') }}</div>

    <el-alert v-if="error" class="export-files__error" type="error" :closable="false" show-icon :title="error" />
  </div>
</template>

<style scoped>
.export-files__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.export-file {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  min-width: 0;
}
.is-compact .export-file {
  flex-direction: row;
  align-items: center;
  padding: 8px 12px;
}
.export-file__text {
  min-width: 0;
}
.export-file__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.export-file__size {
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.export-file__name {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
.export-file__download {
  align-self: flex-start;
}
.is-compact .export-file__download {
  align-self: center;
  flex: none;
}
.export-files__links {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.export-files__countdown {
  font-variant-numeric: tabular-nums;
}
.export-files__error {
  margin-top: 12px;
}
@media (max-width: 640px) {
  .is-compact .export-file {
    flex-direction: column;
    align-items: stretch;
  }
  .export-file__download,
  .is-compact .export-file__download {
    align-self: stretch;
  }
}
</style>
