<script setup lang="ts">
// A seat's reach in two short lines: which students, which assignments.
// 'listed' with an empty list reaches nobody (scope fails closed), and says so.
// The lists themselves come only with member.get; where they are not known the
// line says "listed" without a count.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  studentScope: string
  assignmentScope: string
  students?: string[] | null
  assignments?: string[] | null
  /** The seat's own id: a student's list naming only itself reads as "own work". */
  selfId?: string
}>()
const { t } = useI18n()

function line(kind: 'students' | 'assignments', scope: string, list: string[] | null | undefined) {
  if (scope === 'all') return { text: t('members.scope.allShort'), tone: 'all' }
  if (list === undefined) return { text: t('members.scope.listedUnknown'), tone: 'listed' }
  const n = (list ?? []).length
  if (n === 0) return { text: t(`members.scope.nobody.${kind}`), tone: 'none' }
  if (kind === 'students' && n === 1 && props.selfId && list![0] === props.selfId) {
    return { text: t('members.scope.ownWork'), tone: 'listed' }
  }
  return { text: t('members.scope.listedN', { n }), tone: 'listed' }
}
const students = computed(() => line('students', props.studentScope, props.students))
const assignments = computed(() => line('assignments', props.assignmentScope, props.assignments))
</script>

<template>
  <div class="scope-summary">
    <span class="scope-summary__label">{{ t('members.scope.students') }}</span>
    <span class="scope-summary__value" :class="`is-${students.tone}`">{{ students.text }}</span>
    <span class="scope-summary__label">{{ t('members.scope.assignments') }}</span>
    <span class="scope-summary__value" :class="`is-${assignments.tone}`">{{ assignments.text }}</span>
  </div>
</template>

<style scoped>
.scope-summary {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 1px;
  font-size: 12px;
  line-height: 1.5;
}
.scope-summary__label {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.scope-summary__value {
  min-width: 0;
  white-space: nowrap;
}
.scope-summary__value.is-listed {
  color: var(--el-color-primary);
}
.scope-summary__value.is-none {
  color: var(--el-color-danger);
}
</style>
