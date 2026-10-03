<script setup lang="ts">
// Choose course members, from the member list (needs member_read). Where the
// list cannot be read, a member id can still be typed in.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import type { Role } from '@/api/types'

const model = defineModel<string | string[] | undefined>()
const props = defineProps<{
  multiple?: boolean
  /** Only members with this roster role, e.g. 'student'. */
  role?: Role
  includeInactive?: boolean
  /** Which seat statuses to offer; overrides includeInactive. Core takes a paused student in a list, never a removed one. */
  statuses?: ('active' | 'paused' | 'removed')[]
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
}>()
const course = useCourseStore()
const { t } = useI18n()
onMounted(() => void course.ensureMembers())

const options = computed(() =>
  [...course.members.values()]
    .filter((m) => !props.role || m.role === props.role)
    .filter((m) =>
      props.statuses ? props.statuses.includes(m.status as 'active') : props.includeInactive || m.status === 'active',
    )
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
)
const free = computed(() => course.membersState === 'forbidden' || course.membersState === 'error')
</script>

<template>
  <el-select
    v-model="model"
    :multiple="multiple"
    filterable
    :allow-create="free"
    :default-first-option="free"
    :clearable="clearable"
    :disabled="disabled"
    :loading="course.membersState === 'loading'"
    :placeholder="placeholder ?? (free ? t('common.labels.pasteMemberId') : t('common.actions.select'))"
    class="member-select"
  >
    <el-option v-for="m in options" :key="m.id" :value="m.id" :label="m.display_name">
      <span>{{ m.display_name }}</span>
      <span class="member-select__meta">{{ t(`enums.role.${m.role}`) }}</span>
    </el-option>
  </el-select>
</template>

<style scoped>
.member-select {
  min-width: 220px;
}
.member-select__meta {
  float: right;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  margin-left: 12px;
}
</style>
