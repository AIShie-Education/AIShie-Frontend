<script setup lang="ts">
// What a group grading action is about, in ActionTarget's line: the group
// whose work it is, and what it does to its members: how many it grades
// apart from the group's score (grade.submit, grade.regrade), one member's
// adjustment (grade.adjust), or whom it adds to the work and takes off it
// (submission.set_members), by name where the member list says.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import AdjustmentText from '@/views/course/submissions/components/AdjustmentText.vue'
import type { Adjustment } from '@/views/course/submissions/components/groupGrading'
import { isObject, payloadOf, str, type ActionRow } from './actionText'

const props = defineProps<{ action: ActionRow; groupName?: string | null }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const p = computed(() => payloadOf(props.action))
const type = computed(() => props.action.action_type)

/** Members a grade of the group's work sets apart from the group's score. */
const adjusted = computed(() => {
  const list = p.value.adjustments
  return Array.isArray(list) ? list.filter((a) => isObject(a) && a.kind !== 'none').length : 0
})
const adjustment = computed<Adjustment | null>(() => {
  const kind = str(p.value.kind)
  if (type.value !== 'grade.adjust' || !kind || kind === 'none') return null
  return { kind, points: (p.value.points as number | string) ?? 0, reason: str(p.value.reason) }
})
function names(v: unknown): string | null {
  if (!Array.isArray(v) || !v.length) return null
  void ui.locale
  return formatList(v.map((id) => course.memberName(String(id)) ?? t('common.labels.someMember')))
}
const adds = computed(() => (type.value === 'submission.set_members' ? names(p.value.add) : null))
const removes = computed(() => (type.value === 'submission.set_members' ? names(p.value.remove) : null))
</script>

<template>
  <span v-if="groupName" class="group-target__part">{{ groupName }}</span>
  <span v-if="adjusted" class="group-target__muted">{{
    t('groupGrading.action.adjusted', { n: adjusted }, adjusted)
  }}</span>
  <span v-if="type === 'grade.adjust'" class="group-target__muted">
    <AdjustmentText v-if="adjustment" :adjustment="adjustment" />
    <template v-else>{{ t('groupGrading.action.cleared') }}</template>
  </span>
  <span v-if="adds" class="group-target__muted">{{ t('groupGrading.action.adds', { names: adds }) }}</span>
  <span v-if="removes" class="group-target__muted">{{ t('groupGrading.action.removes', { names: removes }) }}</span>
</template>

<style scoped>
.group-target__part {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.group-target__muted {
  color: var(--app-ink-3);
}
</style>
