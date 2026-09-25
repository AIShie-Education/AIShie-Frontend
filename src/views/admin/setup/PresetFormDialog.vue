<script setup lang="ts">
// Making a department preset (preset.create) or replacing one's body
// (preset.update). A preset's name and department are fixed once made, and
// built-ins are not edited through the API at all.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import {
  PERMS,
  ROLES,
  type Department,
  type Perm,
  type PermLevels,
  type Preset,
  type Role,
  type Scope,
} from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import PermEditor from '@/components/PermEditor.vue'
import { DIALOG_WIDTH, bodyOf, fullPerms, isBuiltin, presetDescription, presetLabel } from './presets'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  mode: 'create' | 'edit'
  /** The preset being edited, or the one a new preset starts as a copy of. */
  preset: Preset | null
  /** The department a new preset goes in, unless the person picks another. */
  deptId: string | null
  departments: Department[]
  /** What a new preset can start from. */
  presets: Preset[]
}>()
const emit = defineEmits<{ saved: [deptId: string | null] }>()
const { t } = useI18n()
// As PermEditor marks a changed row.
const CHANGED_TAG = { size: 'small', type: 'warning', effect: 'light', round: true, disableTransitions: true } as const

const formRef = ref<FormInstance>()
const form = reactive({
  dept_id: '',
  name: '',
  startFrom: '' as string,
  description: '',
  role: 'assistant' as Role,
  student_scope: 'listed' as Scope,
  assignment_scope: 'all' as Scope,
  perms: {} as PermLevels,
})

const create = useWrite('preset.create')
const update = useWrite('preset.update')
const pending = computed(() => create.pending.value || update.pending.value)

function fill(from: Preset | null) {
  const b = bodyOf(from)
  // A copy starts from the description as the reader sees it; an edit from what is saved.
  form.description = props.mode === 'edit' || !from ? b.description : presetDescription(from)
  form.role = b.role
  form.student_scope = b.student_scope
  form.assignment_scope = b.assignment_scope
  form.perms = b.perms
}

watch(open, (v) => {
  if (!v) return
  if (props.mode === 'edit' && props.preset) {
    form.dept_id = props.preset.dept_id ?? ''
    form.name = props.preset.name
    form.startFrom = ''
    fill(props.preset)
  } else {
    form.dept_id = props.deptId ?? ''
    form.name = props.preset?.name ?? ''
    form.startFrom = props.preset?.id ?? ''
    fill(props.preset)
  }
  formRef.value?.clearValidate()
})

function onStartFrom(id: string) {
  const p = props.presets.find((x) => x.id === id)
  if (!p) return
  form.role = p.role as Role
  form.student_scope = p.student_scope as Scope
  form.assignment_scope = p.assignment_scope as Scope
  form.perms = bodyOf(p).perms
  if (!form.description.trim()) form.description = presetDescription(p)
}

const builtins = computed(() => props.presets.filter(isBuiltin))
const owned = computed(() => props.presets.filter((p) => !isBuiltin(p)))
// preset.update replaces the whole body: what the save would change, beside
// what is saved.
const saved = computed(() => (props.mode === 'edit' && props.preset ? bodyOf(props.preset) : null))
const changedPerms = computed<Perm[]>(() => {
  const was = saved.value
  if (!was) return []
  return PERMS.filter((p) => (form.perms[p] ?? 'denied') !== (was.perms[p] ?? 'denied'))
})
const changed = computed(() => {
  const was = saved.value
  return {
    description: !!was && form.description.trim() !== was.description.trim(),
    role: !!was && form.role !== was.role,
    student_scope: !!was && form.student_scope !== was.student_scope,
    assignment_scope: !!was && form.assignment_scope !== was.assignment_scope,
  }
})
const changedCount = computed(() => changedPerms.value.length + Object.values(changed.value).filter(Boolean).length)

const editedDeptName = computed(
  () => props.departments.find((d) => d.id === props.preset?.dept_id)?.name ?? props.preset?.dept_id ?? '',
)

const rules = computed<FormRules>(() => ({
  dept_id: [
    { required: props.mode === 'create', message: t('adminSetup.presets.form.departmentRequired'), trigger: 'change' },
  ],
  name: [
    { required: props.mode === 'create', message: t('common.errors.required'), trigger: 'blur' },
    {
      validator: (_r, v: string, cb) =>
        props.mode === 'edit' || v?.trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
  role: [{ required: true, message: t('common.errors.required'), trigger: 'change' }],
}))

async function save() {
  if (pending.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  const body = {
    description: form.description.trim() || undefined,
    role: form.role,
    student_scope: form.student_scope,
    assignment_scope: form.assignment_scope,
    perms: fullPerms(form.perms),
  }
  if (props.mode === 'edit' && props.preset) {
    const out = await update.run(
      { preset_id: props.preset.id, ...body },
      { success: t('adminSetup.presets.form.updated') },
    )
    if (!out) return
    open.value = false
    emit('saved', props.preset.dept_id ?? null)
  } else {
    const out = await create.run(
      { dept_id: form.dept_id, name: form.name.trim(), ...body },
      { success: t('adminSetup.presets.form.created') },
    )
    if (!out) return
    open.value = false
    emit('saved', form.dept_id)
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="mode === 'edit' ? t('adminSetup.presets.form.editTitle') : t('adminSetup.presets.form.createTitle')"
    :width="DIALOG_WIDTH"
    destroy-on-close
    :close-on-click-modal="false"
    class="preset-form"
  >
    <el-alert
      v-if="mode === 'create' && !departments.length"
      type="warning"
      :closable="false"
      show-icon
      :title="t('adminSetup.presets.form.noDepartments')"
      class="preset-form__alert"
    />
    <el-alert
      v-if="mode === 'edit'"
      type="warning"
      :closable="false"
      show-icon
      :title="t('adminSetup.presets.form.replaceWarn')"
      :description="t('adminSetup.presets.form.changedCount', changedCount)"
      class="preset-form__alert"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <template v-if="mode === 'create'">
        <el-form-item :label="t('adminSetup.presets.form.department')" prop="dept_id">
          <el-select v-model="form.dept_id" filterable :placeholder="t('common.actions.select')">
            <el-option v-for="d in departments" :key="d.id" :value="d.id" :label="d.name" />
          </el-select>
          <div class="app-form-hint">{{ t('adminSetup.presets.form.departmentHelp') }}</div>
        </el-form-item>
        <el-form-item :label="t('adminSetup.presets.form.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('adminSetup.presets.form.namePlaceholder')" maxlength="100" />
          <div class="app-form-hint">{{ t('adminSetup.presets.form.nameHelp') }}</div>
        </el-form-item>
        <el-form-item :label="t('adminSetup.presets.form.startFrom')">
          <el-select
            v-model="form.startFrom"
            filterable
            clearable
            :placeholder="t('adminSetup.presets.form.startFromPlaceholder')"
            @change="onStartFrom"
          >
            <el-option-group :label="t('adminSetup.presets.builtin')">
              <el-option v-for="p in builtins" :key="p.id" :value="p.id" :label="presetLabel(p)">
                <span>{{ presetLabel(p) }}</span>
                <code class="preset-form__option-key">{{ p.name }}</code>
              </el-option>
            </el-option-group>
            <el-option-group v-if="owned.length" :label="t('adminSetup.presets.own')">
              <el-option v-for="p in owned" :key="p.id" :value="p.id" :label="p.name" />
            </el-option-group>
          </el-select>
          <div class="app-form-hint">{{ t('adminSetup.presets.form.startFromHelp') }}</div>
        </el-form-item>
      </template>
      <template v-else-if="preset">
        <div class="preset-form__fixed">
          <div>
            <div class="preset-form__fixed-k">{{ t('adminSetup.presets.form.name') }}</div>
            <div class="preset-form__fixed-v">{{ preset.name }}</div>
          </div>
          <div>
            <div class="preset-form__fixed-k">{{ t('adminSetup.presets.form.department') }}</div>
            <div class="preset-form__fixed-v">{{ editedDeptName }}</div>
          </div>
        </div>
        <div class="app-form-hint preset-form__fixed-hint">{{ t('adminSetup.presets.form.fixed') }}</div>
      </template>

      <el-form-item>
        <template #label>
          {{ t('adminSetup.presets.form.description') }}
          <el-tag v-if="changed.description" v-bind="CHANGED_TAG">{{ t('common.labels.changed') }}</el-tag>
        </template>
        <el-input
          v-model="form.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          :placeholder="t('adminSetup.presets.form.descriptionPlaceholder')"
          maxlength="500"
        />
      </el-form-item>

      <el-form-item prop="role">
        <template #label>
          {{ t('adminSetup.presets.form.role') }}
          <el-tag v-if="changed.role" v-bind="CHANGED_TAG">{{ t('common.labels.changed') }}</el-tag>
        </template>
        <el-select v-model="form.role">
          <el-option v-for="r in ROLES" :key="r" :value="r" :label="t(`enums.role.${r}`)" />
        </el-select>
        <div class="app-form-hint">{{ t('adminSetup.presets.form.roleHelp') }}</div>
      </el-form-item>

      <div class="preset-form__scopes">
        <el-form-item>
          <template #label>
            {{ t('adminSetup.presets.form.studentScope') }}
            <el-tag v-if="changed.student_scope" v-bind="CHANGED_TAG">{{ t('common.labels.changed') }}</el-tag>
          </template>
          <el-radio-group v-model="form.student_scope">
            <el-radio-button value="all">{{ t('enums.scope.all') }}</el-radio-button>
            <el-radio-button value="listed">{{ t('enums.scope.listed') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <template #label>
            {{ t('adminSetup.presets.form.assignmentScope') }}
            <el-tag v-if="changed.assignment_scope" v-bind="CHANGED_TAG">{{ t('common.labels.changed') }}</el-tag>
          </template>
          <el-radio-group v-model="form.assignment_scope">
            <el-radio-button value="all">{{ t('enums.scope.all') }}</el-radio-button>
            <el-radio-button value="listed">{{ t('enums.scope.listed') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </div>
      <div class="app-form-hint preset-form__scope-hint">{{ t('adminSetup.presets.form.scopeHelp') }}</div>

      <div class="preset-form__perms-head">
        <span class="preset-form__perms-title">{{ t('adminSetup.presets.form.perms') }}</span>
        <span class="app-form-hint">{{ t('adminSetup.presets.form.permsHelp') }}</span>
      </div>
      <div class="preset-form__perms">
        <PermEditor
          v-model="form.perms"
          size="small"
          :baseline="saved?.perms"
          :changed="saved ? changedPerms : undefined"
        />
      </div>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="mode === 'create' && !departments.length" @click="save">
        {{ mode === 'edit' ? t('common.actions.save') : t('common.actions.create') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.preset-form__option-key {
  margin-left: 8px;
  font-family: var(--app-font-mono);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.preset-form__alert {
  margin-bottom: 16px;
}
.preset-form__fixed {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.preset-form__fixed-k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.preset-form__fixed-v {
  font-weight: 500;
  word-break: break-word;
}
.preset-form__fixed-hint {
  margin: 4px 0 16px;
}
.preset-form__scopes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.preset-form__scopes :deep(.el-form-item) {
  margin-bottom: 4px;
}
.preset-form__scope-hint {
  margin: 0 0 18px;
}
.preset-form__perms-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 4px;
}
.preset-form__perms-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
@media (max-width: 520px) {
  .preset-form__scopes,
  .preset-form__fixed {
    grid-template-columns: 1fr;
  }
  .preset-form__perms :deep(.perm-editor__row) {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
