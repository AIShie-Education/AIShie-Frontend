<script setup lang="ts">
// Creating material: document.create (kind material) with its first version —
// text, a file, or both — and, when asked, document.publish of that version.
// Material starts unpublished; publishing is a second call, and when the
// creation itself became a proposal there is no document to publish yet.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { UploadedFile } from '@/api/http'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import FileUploader from '@/components/FileUploader.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string; suggestedOrder: number }>()
const emit = defineEmits<{
  created: [documentId: string]
  proposed: [info: { title: string; publish: boolean }]
}>()
const { t } = useI18n()
const course = useCourseStore()

const formRef = ref<FormInstance>()
const form = reactive({
  title: '',
  sortOrder: 1,
  body: '',
  files: [] as UploadedFile[],
  publish: false,
})

function reset() {
  form.title = ''
  form.sortOrder = props.suggestedOrder
  form.body = ''
  form.files = []
  form.publish = false
}
watch(visible, (v) => v && reset(), { immediate: true })

const hasContent = computed(() => form.body.trim() !== '' || form.files.length > 0)
watch(hasContent, (has) => {
  if (!has) form.publish = false
})

const rules = computed<FormRules>(() => ({
  title: [{ required: true, whitespace: true, message: t('common.errors.required'), trigger: 'blur' }],
}))

const create = useWrite('document.create')
const publish = useWrite('document.publish')
const pending = computed(() => create.pending.value || publish.pending.value)

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const title = form.title.trim()
  const wantsPublish = form.publish && hasContent.value
  const out = await create.run(
    {
      course_id: props.courseId,
      kind: 'material',
      title,
      sort_order: form.sortOrder,
      body_md: form.body.trim() ? form.body : undefined,
      upload_token: form.files[0]?.uploadToken,
    },
    // When it is to be published as well, the publish call says how it went.
    { success: wantsPublish ? false : t('materials.create.done') },
  )
  if (!out) return
  if (out.status === 'proposed') {
    // Nothing exists yet, so there is nothing to publish either.
    visible.value = false
    emit('proposed', { title, publish: wantsPublish })
    return
  }
  const documentId = out.result.document_id
  if (wantsPublish && out.result.version_id) {
    const p = await publish.run(
      { course_id: props.courseId, document_id: documentId, version_id: out.result.version_id },
      { success: t('materials.create.donePublished') },
    )
    if (!p) ElMessage({ type: 'warning', message: t('materials.create.notPublished'), duration: 6000, showClose: true })
  }
  visible.value = false
  emit('created', documentId)
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
        <div class="app-form-hint">{{ t('materials.create.bodyHint') }}</div>
      </el-form-item>

      <el-form-item :label="t('materials.create.file')">
        <div class="create-dialog__file">
          <FileUploader v-model="form.files" :course-id="courseId" kind="material" />
          <div class="app-form-hint">{{ t('materials.create.fileHint') }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <div class="create-dialog__publish">
          <el-checkbox v-model="form.publish" :disabled="!hasContent" :label="t('materials.create.publish')" />
          <div class="app-form-hint">
            {{ hasContent ? t('materials.create.publishHint') : t('materials.create.publishNeedsContent') }}
          </div>
        </div>
      </el-form-item>

      <el-alert
        v-if="!hasContent"
        type="info"
        :closable="false"
        :title="t('materials.create.emptyNote')"
        class="create-dialog__empty"
      />
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
        {{ t('materials.create.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-dialog__approval {
  margin-bottom: 16px;
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
.create-dialog__file,
.create-dialog__publish {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}
.create-dialog__empty {
  margin-top: -4px;
}
</style>
