<script setup lang="ts">
// department.move: a department, with everything beneath it, under another
// department the caller administers, or to the top of the tree (a platform
// administrator's alone). Whoever administers the department above it may
// move it. Nowhere is offered that Core would refuse: not under itself or
// beneath itself, not where it is, not too deep for what moves with it, and
// not beside a department of the same name.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DepartmentNode } from '@/api/types'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useWrite } from '@/composables/useWrite'
import { TOP, type Destination } from '@/utils/departmentTree'
import AppNote from '@/components/AppNote.vue'
import DepartmentPicker from './DepartmentPicker.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ dept: DepartmentNode | null }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const departments = useDepartmentTree()
const { run, pending } = useWrite('department.move')

const to = ref('')
watch(open, (v) => {
  if (v) to.value = ''
})

const options = computed<Destination[]>(() =>
  props.dept ? departments.destinationsFor(props.dept.id, t('deptAdmin.tree.top')) : [],
)
const anywhere = computed(() => {
  const any = (ds: Destination[]): boolean => ds.some((d) => !d.disabled || any(d.children ?? []))
  return any(options.value)
})
const where = computed(() => (props.dept?.parent_id ? departments.pathLabel(props.dept.parent_id) : null))

async function save() {
  if (!props.dept || !to.value || pending.value) return
  const out = await run(
    { dept_id: props.dept.id, parent_id: to.value === TOP ? null : to.value },
    { success: t('deptAdmin.tree.moved') },
  )
  if (!out) return
  open.value = false
  emit('done')
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('deptAdmin.tree.moveTitle', { name: dept?.name ?? '' })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="app-form-hint move-dept__intro">{{ t('deptAdmin.tree.moveIntro') }}</p>
    <div class="move-dept__where">
      <span class="move-dept__label">{{ t('deptAdmin.tree.under') }}</span>
      <span v-if="where">{{ where }}</span>
      <span v-else class="app-muted">{{ t('deptAdmin.tree.atTop') }}</span>
    </div>
    <AppNote v-if="!anywhere">{{ t('deptAdmin.tree.moveNone') }}</AppNote>
    <div v-else>
      <label class="move-dept__label move-dept__to" for="move-dept-to">{{ t('deptAdmin.tree.moveTo') }}</label>
      <DepartmentPicker id="move-dept-to" v-model="to" :data="options" />
      <p class="app-form-hint">{{ t('deptAdmin.tree.depthLimit', { n: departments.maxDepth.value }) }}</p>
    </div>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!to" @click="save">{{ t('deptAdmin.tree.move') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.move-dept__intro {
  margin: 0 0 16px;
  font-size: var(--app-text-sm);
}
.move-dept__where {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
  margin-bottom: 16px;
  font-size: var(--app-text-md);
}
.move-dept__label {
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.move-dept__to {
  display: block;
  margin-bottom: 6px;
  font-size: var(--app-text-md);
  color: var(--el-text-color-regular);
}
</style>
