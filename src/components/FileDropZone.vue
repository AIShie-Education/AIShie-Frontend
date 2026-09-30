<script setup lang="ts">
// Where files are uploaded: dropped on the zone (or, with page-drop, anywhere
// on the page or the dialog it is in), chosen by clicking it or from the
// keyboard, or pasted. Each file goes through an upload queue
// (useUploadQueue: a few at a time, each with its progress, speed and time
// left) and is listed with a way to cancel it, try it again or take it off.
// On a phone, where nothing is dragged, it is one big button to choose files.
//
// v-model is the files uploaded so far (UploadedFile[]): hand each one's
// uploadToken to the tool that attaches it. Taking one off the list takes it
// out of v-model, and one the caller takes out of v-model (once attached,
// say) leaves the list. v-model:uploading is true while any file is still to
// upload: saving then would go ahead without it. Without `multiple`, a new
// file takes the place of the one there.
//
// A caller that needs each file's item from the moment it is added (to give
// each its own title, say) makes the queue itself and passes it as `queue`,
// with an #item slot for what goes beside each file; v-model is not kept then.
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { knownUploadLimit, uploadLimit, type UploadedFile, type UploadKind } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { dragHasFiles, filesFrom, usePageDrop } from '@/composables/useFileDrop'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useUploadQueue, type UploadItem, type UploadQueue } from '@/composables/useUploadQueue'
import { formatBytes } from '@/utils/format'

const model = defineModel<UploadedFile[]>({ default: () => [] })
/** True while any file is still to upload. */
const uploading = defineModel<boolean>('uploading', { default: false })
const props = defineProps<{
  courseId: string
  kind: UploadKind
  multiple?: boolean
  disabled?: boolean
  accept?: string
  /** Files dropped anywhere on the page, or pasted, come here: for the one zone of a dialog or a page. */
  pageDrop?: boolean
  /** One line rather than a box, where the zone is not the main thing. */
  compact?: boolean
  /** What the zone is for, as it is announced ("Upload files" otherwise). */
  label?: string
  /** A queue of the caller's own, whose items it reads; v-model is not kept then. */
  queue?: UploadQueue
}>()
const emit = defineEmits<{
  /** Files were added to the queue: dropped, chosen or pasted. */
  added: [items: UploadItem[]]
  uploaded: [file: UploadedFile]
}>()
const { t } = useI18n()
const id = useId()

// v-model as last set here: a caller's v-model comes back as a prop only
// once the page has been drawn again, and two uploads may end before that.
let latest: UploadedFile[] | null = null
const currentFiles = () => latest ?? model.value
function setFiles(next: UploadedFile[]) {
  latest = next
  model.value = next
  void nextTick(() => (latest = null))
}

const ownQueue = !props.queue
const queue: UploadQueue =
  props.queue ??
  useUploadQueue({
    courseId: () => props.courseId,
    kind: () => props.kind,
    onDone: (item) => {
      if (!item.result) return
      setFiles(props.multiple ? [...currentFiles(), item.result] : [item.result])
      emit('uploaded', item.result)
    },
  })

watch(
  () => queue.busy.value,
  (v) => (uploading.value = v),
  { immediate: true },
)

// One the caller took out of v-model leaves the list too.
watch(
  () => model.value.map((f) => f.uploadToken),
  (tokens) => {
    if (!ownQueue) return
    const kept = new Set(tokens)
    for (const item of [...queue.items]) {
      if (item.status === 'done' && item.result && !kept.has(item.result.uploadToken)) queue.remove(item.id)
    }
  },
)

// --- The largest file Core takes, said before anything is dropped ------------
const learnt = ref<number | null>(knownUploadLimit(props.courseId, props.kind))
onMounted(() => {
  if (props.disabled || learnt.value) return
  void uploadLimit(props.courseId, props.kind).then((max) => (learnt.value = max))
})
const maxBytes = computed(() => queue.maxBytes.value ?? learnt.value)

// --- Adding files ----------------------------------------------------------------
const input = ref<HTMLInputElement | null>(null)
const zone = ref<HTMLElement | null>(null)
const phoneButton = ref<{ $el: HTMLElement } | null>(null)

function note(message: string) {
  ElMessage({ type: 'warning', message, showClose: true, duration: 6000 })
  announce(message)
}

function addFiles(files: File[], folders = 0) {
  if (props.disabled) return
  if (folders) note(t('common.upload.folders', { n: folders }, folders))
  if (!files.length) return
  let take = files
  if (!props.multiple) {
    take = files.slice(0, 1)
    if (files.length > 1) note(t('common.upload.onlyOne', { name: take[0]!.name }))
    // A new file takes the place of the one there.
    for (const item of [...queue.items]) queue.remove(item.id)
    if (ownQueue && currentFiles().length) setFiles([])
  }
  const items = queue.add(take)
  announce(t('common.upload.announce.added', { n: items.length }, items.length))
  emit('added', items)
}

function choose() {
  if (props.disabled) return
  input.value?.click()
}

function onPick(ev: Event) {
  const el = ev.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  addFiles(files)
}

// Dragged over the zone itself.
const over = ref(false)
let depth = 0
function onDragEnter(e: DragEvent) {
  if (!dragHasFiles(e)) return
  e.preventDefault()
  depth++
  over.value = !props.disabled
}
function onDragOver(e: DragEvent) {
  if (!dragHasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = props.disabled ? 'none' : 'copy'
}
function onDragLeave(e: DragEvent) {
  if (!dragHasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) over.value = false
}
function onDrop(e: DragEvent) {
  if (!dragHasFiles(e)) return
  // Taken here: the page does not take it again.
  e.preventDefault()
  depth = 0
  over.value = false
  const { files, folders } = filesFrom(e.dataTransfer)
  addFiles(files, folders)
}
function onPaste(e: ClipboardEvent) {
  const { files, folders } = filesFrom(e.clipboardData)
  if (!files.length) return
  e.preventDefault()
  addFiles(files, folders)
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  choose()
}

// Anywhere on the page, for the one zone there.
const page = usePageDrop({ enabled: () => !!props.pageDrop && !props.disabled, onFiles: addFiles })

// On a phone nothing is dragged: the zone is a big button.
const phone = useMediaQuery('(max-width: 640px), (hover: none) and (pointer: coarse)')

// --- The list ----------------------------------------------------------------------
interface Row {
  key: string
  item: UploadItem | null
  /** A file in v-model that the queue does not hold (it was there before). */
  file: UploadedFile | null
  name: string
  size: number
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  if (ownQueue) {
    const held = new Set(queue.items.map((i) => i.result?.uploadToken).filter((x): x is string => !!x))
    for (const f of model.value) {
      if (!held.has(f.uploadToken))
        out.push({ key: `m-${f.uploadToken}`, item: null, file: f, name: f.fileName, size: f.size })
    }
  }
  for (const item of queue.items) out.push({ key: `q-${item.id}`, item, file: null, name: item.name, size: item.size })
  return out
})

function removeRow(row: Row) {
  const token = row.item?.result?.uploadToken ?? row.file?.uploadToken
  if (row.item) queue.remove(row.item.id)
  if (ownQueue && token) setFiles(currentFiles().filter((f) => f.uploadToken !== token))
  announce(t('common.upload.announce.removed', { name: row.name }))
  // Where the list empties, the zone is where the keyboard was.
  if (rows.value.length === 0) void nextTick(focus)
}

const percent = (item: UploadItem) => Math.floor(item.fraction * 100)

function leftText(s: number): string {
  if (s < 60) return t('common.upload.left.seconds', { n: Math.max(1, s) })
  if (s < 3600) return t('common.upload.left.minutes', { n: Math.ceil(s / 60) })
  return t('common.upload.left.hours', { h: Math.floor(s / 3600), m: Math.ceil((s % 3600) / 60) })
}

function failText(item: UploadItem): string {
  if (item.tooLarge) {
    const details = (item.error as { details?: { max_bytes?: number } } | null)?.details
    const max = details?.max_bytes ?? maxBytes.value
    return max
      ? t('common.upload.tooLarge', { size: formatBytes(item.size), max: formatBytes(max) })
      : t('common.upload.tooLargeUnknown', { size: formatBytes(item.size) })
  }
  return errorMessage(item.error)
}

/** What an item is doing, in words: its line under the name. */
function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return t('common.upload.status.queued')
    case 'uploading': {
      if (item.retrying) {
        return item.retrying.offline
          ? t('common.upload.status.offline')
          : t('common.upload.status.retrying', { attempt: item.attempt })
      }
      if (item.phase === 'preparing') return t('common.upload.status.preparing')
      if (item.phase === 'finishing') return t('common.upload.status.finishing')
      const parts = [
        t('common.upload.percent', { n: percent(item) }),
        t('common.upload.of', { loaded: formatBytes(item.loaded), total: formatBytes(item.size) }),
      ]
      if (item.bytesPerSecond !== null)
        parts.push(t('common.upload.speed', { speed: formatBytes(item.bytesPerSecond) }))
      if (item.secondsLeft !== null) parts.push(leftText(item.secondsLeft))
      return parts.join(' · ')
    }
    case 'done':
      return t('common.upload.status.done')
    case 'cancelled':
      return t('common.upload.status.cancelled')
    case 'failed':
      return failText(item)
  }
}

// --- Said to a screen reader -----------------------------------------------------
const announcement = ref('')
function announce(message: string) {
  // Said again even when it is what was said last.
  announcement.value = ''
  void nextTick(() => (announcement.value = message))
}
// Each item's state, and the quarter of it sent, as last said.
const said = new Map<number, string>()
watch(
  () => queue.items.map((i) => `${i.id}:${i.status}:${i.status === 'uploading' ? Math.floor(i.fraction * 4) : ''}`),
  () => {
    const lines: string[] = []
    const present = new Set<number>()
    for (const item of queue.items) {
      present.add(item.id)
      const quarter = item.status === 'uploading' ? Math.floor(item.fraction * 4) : 0
      const now = `${item.status}:${quarter}`
      const before = said.get(item.id)
      if (before === now) continue
      said.set(item.id, now)
      if (item.status === 'uploading' && quarter > 0 && quarter < 4 && before?.startsWith('uploading')) {
        lines.push(t('common.upload.announce.progress', { name: item.name, percent: quarter * 25 }))
      } else if (item.status === 'done') {
        lines.push(t('common.upload.announce.done', { name: item.name }))
      } else if (item.status === 'failed') {
        lines.push(t('common.upload.announce.failed', { name: item.name, reason: failText(item) }))
      } else if (item.status === 'cancelled') {
        lines.push(t('common.upload.announce.cancelled', { name: item.name }))
      }
    }
    for (const k of [...said.keys()]) if (!present.has(k)) said.delete(k)
    if (lines.length) announce(lines.join(' '))
  },
)

// --- Words ---------------------------------------------------------------------------
const zoneLabel = computed(
  () => props.label || (props.multiple ? t('common.upload.zoneMany') : t('common.upload.zoneOne')),
)
const limitText = computed(() =>
  maxBytes.value
    ? t(props.multiple ? 'common.upload.limitEach' : 'common.upload.limit', { size: formatBytes(maxBytes.value) })
    : '',
)

function focus() {
  ;(phone.value ? phoneButton.value?.$el : zone.value)?.focus()
}
defineExpose({ addFiles, choose, focus })
</script>

<template>
  <div
    class="file-drop"
    :class="{
      'is-compact': compact,
      'is-disabled': disabled,
      'is-phone': phone,
      'is-page-target': page.dragging.value,
    }"
  >
    <input
      ref="input"
      type="file"
      class="file-drop__input"
      tabindex="-1"
      aria-hidden="true"
      :multiple="multiple"
      :accept="accept"
      @change="onPick"
    />

    <div v-if="phone" class="file-drop__phone">
      <el-button
        ref="phoneButton"
        type="primary"
        :size="compact ? 'default' : 'large'"
        :plain="compact"
        class="file-drop__big"
        :disabled="disabled"
        @click="choose"
      >
        <el-icon><Upload /></el-icon>
        <span>{{ multiple ? t('common.upload.phoneMany') : t('common.upload.phoneOne') }}</span>
      </el-button>
      <div v-if="limitText" class="file-drop__hint">{{ limitText }}</div>
    </div>

    <div
      v-else
      ref="zone"
      class="file-drop__zone"
      :class="{ 'is-over': over }"
      role="button"
      :tabindex="disabled ? -1 : 0"
      :aria-label="zoneLabel"
      :aria-describedby="`${id}-hint`"
      :aria-disabled="disabled || undefined"
      @click="choose"
      @keydown="onKey"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @paste="onPaste"
    >
      <el-icon class="file-drop__icon" aria-hidden="true"><UploadFilled /></el-icon>
      <div class="file-drop__text">
        <template v-if="over || page.dragging.value">
          <strong>{{ t('common.upload.dropNow') }}</strong>
        </template>
        <i18n-t
          v-else
          :keypath="multiple ? 'common.upload.dropMany' : 'common.upload.dropOne'"
          tag="span"
          scope="global"
        >
          <template #choose>
            <span class="file-drop__choose">{{
              multiple ? t('common.upload.chooseMany') : t('common.upload.chooseOne')
            }}</span>
          </template>
        </i18n-t>
      </div>
      <div :id="`${id}-hint`" class="file-drop__hint">
        <span v-if="limitText">{{ limitText }}</span>
        <span>{{ t('common.upload.pasteHint') }}</span>
      </div>
    </div>

    <ul v-if="rows.length" class="file-drop__list" :aria-label="t('common.upload.list')">
      <li
        v-for="row in rows"
        :key="row.key"
        class="file-drop__item"
        :class="`is-${row.item?.status ?? 'done'}`"
        :data-file="row.name"
      >
        <span class="file-drop__state" aria-hidden="true">
          <el-icon v-if="!row.item || row.item.status === 'done'" class="is-ok"><CircleCheck /></el-icon>
          <el-icon v-else-if="row.item.status === 'uploading'" class="is-loading"><Loading /></el-icon>
          <el-icon v-else-if="row.item.status === 'failed'" class="is-bad"><WarningFilled /></el-icon>
          <el-icon v-else-if="row.item.status === 'cancelled'"><CircleClose /></el-icon>
          <el-icon v-else><Clock /></el-icon>
        </span>
        <div class="file-drop__main">
          <div class="file-drop__line">
            <span class="file-drop__name" :title="row.name">{{ row.name }}</span>
            <span class="file-drop__size">{{ formatBytes(row.size) }}</span>
          </div>
          <el-progress
            v-if="row.item && (row.item.status === 'uploading' || row.item.status === 'queued')"
            :percentage="percent(row.item)"
            :show-text="false"
            :stroke-width="4"
            :indeterminate="row.item.phase === 'preparing' || row.item.phase === 'finishing' || !!row.item.retrying"
            :aria-label="t('common.upload.progressOf', { name: row.name })"
            class="file-drop__progress"
          />
          <div class="file-drop__status" :class="{ 'is-bad': row.item?.status === 'failed' }">
            {{ row.item ? statusText(row.item) : t('common.upload.status.done') }}
          </div>
          <slot name="item" :item="row.item" />
        </div>
        <div class="file-drop__actions">
          <el-button
            v-if="row.item && (row.item.status === 'queued' || row.item.status === 'uploading')"
            link
            :aria-label="t('common.upload.actions.cancelFile', { name: row.name })"
            :title="t('common.upload.actions.cancel')"
            @click="queue.cancel(row.item.id)"
          >
            <el-icon aria-hidden="true"><Close /></el-icon>
          </el-button>
          <template v-else>
            <el-button
              v-if="row.item && (row.item.status === 'failed' || row.item.status === 'cancelled') && !row.item.tooLarge"
              link
              type="primary"
              :disabled="disabled"
              :aria-label="t('common.upload.actions.retryFile', { name: row.name })"
              :title="t('common.upload.actions.retry')"
              @click="queue.retry(row.item.id)"
            >
              <el-icon aria-hidden="true"><RefreshRight /></el-icon>
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="disabled"
              :aria-label="t('common.upload.actions.removeFile', { name: row.name })"
              :title="t('common.upload.actions.remove')"
              @click="removeRow(row)"
            >
              <el-icon aria-hidden="true"><Delete /></el-icon>
            </el-button>
          </template>
        </div>
      </li>
    </ul>

    <div class="file-drop__announce" role="status" aria-live="polite">{{ announcement }}</div>
  </div>
</template>

<style scoped>
.file-drop {
  width: 100%;
  min-width: 0;
}
.file-drop__input {
  display: none;
}
.file-drop__zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 16px;
  border: 1.5px dashed var(--app-line-strong);
  border-radius: var(--app-radius-item);
  background: var(--app-field);
  color: var(--app-ink-2);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.file-drop__zone:hover,
.file-drop__zone.is-over,
.is-page-target .file-drop__zone {
  border-color: var(--el-color-primary);
  background: var(--app-indigo-tint);
}
.file-drop__zone.is-over {
  border-style: solid;
}
.is-disabled .file-drop__zone {
  cursor: not-allowed;
  opacity: 0.6;
}
.is-disabled .file-drop__zone:hover {
  border-color: var(--app-line-strong);
  background: var(--app-field);
}
.file-drop__icon {
  font-size: 28px;
  color: var(--el-color-primary);
}
.file-drop__text {
  font-size: 14px;
  line-height: 1.5;
}
.file-drop__choose {
  color: var(--el-color-primary);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.file-drop__hint {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 12px;
  font-size: 12px;
  color: var(--app-ink-3);
  line-height: 1.5;
}
/* One line, where the zone is not the main thing. */
.is-compact .file-drop__zone {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 4px 10px;
  padding: 8px 12px;
  text-align: left;
}
.is-compact .file-drop__icon {
  font-size: 18px;
}
.is-compact .file-drop__hint {
  justify-content: flex-start;
}
.file-drop__phone {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.file-drop__big {
  width: 100%;
}
.file-drop__phone .file-drop__hint {
  justify-content: flex-start;
}
.file-drop__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-drop__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--app-line-soft);
  border-radius: var(--app-radius-item);
  background: var(--app-card);
  min-width: 0;
}
.file-drop__item.is-failed {
  border-color: var(--el-color-danger-light-5);
}
.file-drop__state {
  flex-shrink: 0;
  line-height: 20px;
  color: var(--app-ink-3);
  font-size: 16px;
}
.file-drop__state .is-ok {
  color: var(--el-color-success);
}
.file-drop__state .is-bad {
  color: var(--el-color-danger);
}
.file-drop__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-drop__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
}
.file-drop__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.file-drop__size {
  flex-shrink: 0;
  color: var(--app-ink-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.file-drop__status {
  font-size: 12px;
  color: var(--app-ink-3);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.file-drop__status.is-bad {
  color: var(--el-color-danger);
}
.file-drop__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}
.file-drop__actions .el-button + .el-button {
  margin-left: 4px;
}
.file-drop__announce {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
