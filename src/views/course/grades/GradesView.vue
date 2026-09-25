<script setup lang="ts">
// Grades in the course (grade.list). Members who grade see drafts and
// superseded grades too, post drafts (grade.post) and enter grades on
// directly graded components (grade.submit); everyone else — a student —
// sees their own posted grades and nothing else.
//
// Filters come from and go to the query: ?assignment=<id>&student=<memberId>.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { TableInstance } from 'element-plus'
import { read, type ToolOut, type WriteOutcome } from '@/api/http'
import type { GradeSummary } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import EnterComponentGradeDialog from './components/EnterComponentGradeDialog.vue'
import PostGradesDialog from './components/PostGradesDialog.vue'
import ProposalNotice from './components/ProposalNotice.vue'
import ScoreText from './components/ScoreText.vue'
import { useGradeLookups, useNarrow, type PostRow } from './components/grading'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)
const narrow = useNarrow()

/** A student sees their own posted grades: "My grades". */
const mine = computed(() => course.role === 'student')
const canPost = computed(() => !mine.value && course.can('grade_post'))
const canEnter = computed(() => !mine.value && course.can('grade_submit'))

// ---------------------------------------------------------------------------
// Filters, kept in the query
// ---------------------------------------------------------------------------

const fromQuery = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const assignment = ref<string | undefined>(fromQuery(route.query.assignment))
const student = ref<string | undefined>(fromQuery(route.query.student))
watch(
  () => [route.query.assignment, route.query.student],
  ([a, s]) => {
    assignment.value = fromQuery(a)
    student.value = fromQuery(s)
  },
)
watch([assignment, student], ([a, s]) => {
  if (a === fromQuery(route.query.assignment) && s === fromQuery(route.query.student)) return
  void router.replace({
    query: {
      ...route.query,
      assignment: a || undefined,
      student: s || undefined,
    },
  })
})
const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined)
const assignmentModel = computed({
  get: () => assignment.value,
  set: (v: string | string[] | undefined) => (assignment.value = one(v)),
})
const studentModel = computed({
  get: () => student.value,
  set: (v: string | string[] | undefined) => (student.value = one(v)),
})

type StateFilter = 'all' | 'draft' | 'posted' | 'superseded'
const stateFilter = ref<StateFilter>('all')

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

const paged = usePaged<GradeSummary>(
  (after) =>
    read('grade.list', {
      course_id: props.courseId,
      assignment_id: assignment.value,
      student_member_id: mine.value ? undefined : student.value,
      limit: 50,
      after,
    }).then((o) => ({ items: o.grades, next: o.next })),
  { watch: [assignment, student] },
)
const rows = computed(() =>
  stateFilter.value === 'all' ? paged.items.value : paged.items.value.filter((g) => g.state === stateFilter.value),
)
const filtered = computed(() => !!assignment.value || (!mine.value && !!student.value) || stateFilter.value !== 'all')

function what(g: GradeSummary): string | null {
  return lookups.what(g, t)
}
function open(g: GradeSummary) {
  void router.push({
    name: 'course-grade',
    params: { courseId: props.courseId, gradeId: g.id },
  })
}
function onRowClick(row: GradeSummary, column: { type?: string } | undefined) {
  if (column?.type === 'selection') return
  open(row)
}
function rowClass({ row }: { row: GradeSummary }) {
  return row.state === 'superseded' ? 'grades-row--superseded' : ''
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

const table = ref<TableInstance>()
const selected = ref<GradeSummary[]>([])
const postable = (g: GradeSummary) => course.writable && g.state === 'draft' && g.origin === 'entered'
watch([assignment, student, narrow], () => {
  selected.value = []
  table.value?.clearSelection()
})
// On a phone the rows are cards with their own checkboxes.
function isSelected(g: GradeSummary): boolean {
  return selected.value.some((x) => x.id === g.id)
}
function toggle(g: GradeSummary) {
  selected.value = isSelected(g) ? selected.value.filter((x) => x.id !== g.id) : [...selected.value, g]
}

const draftsForAssignment = computed(
  () => paged.items.value.filter((g) => postable(g) && g.assignment_id === assignment.value).length,
)

const postVisible = ref(false)
const postMode = ref<'ids' | 'assignment'>('ids')
const postRows = ref<PostRow[]>([])
function toPostRow(g: GradeSummary): PostRow {
  return {
    id: g.id,
    studentMemberId: g.student_member_id,
    label: what(g) ?? g.assignment_id ?? g.component_id ?? '',
    score: g.score,
    outOf: lookups.outOf(g),
  }
}
function postSelected() {
  postMode.value = 'ids'
  postRows.value = selected.value.map(toPostRow)
  postVisible.value = true
}
function postAssignment() {
  postMode.value = 'assignment'
  postRows.value = []
  postVisible.value = true
}

interface PostResult {
  posted: PostRow[]
  unknown: string[]
  snapshots: number
  reviewPending: boolean
}
const postResult = ref<PostResult | null>(null)
const proposal = ref<{ title: string; body: string } | null>(null)

async function onPosted(out: WriteOutcome<ToolOut<'grade.post'>>) {
  postResult.value = null
  proposal.value = null
  if (out.status === 'proposed') {
    proposal.value = {
      title: t('grades.post.proposedTitle'),
      body: t('grades.post.proposedBody'),
    }
  } else {
    const byId = new Map(paged.items.value.map((g) => [g.id, g]))
    const posted = out.result.posted ?? []
    postResult.value = {
      posted: posted.filter((id) => byId.has(id)).map((id) => toPostRow(byId.get(id)!)),
      unknown: posted.filter((id) => !byId.has(id)),
      snapshots: out.result.snapshots,
      reviewPending: out.reviewState === 'pending',
    }
  }
  selected.value = []
  table.value?.clearSelection()
  await paged.reload()
}

// ---------------------------------------------------------------------------
// Entering a grade on a directly graded component
// ---------------------------------------------------------------------------

const enterVisible = ref(false)
async function onEntered(out: WriteOutcome<ToolOut<'grade.submit'>>) {
  postResult.value = null
  proposal.value = null
  if (out.status === 'proposed') {
    proposal.value = {
      title: t('grades.enter.proposedTitle'),
      body: t('grades.enter.proposedBody'),
    }
    return
  }
  await paged.reload()
}

const gradebookLink = computed(() =>
  mine.value
    ? {
        name: 'course-gradebook',
        params: {
          courseId: props.courseId,
          studentMemberId: course.myMemberId ?? undefined,
        },
      }
    : {
        name: 'course-gradebook',
        params: { courseId: props.courseId, studentMemberId: student.value },
      },
)
</script>

<template>
  <div class="grades-view">
    <PageHeader
      :title="mine ? t('grades.mine.title') : t('grades.title')"
      :subtitle="mine ? t('grades.mine.subtitle') : t('grades.list.subtitle')"
    >
      <router-link :to="gradebookLink">
        <el-button>
          <el-icon><Tickets /></el-icon>
          <span>{{ mine ? t('grades.mine.gradebook') : t('grades.list.gradebook') }}</span>
        </el-button>
      </router-link>
      <el-button v-if="canEnter" type="primary" :disabled="!course.writable" @click="enterVisible = true">
        <el-icon><EditPen /></el-icon>
        <span>{{ t('grades.enter.button') }}</span>
        <el-tag
          v-if="course.needsApproval('grade_submit')"
          size="small"
          type="warning"
          effect="plain"
          class="grades-view__approval"
        >
          {{ t('enums.level.confirm_required') }}
        </el-tag>
      </el-button>
    </PageHeader>

    <ProposalNotice
      v-if="proposal"
      :course-id="courseId"
      :title="proposal.title"
      :body="proposal.body"
      @close="proposal = null"
    />

    <el-alert
      v-if="postResult"
      type="success"
      show-icon
      :title="
        t('grades.post.resultTitle', {
          n: postResult.posted.length + postResult.unknown.length,
        })
      "
      class="grades-view__result"
      @close="postResult = null"
    >
      <p class="grades-view__result-line">
        {{ t('grades.post.resultSnapshots', { n: postResult.snapshots }) }}
        <template v-if="postResult.reviewPending"> {{ t('common.outcome.pendingReview') }}</template>
      </p>
      <ul class="grades-view__result-list">
        <li v-for="r in postResult.posted.slice(0, 12)" :key="r.id">
          <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: r.id } }">
            <MemberName :id="r.studentMemberId" /> · {{ r.label }}
          </router-link>
          <ScoreText :score="r.score" :out-of="r.outOf" hide-percent />
        </li>
        <li v-for="id in postResult.unknown.slice(0, 12)" :key="id">
          <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: id } }"
            ><IdText :id="id"
          /></router-link>
        </li>
      </ul>
      <p v-if="postResult.posted.length + postResult.unknown.length > 12" class="grades-view__result-line">
        {{
          t('grades.post.resultMore', {
            n: postResult.posted.length + postResult.unknown.length - 12,
          })
        }}
      </p>
    </el-alert>

    <section class="app-card">
      <div class="app-toolbar">
        <AssignmentSelect
          v-model="assignmentModel"
          clearable
          :placeholder="t('grades.list.allAssignments')"
          class="grades-view__filter"
        />
        <MemberSelect
          v-if="!mine"
          v-model="studentModel"
          role="student"
          include-inactive
          clearable
          :placeholder="t('grades.list.allStudents')"
          class="grades-view__filter"
        />
        <el-select
          v-if="!mine"
          v-model="stateFilter"
          class="grades-view__state"
          :aria-label="t('grades.columns.state')"
        >
          <el-option value="all" :label="t('grades.list.allStates')" />
          <el-option value="draft" :label="t('enums.gradeState.draft')" />
          <el-option value="posted" :label="t('enums.gradeState.posted')" />
          <el-option value="superseded" :label="t('enums.gradeState.superseded')" />
        </el-select>
        <span class="app-toolbar__spacer" />
        <el-button :loading="paged.loading.value" @click="paged.reload()">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('common.actions.refresh') }}</span>
        </el-button>
      </div>

      <div v-if="canPost && !paged.error.value?.isForbidden" class="grades-view__post">
        <el-button type="success" :disabled="!course.writable || !selected.length" @click="postSelected">
          <el-icon><Promotion /></el-icon>
          <span>{{ t('grades.post.selected', { n: selected.length }) }}</span>
        </el-button>
        <el-button type="success" plain :disabled="!course.writable || !assignment" @click="postAssignment">
          <span>{{ t('grades.post.assignment') }}</span>
        </el-button>
        <el-tag v-if="course.needsApproval('grade_post')" type="warning" effect="plain">
          {{ t('enums.level.confirm_required') }}
        </el-tag>
        <span class="app-form-hint grades-view__post-hint">
          {{ assignment ? t('grades.post.selectHint') : t('grades.post.pickAssignment') }}
        </span>
      </div>
      <p v-if="stateFilter !== 'all' && paged.hasMore.value" class="app-form-hint">
        {{ t('grades.list.stateFilterHint') }}
      </p>

      <AsyncState
        :loading="paged.loading.value && !paged.items.value.length"
        :error="paged.error.value"
        :empty="!rows.length && !paged.hasMore.value"
        :empty-text="filtered ? t('grades.list.emptyFiltered') : mine ? t('grades.mine.empty') : t('grades.list.empty')"
        @retry="paged.reload"
      >
        <!-- Phone width: one card per grade -->
        <ul v-if="narrow" class="grades-list">
          <li
            v-for="g in rows"
            :key="g.id"
            class="grades-list__item"
            :class="{ 'is-superseded': g.state === 'superseded' }"
            @click="open(g)"
          >
            <span v-if="canPost" class="grades-list__check" @click.stop>
              <el-checkbox :model-value="isSelected(g)" :disabled="!postable(g)" @change="toggle(g)" />
            </span>
            <div class="grades-list__body">
              <div class="grades-list__top">
                <span class="grades-list__what">
                  <template v-if="what(g)">{{ what(g) }}</template>
                  <IdText v-else :id="g.assignment_id ?? g.component_id" />
                </span>
                <StatusTag v-if="!mine" vocab="gradeState" :value="g.state" />
              </div>
              <div v-if="!mine" class="grades-list__line">
                <MemberName :id="g.student_member_id" />
              </div>
              <div class="grades-list__line">
                <ScoreText :score="g.score" :out-of="lookups.outOf(g)" :as-percent="g.origin === 'computed'" />
                <StatusTag v-if="g.origin === 'computed'" vocab="gradeOrigin" :value="g.origin" />
                <span class="app-muted grades-list__time"
                  ><TimeText :value="mine ? g.posted_at : g.created_at" relative
                /></span>
              </div>
              <div v-if="!mine" class="grades-list__line app-muted">
                {{ t('grades.columns.grader') }}:
                <MemberName :id="g.grader_member_id" show-kind />
              </div>
            </div>
            <el-icon class="grades-list__chev"><ArrowRight /></el-icon>
          </li>
        </ul>

        <!-- A student's own posted grades -->
        <el-table
          v-else-if="mine"
          :data="rows"
          row-key="id"
          class="grades-view__table"
          @row-click="(row: GradeSummary) => open(row)"
        >
          <el-table-column :label="t('grades.columns.what')" min-width="200">
            <template #default="{ row }">
              <span v-if="what(row)" class="grades-view__what">{{ what(row) }}</span>
              <IdText v-else :id="row.assignment_id ?? row.component_id" />
              <StatusTag
                v-if="row.origin === 'computed'"
                vocab="gradeOrigin"
                :value="row.origin"
                class="grades-view__origin"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.score')" min-width="150">
            <template #default="{ row }">
              <ScoreText :score="row.score" :out-of="lookups.outOf(row)" :as-percent="row.origin === 'computed'" />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.feedback')" min-width="90" align="center">
            <template #default="{ row }">
              <el-icon v-if="row.feedback || (row.feedback_files ?? []).length" class="app-muted"
                ><ChatLineSquare
              /></el-icon>
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.posted')" min-width="150">
            <template #default="{ row }"><TimeText :value="row.posted_at" /></template>
          </el-table-column>
        </el-table>

        <!-- Everyone who reads grades beyond their own -->
        <el-table
          v-else
          ref="table"
          :data="rows"
          row-key="id"
          class="grades-view__table"
          :row-class-name="rowClass"
          @row-click="onRowClick"
          @selection-change="(s: GradeSummary[]) => (selected = s)"
        >
          <el-table-column v-if="canPost" type="selection" width="44" :selectable="postable" />
          <el-table-column :label="t('grades.columns.student')" min-width="114">
            <template #default="{ row }"><MemberName :id="row.student_member_id" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.what')" min-width="150">
            <template #default="{ row }">
              <span v-if="what(row)" class="grades-view__what">{{ what(row) }}</span>
              <IdText v-else :id="row.assignment_id ?? row.component_id" />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.score')" min-width="126">
            <template #default="{ row }">
              <ScoreText :score="row.score" :out-of="lookups.outOf(row)" :as-percent="row.origin === 'computed'" />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.state')" min-width="116">
            <template #default="{ row }"><StatusTag vocab="gradeState" :value="row.state" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.origin')" min-width="104">
            <template #default="{ row }"><StatusTag vocab="gradeOrigin" :value="row.origin" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.grader')" min-width="140">
            <template #default="{ row }"><MemberName :id="row.grader_member_id" show-kind /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.created')" min-width="130">
            <template #default="{ row }"><TimeText :value="row.created_at" relative /></template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="paged.hasMore.value" :loading="paged.loading.value" @more="paged.loadMore" />
      </AsyncState>
    </section>

    <PostGradesDialog
      v-model="postVisible"
      :course-id="courseId"
      :mode="postMode"
      :rows="postRows"
      :assignment-id="assignment"
      :loaded-drafts="draftsForAssignment"
      @done="onPosted"
    />
    <EnterComponentGradeDialog
      v-model="enterVisible"
      :course-id="courseId"
      :components="lookups.directComponents.value"
      :components-loading="lookups.tree.loading.value"
      :student-member-id="student"
      @done="onEntered"
    />
  </div>
</template>

<style scoped>
.grades-view__approval {
  margin-left: 6px;
}
.grades-view__result {
  margin-bottom: 16px;
}
.grades-view__result-line {
  margin: 0 0 4px;
}
.grades-view__result-list {
  margin: 4px 0 0;
  padding-left: 18px;
}
.grades-view__result-list li > a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}
.grades-view__filter {
  width: 240px;
}
.grades-view__state {
  width: 150px;
}
@media (max-width: 640px) {
  .grades-view__filter,
  .grades-view__state {
    width: 100%;
  }
}
.grades-view__post {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.grades-view__post .el-button + .el-button {
  margin-left: 0;
}
.grades-view__post-hint {
  margin: 0;
  flex: 1 1 200px;
}
.grades-view__table :deep(.el-table__row) {
  cursor: pointer;
}
.grades-view__table :deep(.grades-row--superseded) {
  color: var(--el-text-color-secondary);
}
.grades-view__what {
  word-break: break-word;
}
.grades-view__origin {
  margin-left: 6px;
}
.grades-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.grades-list__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
}
.grades-list__item.is-superseded {
  color: var(--el-text-color-secondary);
}
.grades-list__check {
  flex-shrink: 0;
  margin-top: -6px;
}
.grades-list__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.grades-list__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.grades-list__what {
  font-weight: 500;
  word-break: break-word;
}
.grades-list__line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}
.grades-list__time {
  margin-left: auto;
  font-size: 12px;
}
.grades-list__chev {
  flex-shrink: 0;
  align-self: center;
  color: var(--el-text-color-placeholder);
}
</style>
