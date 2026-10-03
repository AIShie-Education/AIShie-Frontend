<script setup lang="ts">
// Assignments by due date: what is due next, and what fell due lately. The
// list is the course store's (assignment.list, every page, shared with the
// rest of the course's views). A student also sees where each of theirs
// stands, from one page of their own submissions (submission.list).
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import type { AssignmentSummary, SubmissionSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatDecimal } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const { t } = useI18n()

const UPCOMING = 5
const RECENT = 3
const RECENT_DAYS = 14
const SOON_MS = 48 * 3600 * 1000

onMounted(() => void course.ensureAssignments())

// Core's own error, as the store kept it. A refusal the store foresaw (the
// seat is known not to hold document_read) was never asked, so has none.
const listError = computed<ApiError | null>(() => {
  const state = course.assignmentsState
  if (state !== 'forbidden' && state !== 'error') return null
  return course.assignmentsError ?? new ApiError({ status: 403, code: 'forbidden', message: '' })
})
const listLoading = computed(() => course.assignmentsState === 'loading' || course.assignmentsState === 'idle')
function retry() {
  course.invalidate('assignments')
  void course.ensureAssignments()
}

const now = Date.now()
const all = computed(() => [...course.assignments.values()])
const due = (a: AssignmentSummary) => (a.due_at ? new Date(a.due_at).getTime() : NaN)
const upcomingAll = computed(() => all.value.filter((a) => due(a) > now).sort((a, b) => due(a) - due(b)))
const upcoming = computed(() => upcomingAll.value.slice(0, UPCOMING))
const recent = computed(() =>
  all.value
    .filter((a) => due(a) <= now && due(a) > now - RECENT_DAYS * 24 * 3600 * 1000)
    .sort((a, b) => due(b) - due(a))
    .slice(0, RECENT),
)
const undated = computed(() => all.value.filter((a) => !a.due_at).length)

// A student's own work, where it stands.
const isStudent = computed(() => course.role === 'student' && !!course.myMemberId && course.can('submission_read'))
const mine = useAsync<Map<string, SubmissionSummary> | null>(async () => {
  if (!isStudent.value || !course.myMemberId) return null
  const out = await read('submission.list', {
    course_id: props.courseId,
    student_member_id: course.myMemberId,
    limit: 200,
  })
  const latest = new Map<string, SubmissionSummary>()
  for (const s of out.submissions ?? []) {
    const had = latest.get(s.assignment_id)
    if (!had || s.attempt > had.attempt) latest.set(s.assignment_id, s)
  }
  return latest
})
interface Standing {
  state?: string
  none?: 'notStarted' | 'notHandedIn'
}
function standing(a: AssignmentSummary): Standing | null {
  const map = mine.data.value
  if (!map) return null
  const s = map.get(a.id)
  if (s) return { state: s.state }
  return { none: due(a) <= now ? 'notHandedIn' : 'notStarted' }
}

interface Row {
  a: AssignmentSummary
  standing: Standing | null
  /** Due within two days, and not handed in (as far as is known). */
  urgent: boolean
}
function row(a: AssignmentSummary): Row {
  const st = standing(a)
  const open = !st || st.none === 'notStarted' || st.state === 'draft'
  return { a, standing: st, urgent: open && due(a) > now && due(a) - now < SOON_MS }
}
const groups = computed(() => [
  {
    key: 'upcoming',
    title: t('overview.assignments.upcoming'),
    rows: upcoming.value.map(row),
    empty: t('overview.assignments.nothingDue'),
  },
  { key: 'recent', title: t('overview.assignments.recent'), rows: recent.value.map(row), empty: '' },
])
</script>

<template>
  <section class="app-card assignments">
    <h2 class="app-card__title">
      <span>{{ t('overview.assignments.title') }}</span>
      <router-link :to="{ name: 'course-assignments', params: { courseId } }" class="assignments__all">
        {{ t('overview.assignments.all') }}
        <el-icon><ArrowRight /></el-icon>
      </router-link>
    </h2>

    <AsyncState
      :loading="listLoading"
      :error="listError"
      :empty="!all.length"
      :empty-text="t('overview.assignments.none')"
      @retry="retry"
    >
      <template v-for="group in groups" :key="group.key">
        <div v-if="group.rows.length || group.empty" class="assignments__group">
          <h3 class="assignments__group-title">{{ group.title }}</h3>
          <p v-if="!group.rows.length" class="assignments__empty app-muted">{{ group.empty }}</p>
          <router-link
            v-for="r in group.rows"
            :key="r.a.id"
            :to="{ name: 'course-assignment', params: { courseId, assignmentId: r.a.id } }"
            class="assignments__row"
            :class="{ 'is-urgent': r.urgent }"
          >
            <span class="assignments__main">
              <span class="assignments__name">{{ r.a.title }}</span>
              <span class="assignments__meta">
                <el-icon><Clock /></el-icon>
                <span>{{ t('overview.assignments.due') }}</span>
                <TimeText :value="r.a.due_at" relative />
                <span class="assignments__dot">·</span>
                <span>{{ t('overview.assignments.points', { n: formatDecimal(r.a.points_possible) }) }}</span>
              </span>
            </span>
            <span class="assignments__tags">
              <el-tag v-if="!r.a.published_at" type="info" size="small" effect="plain">
                {{ t('overview.assignments.unpublished') }}
              </el-tag>
              <StatusTag v-if="r.standing?.state" vocab="submissionState" :value="r.standing.state" />
              <el-tag
                v-else-if="r.standing?.none"
                :type="r.standing.none === 'notHandedIn' ? 'danger' : 'info'"
                size="small"
                effect="plain"
              >
                {{ t(`overview.assignments.${r.standing.none}`) }}
              </el-tag>
            </span>
          </router-link>
        </div>
      </template>
      <p v-if="upcomingAll.length > UPCOMING || undated" class="assignments__more app-muted">
        <span v-if="upcomingAll.length > UPCOMING">
          {{ t('overview.assignments.laterCount', { n: upcomingAll.length - UPCOMING }) }}
        </span>
        <span v-if="undated">{{ t('overview.assignments.undated', { n: undated }) }}</span>
      </p>
    </AsyncState>
  </section>
</template>

<style scoped>
.assignments__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--app-text-sm);
  font-weight: 500;
  text-decoration: none;
}
.assignments__group + .assignments__group {
  margin-top: 12px;
}
.assignments__group-title {
  margin: 0 0 6px;
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}
.assignments__empty {
  margin: 0;
  font-size: var(--app-text-sm);
}
.assignments__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: var(--app-radius-item);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
  text-decoration: none;
}
.assignments__row + .assignments__row {
  margin-top: 6px;
}
.assignments__row:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
}
.assignments__row.is-urgent {
  border-left: 3px solid var(--el-color-warning);
}
.assignments__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 220px;
}
.assignments__name {
  font-weight: 500;
  font-size: var(--app-text-md);
  overflow-wrap: anywhere;
}
.assignments__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.assignments__dot {
  margin: 0 2px;
}
.assignments__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.assignments__more {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 10px 0 0;
  font-size: var(--app-text-xs);
}
</style>
