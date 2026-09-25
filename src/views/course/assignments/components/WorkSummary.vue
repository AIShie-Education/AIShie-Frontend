<script setup lang="ts">
// Where the work on one assignment stands: each student's newest attempt,
// counted by its state (submission.list, within the caller's scope).
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

const summary = computed(() => {
  const subs = state.data.value ?? []
  const latest = new Map<string, SubmissionSummary>()
  for (const s of subs) {
    const cur = latest.get(s.student_member_id)
    if (!cur || s.attempt > cur.attempt) latest.set(s.student_member_id, s)
  }
  const counts: Record<string, number> = Object.fromEntries(STATES.map((s) => [s, 0]))
  for (const s of latest.values()) counts[s.state] = (counts[s.state] ?? 0) + 1
  return { students: latest.size, attempts: subs.length, counts }
})

defineExpose({ reload: state.reload })
</script>

<template>
  <AsyncState :loading="state.loading.value" :error="state.error.value" @retry="state.reload">
    <p v-if="!summary.attempts" class="app-muted work-summary__empty">{{ t('assignments.detail.summary.empty') }}</p>
    <template v-else>
      <div class="work-summary">
        <div class="work-summary__tile">
          <span class="work-summary__num">{{ summary.students }}</span>
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
