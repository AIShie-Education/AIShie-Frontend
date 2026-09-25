<script setup lang="ts">
// The submissions the caller's scope reaches: a student sees their own, a
// tutor those of the students they are listed for, a grader those for the
// assignments they are listed for. Filtered by assignment and student, and
// the filters kept in the address (?assignment=…&student=…) so that other
// pages can link to a filtered list.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { SubmissionSummary } from '@/api/types'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { usePaged } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()
onMounted(() => void course.ensureAssignments())

/** A student's scope is themselves: there is nobody else to filter by. */
const isStudent = computed(() => course.role === 'student')

function fromQuery(name: string): string | undefined {
  const v = route.query[name]
  return typeof v === 'string' && v ? v : undefined
}
const assignment = ref<string | undefined>(fromQuery('assignment'))
const student = ref<string | undefined>(fromQuery('student'))

// The filters follow the address (a link, back and forward) …
watch(
  () => [route.query.assignment, route.query.student],
  () => {
    assignment.value = fromQuery('assignment')
    student.value = fromQuery('student')
  },
)
// … and the address follows the filters.
watch([assignment, student], ([a, s]) => {
  const query = { ...route.query, assignment: a || undefined, student: s || undefined }
  if (query.assignment === fromQuery('assignment') && query.student === fromQuery('student')) return
  void router.replace({ query })
})

const studentFilter = computed(() => (isStudent.value ? undefined : student.value || undefined))

const list = usePaged<SubmissionSummary>(
  (after) =>
    read('submission.list', {
      course_id: props.courseId,
      assignment_id: assignment.value || undefined,
      student_member_id: studentFilter.value,
      limit: 50,
      after,
    }).then((o) => ({ items: o.submissions, next: o.next })),
  { watch: [() => assignment.value, studentFilter] },
)

const filtered = computed(() => !!assignment.value || !!studentFilter.value)
const emptyText = computed(() =>
  isStudent.value ? t('submissions.empty.student') : filtered.value ? t('submissions.empty.filtered') : t('submissions.empty.none'),
)

// On a phone the table's columns would not fit side by side: the list is
// shown as one card per submission instead.
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)') : null
const narrow = ref(!!narrowQuery?.matches)
const onNarrow = (e: MediaQueryListEvent) => (narrow.value = e.matches)
narrowQuery?.addEventListener('change', onNarrow)
onBeforeUnmount(() => narrowQuery?.removeEventListener('change', onNarrow))

function open(row: SubmissionSummary) {
  void router.push({ name: 'course-submission', params: { courseId: props.courseId, submissionId: row.id } })
}
</script>

<template>
  <div>
    <PageHeader
      :title="t('submissions.title')"
      :subtitle="isStudent ? t('submissions.subtitle.student') : t('submissions.subtitle.staff')"
    >
      <router-link
        v-if="assignment"
        :to="{ name: 'course-assignment', params: { courseId, assignmentId: assignment } }"
      >
        <el-button>
          <el-icon><EditPen /></el-icon>
          <span>{{ t('submissions.links.assignment') }}</span>
        </el-button>
      </router-link>
      <router-link
        v-if="assignment && !isStudent && (course.can('grade_read') || course.can('grade_post'))"
        :to="{ name: 'course-grades', params: { courseId }, query: { assignment } }"
      >
        <el-button>
          <el-icon><Medal /></el-icon>
          <span>{{ t('submissions.links.grades') }}</span>
        </el-button>
      </router-link>
    </PageHeader>

    <div v-if="!list.error.value?.isForbidden" class="app-toolbar">
      <AssignmentSelect
        v-model="assignment"
        class="submissions-filter"
        clearable
        :placeholder="t('submissions.filters.assignment')"
      />
      <MemberSelect
        v-if="!isStudent"
        v-model="student"
        class="submissions-filter"
        role="student"
        include-inactive
        clearable
        :placeholder="t('submissions.filters.student')"
      />
      <span class="app-toolbar__spacer" />
      <el-button :loading="list.loading.value" @click="list.reload">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
    </div>

    <section class="app-card submissions-card">
      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="emptyText"
        @retry="list.reload"
      >
        <template #empty>
          <router-link v-if="isStudent" :to="{ name: 'course-assignments', params: { courseId } }">
            <el-button type="primary">{{ t('submissions.links.assignments') }}</el-button>
          </router-link>
        </template>
        <ul v-if="narrow" class="submission-cards">
          <li v-for="row in list.items.value" :key="row.id">
            <router-link
              :to="{ name: 'course-submission', params: { courseId, submissionId: row.id } }"
              class="submission-cards__item"
            >
              <div class="submission-cards__top">
                <span class="submission-cards__title">
                  {{ course.assignmentTitle(row.assignment_id) ?? '' }}
                  <IdText v-if="!course.assignmentTitle(row.assignment_id)" :id="row.assignment_id" />
                </span>
                <StatusTag vocab="submissionState" :value="row.state" />
              </div>
              <div class="submission-cards__meta">
                <MemberName v-if="!isStudent" :id="row.student_member_id" />
                <span>{{ t('submissions.detail.attempt', { n: row.attempt }) }}</span>
                <TimeText v-if="row.submitted_at" :value="row.submitted_at" />
                <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
              </div>
            </router-link>
          </li>
        </ul>
        <el-table v-else :data="list.items.value" row-key="id" class="submissions-table" @row-click="open">
          <el-table-column v-if="!isStudent" :label="t('submissions.columns.student')" min-width="160">
            <template #default="{ row }">
              <MemberName :id="row.student_member_id" />
            </template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.assignment')" min-width="220">
            <template #default="{ row }">
              <span v-if="course.assignmentTitle(row.assignment_id)" class="submissions-table__title">
                {{ course.assignmentTitle(row.assignment_id) }}
              </span>
              <IdText v-else :id="row.assignment_id" />
            </template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.attempt')" width="90" align="center">
            <template #default="{ row }">{{ row.attempt }}</template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.state')" min-width="110">
            <template #default="{ row }">
              <StatusTag vocab="submissionState" :value="row.state" />
            </template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.submittedAt')" min-width="160">
            <template #default="{ row }">
              <TimeText v-if="row.submitted_at" :value="row.submitted_at" />
              <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
            </template>
          </el-table-column>
          <el-table-column width="40" align="right">
            <template #default>
              <el-icon class="submissions-table__chevron"><ArrowRight /></el-icon>
            </template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </section>
  </div>
</template>

<style scoped>
.submissions-filter {
  width: 260px;
  max-width: 100%;
}
.submissions-card {
  padding: 8px 12px;
}
.submissions-table :deep(.el-table__row) {
  cursor: pointer;
}
.submissions-table__title {
  word-break: break-word;
}
.submissions-table__chevron {
  color: var(--el-text-color-secondary);
}
@media (max-width: 600px) {
  .submissions-filter {
    width: 100%;
  }
}
.submission-cards {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.submission-cards__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}
.submission-cards__item:active,
.submission-cards__item:hover {
  background: var(--el-fill-color-light);
}
.submission-cards__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.submission-cards__title {
  font-weight: 500;
  word-break: break-word;
  min-width: 0;
}
.submission-cards__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
