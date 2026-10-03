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
//
// The search, the filter and the order are kept in the address (?q=, ?show=,
// ?sort=), so that Back finds them again; GradebookView keeps this page alive
// while a student's own gradebook is open, so that coming back to the class
// finds it as it was left, laid out for the width it comes back to, and
// reads again behind what is shown the students opened meanwhile (the whole
// term, where what is shown was read more than five minutes before). Refresh
// reads it all again under the rows as they are.
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  reactive,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { ApiError, read } from '@/api/http'
import type { Component } from '@/api/types'
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
  mergeStudents,
  slimGrade,
  sortRows,
  studentsSeen,
  summarise,
  visibleStudents,
  type MatrixColumn,
  type MatrixStudent,
  type RowFilter,
  type SortBy,
  type SubmissionLite,
  type TermRead,
} from './classMatrix'

const props = defineProps<{ courseId: string }>()
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)
void course.ensureMembers()

// A phone's layout where the toolbar is as narrow as in a window of 640 px
// without the side bar: by the card's own width, not the window's.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const measuredNarrow = useContainerNarrow(toolbar, 542)

/** Whether the page is shown: GradebookView keeps it alive, out of the page, while a student's gradebook is open. */
const active = ref(true)
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))
// Out of the page the toolbar is 0 px wide: the layout it was left in is
// kept for when it comes back, not the phone's. Put back, it is laid out for
// the width it has then, which useContainerWidth has measured again by now:
// the window may have been resized while a student's gradebook was open.
const narrow = ref(false)
watch(
  measuredNarrow,
  (n) => {
    if (active.value) narrow.value = n
  },
  { immediate: true },
)
onActivated(() => (narrow.value = measuredNarrow.value))

/** Grades on components, and totals, are within a seat's scope only over the whole course. */
const spansAssignments = computed(() => course.membership?.assignment_scope !== 'listed')

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const PAGE = 200
const progress = reactive({ grades: 0, submissions: 0 })
/** Read again in full where what is shown was asked for longer ago than this, coming back from a student's gradebook. */
const STALE_MS = 5 * 60_000

/** Every page of a list, keeping of each item what keep makes of it (null: nothing); count is told how many were read. */
async function readEvery<T, K>(
  page: (after?: string) => Promise<{ items: T[] | null | undefined; next?: string | null }>,
  keep: (item: T) => K | null,
  count: (n: number) => void,
): Promise<K[]> {
  const out: K[] = []
  let after: string | undefined
  let n = 0
  for (;;) {
    const p = await page(after)
    for (const item of p.items ?? []) {
      const k = keep(item)
      if (k !== null) out.push(k)
    }
    n += p.items?.length ?? 0
    count(n)
    if (!p.next) return out
    after = p.next
  }
}

/** Every grade and submission of the term, or of one student alone; the term's are counted as they come. */
async function readTerm(student?: string): Promise<TermRead> {
  const only = student ? { student_member_id: student } : {}
  const [grades, submissions] = await Promise.all([
    // Most of a term's grade.list is superseded totals, each with its
    // feedback and working: the little the matrix needs is kept of each
    // live grade, and nothing of a superseded one.
    readEvery(
      (after) =>
        read('grade.list', { course_id: props.courseId, limit: PAGE, after, ...only }).then((o) => ({
          items: o.grades,
          next: o.next,
        })),
      slimGrade,
      (n) => {
        if (!student) progress.grades = n
      },
    ),
    // Without submissions, a cell without a grade says nothing of whether work was handed in.
    course.can('submission_read')
      ? readEvery(
          (after) =>
            read('submission.list', { course_id: props.courseId, limit: PAGE, after, ...only }).then((o) => ({
              items: o.submissions,
              next: o.next,
            })),
          (s): SubmissionLite => ({
            id: s.id,
            assignment_id: s.assignment_id,
            student_member_id: s.student_member_id,
            attempt: s.attempt,
            state: s.state,
          }),
          (n) => {
            if (!student) progress.submissions = n
          },
        ).catch((e: unknown) => {
          if (e instanceof ApiError && e.isForbidden) return null
          throw e
        })
      : Promise.resolve(null),
  ])
  return { grades, submissions }
}

/**
 * Where the member list cannot be read (a tutor agent's seat), every student
 * the seat reaches, by member ID, from an assignment's roster
 * (submission.roster), which lists those who have handed nothing in, as
 * grades and submissions cannot: so that each is a row, to open. Null where
 * the member list can be read, or there is no roster to read.
 */
async function readRoster(): Promise<string[] | null> {
  await Promise.all([course.ensureMembers(), course.ensureAssignments()])
  if (course.membersState !== 'forbidden' || !course.can('submission_read')) return null
  const first = [...course.assignments.values()].find((a) => !!a.published_at)
  if (!first) return null
  return readEvery(
    (after) =>
      read('submission.roster', { course_id: props.courseId, assignment_id: first.id, limit: PAGE, after }).then(
        (o) => ({ items: o.students, next: o.next }),
      ),
    (s) => s.student_member_id,
    () => undefined,
  ).catch((e: unknown) => {
    if (e instanceof ApiError && (e.isForbidden || e.isNotFound)) return null
    throw e
  })
}

/** When the whole term was last asked for, and how many times: what was read of a student before then is older. */
let termAskedAt = 0
let termAsked = 0
const data = useAsync(
  async () => {
    termAskedAt = Date.now()
    termAsked++
    progress.grades = 0
    progress.submissions = 0
    if (course.level('grade_read') === 'denied') {
      throw new ApiError({ status: 403, code: 'forbidden', message: 'not permitted' })
    }
    const [term, roster] = await Promise.all([readTerm(), readRoster()])
    return { ...term, roster }
  },
  // What is shown stays while it is read again.
  { keepData: true },
)

/**
 * The scheme last read: kept while it is read again, so that a refresh does
 * not take the columns away; never guessed where it could not be read.
 */
const scheme = shallowRef<readonly Component[] | null>(null)
watch(
  () => lookups.tree.data.value,
  (v) => {
    if (v) scheme.value = v.components ?? []
  },
  { immediate: true },
)

/**
 * The assignments, the other half of what the columns are made of: never
 * dropped unsaid. Those last read are kept (by the store) while they are
 * read again; where they could not be read, the page says so, with a Retry
 * and nothing to export; where the seat may not read them, it says that
 * their grades are not shown.
 */
const assignmentsSeen = ref(course.assignmentsState === 'loaded')
watch(
  () => course.assignmentsState,
  (s) => {
    if (s === 'loaded') assignmentsSeen.value = true
  },
)
const assignmentsKnown = computed(
  () =>
    course.assignmentsState === 'loaded' ||
    course.assignmentsState === 'forbidden' ||
    (course.assignmentsState === 'loading' && assignmentsSeen.value),
)
const assignmentsFailed = computed(() => (course.assignmentsState === 'error' ? course.assignmentsError : null))

/**
 * The member list, which names the rows: kept (by the store) while it is
 * read again, so that a refresh does not take the rows away. Where it could
 * not be read, the page says so, with a Retry and nothing to export, rather
 * than name the class by member ID; only where the seat may not read it are
 * the rows the students Core shows it work or grades of.
 */
const membersSeen = ref(course.membersState === 'loaded')
watch(
  () => course.membersState,
  (s) => {
    if (s === 'loaded') membersSeen.value = true
  },
)
const membersFailed = computed(() => (course.membersState === 'error' ? course.membersError : null))
const failed = computed(
  () => data.error.value ?? lookups.tree.error.value ?? assignmentsFailed.value ?? membersFailed.value,
)
/** Everything the matrix is made of has been read. */
const ready = computed(() => !!data.data.value && !!scheme.value && assignmentsKnown.value && !failed.value)

function reload() {
  course.invalidate('all')
  void course.ensureMembers()
  void course.ensureAssignments()
  void lookups.tree.reload()
  void data.reload()
}

/** Read again behind what is shown, as when coming back from a student's gradebook. */
const quiet = ref(false)
function refreshQuietly() {
  if (data.loading.value) return
  quiet.value = true
  void Promise.all([data.reload(), lookups.tree.reload()]).finally(() => (quiet.value = false))
}

/**
 * The students whose own gradebooks were opened from here, or from one
 * another, since the class was last shown: what may have changed there is
 * theirs alone (a total overridden, final grades undone).
 */
const opened = new Set<string>()
watch(
  () => route.params.studentMemberId,
  (id) => {
    if (typeof id === 'string' && id) opened.add(id)
  },
)
const rereading = ref(false)
/**
 * Back from students' gradebooks: theirs read again (both lists take a
 * student), and put in place of what was kept of them, rather than every
 * page of the term once for each student. The whole term only where what is
 * shown was asked for more than five minutes before.
 */
async function refreshOpened() {
  // The whole term is being read: those opened are read once it has been,
  // since it may have read them before they changed.
  if (data.loading.value || rereading.value) return
  if (!data.data.value || Date.now() - termAskedAt > STALE_MS) {
    opened.clear()
    refreshQuietly()
    return
  }
  if (!opened.size) return
  const ids = [...opened]
  opened.clear()
  const asked = termAsked
  rereading.value = true
  try {
    const again = await Promise.all(ids.map((id) => readTerm(id)))
    const kept = data.data.value
    // Read in full meanwhile (Refresh): newer than this.
    if (kept && asked === termAsked) data.data.value = mergeStudents(kept, ids, again)
  } catch {
    // The whole term instead, which says what went wrong if it goes wrong again.
    if (asked === termAsked) refreshQuietly()
  } finally {
    rereading.value = false
  }
  // Another opened while these were read, and come back from.
  if (active.value && opened.size) void refreshOpened()
}
watch(data.loading, (busy) => {
  if (!busy && active.value && opened.size) void refreshOpened()
})

const loading = computed(
  () =>
    (data.loading.value && !quiet.value) ||
    (lookups.tree.loading.value && !quiet.value) ||
    course.membersState === 'loading' ||
    course.assignmentsState === 'loading',
)

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

const includeRemoved = ref(false)
/** The member list has been read: as it was, while it is read again. */
const rosterRead = computed(
  () =>
    course.membersState === 'loaded' ||
    ((course.membersState === 'idle' || course.membersState === 'loading') && membersSeen.value),
)
const anyRemoved = computed(
  () => rosterRead.value && [...course.members.values()].some((m) => m.role === 'student' && m.status === 'removed'),
)

const students = computed<MatrixStudent[]>(() => {
  const d = data.data.value
  if (!d) return []
  const seen = new Set(studentsSeen(d.grades, d.submissions, d.roster))
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
  // Not named until the member list has been read, or found unreadable.
  if (course.membersState !== 'forbidden') return []
  // The member list cannot be read (a tutor agent's seat): the students Core
  // showed work or grades of, and every one an assignment's roster lists.
  return [...seen].map((id) => ({ id, name: course.memberName(id), loginId: null, status: 'unknown' }))
})

const columns = computed(() =>
  buildColumns(scheme.value ?? [], course.assignments.values(), {
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

// Kept in the address: ?q= what was typed, ?show= the filter, ?sort= a
// column's key, after a minus sign for the other way (by name A to Z, and
// every student, are said by leaving them out).
const FILTERS: readonly RowFilter[] = ['all', 'drafts', 'missing', 'toGrade']
const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

const query = ref('')
const filter = ref<RowFilter>('all')
const sort = ref<SortBy>({ key: 'name', dir: 'asc' })

function fromAddress() {
  query.value = one(route.query.q) ?? ''
  const show = one(route.query.show) as RowFilter | undefined
  filter.value = show && FILTERS.includes(show) ? show : 'all'
  const by = one(route.query.sort)
  sort.value = !by
    ? { key: 'name', dir: 'asc' }
    : by.startsWith('-')
      ? { key: by.slice(1), dir: 'desc' }
      : { key: by, dir: 'asc' }
}
fromAddress()

/** What the address says of the page as it is now: undefined for what is said by leaving it out. */
function wanted() {
  return {
    q: query.value.trim() ? query.value : undefined,
    show: filter.value === 'all' ? undefined : filter.value,
    sort:
      sort.value.key === 'name' && sort.value.dir === 'asc'
        ? undefined
        : `${sort.value.dir === 'desc' ? '-' : ''}${sort.value.key}`,
  }
}
function saysAlready(q: LocationQuery, want: ReturnType<typeof wanted>) {
  return want.q === one(q.q) && want.show === one(q.show) && want.sort === one(q.sort)
}

/** A search typed and not yet in the address: written there once typing pauses. */
let typing: ReturnType<typeof setTimeout> | undefined
function toAddress() {
  clearTimeout(typing)
  typing = undefined
  if (!active.value) return
  const want = wanted()
  if (saysAlready(route.query, want)) return
  void router.replace({ query: { ...route.query, ...want } })
}
// What is typed goes into the address once typing pauses; the rest at once.
watch(query, () => {
  clearTimeout(typing)
  typing = setTimeout(toAddress, 400)
})
watch([filter, sort], toAddress)
// Left before typing paused (a student opened at once): what was typed is
// written into the address of the page being left, so that Back finds it
// there. Not by router.replace, a navigation of its own, which would cancel
// the one under way: the history's entry is replaced, as router.replace
// would, before the navigation adds its own after it.
const stopLeaving = router.beforeEach((to, from) => {
  if (typing === undefined || !active.value || to.path === from.path) return
  // Left by Back or Forward: the browser is at the entry it goes to already,
  // whose address is that page's, not the class's to write. The search waits
  // for typing to pause, as before, and is not written once the class is
  // out of the page.
  if (router.options.history.location !== from.fullPath) return
  clearTimeout(typing)
  typing = undefined
  const want = wanted()
  if (saysAlready(from.query, want)) return
  router.options.history.replace(
    router.resolve({ path: from.path, query: { ...from.query, ...want }, hash: from.hash }).fullPath,
  )
})
onBeforeUnmount(() => {
  clearTimeout(typing)
  stopLeaving()
})

let shownOnce = false
onActivated(() => {
  if (!shownOnce) {
    shownOnce = true
    return
  }
  // Back to the class: the address says how it was left, or (the Whole
  // class button) says nothing, and is told.
  const q = route.query
  if (one(q.q) || one(q.show) || one(q.sort)) fromAddress()
  else toAddress()
  void refreshOpened()
})

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
// An order the phone cannot say (by an assignment, or by name Z to A, chosen
// on the table) is not kept where the page narrows to the list: it would be
// an order no one could see the reason for, under a choice saying "By name".
watch(
  [narrow, scheme],
  ([isNarrow, known]) => {
    if (!isNarrow || !known || !active.value) return
    const { key, dir } = sort.value
    if ((key === 'name' && dir === 'asc') || (key === totalKey.value && key !== null)) return
    sort.value = { key: 'name', dir: 'asc' }
  },
  { immediate: true },
)

/** What, changed, brings the table back to its top, where the change is seen: not the rows read again. */
const resetKey = computed(() =>
  [query.value, filter.value, sort.value.key, sort.value.dir, includeRemoved.value].join('\u0000'),
)

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
    status: t('classbook.csv.status'),
    statusOf: (s) => (s.status === 'paused' || s.status === 'removed' ? t(`enums.memberStatus.${s.status}`) : ''),
    draft: (score) => t('classbook.csv.draft', { score }),
    overridden: (score) => t('classbook.csv.overridden', { score }),
    waiting: (text) => t('classbook.csv.waiting', { text }),
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
      <el-button :disabled="!ready || !shown.length" @click="exportCsv">
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
        <span v-if="ready" class="app-muted classbook__count" aria-live="polite">{{ countText }}</span>
        <el-button :loading="loading || quiet || rereading" @click="reload">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('common.actions.refresh') }}</span>
        </el-button>
      </div>

      <p v-if="data.loading.value && !quiet" class="app-form-hint classbook__reading" role="status">
        {{
          t('classbook.reading', {
            grades: formatNumber(progress.grades, 0),
            submissions: formatNumber(progress.submissions, 0),
          })
        }}
      </p>
      <el-alert
        v-if="ready && course.assignmentsState === 'forbidden'"
        type="warning"
        :closable="false"
        show-icon
        class="classbook__notice"
        :title="t('classbook.assignmentsForbidden')"
      />
      <AsyncState
        :loading="loading"
        :error="failed"
        :empty="ready && !shown.length"
        :empty-text="matrix.length ? t('classbook.emptyFiltered') : t('classbook.empty')"
        :overlay="ready"
        @retry="reload"
      >
        <template v-if="ready && shown.length">
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
            :reset-key="resetKey"
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
        <li v-if="includeRemoved">{{ t('classbook.legend.removed') }}</li>
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
  font-size: var(--app-text-sm);
}
.classbook__reading,
.classbook__notice {
  margin: 0 0 12px;
}
.classbook__legend {
  margin: 12px 0 0;
  padding-left: 18px;
}
</style>
