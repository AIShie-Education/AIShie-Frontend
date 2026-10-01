<script setup lang="ts">
// Editing material, instructions or a rubric: document.add_version. A version
// is never changed, so an edit is a new version.
//
// Files come first: the dialog opens on a drop zone for the new version's
// files (dropped anywhere on it, or on the document's page, which opens it
// with them), which it holds in the order listed, to move up or down or take
// off before saving. The text is the second part, under them
// (DocumentTextField): the latest version's text comes with the files unless
// it is left out, and opens to be edited, or written where there is none. A
// version holds text, files, or both; the text is shown open where the latest
// version is text alone.
//
// What a version holds is known before anything is sent (the upload URL's
// max_files, max_version_bytes and max_bytes): a file there is no room for is
// not uploaded, and says why. The files go as files: [{upload_token,
// filename}], in order; what Core refuses because of them marks the files it
// was about, and uploads that can no longer be attached are uploaded again.
//
// Files are not carried over from one version to the next — a version holds
// what it is given — so files to keep are uploaded again, and saving without
// them is how they are dropped.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read, type ApiError, type UploadKind } from '@/api/http'
import type { DocumentFull } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { useUploadQueue } from '@/composables/useUploadQueue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { FILE_REFUSAL_SCOPE, filesPayload, versionFilesOf, versionFilesRefused } from '@/utils/documentFiles'
import { formatBytes, formatNumber } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import DocumentTextField from '@/components/DocumentTextField.vue'
import FileDropZone from '@/components/FileDropZone.vue'

type Version = NonNullable<DocumentFull['version']>

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  documentId: string
  kind: UploadKind
  docTitle: string
  /** Instructions or a rubric whose assignment is not published yet. */
  unreleased?: boolean
  /** Files dropped on the document's page, to start with. */
  files?: File[]
}>()
const emit = defineEmits<{
  saved: [result: { version_id: string; seq: number; published: boolean }]
  proposed: [publish: boolean]
}>()
const { t } = useI18n()
const course = useCourseStore()

const form = reactive({ body: '', publish: false })
/** Whether the text is open to be edited. */
const textOpen = ref(false)
const base = ref<Version | null>(null)
const baseLoading = ref(false)
const baseError = ref<ApiError | null>(null)

// The new version's files, in the order listed.
const queue = useUploadQueue({ courseId: () => props.courseId, kind: () => props.kind, version: true })
const ready = computed(() => queue.items.filter((i) => i.status === 'done' && i.result))
const uploading = computed(() => queue.busy.value)
/** Refused because of its files, and uploading them again: said until they are up. */
const againNote = ref(false)
watch(uploading, (busy) => {
  if (!busy) againNote.value = false
})

// The latest version, read afresh: for a member who reads drafts, document.get
// without a version is the latest one.
async function loadBase() {
  baseLoading.value = true
  baseError.value = null
  try {
    const d = await read('document.get', { course_id: props.courseId, document_id: props.documentId })
    base.value = d.version ?? null
    form.body = d.version?.body_md ?? ''
    // A document that is text alone is edited as text: its editor is open.
    const v = d.version
    textOpen.value = !!v?.body_md?.trim() && !versionFilesOf(v).length
  } catch (e) {
    baseError.value = toApiError(e)
  } finally {
    baseLoading.value = false
  }
}

watch(
  visible,
  (v) => {
    queue.clear()
    if (!v) return
    textOpen.value = false
    form.body = ''
    form.publish = false
    base.value = null
    againNote.value = false
    void loadBase()
    if (props.files?.length) queue.add(props.files)
  },
  { immediate: true },
)

const baseText = computed(() => base.value?.body_md ?? '')
const hasText = computed(() => form.body.trim() !== '')
const hasFiles = computed(() => ready.value.length > 0)
const hasContent = computed(() => hasText.value || hasFiles.value)
/** The latest version's files, which a new version does not carry over. */
const baseFiles = computed(() => versionFilesOf(base.value, props.docTitle))
const baseHasFile = computed(() => baseFiles.value.length > 0)
const sameText = computed(() => !!base.value && form.body === baseText.value)
// A new version holds only what it is given: the same text without the files
// the latest version has is a change — it drops them.
const unchanged = computed(() => sameText.value && !hasFiles.value && !baseHasFile.value)
const dropsFileOnly = computed(() => sameText.value && !hasFiles.value && baseHasFile.value)
/** More than a version holds, by what a refusal taught after the files were let in. */
const excessText = computed(() => {
  const x = queue.excess.value
  if (!x) return null
  if (x.files && queue.maxFiles.value) return t('common.upload.excessFiles', { max: queue.maxFiles.value, n: x.files })
  return t('common.upload.excessBytes', {
    total: formatBytes(x.bytes),
    max: formatBytes(queue.maxVersionBytes.value ?? 0),
  })
})
const canSave = computed(
  () =>
    course.writable &&
    !baseLoading.value &&
    !baseError.value &&
    !uploading.value &&
    hasContent.value &&
    !unchanged.value &&
    !excessText.value,
)
/** The latest version's files, named, for the word that they are not carried over. */
const baseFileNames = computed(() => {
  const names = baseFiles.value.map((f) => `${f.filename} (${formatBytes(f.byte_size)})`)
  return names.length > 4 ? [...names.slice(0, 4), '…'].join(', ') : names.join(', ')
})

/** What becomes of the text, said under the file while there is some. */
const textLine = computed(() => {
  const chars = formatNumber(form.body.length, 0)
  if (base.value && sameText.value) return t('materials.document.addVersion.textKept', { seq: base.value.seq, chars })
  return t('materials.document.addVersion.textWritten', { chars })
})

const addVersion = useWrite('document.add_version')

async function submit() {
  if (!canSave.value) return
  const publish = form.publish
  const files = filesPayload(queue)
  const out = await addVersion.run(
    {
      course_id: props.courseId,
      document_id: props.documentId,
      body_md: hasText.value ? form.body : undefined,
      ...(files.length ? { files } : {}),
      publish: publish || undefined,
    },
    {
      success: publish ? t('materials.document.addVersion.donePublished') : t('materials.document.addVersion.done'),
      reasons: [FILE_REFUSAL_SCOPE, 'materials.refusal'],
    },
  )
  if (!out) {
    // Refused because of its files: the files it was about say so, and
    // uploads that can no longer be attached are uploaded again.
    againNote.value = !!versionFilesRefused(queue, addVersion.lastError.value)?.again
    return
  }
  visible.value = false
  if (out.status === 'proposed') emit('proposed', publish)
  else emit('saved', out.result)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('materials.document.addVersion.title', { title: docTitle })"
    width="760px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <AsyncState :loading="baseLoading" :error="baseError" @retry="loadBase">
      <el-alert
        v-if="course.needsApproval('document_write')"
        type="warning"
        :closable="false"
        show-icon
        class="version-dialog__alert"
        :title="t('materials.document.approvalNote')"
      />
      <p class="version-dialog__intro">
        {{
          base
            ? t('materials.document.addVersion.introFrom', { seq: base.seq })
            : t('materials.document.addVersion.introEmpty')
        }}
      </p>
      <el-alert
        v-if="baseHasFile && base && !hasFiles"
        type="info"
        :closable="false"
        show-icon
        class="version-dialog__alert"
        :title="
          t(
            'materials.document.addVersion.fileNotCarried',
            { seq: base.seq, n: baseFiles.length, names: baseFileNames },
            baseFiles.length,
          )
        "
      />
      <el-form label-position="top" @submit.prevent="submit">
        <!-- The file first, and the text under it. -->
        <el-form-item :label="t('materials.document.addVersion.file')">
          <div class="version-dialog__stack">
            <FileDropZone
              :queue="queue"
              :course-id="courseId"
              :kind="kind"
              multiple
              reorder
              page-drop
              :disabled="!course.writable || addVersion.pending.value"
              :label="t('materials.document.addVersion.dropLabel')"
            />
            <p v-if="queue.items.length > 1" class="app-form-hint version-dialog__files-hint">
              {{ t('materials.document.addVersion.filesHint') }}
            </p>
            <el-alert
              v-if="againNote"
              type="info"
              :closable="false"
              show-icon
              class="version-dialog__again"
              :title="t('common.upload.uploadingAgain')"
            />
            <DocumentTextField
              v-model="form.body"
              v-model:open="textOpen"
              :summary="textLine"
              :rows="12"
              :disabled="addVersion.pending.value"
              class="version-dialog__text"
            >
              <template #actions>
                <el-button v-if="hasText" link type="danger" @click="form.body = ''">
                  {{ t('materials.document.addVersion.leaveTextOut') }}
                </el-button>
                <el-button v-else-if="baseText.trim() && base" link type="primary" @click="form.body = baseText">
                  {{ t('materials.document.addVersion.putTextBack', { seq: base.seq }) }}
                </el-button>
              </template>
            </DocumentTextField>
          </div>
        </el-form-item>

        <el-form-item>
          <div class="version-dialog__stack">
            <el-checkbox v-model="form.publish" :label="t('materials.document.addVersion.publish')" />
            <div class="app-form-hint">{{ t('materials.document.addVersion.publishHint') }}</div>
            <div v-if="unreleased" class="app-form-hint">{{ t('materials.document.addVersion.unreleased') }}</div>
          </div>
        </el-form-item>
      </el-form>
    </AsyncState>
    <template #footer>
      <div class="version-dialog__footer">
        <span v-if="!baseLoading && !baseError && uploading" class="version-dialog__why">
          {{ t('materials.document.addVersion.waitForFile') }}
        </span>
        <span v-else-if="!baseLoading && !baseError && !hasContent" class="version-dialog__why">
          {{ t('materials.document.addVersion.needsContent') }}
        </span>
        <span v-else-if="!baseLoading && unchanged && base" class="version-dialog__why">
          {{ t('materials.document.addVersion.unchanged', { seq: base.seq }) }}
        </span>
        <span v-else-if="!baseLoading && excessText" class="version-dialog__why">{{ excessText }}</span>
        <span v-else-if="!baseLoading && dropsFileOnly && base" class="version-dialog__why">
          {{ t('materials.document.addVersion.dropsFile', { seq: base.seq }, baseFiles.length) }}
        </span>
        <span class="version-dialog__buttons">
          <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
          <el-button type="primary" :loading="addVersion.pending.value" :disabled="!canSave" @click="submit">
            {{ t('materials.document.addVersion.submit') }}
          </el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.version-dialog__alert {
  margin-bottom: 12px;
}
.version-dialog__intro {
  margin: 0 0 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.version-dialog__stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}
.version-dialog__text {
  margin-top: 10px;
}
.version-dialog__files-hint {
  margin: 6px 0 0;
}
.version-dialog__again {
  margin-top: 8px;
}
.version-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.version-dialog__why {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: left;
}
/* The buttons keep together at the right, under the reason where there is no room beside it. */
.version-dialog__buttons {
  display: inline-flex;
  gap: 12px;
  margin-left: auto;
}
.version-dialog__buttons .el-button + .el-button {
  margin-left: 0;
}
</style>
