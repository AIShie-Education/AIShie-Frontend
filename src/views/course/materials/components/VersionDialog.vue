<script setup lang="ts">
// Editing material, instructions or a rubric: document.add_version. A version
// is never changed, so an edit is a new version, started from the text of the
// latest one. A file is not carried over from one version to the next — a
// version holds what it is given — so a file to keep is uploaded again.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read, type ApiError, type UploadKind, type UploadedFile } from '@/api/http'
import type { DocumentFull } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatBytes } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import FileUploader from '@/components/FileUploader.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

type Version = NonNullable<DocumentFull['version']>

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  documentId: string
  kind: UploadKind
  docTitle: string
  /** Instructions or a rubric whose assignment is not published yet. */
  unreleased?: boolean
}>()
const emit = defineEmits<{
  saved: [result: { version_id: string; seq: number; published: boolean }]
  proposed: [publish: boolean]
}>()
const { t } = useI18n()
const course = useCourseStore()

const form = reactive({ body: '', files: [] as UploadedFile[], publish: false })
const base = ref<Version | null>(null)
const baseLoading = ref(false)
const baseError = ref<ApiError | null>(null)

// The latest version, read afresh: for a member who reads drafts, document.get
// without a version is the latest one.
async function loadBase() {
  baseLoading.value = true
  baseError.value = null
  try {
    const d = await read('document.get', { course_id: props.courseId, document_id: props.documentId })
    base.value = d.version ?? null
    form.body = d.version?.body_md ?? ''
  } catch (e) {
    baseError.value = toApiError(e)
  } finally {
    baseLoading.value = false
  }
}

watch(
  visible,
  (v) => {
    if (!v) return
    form.body = ''
    form.files = []
    form.publish = false
    base.value = null
    void loadBase()
  },
  { immediate: true },
)

const hasContent = computed(() => form.body.trim() !== '' || form.files.length > 0)
const unchanged = computed(() => !form.files.length && !!base.value && form.body === (base.value.body_md ?? ''))
const baseHasFile = computed(() => !!base.value && (!!base.value.download_url || !!base.value.content_type))
const canSave = computed(
  () => course.writable && !baseLoading.value && !baseError.value && hasContent.value && !unchanged.value,
)

const addVersion = useWrite('document.add_version')

async function submit() {
  if (!canSave.value) return
  const publish = form.publish
  const out = await addVersion.run(
    {
      course_id: props.courseId,
      document_id: props.documentId,
      body_md: form.body.trim() ? form.body : undefined,
      upload_token: form.files[0]?.uploadToken,
      publish: publish || undefined,
    },
    { success: publish ? t('materials.document.addVersion.donePublished') : t('materials.document.addVersion.done') },
  )
  if (!out) return
  visible.value = false
  if (out.status === 'proposed') emit('proposed', publish)
  else emit('saved', out.result)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('materials.document.addVersion.title', { title: docTitle })"
    width="min(760px, calc(100vw - 24px))"
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
        {{ t('materials.document.addVersion.intro') }}
        <template v-if="base">{{ t('materials.document.addVersion.startsFrom', { seq: base.seq }) }}</template>
        <template v-else>{{ t('materials.document.addVersion.startsEmpty') }}</template>
      </p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('materials.document.addVersion.body')">
          <MarkdownEditor v-model="form.body" :rows="14" />
        </el-form-item>
        <el-form-item :label="t('materials.document.addVersion.file')">
          <div class="version-dialog__stack">
            <el-alert
              v-if="baseHasFile && base"
              type="info"
              :closable="false"
              show-icon
              class="version-dialog__alert"
              :title="
                t('materials.document.addVersion.fileNotCarried', {
                  seq: base.seq,
                  type: base.content_type ?? '—',
                  size: formatBytes(base.byte_size),
                })
              "
            />
            <FileUploader v-model="form.files" :course-id="courseId" :kind="kind" />
            <div class="app-form-hint">{{ t('materials.document.addVersion.fileHint') }}</div>
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
        <span v-if="!baseLoading && !baseError && !hasContent" class="version-dialog__why">
          {{ t('materials.document.addVersion.needsContent') }}
        </span>
        <span v-else-if="!baseLoading && unchanged && base" class="version-dialog__why">
          {{ t('materials.document.addVersion.unchanged', { seq: base.seq }) }}
        </span>
        <span class="version-dialog__spacer" />
        <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="addVersion.pending.value" :disabled="!canSave" @click="submit">
          {{ t('materials.document.addVersion.submit') }}
        </el-button>
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
.version-dialog__spacer {
  flex: 1;
}
</style>
