<script setup lang="ts">
// Where the work on one assignment stands (submission.list, within the
// caller's scope): each student counted once, by where their work stands —
// handed in (late or on time) if any attempt was, else a draft being written,
// else missing. After the due date Core records a "missing" row for every
// student with nothing, so a row is not yet work.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SubmissionState, SubmissionSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { allSubmissions } from './useAssignmentData'

const props = defineProps<{ courseId: string; assignmentId: string }>()
const { t } = useI18n()

const state = useAsync(() => allSubmissions(props.courseId, { assignment_id: props.assignmentId }), {
  watch: [() => props.assignmentId],
})

const STATES: SubmissionState[] = ['draft', 'submitted', 'late', 'missing']

/** One student's standing: the newest attempt handed in, else an open draft, else missing. */
function standing(subs: SubmissionSummary[]): SubmissionState {
  const handed = subs
    .filter((s) => s.state === 'submitted' || s.state === 'late')
    .sort((a, b) => b.attempt - a.attempt)[0]
  if (handed) return handed.state as SubmissionState
  if (subs.some((s) => s.state === 'draft')) return 'draft'
  return 'missing'
}

const summary = computed(() => {
  const rows = state.data.value ?? []
  const byStudent = new Map<string, SubmissionSummary[]>()
  for (const s of rows) byStudent.set(s.student_member_id, [...(byStudent.get(s.student_member_id) ?? []), s])
  const counts: Record<string, number> = Object.fromEntries(STATES.map((s) => [s, 0]))
  for (const subs of byStudent.values()) {
    const st = standing(subs)
    counts[st] = (counts[st] ?? 0) + 1
  }
  return {
    rows: rows.length,
    // Students who have started or handed in something; a missing row is none.
    withWork: byStudent.size - (counts.missing ?? 0),
    // Attempts made: drafts and work handed in, not the records of nothing.
    attempts: rows.filter((s) => s.state !== 'missing').length,
    counts,
  }
})

defineExpose({ reload: state.reload })
</script>

<template>
  <AsyncState :loading="state.loading.value" :error="state.error.value" @retry="state.reload">
    <p v-if="!summary.rows" class="app-muted work-summary__empty">{{ t('assignments.detail.summary.empty') }}</p>
    <template v-else>
      <div class="work-summary">
        <div class="work-summary__tile">
          <span class="work-summary__num">{{ summary.withWork }}</span>
          <span class="work-summary__label">{{ t('assignments.detail.summary.students') }}</span>
        </div>
        <div class="work-summary__tile">
          <span class="work-summary__num">{{ summary.attempts }}</span>
          <span class="work-summary__label">{{ t('assignments.detail.summary.attempts') }}</span>
        </div>
      </div>
      <ul class="work-summary__states">
        <li v-for="s in STATES" :key="s">
          <StatusTag vocab="submissionState" :value="s" />
          <span class="work-summary__count">{{ summary.counts[s] }}</span>
        </li>
      </ul>
      <p class="app-form-hint">{{ t('assignments.detail.summary.scoped') }}</p>
    </template>
  </AsyncState>
</template>

<style scoped>
.work-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.work-summary__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.work-summary__num {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.work-summary__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.work-summary__states {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}
.work-summary__states li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.work-summary__count {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.work-summary__empty {
  margin: 0 0 8px;
  font-size: 14px;
}
</style>
