<script setup lang="ts">
// Choosing the instructions or rubric document of an assignment: none, an
// existing document of that kind, or a new one made here (created, and
// published if asked, when the form is saved). A new one is a file first: its
// drop zone comes first, and writing its text is the second choice ("Write
// text instead"). It may hold both.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DocumentSummary } from '@/api/types'
import type { UploadedFile } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { formatBytes, formatNumber, titleFromFileName } from '@/utils/format'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import type { DocChoice } from './types'

const model = defineModel<DocChoice>({ required: true })
/** True while the new document's file is still uploading. */
const uploading = defineModel<boolean>('uploading', { default: false })
const props = defineProps<{
  courseId: string
  kind: 'instructions' | 'rubric'
  options: DocumentSummary[]
  loading?: boolean
  /** The list could not be read (no permission for this kind). */
  listError?: boolean
  /** "None" is offered: not when editing an assignment that has one, since it cannot be removed. */
  allowNone: boolean
  /** Writing a new one is offered (the seat can write documents). */
  canCreate: boolean
  /** The title a new document starts with. */
  defaultTitle?: string
  /**
   * Only a document with a published version will do (the instructions of a
   * published assignment): others cannot be chosen, and a new one is
   * published at once.
   */
  requirePublished?: boolean
  disabled?: boolean
}>()
const { t } = useI18n()
const course = useCourseStore()

function set(patch: Partial<DocChoice>) {
  if (patch.mode === 'new' && !model.value.title.trim() && props.defaultTitle)
    patch = { ...patch, title: props.defaultTitle }
  model.value = { ...model.value, ...patch }
}

const kindLabel = computed(() => t(`enums.documentKind.${props.kind}`))
const selected = computed(() => props.options.find((d) => d.id === model.value.id))

// A new document: its file, or (the second choice) its text being written.
const writing = ref(false)
watch(
  () => model.value.mode,
  (m) => {
    if (m !== 'new') writing.value = false
  },
)
const file = computed(() => model.value.files[0] ?? null)
const hasText = computed(() => model.value.body.trim() !== '')
/** A file dropped on a new document with no title yet names it. */
function onUploaded(f: UploadedFile) {
  if (!model.value.title.trim()) set({ title: titleFromFileName(f.fileName) })
}
</script>

<template>
  <div class="doc-choice">
    <el-radio-group
      :model-value="model.mode"
      size="small"
      :disabled="disabled"
      @update:model-value="(v: string | number | boolean | undefined) => set({ mode: v as DocChoice['mode'] })"
    >
      <el-radio-button v-if="allowNone" value="none">{{ t('assignments.form.doc.none') }}</el-radio-button>
      <el-radio-button value="existing">{{ t('assignments.form.doc.existing') }}</el-radio-button>
      <el-radio-button v-if="canCreate" value="new">{{ t('assignments.form.doc.new') }}</el-radio-button>
    </el-radio-group>

    <div v-if="model.mode === 'existing'" class="doc-choice__body">
      <el-select
        :model-value="model.id"
        filterable
        :loading="loading"
        :disabled="disabled"
        :placeholder="t('assignments.form.doc.choose')"
        class="doc-choice__select"
        @update:model-value="(v: string) => set({ id: v })"
      >
        <el-option
          v-for="d in options"
          :key="d.id"
          :value="d.id"
          :label="d.title"
          :disabled="requirePublished && !d.published_version_id"
        >
          <div class="doc-choice__option">
            <span class="doc-choice__option-title">{{ d.title }}</span>
            <el-tag v-if="!d.published_version_id" size="small" type="warning" disable-transitions>
              {{ t('assignments.form.doc.unpublishedTag') }}
            </el-tag>
          </div>
        </el-option>
      </el-select>
      <div v-if="listError" class="app-form-hint">{{ t('assignments.form.doc.unreadable') }}</div>
      <div v-else-if="!loading && !options.length" class="app-form-hint">
        {{ t('assignments.form.doc.noneAvailable', { kind: kindLabel }) }}
      </div>
      <div v-else-if="selected && !selected.published_version_id" class="app-form-hint">
        {{
          requirePublished
            ? t('assignments.form.doc.mustBePublished')
            : t(`assignments.form.doc.selectedUnpublished.${kind}`)
        }}
      </div>
      <div v-if="!allowNone" class="app-form-hint">{{ t('assignments.form.doc.cannotRemove') }}</div>
    </div>

    <div v-else-if="model.mode === 'new'" class="doc-choice__body doc-choice__new">
      <div v-if="course.needsApproval('document_write')" class="app-form-hint doc-choice__approval">
        <el-tag type="warning" size="small" disable-transitions>{{ t('enums.level.confirm_required') }}</el-tag>
        <span>{{ t('assignments.form.doc.newNeedsApproval') }}</span>
      </div>
      <el-input
        :model-value="model.title"
        :disabled="disabled"
        :placeholder="t('assignments.form.doc.newTitle')"
        maxlength="300"
        @update:model-value="(v: string) => set({ title: v })"
      />
      <!-- The file first. Kept while text is written, so that what is uploading goes on. -->
      <div v-show="!writing" class="doc-choice__file">
        <FileDropZone
          v-model:uploading="uploading"
          :model-value="model.files"
          :course-id="courseId"
          :kind="kind"
          :disabled="disabled"
          :label="t(`assignments.form.doc.dropLabel.${kind}`)"
          @update:model-value="(v: UploadedFile[]) => set({ files: v })"
          @uploaded="onUploaded"
        />
        <div class="doc-choice__line">
          <template v-if="hasText">
            <span>{{ t('assignments.form.doc.textChars', { chars: formatNumber(model.body.length, 0) }) }}</span>
            <el-button link type="primary" :disabled="disabled" @click="writing = true">
              {{ t('assignments.form.doc.editText') }}
            </el-button>
          </template>
          <el-button v-else link type="primary" :disabled="disabled" @click="writing = true">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('assignments.form.doc.writeInstead') }}</span>
          </el-button>
        </div>
      </div>
      <template v-if="writing">
        <MarkdownEditor
          :model-value="model.body"
          :rows="6"
          :disabled="disabled"
          :placeholder="t('assignments.form.doc.newBody')"
          @update:model-value="(v: string) => set({ body: v })"
        />
        <div class="doc-choice__line">
          <el-icon aria-hidden="true"><Paperclip /></el-icon>
          <span v-if="file">
            {{ t('assignments.form.doc.withFile', { name: file.fileName, size: formatBytes(file.size) }) }}
          </span>
          <span v-else-if="uploading">{{ t('assignments.form.doc.fileUploading') }}</span>
          <span v-else>{{ t('assignments.form.doc.noFile') }}</span>
          <el-button link type="primary" :disabled="disabled" @click="writing = false">
            {{ file || uploading ? t('assignments.form.doc.seeFile') : t('assignments.form.doc.uploadInstead') }}
          </el-button>
        </div>
      </template>
      <el-checkbox
        :model-value="model.publish || requirePublished"
        :disabled="disabled || requirePublished"
        @update:model-value="(v: string | number | boolean) => set({ publish: !!v })"
      >
        {{ t(`assignments.form.doc.publishNow.${kind}`) }}
      </el-checkbox>
      <div v-if="kind === 'rubric'" class="app-form-hint doc-choice__publish-hint">
        {{ t('assignments.form.doc.rubricReaders') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.doc-choice {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.doc-choice__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.doc-choice__new {
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: var(--app-radius-item);
}
.doc-choice__select {
  width: 100%;
}
.doc-choice__approval {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 0;
}
.doc-choice__approval .el-tag {
  flex-shrink: 0;
}
.doc-choice__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.doc-choice__option-title {
  overflow: hidden;
  text-overflow: ellipsis;
}
.doc-choice__file {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.doc-choice__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.doc-choice__new :deep(.el-checkbox) {
  white-space: normal;
  height: auto;
  line-height: 1.4;
}
.doc-choice__new :deep(.el-checkbox__label) {
  white-space: normal;
}
.doc-choice__publish-hint {
  margin-top: -4px;
}
</style>
