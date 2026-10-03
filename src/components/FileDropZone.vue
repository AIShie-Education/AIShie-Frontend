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
//
// The files of one version of a document (`version`, or a queue made with
// version) are held to what a version holds: the zone says how many files
// and how much in all, and a file there is no room for fails before it is
// sent, saying why. With `reorder` the list is numbered and each file moved
// up or down: a version's files are in the order listed, and so is v-model.
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { knownUploadLimits, uploadLimits, type UploadedFile, type UploadKind, type UploadLimits } from '@/api/http'
import { filesFrom, useDropTarget, usePageDrop } from '@/composables/useFileDrop'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useUploadQueue, type UploadItem, type UploadQueue } from '@/composables/useUploadQueue'
import { useUploadText } from '@/composables/useUploadText'
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
  /** The files are one version's of a document: at most as many, and as much in all, as a version holds. */
  version?: boolean
  /** The list is numbered, and each file can be moved up or down: the files are in the order listed. */
  reorder?: boolean
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
    version: props.version,
    onDone: (item) => {
      if (!item.result) return
      setFiles(props.multiple ? inQueueOrder([...currentFiles(), item.result]) : [item.result])
      emit('uploaded', item.result)
    },
  })

/** Files in the order the list has them: those it does not hold (there before) first. */
function inQueueOrder(files: UploadedFile[]): UploadedFile[] {
  const at = new Map(queue.items.map((i, n) => [i.result?.uploadToken, n]))
  const place = (f: UploadedFile) => at.get(f.uploadToken) ?? -1
  return [...files].sort((a, b) => place(a) - place(b))
}

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

// --- What Core takes, said before anything is dropped ---------------------------
const learnt = ref<UploadLimits | null>(knownUploadLimits(props.courseId, props.kind))
onMounted(() => {
  if (props.disabled || learnt.value) return
  void uploadLimits(props.courseId, props.kind).then((l) => (learnt.value = l))
})
const maxBytes = computed(() => queue.maxBytes.value ?? learnt.value?.maxBytes ?? null)
/** One version's files: how many, and how much in all, a version holds. */
const isVersion = computed(() => props.version || queue.version)
const maxFiles = computed(() =>
  isVersion.value ? (queue.maxFiles.value ?? learnt.value?.maxFiles ?? null) : null,
)
const maxVersionBytes = computed(() =>
  isVersion.value ? (queue.maxVersionBytes.value ?? learnt.value?.maxVersionBytes ?? null) : null,
)

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
const { over, handlers: dropHandlers } = useDropTarget({ enabled: () => !props.disabled, onFiles: addFiles })
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

// --- Their order ----------------------------------------------------------------------
/** Moves a file up (-1) or down (1) the list, and says where it is now. */
function moveRow(row: Row, by: -1 | 1) {
  if (!row.item) return
  const from = queue.items.indexOf(row.item)
  queue.move(row.item.id, from + by)
  if (ownQueue) setFiles(inQueueOrder(currentFiles()))
  const at = queue.items.indexOf(row.item)
  announce(t('common.upload.announce.moved', { name: row.name, n: at + 1, total: queue.items.length }))
  // The button pressed may be gone from where it was: the keyboard stays on the file.
  void nextTick(() => {
    const li = document.getElementById(`${id}-row-${row.item!.id}`)
    const button = li?.querySelector<HTMLButtonElement>(by < 0 ? '.file-drop__up' : '.file-drop__down')
    ;(button && !button.disabled ? button : li?.querySelector<HTMLButtonElement>('button'))?.focus()
  })
}

// What an item is doing, in words: its line under the name.
const { percent, statusText, failText } = useUploadText({ maxBytes, maxFiles, maxVersionBytes })

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
const limitText = computed(() => {
  if (props.multiple && maxBytes.value && maxFiles.value && maxVersionBytes.value) {
    return t(
      'common.upload.limitVersion',
      { files: maxFiles.value, size: formatBytes(maxBytes.value), total: formatBytes(maxVersionBytes.value) },
      maxFiles.value,
    )
  }
  return maxBytes.value
    ? t(props.multiple ? 'common.upload.limitEach' : 'common.upload.limit', { size: formatBytes(maxBytes.value) })
    : ''
})

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
      @paste="onPaste"
      v-on="dropHandlers"
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

    <component
      :is="reorder ? 'ol' : 'ul'"
      v-if="rows.length"
      class="file-drop__list"
      :class="{ 'is-ordered': reorder }"
      :aria-label="t('common.upload.list')"
    >
      <li
        v-for="(row, n) in rows"
        :id="row.item ? `${id}-row-${row.item.id}` : undefined"
        :key="row.key"
        class="file-drop__item"
        :class="`is-${row.item?.status ?? 'done'}`"
        :data-file="row.name"
      >
        <span v-if="reorder" class="file-drop__n" aria-hidden="true">{{ n + 1 }}</span>
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
          <template v-if="reorder && row.item && rows.length > 1">
            <el-button
              link
              class="file-drop__up"
              :disabled="disabled || n === 0"
              :aria-label="t('common.upload.actions.moveUpFile', { name: row.name })"
              :title="t('common.upload.actions.moveUp')"
              @click="moveRow(row, -1)"
            >
              <el-icon aria-hidden="true"><Top /></el-icon>
            </el-button>
            <el-button
              link
              class="file-drop__down"
              :disabled="disabled || n === rows.length - 1"
              :aria-label="t('common.upload.actions.moveDownFile', { name: row.name })"
              :title="t('common.upload.actions.moveDown')"
              @click="moveRow(row, 1)"
            >
              <el-icon aria-hidden="true"><Bottom /></el-icon>
            </el-button>
          </template>
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
    </component>

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
  font-size: var(--app-text-3xl);
  color: var(--el-color-primary);
}
.file-drop__text {
  font-size: var(--app-text-md);
  line-height: var(--app-lh-ui);
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
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
  line-height: var(--app-lh-ui);
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
  font-size: var(--app-text-xl);
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
/* A version's files, numbered in the order they go in. */
.file-drop__n {
  flex-shrink: 0;
  min-width: 1.4em;
  line-height: 20px;
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  color: var(--app-ink-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.file-drop__state {
  flex-shrink: 0;
  line-height: 20px;
  color: var(--app-ink-3);
  font-size: var(--app-text-lg);
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
  font-size: var(--app-text-sm);
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
  font-size: var(--app-text-xs);
  font-variant-numeric: tabular-nums;
}
.file-drop__status {
  font-size: var(--app-text-xs);
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
