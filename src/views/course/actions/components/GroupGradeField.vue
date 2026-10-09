<script setup lang="ts">
// A field of a group grading action, shown for what it is: each member's
// adjustment as a grade of a group's work writes it (adjustments), each
// member's grade from it (member_grades), one adjustment (grade.adjust's, or
// what it wrote), and who is part of the work (members; submission.set_members'
// add and remove), by name. groupGradeField() says which fields these are,
// for FieldsView to hand them here.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MemberName from '@/components/MemberName.vue'
import AdjustmentText from '@/views/course/submissions/components/AdjustmentText.vue'
import type { Adjustment } from '@/views/course/submissions/components/groupGrading'
import { exactDecimal, isObject, payloadOf, type ActionRow } from './actionText'
import { groupGradeField } from './groupGradeFields'

const props = defineProps<{ name: string; value: unknown; action?: ActionRow }>()
const { t } = useI18n()

const kind = computed(() => groupGradeField(props.name, props.value, props.action?.action_type))

/** An adjustment as a payload or a result holds it, or null. */
function asAdjustment(v: unknown): Adjustment | null {
  if (!isObject(v) || typeof v.kind !== 'string') return null
  if (v.kind === 'none') return null
  return v as unknown as Adjustment
}
const list = computed(() => (Array.isArray(props.value) ? props.value.filter(isObject) : []))
const ids = computed(() =>
  Array.isArray(props.value) ? props.value.filter((x): x is string => typeof x === 'string') : [],
)
/** grade.adjust's own payload: its kind, points and reason, as one adjustment. */
const payloadAdjustment = computed(() => {
  const p = props.action ? payloadOf(props.action) : {}
  return asAdjustment({ kind: props.value, points: p.points ?? 0, reason: p.reason })
})
</script>

<template>
  <ul v-if="kind === 'adjustments' || kind === 'memberGrades'" class="group-field__list">
    <li v-if="!list.length" class="group-field__muted">{{ t('common.labels.none') }}</li>
    <li v-for="(x, i) in list" :key="i" class="group-field__item">
      <MemberName :id="typeof x.student_member_id === 'string' ? x.student_member_id : null" />
      <span
        v-if="kind === 'memberGrades' && (typeof x.score === 'number' || typeof x.score === 'string')"
        class="group-field__score"
        >{{ exactDecimal(x.score as number | string) }}</span
      >
      <AdjustmentText :adjustment="asAdjustment(kind === 'adjustments' ? x : x.adjustment)" reason />
    </li>
  </ul>
  <AdjustmentText v-else-if="kind === 'adjustment'" :adjustment="asAdjustment(value)" reason />
  <AdjustmentText v-else-if="kind === 'adjustKind'" :adjustment="payloadAdjustment" reason />
  <span v-else-if="kind === 'memberList'" class="group-field__inline">
    <span v-if="!ids.length" class="group-field__muted">{{ t('common.labels.none') }}</span>
    <MemberName v-for="id in ids" :key="id" :id="id" />
  </span>
</template>

<style scoped>
.group-field__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-xs);
}
.group-field__item {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-xs) var(--app-space-sm);
  flex-wrap: wrap;
}
.group-field__score {
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.group-field__inline {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-sm);
}
.group-field__muted {
  color: var(--app-ink-3);
  font-size: var(--app-text-xs);
}
</style>
