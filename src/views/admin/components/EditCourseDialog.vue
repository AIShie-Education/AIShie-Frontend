<script setup lang="ts">
// course.update: the title and description. Code, section and term are what
// the course is, and do not change.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useWrite } from '@/composables/useWrite'
import type { CourseRow } from './adminShared'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ course: CourseRow }>()
const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ title: '', description: '' })
const { run, pending } = useWrite('course.update')

watch(
  open,
  (v) => {
    if (!v) return
    form.title = props.course.title
    form.description = props.course.description ?? ''
  },
  { immediate: true },
)

const rules = computed<FormRules>(() => ({
  title: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        v && v.trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const title = form.title.trim()
  const description = form.description.trim()
  const titleChanged = title !== props.course.title
  const descChanged = description !== (props.course.description ?? '')
  if (!titleChanged && !descChanged) {
    ElMessage({ type: 'info', message: t('admin.course.nothingChanged') })
    open.value = false
    return
  }
  const out = await run(
    {
      course_id: props.course.id,
      title: titleChanged ? title : undefined,
      description: descChanged ? description : undefined,
    },
    { success: t('admin.course.saved') },
  )
  if (!out) return
  open.value = false
  emit('saved')
}
</script>

<template>
  <el-dialog v-model="open" :title="t('admin.course.editTitle')" width="560px" destroy-on-close>
    <p class="app-form-hint edit-course__hint">{{ t('admin.course.editHint') }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('admin.course.courseTitle')" prop="title">
        <el-input v-model="form.title" maxlength="300" />
      </el-form-item>
      <el-form-item prop="description">
        <template #label>
          {{ t('admin.course.description') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input v-model="form.description" type="textarea" :rows="5" maxlength="5000" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('common.actions.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.edit-course__hint {
  margin: 0 0 16px;
}
</style>
