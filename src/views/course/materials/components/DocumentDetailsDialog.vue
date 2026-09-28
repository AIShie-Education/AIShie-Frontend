<script setup lang="ts">
// document.update: what a document is called, and for material where it is
// listed (sort_order). Its versions are untouched, so an archived or a purged
// document may be renamed too. Only what changed is sent.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { DocumentFull } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string; doc: DocumentFull }>()
const emit = defineEmits<{ done: [status: 'executed' | 'proposed'] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('document.update')

const formRef = ref<FormInstance>()
const form = reactive({ title: '', sortOrder: 0 })
watch(
  open,
  (v) => {
    if (!v) return
    form.title = props.doc.title
    form.sortOrder = props.doc.sort_order
    formRef.value?.clearValidate()
  },
  { immediate: true },
)
const isMaterial = computed(() => props.doc.kind === 'material')
const needsApproval = computed(() => course.needsApproval('document_write'))

const rules = computed<FormRules>(() => ({
  title: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        (v ?? '').trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const title = form.title.trim()
  const args: { course_id: string; document_id: string; title?: string; sort_order?: number } = {
    course_id: props.courseId,
    document_id: props.doc.id,
  }
  if (title !== props.doc.title) args.title = title
  if (isMaterial.value && form.sortOrder !== props.doc.sort_order) args.sort_order = form.sortOrder
  if (args.title === undefined && args.sort_order === undefined) {
    ElMessage({ type: 'info', message: t('materials.document.details.unchanged') })
    open.value = false
    return
  }
  const out = await run(args, { success: false, reasons: 'materials.refusal' })
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage(
      out.result.changed
        ? { type: 'success', message: t('materials.document.details.done') }
        : { type: 'info', message: t('materials.document.details.unchanged') },
    )
  }
  open.value = false
  emit('done', out.status)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('materials.document.details.title', { title: doc.title })"
    width="560px"
    destroy-on-close
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      :validate-on-rule-change="false"
      label-position="top"
      :disabled="pending"
      @submit.prevent="submit"
    >
      <el-form-item :label="t('materials.document.details.name')" prop="title">
        <el-input v-model="form.title" name="title" maxlength="300" />
      </el-form-item>
      <el-form-item v-if="isMaterial" :label="t('materials.document.details.sortOrder')">
        <el-input-number v-model="form.sortOrder" :min="-100000" :max="100000" :step="1" :precision="0" step-strictly />
        <div class="app-form-hint doc-details__hint">{{ t('materials.document.details.sortOrderHint') }}</div>
      </el-form-item>
    </el-form>
    <p class="app-form-hint">{{ t('materials.document.details.versionsKept') }}</p>
    <el-alert
      v-if="needsApproval"
      type="info"
      :closable="false"
      show-icon
      :title="t('materials.document.approvalNote')"
    />
    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
        {{ t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.doc-details__hint {
  width: 100%;
}
</style>
