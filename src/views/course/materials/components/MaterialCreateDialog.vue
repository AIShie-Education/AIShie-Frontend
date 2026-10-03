<script setup lang="ts">
// Creating material. Files come first: it opens on a drop zone, and the
// files dropped (or chosen, or pasted, or dropped on the materials list,
// which opens it) all go into one material, document.create (kind material)
// with them as its first version, in the order listed, which can be changed
// (moved up or down) or have a file taken off before it is created. Its
// title is the first file's name until it is changed. Text is the second
// part: a note in Markdown under the drop zone (DocumentTextField), in the
// same version. Material with no file at all is written by "Write text
// instead": a title and Markdown.
//
// What a version holds is known before anything is sent (the upload URL's
// max_files, max_version_bytes and max_bytes): a file there is no room for
// is not uploaded, and says why (the upload queue, `version`). The files go
// as files: [{upload_token, filename}], in order. What Core refuses because
// of them is said in the reader's words, and marks the files it was about:
// uploads that can no longer be attached are uploaded again, to create once
// they are up.
//
// Material starts unpublished; publishing is a second call
// (document.publish), and when the creation became a proposal there is
// nothing to publish yet.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUploadQueue, type UploadItem } from '@/composables/useUploadQueue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { FILE_REFUSAL_SCOPE, filesPayload, versionFilesRefused } from '@/utils/documentFiles'
import { formatBytes, titleFromFileName } from '@/utils/format'
import DocumentTextField from '@/components/DocumentTextField.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  suggestedOrder: number
  /** Files dropped on the materials list, to start with. */
  files?: File[]
}>()
const emit = defineEmits<{
  created: [documentIds: string[]]
  proposed: [info: { titles: string[]; publish: boolean }]
}>()
const { t } = useI18n()
const course = useCourseStore()

type Mode = 'upload' | 'text'
const mode = ref<Mode>('upload')
const formRef = ref<FormInstance>()
const form = reactive({
  title: '',
  sortOrder: 1,
  body: '',
  publish: false,
})
/** The title was written here: it no longer follows the first file's name. */
const titleTouched = ref(false)

// --- The files: one material holds them all, in order ---------------------------------
const queue = useUploadQueue({ courseId: () => props.courseId, kind: 'material', version: true })
const ready = computed(() => queue.items.filter((i) => i.status === 'done' && i.result))
/** The files that are to go in: uploaded, or on their way. */
const kept = computed(() => queue.items.filter((i) => i.status !== 'failed' && i.status !== 'cancelled'))
const leftOut = computed(() => queue.items.length - kept.value.length)
/** Refused because of its files, and uploading them again: said until they are up. */
const againNote = ref(false)

// The title is the first file's name until it is written here.
watch(
  () => kept.value[0]?.name,
  (name) => {
    if (!titleTouched.value) form.title = name ? titleFromFileName(name) : ''
  },
)
function onTitle(v: string) {
  form.title = v
  titleTouched.value = true
}

// --- The text: in the same version ------------------------------------------------------
const textOpen = ref(false)

function onAdded(_items: UploadItem[]) {
  // Files dropped while writing text: the title and text written go with them.
  if (mode.value === 'text') {
    if (form.title.trim()) titleTouched.value = true
    if (hasText.value) textOpen.value = true
  }
  mode.value = 'upload'
}

function reset() {
  mode.value = 'upload'
  form.title = ''
  titleTouched.value = false
  form.sortOrder = props.suggestedOrder
  form.body = ''
  form.publish = false
  textOpen.value = false
  againNote.value = false
  queue.clear()
  if (props.files?.length) queue.add(props.files)
}
watch(
  visible,
  (v) => {
    if (v) reset()
    // Closed, whatever is still on its way goes nowhere.
    else queue.clear()
  },
  { immediate: true },
)
watch(
  () => queue.busy.value,
  (busy) => {
    if (!busy) againNote.value = false
  },
)

const hasText = computed(() => form.body.trim() !== '')
const canPublish = computed(() => (mode.value === 'upload' ? ready.value.length > 0 : hasText.value))
watch(canPublish, (can) => {
  if (!can) form.publish = false
})

const rules = computed<FormRules>(() => ({
  title: [{ required: true, whitespace: true, message: t('common.errors.required'), trigger: 'blur' }],
}))

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

/** Why Create cannot be pressed now, or null. */
const blocked = computed<string | null>(() => {
  if (mode.value === 'text') return null
  if (queue.busy.value) {
    const n = queue.items.filter((i) => i.status === 'queued' || i.status === 'uploading').length
    return t('materials.create.waitForUploads', { n }, n)
  }
  if (!ready.value.length) return t('materials.create.noFiles')
  if (excessText.value) return excessText.value
  if (!form.title.trim()) return t('materials.create.untitled')
  return null
})

const creator = useWrite('document.create')
const publisher = useWrite('document.publish')
const pending = computed(() => creator.pending.value || publisher.pending.value)

async function submit() {
  if (mode.value === 'upload' && blocked.value) return
  const ok = mode.value === 'upload' || (await formRef.value?.validate().catch(() => false))
  if (!ok) return
  const title = form.title.trim()
  const files = mode.value === 'upload' ? filesPayload(queue) : []
  const wantsPublish = form.publish && canPublish.value
  const out = await creator.run(
    {
      course_id: props.courseId,
      kind: 'material',
      title,
      sort_order: form.sortOrder,
      ...(files.length ? { files } : {}),
      body_md: hasText.value ? form.body : undefined,
    },
    // When it is to be published as well, the publish call says how it went.
    {
      success: wantsPublish ? false : t('materials.create.done'),
      reasons: [FILE_REFUSAL_SCOPE, 'materials.refusal'],
    },
  )
  if (!out) {
    // Refused because of its files: the files it was about say so, and
    // uploads that can no longer be attached are uploaded again.
    againNote.value = !!versionFilesRefused(queue, creator.lastError.value)?.again
    return
  }
  if (out.status === 'proposed') {
    // Nothing exists yet, so there is nothing to publish either.
    visible.value = false
    emit('proposed', { titles: [title], publish: wantsPublish })
    return
  }
  const documentId = out.result.document_id
  if (wantsPublish && out.result.version_id) {
    const p = await publisher.run(
      { course_id: props.courseId, document_id: documentId, version_id: out.result.version_id },
      { success: t('materials.create.donePublished') },
    )
    if (!p) ElMessage({ type: 'warning', message: t('materials.create.notPublished'), duration: 6000, showClose: true })
  }
  visible.value = false
  emit('created', [documentId])
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('materials.create.title')"
    width="680px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <el-alert
      v-if="course.needsApproval('document_write')"
      type="warning"
      :closable="false"
      show-icon
      class="create-dialog__approval"
      :title="t('materials.create.approvalNote')"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <!-- Files first. Kept while text is written, so that files dropped then come here. -->
      <div v-show="mode === 'upload'" class="create-dialog__upload">
        <FileDropZone
          :queue="queue"
          :course-id="courseId"
          kind="material"
          multiple
          reorder
          page-drop
          :disabled="!course.writable || pending"
          :label="t('materials.create.dropLabel')"
          @added="onAdded"
        />
        <p v-if="kept.length > 1" class="app-form-hint create-dialog__files-hint">
          {{ t('materials.create.filesHint') }}
        </p>
        <p v-if="leftOut" class="app-form-hint create-dialog__left-out">
          {{ t('materials.create.leftOut', { n: leftOut }, leftOut) }}
        </p>
        <el-alert
          v-if="againNote"
          type="info"
          :closable="false"
          show-icon
          class="create-dialog__again"
          :title="t('common.upload.uploadingAgain')"
        />
        <!-- The material's title, once there is a file: the first file's name until it is written. -->
        <div v-if="kept.length && mode === 'upload'" class="create-dialog__title-upload">
          <label class="create-dialog__label" for="create-dialog-title">{{ t('materials.create.name') }}</label>
          <el-input
            id="create-dialog-title"
            :model-value="form.title"
            maxlength="300"
            :placeholder="t('materials.create.namePlaceholder')"
            :disabled="pending"
            @update:model-value="onTitle"
          />
          <div v-if="!titleTouched" class="app-form-hint">{{ t('materials.create.titleFromFile') }}</div>
        </div>
        <!-- The text, second: in the same version. -->
        <DocumentTextField
          v-if="mode === 'upload'"
          v-model="form.body"
          v-model:open="textOpen"
          :rows="8"
          :disabled="pending"
          class="create-dialog__text"
        />
        <!-- No file at all: material that is text alone. -->
        <div v-if="!kept.length" class="create-dialog__switch">
          <el-button link type="primary" @click="mode = 'text'">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('materials.create.writeInstead') }}</span>
          </el-button>
        </div>
      </div>

      <template v-if="mode === 'text'">
        <div class="create-dialog__row">
          <el-form-item :label="t('materials.create.name')" prop="title" class="create-dialog__title">
            <el-input v-model="form.title" :placeholder="t('materials.create.namePlaceholder')" maxlength="300" />
          </el-form-item>
          <el-form-item :label="t('materials.create.sortOrder')" prop="sortOrder" class="create-dialog__order">
            <el-input-number
              v-model="form.sortOrder"
              :step="1"
              step-strictly
              :min="-100000"
              :max="100000"
              controls-position="right"
            />
          </el-form-item>
        </div>
        <p class="app-form-hint create-dialog__hint">{{ t('materials.create.sortOrderHint') }}</p>

        <el-form-item :label="t('materials.create.body')">
          <MarkdownEditor v-model="form.body" :rows="10" />
          <div class="create-dialog__switch">
            <el-button link type="primary" @click="mode = 'upload'">
              <el-icon><Upload /></el-icon>
              <span>{{ t('materials.create.uploadInstead') }}</span>
            </el-button>
          </div>
        </el-form-item>
      </template>

      <el-form-item v-else :label="t('materials.create.sortOrder')" class="create-dialog__order-upload">
        <div class="create-dialog__stack">
          <el-input-number
            v-model="form.sortOrder"
            :step="1"
            step-strictly
            :min="-100000"
            :max="100000"
            controls-position="right"
          />
          <div class="app-form-hint">{{ t('materials.create.sortOrderHint') }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <div class="create-dialog__stack">
          <el-checkbox v-model="form.publish" :disabled="!canPublish" :label="t('materials.create.publish')" />
          <div class="app-form-hint">
            {{
              canPublish
                ? t('materials.create.publishHint')
                : mode === 'upload'
                  ? t('materials.create.publishNeedsFile')
                  : t('materials.create.publishNeedsContent')
            }}
          </div>
        </div>
      </el-form-item>

      <el-alert
        v-if="mode === 'text' && !hasText"
        type="info"
        :closable="false"
        :title="t('materials.create.emptyNote')"
        class="create-dialog__empty"
      />
    </el-form>
    <template #footer>
      <div class="create-dialog__footer">
        <span v-if="blocked && !pending" class="create-dialog__why">{{ blocked }}</span>
        <span class="create-dialog__buttons">
          <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
          <el-button type="primary" :loading="pending" :disabled="!course.writable || !!blocked" @click="submit">
            {{ t('materials.create.submit') }}
          </el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-dialog__approval {
  margin-bottom: 16px;
}
.create-dialog__upload {
  margin-bottom: 18px;
}
.create-dialog__switch {
  margin-top: 8px;
}
.create-dialog__text {
  margin-top: 12px;
}
.create-dialog__files-hint,
.create-dialog__left-out {
  margin: 6px 0 0;
}
.create-dialog__again {
  margin-top: 8px;
}
.create-dialog__title-upload {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
}
.create-dialog__label {
  font-size: var(--app-text-md);
  color: var(--el-text-color-regular);
}
.create-dialog__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.create-dialog__title {
  flex: 1 1 260px;
  margin-bottom: 0;
}
.create-dialog__order {
  flex: 0 0 150px;
  margin-bottom: 0;
}
.create-dialog__hint {
  margin: 4px 0 18px;
}
.create-dialog__stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}
.create-dialog__empty {
  margin-top: -4px;
}
.create-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.create-dialog__why {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  text-align: left;
}
/* The buttons keep together at the right, under the reason where there is no room beside it. */
.create-dialog__buttons {
  display: inline-flex;
  gap: 12px;
  margin-left: auto;
}
.create-dialog__buttons .el-button + .el-button {
  margin-left: 0;
}
</style>
