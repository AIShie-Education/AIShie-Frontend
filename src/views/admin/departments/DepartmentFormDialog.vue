<script setup lang="ts">
// Making a department (department.create), beneath one the caller
// administers or, for a platform administrator, at the top of the tree; or
// renaming one (department.update), which whoever administers the
// department above it does. Where it goes is fixed here and shown as its
// path. A name a sibling has already, in any case, is refused before Core is
// asked; Core measures it again.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { DepartmentNode } from '@/api/types'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useWrite } from '@/composables/useWrite'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  mode: 'create' | 'rename'
  /** create: the department it goes under; null for the top of the tree. */
  parent?: DepartmentNode | null
  /** rename: the department. */
  dept?: DepartmentNode | null
}>()
const emit = defineEmits<{ done: [id: string] }>()
const { t } = useI18n()
const departments = useDepartmentTree()

const formRef = ref<FormInstance>()
const form = reactive({ name: '' })
const createW = useWrite('department.create')
const renameW = useWrite('department.update')
const pending = computed(() => createW.pending.value || renameW.pending.value)

/** Where it is (renaming) or will be (making): the department above it, or none at the top. */
const parentId = computed(() => (props.mode === 'create' ? (props.parent?.id ?? null) : (props.dept?.parent_id ?? null)))
const where = computed(() => (parentId.value ? departments.pathLabel(parentId.value) : null))
const title = computed(() => {
  if (props.mode === 'rename') return t('deptAdmin.tree.renameTitle', { name: props.dept?.name ?? '' })
  return props.parent ? t('deptAdmin.tree.newChildTitle', { name: props.parent.name }) : t('deptAdmin.tree.newTopTitle')
})

watch(
  open,
  (v) => {
    if (!v) return
    form.name = props.mode === 'rename' ? (props.dept?.name ?? '') : ''
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

function siblingHas(name: string): boolean {
  const n = name.trim().toLowerCase()
  const except = props.mode === 'rename' ? props.dept?.id : undefined
  return departments.children(parentId.value).some((s) => s.id !== except && s.name.trim().toLowerCase() === n)
}

const rules = computed<FormRules>(() => ({
  name: [
    {
      trigger: 'blur',
      validator: (_r, v: string, cb) => {
        const name = v?.trim() ?? ''
        if (!name) return cb(new Error(t('common.errors.required')))
        if (props.mode === 'rename' && name === props.dept?.name) return cb(new Error(t('deptAdmin.errors.same_name')))
        if (siblingHas(name)) return cb(new Error(t('deptAdmin.errors.name_taken')))
        cb()
      },
    },
  ],
}))

async function save() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const name = form.name.trim()
  if (props.mode === 'rename') {
    if (!props.dept) return
    const out = await renameW.run({ dept_id: props.dept.id, name }, { success: t('deptAdmin.tree.renamed') })
    if (!out) return
    open.value = false
    emit('done', props.dept.id)
    return
  }
  const out = await createW.run(
    { name, parent_id: props.parent?.id ?? undefined },
    { success: t('deptAdmin.tree.created') },
  )
  if (!out) return
  open.value = false
  // A tool outside any course is never proposed: there is no ladder there.
  if (out.status === 'executed') emit('done', out.result.id)
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="560px" destroy-on-close :close-on-click-modal="!pending">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="save">
      <div class="dept-form__where">
        <span class="dept-form__where-label">{{ t('deptAdmin.tree.under') }}</span>
        <span v-if="where" class="dept-form__path">{{ where }}</span>
        <span v-else class="app-muted">{{ t('deptAdmin.tree.atTop') }}</span>
      </div>
      <el-form-item :label="t('deptAdmin.tree.name')" prop="name">
        <el-input
          v-model="form.name"
          name="department-name"
          :placeholder="t('deptAdmin.tree.namePlaceholder')"
          maxlength="200"
          @keyup.enter="save"
        />
      </el-form-item>
      <el-alert
        v-if="mode === 'create'"
        type="info"
        :closable="false"
        show-icon
        :title="t('adminSetup.departments.create.permanent')"
      />
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="save">
        {{ mode === 'rename' ? t('common.actions.save') : t('common.actions.create') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dept-form__where {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
  margin-bottom: 16px;
  font-size: var(--app-text-md);
}
.dept-form__where-label {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
}
.dept-form__path {
  font-weight: 500;
  word-break: break-word;
}
</style>
