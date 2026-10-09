<script setup lang="ts">
// The grades given for one submission, newest first. Those who grade see
// drafts and superseded grades as well; everyone else sees the posted one.
// Below them, any grade proposed for it that still waits for approval: it is
// not a grade yet, but it decides what a grade entered now comes to.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import type { ActionSummary, Decimal, GradeSummary } from '@/api/types'
import AsyncState from '@/components/AsyncState.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { formatDecimal, formatPercent } from '@/utils/format'
import PendingGradeProposals from './PendingGradeProposals.vue'

const props = defineProps<{
  courseId: string
  assignmentId: string
  /** Whose work it is; none for a group's, whose grades are each member's. */
  studentId?: string | null
  grades: GradeSummary[]
  pointsPossible?: Decimal | null
  loading?: boolean
  error?: ApiError | null
  /** The student looking at their own work. */
  own?: boolean
  /** The caller may not read grades here: known already, so none were asked for. */
  forbidden?: boolean
  /** Grades proposed for this work and waiting for approval. */
  proposals?: ActionSummary[]
  liveDraft?: GradeSummary
  livePosted?: GradeSummary
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()

const sorted = computed(() => [...props.grades].sort((a, b) => b.created_at.localeCompare(a.created_at)))
const hasDraft = computed(() => props.grades.some((g) => g.state === 'draft'))
const forbidden = computed(() => props.forbidden || !!props.error?.isForbidden)
</script>

<template>
  <section class="app-card">
    <h2 class="app-card__title">
      <span>{{ t('submissions.grades.title') }}</span>
      <router-link
        v-if="!own && !forbidden"
        class="sub-grades__all"
        :to="{
          name: 'course-grades',
          params: { courseId },
          query: { assignment: assignmentId, student: studentId ?? undefined },
        }"
      >
        {{ t('submissions.grades.allLink') }}
      </router-link>
    </h2>
    <p v-if="forbidden" class="app-muted sub-grades__none">{{ t('submissions.grades.forbidden') }}</p>
    <AsyncState v-else :loading="loading && !grades.length" :error="error" @retry="emit('retry')">
      <p v-if="!grades.length" class="app-muted sub-grades__none">
        {{ own ? t('submissions.grades.emptyStudent') : t('submissions.grades.empty') }}
      </p>
      <ul v-else class="sub-grades">
        <li v-for="g in sorted" :key="g.id">
          <router-link
            :to="{ name: 'course-grade', params: { courseId, gradeId: g.id } }"
            class="sub-grades__row"
            :class="{ 'is-superseded': g.state === 'superseded' }"
          >
            <div class="sub-grades__score">
              <span class="sub-grades__value">{{ formatDecimal(g.score, 4) }}</span>
              <span v-if="pointsPossible !== undefined && pointsPossible !== null" class="app-muted">
                / {{ formatDecimal(pointsPossible, 4) }}{{ t('common.sep')
                }}{{ formatPercent(g.score, pointsPossible) }}
              </span>
            </div>
            <StatusTag vocab="gradeState" :value="g.state" />
            <div class="sub-grades__meta">
              <span v-if="!own">
                <span class="app-muted">{{ t('submissions.grades.grader') }}</span>
                <MemberName :id="g.grader_member_id" show-kind />
              </span>
              <span>
                <span class="app-muted">{{ t('submissions.grades.entered') }}</span>
                <TimeText :value="g.created_at" />
              </span>
              <span v-if="g.posted_at">
                <span class="app-muted">{{ t('submissions.grades.posted') }}</span>
                <TimeText :value="g.posted_at" />
              </span>
            </div>
            <el-icon class="sub-grades__chevron"><ArrowRight /></el-icon>
          </router-link>
        </li>
      </ul>
      <p v-if="hasDraft && !own" class="app-form-hint">{{ t('submissions.grades.draftHint') }}</p>
    </AsyncState>
    <PendingGradeProposals
      v-if="proposals?.length"
      :course-id="courseId"
      :proposals="proposals"
      :points-possible="pointsPossible"
      :live-draft="liveDraft"
      :live-posted="livePosted"
    />
  </section>
</template>

<style scoped>
.sub-grades__all {
  font-size: var(--app-text-sm);
  font-weight: 400;
  text-decoration: none;
}
.sub-grades__all:hover {
  text-decoration: underline;
}
.sub-grades__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
.sub-grades {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub-grades__row {
  display: flex;
  align-items: center;
  gap: 8px 14px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  color: inherit;
  text-decoration: none;
}
.sub-grades__row:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}
.sub-grades__row.is-superseded {
  opacity: 0.65;
}
.sub-grades__score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.sub-grades__value {
  font-size: var(--app-text-xl);
  font-weight: var(--app-weight-strong);
}
.sub-grades__meta {
  display: flex;
  gap: 4px 14px;
  flex-wrap: wrap;
  font-size: var(--app-text-sm);
  /* Beside the score where there is room, on a line of its own where not. */
  flex: 1 1 260px;
  min-width: 0;
}
.sub-grades__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sub-grades__chevron {
  color: var(--el-text-color-secondary);
}
</style>
