<script setup lang="ts">
// Choosing a department from the tree, where one is to go (a department
// moved under another, a course moved into one). The places Core would
// refuse are shown, where they belong in the tree, but cannot be chosen, and
// say why.
import { useI18n } from 'vue-i18n'
import type { Destination } from '@/utils/departmentTree'

const value = defineModel<string>({ required: true })
defineProps<{ data: Destination[]; placeholder?: string; id?: string; disabled?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <el-tree-select
    :id="id"
    v-model="value"
    :data="data"
    :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
    node-key="value"
    check-strictly
    default-expand-all
    :render-after-expand="false"
    filterable
    :disabled="disabled"
    :placeholder="placeholder ?? t('deptAdmin.tree.movePick')"
    class="dept-picker"
    popper-class="dept-picker__popper"
  >
    <template #default="{ data: d }">
      <span class="dept-picker__node">
        <span>{{ d.label }}</span>
        <span v-if="d.reason" class="dept-picker__why">{{ t(`deptAdmin.tree.notHere.${d.reason}`) }}</span>
      </span>
    </template>
  </el-tree-select>
</template>

<style scoped>
.dept-picker {
  width: 100%;
}
.dept-picker__node {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.dept-picker__why {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
