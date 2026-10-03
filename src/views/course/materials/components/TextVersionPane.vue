<script setup lang="ts">
// The text version (文字版) of one file of a version, on its own tab of the
// document page (one for each file: a version of several has several): the
// file transcribed into Markdown by the school's transcriber, or written by
// staff, shown as the chat shows Markdown (formulas, code, tables), with its
// pages' headings to go to. It is read afresh whenever the tab is shown, and
// by its refresh button; a long one part by part (readWholeText), and while
// one waits for the transcriber that is on, every 15 seconds.
//
// Every read and write names the file (file_id), as Core requires.
//
// A text that is done may be downloaded as a PDF (下載為 PDF): laid out for
// paper and handed to the browser's print window (PrintButton).
//
// Whoever may write the document (document_write, as for a new version)
// edits it (document.text_update, from the revision read: one that changed
// meanwhile is said so, and the draft kept to be saved over the latest), and
// sends it to be transcribed again, or for the first time for a version from
// before text versions (document.text_retranscribe); a text staff wrote is
// discarded only when they confirm it twice. Either may become a proposal,
// which the page says as it says its other writes'. While the runtime says
// the transcriber is off, nothing is offered that only it would do, and a
// text waiting for it is shown as none: staff may write one by hand.
import { computed, h, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TextVersion } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { notifyError } from '@/composables/useErrors'
import { usePolling } from '@/composables/usePolling'
import { announce, useWrite } from '@/composables/useWrite'
import { pageHeadings } from '@/utils/markdown'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import StatusTag from '@/components/StatusTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'
import PrintButton from '@/components/PrintButton.vue'
import { courseLine, dateLine, type PrintRequest } from '@/composables/usePrintLayout'
import type { ApiError } from '@/api/http'
import {
  TEXT_STATUS_TAG,
  changedRevision,
  isNoText,
  isQueued,
  isTextChanged,
  readWholeText,
  textReasonText,
  textShown,
  textStatus,
  type WholeText,
} from './textVersion'
import { joinParts } from '@/utils/parts'

const props = defineProps<{
  courseId: string
  documentId: string
  versionId: string
  seq: number
  /** The file whose text version this is. */
  fileId: string
  /** The file's name. */
  fileName: string
  /** The file's place in the version, from 1. */
  position?: number
  /** The text version as document.get gave it with the file; null for none. */
  initial: TextVersion | null
  /** There is a file, which can be transcribed. */
  hasFile: boolean
  /** The tab is shown: read it afresh. */
  active: boolean
  /** The caller may write the document (document_write). */
  canWrite: boolean
  /** An archived course or document: writing is offered, disabled. */
  writeDisabled: boolean
  /** Writing the document is a proposal here. */
  needsApproval: boolean
  /** The runtime's transcriber is on (info.features.transcription). */
  transcriptionOn: boolean
  /** The document's title, said above the text when it is downloaded as a PDF. */
  docTitle?: string
}>()
const emit = defineEmits<{
  /** The text changed here: the page may read the version again. */
  changed: []
  /** A write became a proposal: the page says so, as for its other writes. */
  proposed: [message: string]
}>()
const { t, te, n } = useI18n()

/**
 * The prefix of the ids the pages' headings are given: text-page-3 for the
 * first file's, text-f2-page-3 for the second's, since each file has a pane
 * of its own on the page.
 */
const ANCHORS = (props.position ?? 1) > 1 ? `text-f${props.position}-` : 'text-'
/** How often a text waiting for the transcriber is read again, while the tab is shown. */
const QUEUED_POLL_MS = 15_000

// Writing it: the draft, the revision it was begun from (or moved to once the
// latest was loaded over a conflict), and a conflict met on saving.
const editing = ref(false)
const draft = ref('')
const baseRevision = ref<number | null>(null)
/** The text changed meanwhile: the revision Core has now, where it said. */
const conflict = ref<{ revision: number | null } | null>(null)
/** The latest was loaded after a conflict: the draft stays, and saving writes over it. */
const reloadedOver = ref(false)

const loaded = shallowRef<WholeText | null>(null)
/** The version has no text version (Core said no_text): none, not an error. */
const absent = ref(false)
const loading = ref(false)
const error = shallowRef<ApiError | null>(null)
const progress = ref<{ read: number; parts: number } | null>(null)
let generation = 0

const current = computed<TextVersion | null>(() => {
  if (loaded.value) return loaded.value.text
  if (absent.value) return null
  return props.initial
})
const status = computed(() => textStatus(current.value))
const shown = computed(() => textShown(current.value, props.transcriptionOn))
const body = computed(() => loaded.value?.body ?? (status.value === 'done' ? (props.initial?.body ?? '') : ''))
const pages = computed(() => (shown.value === 'text' ? pageHeadings(body.value, ANCHORS) : []))

async function load() {
  const mine = ++generation
  loading.value = true
  error.value = null
  progress.value = null
  try {
    const whole = await readWholeText(
      { course_id: props.courseId, document_id: props.documentId, version_id: props.versionId, file_id: props.fileId },
      {
        onProgress: (read, parts) => {
          if (mine === generation && parts > 1) progress.value = { read, parts }
        },
      },
    )
    if (mine !== generation) return
    loaded.value = whole
    absent.value = false
  } catch (e) {
    if (mine !== generation) return
    if (isNoText(e)) {
      loaded.value = null
      absent.value = true
    } else error.value = toApiError(e)
  } finally {
    if (mine === generation) {
      loading.value = false
      progress.value = null
    }
  }
}

// Another version or file: what was read of the one before is not this one's.
watch(
  () => [props.versionId, props.fileId],
  () => {
    generation++
    loaded.value = null
    absent.value = false
    error.value = null
    editing.value = false
    if (props.active) void load()
  },
)
watch(
  () => props.active,
  (on) => {
    if (on && !editing.value) void load()
  },
  { immediate: true },
)
usePolling(() => load(), {
  intervalMs: QUEUED_POLL_MS,
  immediate: false,
  enabled: () => props.active && !editing.value && shown.value === 'queued',
})

// --- Downloaded as a PDF ------------------------------------------------------------------
function printSource(): PrintRequest {
  const c = current.value
  const when = dateLine(c?.edited_at ?? c?.produced_at ?? c?.updated_at)
  return {
    title: t('preview.print.textVersionOf', { name: props.fileName }),
    lines: [
      props.docTitle,
      courseLine(props.courseId),
      joinParts([t('materials.document.version', { seq: props.seq }), when]),
    ],
    body: { markdown: body.value },
    footer: t('preview.print.textVersionNote'),
  }
}

// --- Where it came from ----------------------------------------------------------------
const source = computed(() => (status.value === 'done' ? (current.value?.source ?? 'ai') : null))

function goTo(id: string | number | boolean | undefined) {
  if (typeof id !== 'string') return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- Editing ------------------------------------------------------------------------
const updater = useWrite('document.text_update')

function startEdit() {
  draft.value = status.value === 'done' ? body.value : ''
  baseRevision.value = current.value ? current.value.revision : null
  conflict.value = null
  reloadedOver.value = false
  editing.value = true
}

async function cancelEdit() {
  const from = status.value === 'done' ? body.value : ''
  if (draft.value !== from) {
    try {
      await ElMessageBox.confirm(
        t('materials.document.text.editor.discardBody'),
        t('materials.document.text.editor.discardTitle'),
        {
          type: 'warning',
          confirmButtonText: t('materials.document.text.editor.discard'),
          cancelButtonText: t('materials.document.text.editor.keep'),
        },
      )
    } catch {
      return
    }
  }
  editing.value = false
  conflict.value = null
}

async function save() {
  if (!draft.value.trim()) {
    ElMessage({ type: 'warning', message: t('materials.document.text.editor.empty') })
    return
  }
  const out = await updater.run(
    {
      course_id: props.courseId,
      document_id: props.documentId,
      version_id: props.versionId,
      file_id: props.fileId,
      body: draft.value,
      ...(baseRevision.value !== null ? { base_revision: baseRevision.value } : {}),
    },
    { notify: false },
  )
  if (!out) {
    const e = updater.lastError.value
    if (isTextChanged(e)) {
      conflict.value = { revision: changedRevision(e) }
      reloadedOver.value = false
      return
    }
    notifyError(e, undefined, { reasons: 'materials.refusal' })
    return
  }
  if (out.status === 'proposed') {
    announce(out)
    editing.value = false
    emit('proposed', t('materials.document.text.editor.pending', { seq: props.seq, name: props.fileName }))
    return
  }
  announce(out, {
    success: out.result.changed
      ? t('materials.document.text.editor.done')
      : t('materials.document.text.editor.unchanged'),
  })
  editing.value = false
  conflict.value = null
  await load()
  if (out.result.changed) emit('changed')
}

/** Loads the latest over a conflict, keeping the draft: saving next writes over what was loaded. */
async function reloadLatest() {
  await load()
  if (error.value) return
  baseRevision.value = current.value ? current.value.revision : null
  conflict.value = null
  reloadedOver.value = true
}

// --- Transcribing again -------------------------------------------------------------
const retranscriber = useWrite('document.text_retranscribe')

/** A confirmation's paragraphs, those given. */
function lines(parts: (string | false | null | undefined)[]) {
  return h(
    'div',
    { class: 'text-confirm' },
    parts.filter((p): p is string => !!p).map((p) => h('p', { style: 'margin: 0 0 8px; line-height: 1.55' }, p)),
  )
}

/** Sends it to be transcribed again: confirmed, and twice for a text staff wrote, whose changes are discarded. */
async function retranscribe() {
  const c = current.value
  const staff = status.value === 'done' && c?.source === 'staff'
  if (c) {
    try {
      await ElMessageBox.confirm(
        lines([t('materials.document.text.again.body'), props.needsApproval && t('materials.document.approvalNote')]),
        t('materials.document.text.again.title', { seq: props.seq, name: props.fileName }),
        {
          type: 'info',
          confirmButtonText: t('materials.document.text.actions.retranscribe'),
          cancelButtonText: t('common.actions.cancel'),
        },
      )
      if (staff) {
        await ElMessageBox.confirm(
          t('materials.document.text.again.staffBody', {
            name: c.edited_by_name || t('materials.document.text.again.someone'),
          }),
          t('materials.document.text.again.staffTitle'),
          {
            type: 'warning',
            confirmButtonText: t('materials.document.text.again.discard'),
            cancelButtonText: t('common.actions.cancel'),
            confirmButtonClass: 'el-button--danger',
          },
        )
      }
    } catch {
      return
    }
  }
  const out = await retranscriber.run(
    {
      course_id: props.courseId,
      document_id: props.documentId,
      version_id: props.versionId,
      file_id: props.fileId,
      ...(c ? { base_revision: c.revision } : {}),
      ...(staff ? { discard_edit: true } : {}),
    },
    { notify: false },
  )
  if (!out) {
    const e = retranscriber.lastError.value
    notifyError(e, undefined, { reasons: 'materials.refusal' })
    // What was confirmed is not what there is now: read it again.
    const reason = e?.details?.reason
    if (reason === 'text_changed' || reason === 'staff_edit') await load()
    return
  }
  if (out.status === 'proposed') {
    announce(out)
    emit('proposed', t('materials.document.text.again.pending', { seq: props.seq, name: props.fileName }))
    return
  }
  announce(out, {
    success: out.result.changed ? t('materials.document.text.again.done') : t('materials.document.text.again.already'),
  })
  await load()
  if (out.result.changed) emit('changed')
}

// --- What is offered ------------------------------------------------------------------
const busy = computed(() => updater.pending.value || retranscriber.pending.value)
/** Transcribing again: a text there is, not waiting its turn already, while the transcriber is on. */
const canRetranscribe = computed(
  () => props.canWrite && props.transcriptionOn && !!current.value && status.value !== 'pending',
)
/** Transcribing for the first time: a version with a file from before text versions. */
const canTranscribe = computed(() => props.canWrite && props.transcriptionOn && !current.value && props.hasFile)
const reason = computed(() => textReasonText(current.value?.reason, t, te))
/** A text that is done is edited from the whole of it: once it is read (or came whole with the version). */
const editable = computed(() => status.value !== 'done' || !!loaded.value || !!props.initial?.body)
</script>

<template>
  <div class="text-pane" :data-status="status ?? 'none'" :data-file="fileName">
    <div class="text-pane__bar">
      <div class="text-pane__state">
        <AppTag
          v-if="status && (shown !== 'none' || !isQueued(status))"
          :tone="toneOf(TEXT_STATUS_TAG[status])"
          class="text-pane__status"
        >
          {{ t(`enums.textStatus.${status}`) }}
        </AppTag>
        <span v-if="source === 'ai'" class="text-pane__source">
          {{
            current?.model
              ? t('materials.document.text.source.ai', { model: current.model })
              : t('materials.document.text.source.aiNoModel')
          }}
          <template v-if="current?.produced_at">
            <span class="text-pane__dot">·</span>
            <TimeText :value="current.produced_at" relative />
          </template>
        </span>
        <i18n-t
          v-else-if="source === 'staff'"
          keypath="materials.document.text.source.staff"
          tag="span"
          scope="global"
          class="text-pane__source"
        >
          <template #name>{{ current?.edited_by_name || t('materials.document.text.source.staffUnknown') }}</template>
          <template #time><TimeText :value="current?.edited_at ?? current?.updated_at" /></template>
        </i18n-t>
        <span v-if="shown === 'text' && current?.pages" class="text-pane__pages">
          {{ t('materials.document.text.pages', { n: n(current.pages) }, current.pages) }}
        </span>
      </div>
      <div class="text-pane__actions">
        <el-select
          v-if="pages.length > 1 && !editing"
          :model-value="undefined"
          :placeholder="t('materials.document.text.jumpTo')"
          size="small"
          filterable
          class="text-pane__jump"
          :aria-label="t('materials.document.text.jumpTo')"
          @change="goTo"
        >
          <el-option v-for="p in pages" :key="p.id" :value="p.id" :label="p.text" />
        </el-select>
        <PrintButton
          v-if="shown === 'text' && !editing && body.trim()"
          :source="printSource"
          class="text-pane__print"
        />
        <el-tooltip :content="t('materials.document.text.actions.refresh')" placement="top">
          <el-button
            size="small"
            circle
            :loading="loading"
            :disabled="editing"
            :aria-label="t('materials.document.text.actions.refresh')"
            class="text-pane__refresh"
            @click="load"
          >
            <el-icon v-if="!loading"><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
        <template v-if="canWrite && !editing">
          <el-button
            size="small"
            :disabled="writeDisabled || busy || !editable"
            class="text-pane__edit"
            @click="startEdit"
          >
            <el-icon><EditPen /></el-icon>
            <span>{{
              shown === 'text' ? t('materials.document.text.actions.edit') : t('materials.document.text.actions.write')
            }}</span>
          </el-button>
          <el-button
            v-if="canRetranscribe"
            size="small"
            :disabled="writeDisabled || busy"
            :loading="retranscriber.pending.value"
            class="text-pane__retranscribe"
            @click="retranscribe"
          >
            <el-icon><RefreshRight /></el-icon>
            <span>{{ t('materials.document.text.actions.retranscribe') }}</span>
          </el-button>
          <el-button
            v-else-if="canTranscribe"
            size="small"
            type="primary"
            :disabled="writeDisabled || busy"
            :loading="retranscriber.pending.value"
            class="text-pane__transcribe"
            @click="retranscribe"
          >
            <el-icon><MagicStick /></el-icon>
            <span>{{ t('materials.document.text.actions.transcribe') }}</span>
          </el-button>
          <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
        </template>
      </div>
    </div>

    <!-- Writing it -->
    <div v-if="editing" class="text-pane__editor">
      <el-alert
        v-if="conflict"
        type="warning"
        :closable="false"
        show-icon
        class="text-pane__conflict"
        :title="
          conflict.revision !== null
            ? t('materials.document.text.editor.changed', { revision: conflict.revision })
            : t('materials.document.text.editor.changedNoRevision')
        "
      >
        <el-button size="small" :loading="loading" class="text-pane__reload" @click="reloadLatest">
          {{ t('materials.document.text.editor.reload') }}
        </el-button>
      </el-alert>
      <AppNote
        v-else-if="reloadedOver"
        :title="t('materials.document.text.editor.reloaded')"
        class="text-pane__conflict"
        @close="reloadedOver = false"
        closable
      >
        <details v-if="body" class="text-pane__latest">
          <summary>{{ t('materials.document.text.editor.latest') }}</summary>
          <MarkdownView :source="body" class="text-pane__latest-body" />
        </details>
      </AppNote>
      <p class="app-form-hint text-pane__hint">{{ t('materials.document.text.editor.hint') }}</p>
      <MarkdownEditor v-model="draft" :rows="18" :disabled="updater.pending.value" />
      <div class="text-pane__editor-actions">
        <el-button type="primary" :loading="updater.pending.value" class="text-pane__save" @click="save">
          {{ t('materials.document.text.editor.save') }}
        </el-button>
        <el-button :disabled="updater.pending.value" class="text-pane__cancel" @click="cancelEdit">
          {{ t('common.actions.cancel') }}
        </el-button>
        <span v-if="needsApproval" class="app-form-hint">{{ t('materials.document.approvalNote') }}</span>
      </div>
    </div>

    <!-- Reading it -->
    <template v-else>
      <p v-if="progress" class="app-muted text-pane__progress">
        {{ t('materials.document.text.reading', { read: progress.read, parts: progress.parts }) }}
      </p>
      <AsyncState
        :loading="loading && !loaded && !initial"
        :error="shown === 'text' && body ? null : error"
        :overlay="true"
        @retry="load"
      >
        <div v-if="shown === 'text'" class="text-pane__body">
          <MarkdownView :source="body" :anchors="ANCHORS" code-tools :empty="t('common.labels.empty')" />
        </div>
        <div v-else-if="shown === 'queued'" class="text-pane__queued">
          <el-icon class="text-pane__queued-icon" :class="{ 'is-working': status === 'working' }">
            <Loading v-if="status === 'working'" />
            <Clock v-else />
          </el-icon>
          <div>
            <p class="text-pane__queued-text">{{ t(`materials.document.text.queued.${status}`) }}</p>
            <p class="app-muted text-pane__queued-after">{{ t('materials.document.text.queued.after') }}</p>
          </div>
        </div>
        <el-alert
          v-else-if="shown === 'failed'"
          :type="status === 'failed' ? 'error' : 'warning'"
          :closable="false"
          show-icon
          class="text-pane__failed"
          :title="
            reason ? t(`materials.document.text.${status}`, { reason }) : t(`materials.document.text.${status}NoReason`)
          "
        >
          <p v-if="canWrite" class="text-pane__failed-hint">
            {{
              transcriptionOn
                ? t('materials.document.text.none.staffFailed')
                : t('materials.document.text.none.staffOff')
            }}
          </p>
        </el-alert>
        <AppEmpty
          v-else
          class="text-pane__none"
          :text="
            !canWrite
              ? t('materials.document.text.none.reader')
              : !transcriptionOn
                ? t('materials.document.text.none.staffOff')
                : !current && hasFile
                  ? t('materials.document.text.none.staffOld')
                  : t('materials.document.text.none.staff')
          "
        />
      </AsyncState>
    </template>
  </div>
</template>

<style scoped>
.text-pane__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.text-pane__state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  min-width: 0;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.text-pane__dot {
  margin: 0 4px;
  color: var(--el-text-color-placeholder);
}
.text-pane__source + .text-pane__pages::before {
  content: '·';
  margin-right: 8px;
  color: var(--el-text-color-placeholder);
}
.text-pane__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.text-pane__actions .el-button + .el-button {
  margin-left: 0;
}
.text-pane__jump {
  width: 160px;
}
.text-pane__body {
  overflow-wrap: anywhere;
}
/* A page's heading gone to stays clear of the page's header. */
.text-pane__body :deep(h2[id]) {
  scroll-margin-top: 72px;
}
.text-pane__queued {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--app-radius-item);
}
.text-pane__queued-icon {
  font-size: var(--app-text-2xl);
  margin-top: 2px;
  color: var(--el-color-primary);
}
.text-pane__queued-icon.is-working {
  animation: text-pane-turn 1.6s linear infinite;
}
@keyframes text-pane-turn {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .text-pane__queued-icon.is-working {
    animation: none;
  }
}
.text-pane__queued-text {
  margin: 0;
  line-height: var(--app-lh-text);
}
.text-pane__queued-after {
  margin: 4px 0 0;
  font-size: var(--app-text-xs);
}
.text-pane__failed-hint {
  margin: 4px 0 0;
}
.text-pane__none {
  padding: 16px 0;
}
.text-pane__progress {
  margin: 0 0 8px;
  font-size: var(--app-text-xs);
}
.text-pane__editor-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 12px;
}
.text-pane__editor-actions .el-button + .el-button {
  margin-left: 0;
}
.text-pane__hint {
  margin: 0 0 4px;
}
.text-pane__conflict {
  margin-bottom: 12px;
}
.text-pane__conflict :deep(.el-alert__description) {
  margin-top: 6px;
}
.text-pane__latest summary {
  cursor: pointer;
}
.text-pane__latest-body {
  margin-top: 8px;
  max-height: 320px;
  overflow: auto;
}
</style>
