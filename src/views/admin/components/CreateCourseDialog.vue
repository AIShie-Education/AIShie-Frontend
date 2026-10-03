<script setup lang="ts">
// course.create: one offering of a course in one term, as a draft, in a
// department the caller administers (any, for a platform administrator),
// chosen from the tree.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { DepartmentNode, Term } from '@/api/types'
import { useWrite } from '@/composables/useWrite'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  terms: Term[]
  /** The departments it may be made in, in the tree's order, each indented beneath those above it. */
  departments: { node: Pick<DepartmentNode, 'id' | 'name'>; indent: number }[]
  termId?: string
  deptId?: string
}>()
const emit = defineEmits<{ created: [courseId: string] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ dept_id: '', term_id: '', code: '', section: '', title: '', description: '' })
const { run, pending } = useWrite('course.create')

watch(
  open,
  (v) => {
    if (!v) return
    const offered = props.deptId && props.departments.some((d) => d.node.id === props.deptId)
    form.dept_id = offered ? props.deptId! : props.departments.length === 1 ? props.departments[0]!.node.id : ''
    form.term_id = props.termId || props.terms[0]?.id || ''
    form.code = ''
    form.section = ''
    form.title = ''
    form.description = ''
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const notBlank = (_r: unknown, v: string, cb: (e?: Error) => void) =>
  v && v.trim() ? cb() : cb(new Error(t('common.errors.required')))

const rules = computed<FormRules>(() => ({
  dept_id: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  term_id: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
  code: [{ required: true, validator: notBlank, trigger: 'blur' }],
  title: [{ required: true, validator: notBlank, trigger: 'blur' }],
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const code = form.code.trim()
  const out = await run(
    {
      dept_id: form.dept_id,
      term_id: form.term_id,
      code,
      section: form.section.trim() || undefined,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
    },
    { success: t('admin.create.done', { code }) },
  )
  if (!out) return
  open.value = false
  // A platform tool is never proposed: outside a course there is no ladder.
  if (out.status === 'executed') emit('created', out.result.course_id)
}
</script>

<template>
  <el-dialog v-model="open" :title="t('admin.create.title')" width="560px" destroy-on-close>
    <p class="app-form-hint create-course__intro">{{ t('admin.create.intro') }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <div class="create-course__row">
        <el-form-item :label="t('admin.create.term')" prop="term_id" class="create-course__half">
          <el-select v-model="form.term_id" filterable :placeholder="t('common.actions.select')">
            <el-option v-for="x in terms" :key="x.id" :value="x.id" :label="x.name">
              <span>{{ x.name }}</span>
              <span class="create-course__meta">{{ t('admin.courses.termDates', { from: x.starts_on, to: x.ends_on }) }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.create.dept')" prop="dept_id" class="create-course__half">
          <el-select v-model="form.dept_id" filterable :placeholder="t('common.actions.select')">
            <el-option v-for="x in departments" :key="x.node.id" :value="x.node.id" :label="x.node.name">
              <span :style="{ paddingLeft: `${x.indent * 14}px` }">{{ x.node.name }}</span>
            </el-option>
          </el-select>
        </el-form-item>
      </div>
      <div class="create-course__row">
        <el-form-item :label="t('admin.create.code')" prop="code" class="create-course__half">
          <el-input v-model="form.code" :placeholder="t('admin.create.codePlaceholder')" maxlength="40" />
        </el-form-item>
        <el-form-item prop="section" class="create-course__half">
          <template #label>
            {{ t('admin.create.section') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
          </template>
          <el-input v-model="form.section" :placeholder="t('admin.create.sectionPlaceholder')" maxlength="40" />
        </el-form-item>
      </div>
      <p class="app-form-hint create-course__section-hint">{{ t('admin.create.sectionHint') }}</p>
      <el-form-item :label="t('admin.create.courseTitle')" prop="title">
        <el-input v-model="form.title" :placeholder="t('admin.create.titlePlaceholder')" maxlength="300" />
      </el-form-item>
      <el-form-item prop="description">
        <template #label>
          {{ t('admin.create.description') }}<span class="app-muted">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input v-model="form.description" type="textarea" :rows="4" maxlength="5000" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('admin.create.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-course__intro {
  margin: 0 0 16px;
}
.create-course__row {
  display: flex;
  gap: 0 16px;
  flex-wrap: wrap;
}
.create-course__half {
  flex: 1 1 200px;
  min-width: 0;
}
.create-course__section-hint {
  margin: -10px 0 16px;
}
.create-course__meta {
  float: right;
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
