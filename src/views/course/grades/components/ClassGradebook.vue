<script setup lang="ts">
// The whole class's gradebook (the gradebook's page for staff before a
// student is chosen): every student the seat reaches by every published
// assignment it reaches, the scheme's directly graded components and
// totals beside them for a seat over the whole course. It reads what the
// seat may read and nothing more: every grade (grade.list), every
// submission (submission.list, where the seat reads them, for what is
// missing and what waits to be graded), the assignments, the scheme and the
// member list, a page of 200 at a time, and works the matrix out from them
// (classMatrix.ts). Searching, filtering, sorting and the CSV are of what
// was read, without asking Core again.
//
// Where the page is as narrow as a phone it is a list a student at a time
// (StudentGradeList); otherwise a table that draws only the rows near the
// screen (GradeMatrix). A student's own gradebook, and an assignment's
// grades, are a click away.
import { computed, reactive, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import type { GradeSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useCourseStore } from '@/stores/course'
import { formatNumber, shortId } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import GradeMatrix from './GradeMatrix.vue'
import StudentGradeList from './StudentGradeList.vue'
import { formatScore, useGradeLookups } from './grading'
import {
  buildColumns,
  buildMatrix,
  filterRows,
  matrixCsv,
  sortRows,
  studentsSeen,
  summarise,
  visibleStudents,
  type MatrixColumn,
  type MatrixStudent,
  type RowFilter,
  type SortBy,
  type SubmissionLite,
} from './classMatrix'

const props = defineProps<{ courseId: string }>()
const { t, locale } = useI18n()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)
void course.ensureMembers()

// A phone's layout where the toolbar is as narrow as in a window of 640 px
// without the side bar: by the card's own width, not the window's.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const narrow = useContainerNarrow(toolbar, 542)

/** Grades on components, and totals, are within a seat's scope only over the whole course. */
const spansAssignments = computed(() => course.membership?.assignment_scope !== 'listed')

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const PAGE = 200
const progress = reactive({ grades: 0, submissions: 0 })

async function readEvery<T>(
  page: (after?: string) => Promise<{ items: T[] | null | undefined; next?: string | null }>,
  count: (n: number) => void,
): Promise<T[]> {
  const out: T[] = []
  let after: string | undefined
  for (;;) {
    const p = await page(after)
    out.push(...(p.items ?? []))
    count(out.length)
    if (!p.next) return out
    after = p.next
  }
}

const data = useAsync(async () => {
  progress.grades = 0
  progress.submissions = 0
  if (course.level('grade_read') === 'denied') {
    throw new ApiError({ status: 403, code: 'forbidden', message: 'not permitted' })
  }
  const [grades, submissions] = await Promise.all([
    readEvery<GradeSummary>(
      (after) =>
        read('grade.list', { course_id: props.courseId, limit: PAGE, after }).then((o) => ({
          items: o.grades,
          next: o.next,
        })),
      (n) => (progress.grades = n),
    ),
    // Without submissions, a cell without a grade says nothing of whether work was handed in.
    course.can('submission_read')
      ? readEvery<SubmissionLite>(
          (after) =>
            read('submission.list', { course_id: props.courseId, limit: PAGE, after }).then((o) => ({
              items: (o.submissions ?? []).map((s) => ({
                id: s.id,
                assignment_id: s.assignment_id,
                student_member_id: s.student_member_id,
                attempt: s.attempt,
                state: s.state,
              })),
              next: o.next,
            })),
          (n) => (progress.submissions = n),
        ).catch((e: unknown) => {
          if (e instanceof ApiError && e.isForbidden) return null
          throw e
        })
      : Promise.resolve(null),
  ])
  return { grades, submissions }
})

function reload() {
  course.invalidate('all')
  void course.ensureMembers()
  void course.ensureAssignments()
  void lookups.tree.reload()
  void data.reload()
}

const loading = computed(
  () =>
    data.loading.value ||
    lookups.tree.loading.value ||
    course.membersState === 'loading' ||
    course.assignmentsState === 'loading',
)

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

const includeRemoved = ref(false)
const rosterRead = computed(() => course.membersState === 'loaded')
const anyRemoved = computed(
  () => rosterRead.value && [...course.members.values()].some((m) => m.role === 'student' && m.status === 'removed'),
)

const students = computed<MatrixStudent[]>(() => {
  const d = data.data.value
  if (!d) return []
  const seen = new Set(studentsSeen(d.grades, d.submissions))
  // Not named until the member list has been read, or found unreadable.
  if (course.membersState === 'idle' || course.membersState === 'loading') return []
  if (rosterRead.value) {
    const seat = course.seat ?? course.membership
    return visibleStudents(
      course.members.values(),
      {
        member_id: course.myMemberId,
        student_scope: seat?.student_scope,
        listed_students: course.seat?.listed_students ?? null,
      },
      { includeRemoved: includeRemoved.value, seen },
    )
  }
  // The member list cannot be read (a tutor agent's seat): the students Core showed work or grades of.
  return [...seen].map((id) => ({ id, name: course.memberName(id), loginId: null, status: 'unknown' }))
})

const columns = computed(() =>
  buildColumns(lookups.tree.data.value?.components ?? [], course.assignments.values(), {
    spansAssignments: spansAssignments.value,
  }),
)

const matrix = computed(() => {
  const d = data.data.value
  if (!d) return []
  return buildMatrix({ students: students.value, columns: columns.value, grades: d.grades, submissions: d.submissions })
})

function nameOf(s: MatrixStudent): string {
  return s.name ?? t('classbook.unnamed', { id: shortId(s.id) })
}
function titleOf(c: MatrixColumn): string {
  if (c.isRoot) return t('grades.courseTotal')
  if (c.kind === 'total') return t('classbook.componentTotal', { name: c.title ?? '' })
  return c.title ?? shortId(c.id)
}

// ---------------------------------------------------------------------------
// Finding, filtering, sorting
// ---------------------------------------------------------------------------

const query = ref('')
const filter = ref<RowFilter>('all')
const sort = ref<SortBy>({ key: 'name', dir: 'asc' })

const filtered = computed(() => filterRows(matrix.value, query.value, filter.value))
const shown = computed(() => sortRows(filtered.value, sort.value, nameOf, locale.value))
const summaries = computed(() => summarise(filtered.value, columns.value))

/** A heading clicked: by it, highest first for a score, A to Z for a name; clicked again, the other way. */
function sortBy(key: string) {
  if (sort.value.key === key) sort.value = { key, dir: sort.value.dir === 'asc' ? 'desc' : 'asc' }
  else sort.value = { key, dir: key === 'name' || key === 'loginId' ? 'asc' : 'desc' }
}
/** The phone's choice of order: by name, or by the course total either way. */
const totalKey = computed(() => columns.value.find((c) => c.isRoot)?.key ?? null)
const phoneSort = computed({
  get: () => (sort.value.key === totalKey.value ? `total-${sort.value.dir}` : 'name'),
  set: (v: string) => {
    if (v === 'name' || !totalKey.value) sort.value = { key: 'name', dir: 'asc' }
    else sort.value = { key: totalKey.value, dir: v === 'total-asc' ? 'asc' : 'desc' }
  },
})

const countText = computed(() =>
  shown.value.length === matrix.value.length
    ? t('classbook.countAll', { n: matrix.value.length }, matrix.value.length)
    : t('classbook.countSome', { shown: shown.value.length, n: matrix.value.length }),
)

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function exportCsv() {
  const csv = matrixCsv(columns.value, shown.value, {
    student: t('classbook.student'),
    loginId: t('classbook.loginId'),
    memberId: t('classbook.memberId'),
    column: (c) =>
      c.kind === 'total'
        ? t('classbook.csv.total', { name: titleOf(c) })
        : t('classbook.csv.column', { name: titleOf(c), n: formatScore(c.outOf) }),
    draft: (score) => t('classbook.csv.draft', { score }),
    missing: t('classbook.state.missing'),
    toGrade: t('classbook.state.toGrade'),
    unnamed: nameOf,
  })
  const code = [course.course?.code, course.course?.section].filter(Boolean).join('-')
  const day = new Date().toLocaleDateString('sv-SE')
  const name = `${[code, t('classbook.csv.file'), day].filter(Boolean).join('-')}.csv`.replace(/[\\/:*?"<>|\s]+/g, '_')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="classbook">
    <PageHeader :title="t('grades.gradebook.title')" :subtitle="t('classbook.subtitle')">
      <router-link :to="{ name: 'course-grades', params: { courseId } }">
        <el-button>
          <el-icon><Medal /></el-icon>
          <span>{{ t('classbook.allGrades') }}</span>
        </el-button>
      </router-link>
      <el-button :disabled="!shown.length" @click="exportCsv">
        <el-icon><Download /></el-icon>
        <span>{{ t('classbook.export') }}</span>
      </el-button>
    </PageHeader>

    <section class="app-card">
      <div ref="toolbar" class="app-toolbar classbook__toolbar">
        <el-input
          v-model="query"
          clearable
          class="classbook__search"
          :placeholder="t('classbook.search')"
          :aria-label="t('classbook.search')"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <el-select v-model="filter" class="classbook__filter" :aria-label="t('classbook.show.label')">
          <el-option value="all" :label="t('classbook.show.all')" />
          <el-option value="drafts" :label="t('classbook.show.drafts')" />
          <el-option value="missing" :label="t('classbook.show.missing')" />
          <el-option value="toGrade" :label="t('classbook.show.toGrade')" />
        </el-select>
        <el-select
          v-if="narrow && totalKey"
          v-model="phoneSort"
          class="classbook__filter"
          :aria-label="t('classbook.sort.label')"
        >
          <el-option value="name" :label="t('classbook.sort.name')" />
          <el-option value="total-desc" :label="t('classbook.sort.totalDesc')" />
          <el-option value="total-asc" :label="t('classbook.sort.totalAsc')" />
        </el-select>
        <el-checkbox v-if="anyRemoved" v-model="includeRemoved">{{ t('classbook.removed') }}</el-checkbox>
        <span class="app-toolbar__spacer" />
        <span v-if="data.data.value" class="app-muted classbook__count" aria-live="polite">{{ countText }}</span>
        <el-button :loading="loading" @click="reload">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('common.actions.refresh') }}</span>
        </el-button>
      </div>

      <p v-if="data.loading.value" class="app-form-hint classbook__reading" role="status">
        {{
          t('classbook.reading', {
            grades: formatNumber(progress.grades, 0),
            submissions: formatNumber(progress.submissions, 0),
          })
        }}
      </p>
      <AsyncState
        :loading="loading"
        :error="data.error.value"
        :empty="!!data.data.value && !shown.length"
        :empty-text="matrix.length ? t('classbook.emptyFiltered') : t('classbook.empty')"
        :overlay="!!data.data.value"
        @retry="reload"
      >
        <template v-if="data.data.value && shown.length">
          <StudentGradeList
            v-if="narrow"
            :course-id="courseId"
            :columns="columns"
            :rows="shown"
            :name-of="nameOf"
            :title-of="titleOf"
          />
          <GradeMatrix
            v-else
            :course-id="courseId"
            :columns="columns"
            :rows="shown"
            :total="matrix.length"
            :sort="sort"
            :summaries="summaries"
            :name-of="nameOf"
            :title-of="titleOf"
            @sort="sortBy"
          />
        </template>
      </AsyncState>

      <ul class="classbook__legend app-form-hint">
        <li>{{ t('classbook.legend.posted') }}</li>
        <li>{{ t('classbook.legend.draft') }}</li>
        <li>{{ t('classbook.legend.missing') }}</li>
        <li v-if="spansAssignments">{{ t('classbook.legend.totals') }}</li>
        <li>{{ t('classbook.legend.scope') }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.classbook__search {
  width: 260px;
}
.classbook__filter {
  width: 200px;
}
@media (max-width: 640px) {
  .classbook__search,
  .classbook__filter {
    width: 100%;
  }
}
.classbook__toolbar .el-checkbox {
  margin-right: 0;
}
.classbook__count {
  font-size: 13px;
}
.classbook__reading {
  margin: 0 0 12px;
}
.classbook__legend {
  margin: 12px 0 0;
  padding-left: 18px;
}
</style>
