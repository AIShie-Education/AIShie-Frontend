<script setup lang="ts">
// document.purge: removing what was uploaded by mistake from a course's
// material, instructions or rubric — one version, or the whole document. Its
// text and file go, the file deleted from storage, and a tombstone says who
// purged it, when and why. An administrator's to do, never a seat's; it works
// in an archived course too, and it cannot be undone, so it asks for the
// reason and for the person to say they understand.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useWrite } from '@/composables/useWrite'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  documentId: string
  title: string
  /** One version to purge; the whole document when absent. */
  version?: { id: string; seq: number } | null
}>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const { run, pending } = useWrite('document.purge')
const MAX_REASON = 500

const formRef = ref<FormInstance>()
const form = reactive({ reason: '', understood: false })
watch(open, (v) => {
  if (!v) return
  form.reason = ''
  form.understood = false
  formRef.value?.clearValidate()
})

const rules = computed<FormRules>(() => ({
  reason: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const s = (v ?? '').trim()
        if (!s) return cb(new Error(t('common.errors.required')))
        return [...s].length > MAX_REASON ? cb(new Error(t('materials.document.purge.reasonLong'))) : cb()
      },
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (!form.understood) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const out = await run(
    {
      course_id: props.courseId,
      document_id: props.documentId,
      version_id: props.version?.id,
      reason: form.reason.trim(),
    },
    { success: false, reasons: 'materials.refusal' },
  )
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage({
      type: 'success',
      message: t('materials.document.purge.done', { v: out.result.purged_versions, f: out.result.files_removed }),
    })
  }
  open.value = false
  emit('done')
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="
      version
        ? t('materials.document.purge.titleVersion', { seq: version.seq, title })
        : t('materials.document.purge.title', { title })
    "
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    class="purge-dialog"
  >
    <el-alert type="error" :closable="false" show-icon class="purge-dialog__alert">
      <template #title>{{ t('materials.document.purge.irreversible') }}</template>
    </el-alert>
    <p class="purge-dialog__p">
      {{
        version ? t('materials.document.purge.introVersion', { seq: version.seq }) : t('materials.document.purge.intro')
      }}
    </p>
    <p class="purge-dialog__p app-form-hint">{{ t('materials.document.purge.pinned') }}</p>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      :validate-on-rule-change="false"
      label-position="top"
      :disabled="pending"
      @submit.prevent="submit"
    >
      <el-form-item :label="t('materials.document.purge.reason')" prop="reason">
        <el-input
          v-model="form.reason"
          name="reason"
          type="textarea"
          :rows="3"
          :maxlength="MAX_REASON"
          show-word-limit
          :placeholder="t('materials.document.purge.reasonPlaceholder')"
        />
        <div class="app-form-hint purge-dialog__hint">{{ t('materials.document.purge.reasonHint') }}</div>
      </el-form-item>
      <el-checkbox v-model="form.understood" class="purge-dialog__understand">
        {{ t('materials.document.purge.understand') }}
      </el-checkbox>
    </el-form>
    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="danger" :loading="pending" :disabled="!form.understood || !form.reason.trim()" @click="submit">
        <el-icon><Delete /></el-icon><span>{{ t('materials.document.purge.submit') }}</span>
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.purge-dialog__alert {
  margin-bottom: 12px;
}
.purge-dialog__p {
  margin: 0 0 10px;
  line-height: 1.6;
}
.purge-dialog__hint {
  width: 100%;
}
.purge-dialog__understand {
  height: auto;
  white-space: normal;
  align-items: flex-start;
}
</style>
