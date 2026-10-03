<script setup lang="ts">
// Grades in the course (grade.list). Members who grade see drafts and
// superseded grades too, post drafts (grade.post) and enter grades on
// directly graded components (grade.submit), and undo final grades
// (grade.undo_ungraded_as_zero); everyone else — a student —
// sees their own posted grades and nothing else. A seat that enters grades
// without reading them (the built-in grader agent) is told where its work is.
//
// Filters come from and go to the query: ?assignment=<id>&student=<memberId>.
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { TableInstance } from 'element-plus'
import { read, type ToolOut, type WriteOutcome } from '@/api/http'
import type { GradeSummary } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useCourseStore } from '@/stores/course'
import AppEmpty from '@/components/AppEmpty.vue'
import AssignmentSelect from '@/components/AssignmentSelect.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import EnterComponentGradeDialog from './components/EnterComponentGradeDialog.vue'
import PostGradesDialog from './components/PostGradesDialog.vue'
import ProposalNotice from './components/ProposalNotice.vue'
import ScoreText from './components/ScoreText.vue'
import UndoFinalDialog from './components/UndoFinalDialog.vue'
import { useGradeLookups, type PostRow } from './components/grading'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)
// A card per grade, with its own checkbox, where the card is as narrow as on a
// phone: its toolbar 542 px or less, the width it has in a window of 640 px
// without the side bar. By the card's own width, not the window's: the side bar
// takes from it.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const narrow = useContainerNarrow(toolbar, 542)

/** A student sees their own posted grades: "My grades". */
const mine = computed(() => course.role === 'student')
/** grade.list and component.tree take grade_read: a seat known to lack it would only be refused. */
const readsGrades = computed(() => course.level('grade_read') !== 'denied')
/**
 * Work that belongs to no single assignment — a component grade, a
 * gradebook — is refused to a seat limited to listed assignments.
 */
const spansAssignments = computed(() => course.membership?.assignment_scope !== 'listed')
const canPost = computed(() => !mine.value && readsGrades.value && course.can('grade_post'))
/** The dialog lists the scheme's directly graded components, which takes reading it. */
const canEnter = computed(
  () => !mine.value && readsGrades.value && spansAssignments.value && course.can('grade_submit'),
)

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
  async (after) => {
    if (!readsGrades.value) return { items: [] }
    const o = await read('grade.list', {
      course_id: props.courseId,
      assignment_id: assignment.value,
      student_member_id: mine.value ? undefined : student.value,
      limit: 50,
      after,
    })
    return { items: o.grades, next: o.next }
  },
  { watch: [assignment, student] },
)
/** The posting toolbar, over the list: where it is shown, posting is the view's one primary action. */
const postBar = computed(() => canPost.value && !paged.error.value?.isForbidden)
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
// Narrow, the rows are cards with their own checkboxes.
function isSelected(g: GradeSummary): boolean {
  return selected.value.some((x) => x.id === g.id)
}
function toggle(g: GradeSummary) {
  selected.value = isSelected(g) ? selected.value.filter((x) => x.id !== g.id) : [...selected.value, g]
}

const draftsForAssignment = computed(
  () => paged.items.value.filter((g) => postable(g) && g.assignment_id === assignment.value).length,
)
/**
 * Every grade for the assignment is loaded and none is a draft. Filtered by
 * student, the list says nothing of the others, whose drafts are posted too.
 */
const noDraftsForAssignment = computed(
  () =>
    !!assignment.value &&
    !student.value &&
    !paged.loading.value &&
    !paged.error.value &&
    !paged.hasMore.value &&
    draftsForAssignment.value === 0,
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

// Undoing final grades: posting's own undo, gated as posting as final is
// (grade_post over the whole course), offered where posting is.
const undoVisible = ref(false)
const canUndoFinal = computed(() => canPost.value && spansAssignments.value)
async function onUndone(status: 'executed' | 'proposed') {
  postResult.value = null
  proposal.value =
    status === 'proposed' ? { title: t('common.outcome.proposedTitle'), body: t('common.outcome.proposed') } : null
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
</script>

<template>
  <div class="grades-view">
    <PageHeader
      :title="mine ? t('grades.mine.title') : t('grades.title')"
      :subtitle="mine ? t('grades.mine.subtitle') : t('grades.list.subtitle')"
    >
      <!-- One primary to a view: where the posting toolbar is shown, posting is it. -->
      <el-button
        v-if="canEnter"
        :type="postBar ? undefined : 'primary'"
        :disabled="!course.writable"
        @click="enterVisible = true"
      >
        <el-icon><EditPen /></el-icon>
        <span>{{ t('grades.enter.button') }}</span>
        <StatusTag
          v-if="course.needsApproval('grade_submit')"
          vocab="level"
          value="confirm_required"
          class="grades-view__approval"
          size="small"
        />
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
            <MemberName :id="r.studentMemberId" />{{ t('common.sep') }}{{ r.label }}
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

    <!-- A seat that enters grades without reading them: its grades are on each submission and in My actions. -->
    <section v-if="!readsGrades" class="app-card">
      <AppEmpty :text="t('grades.noRead.title')" page>
        <p v-if="course.can('grade_submit')" class="app-form-hint grades-view__no-read">
          {{ t('grades.noRead.submit') }}
        </p>
        <div v-if="course.can('grade_submit') || course.can('grade_post')" class="grades-view__no-read-links">
          <router-link v-if="course.can('submission_read')" :to="{ name: 'course-submissions', params: { courseId } }">
            <el-button>
              <el-icon><Files /></el-icon>
              <span>{{ t('grades.noRead.toSubmissions') }}</span>
            </el-button>
          </router-link>
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
            <el-button type="primary">
              <el-icon><List /></el-icon>
              <span>{{ t('grades.noRead.toActions') }}</span>
            </el-button>
          </router-link>
        </div>
      </AppEmpty>
    </section>

    <section v-else class="app-card">
      <div ref="toolbar" class="app-toolbar">
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
        <RefreshButton :loading="paged.loading.value" @click="paged.reload()" />
      </div>

      <div v-if="postBar" class="grades-view__post">
        <el-button type="primary" :disabled="!course.writable || !selected.length" @click="postSelected">
          <el-icon><Promotion /></el-icon>
          <span>{{ t('grades.post.selected', { n: selected.length }) }}</span>
        </el-button>
        <el-button :disabled="!course.writable || !assignment || noDraftsForAssignment" @click="postAssignment">
          <span>{{ t('grades.post.assignment') }}</span>
        </el-button>
        <StatusTag v-if="course.needsApproval('grade_post')" vocab="level" value="confirm_required" size="default" />
        <span class="app-form-hint grades-view__post-hint">
          {{
            !assignment
              ? t('grades.post.pickAssignment')
              : noDraftsForAssignment
                ? t('grades.post.noDrafts')
                : t('grades.post.selectHint')
          }}
        </span>
        <!-- What cannot be taken back is not beside posting: it is in the toolbar's menu, at its far end. -->
        <el-dropdown trigger="click" placement="bottom-end" @command="undoVisible = true">
          <el-button class="grades-view__more" :aria-label="t('grades.post.more')">
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="undo" :disabled="!canUndoFinal || !course.writable" class="grades-view__undo">
                <el-icon><RefreshLeft /></el-icon>
                <span class="grades-view__undo-text">
                  <span>{{ t('grades.undoFinal.button') }}</span>
                  <span v-if="!canUndoFinal || !course.writable" class="grades-view__undo-why">
                    {{ !spansAssignments ? t('grades.undoFinal.wholeCourse') : t('common.archivedCourse') }}
                  </span>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
        <!-- Narrow: one card per grade -->
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
              <!-- The pair is one item of the line's flex: its gap would put a space after the colon. -->
              <div v-if="!mine" class="grades-list__line app-muted">
                <i18n-t keypath="common.pair" tag="span" scope="global">
                  <template #label>{{
                    g.origin === 'computed' ? t('grades.detail.writtenBy') : t('grades.columns.grader')
                  }}</template>
                  <template #value><MemberName :id="g.grader_member_id" show-kind /></template>
                </i18n-t>
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
          <el-table-column :label="t('grades.columns.score')" min-width="150" align="right">
            <template #default="{ row }">
              <ScoreText :score="row.score" :out-of="lookups.outOf(row)" :as-percent="row.origin === 'computed'" />
            </template>
          </el-table-column>
          <!-- grade.list carries written feedback only; feedback files are on the grade page. -->
          <el-table-column :label="t('grades.columns.feedback')" min-width="110" align="center">
            <template #default="{ row }">
              <el-icon v-if="row.feedback" class="app-muted"><ChatLineSquare /></el-icon>
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
          <el-table-column :label="t('grades.columns.student')" min-width="110">
            <template #default="{ row }"><MemberName :id="row.student_member_id" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.what')" min-width="130">
            <template #default="{ row }">
              <span v-if="what(row)" class="grades-view__what">{{ what(row) }}</span>
              <IdText v-else :id="row.assignment_id ?? row.component_id" />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.score')" min-width="156" align="right">
            <template #default="{ row }">
              <ScoreText :score="row.score" :out-of="lookups.outOf(row)" :as-percent="row.origin === 'computed'" />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.state')" min-width="110">
            <template #default="{ row }"><StatusTag vocab="gradeState" :value="row.state" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.origin')" min-width="100">
            <template #default="{ row }"><StatusTag vocab="gradeOrigin" :value="row.origin" /></template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.grader')" min-width="140">
            <template #default="{ row }">
              <!-- Nobody grades a computed total: it is written down by posting. The grade page says who posted. -->
              <span v-if="row.origin === 'computed'" class="app-muted">—</span>
              <MemberName v-else :id="row.grader_member_id" show-kind />
            </template>
          </el-table-column>
          <el-table-column :label="t('grades.columns.created')" min-width="130">
            <template #default="{ row }"><TimeText :value="row.created_at" relative /></template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="paged.hasMore.value" :loading="paged.loading.value" @more="paged.loadMore" />
      </AsyncState>
    </section>

    <UndoFinalDialog v-if="canPost" v-model="undoVisible" :course-id="courseId" @done="onUndone" />
    <PostGradesDialog
      v-model="postVisible"
      :course-id="courseId"
      :mode="postMode"
      :rows="postRows"
      :assignment-id="assignment"
      :loaded-drafts="draftsForAssignment"
      :student-filtered="!!student"
      @done="onPosted"
    />
    <EnterComponentGradeDialog
      v-model="enterVisible"
      :course-id="courseId"
      :components="lookups.directComponents.value"
      :components-loading="lookups.tree.loading.value"
      :components-error="lookups.tree.error.value"
      :student-member-id="student"
      @done="onEntered"
      @retry="lookups.tree.reload"
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
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-light);
}
.grades-view__post .el-button + .el-button {
  margin-left: 0;
}
/* On a phone, the chat's round button floats at the screen's bottom right,
   where the toolbar's ⋯ would be under it when the page opens: the toolbar
   keeps clear of that column (the button's size and its 16 px inset). */
.has-chat-fab .grades-view__post {
  padding-right: calc(var(--app-fab-size, 48px) + 16px);
}
.grades-view__post-hint {
  margin: 0;
  flex: 1 1 200px;
}
/* The ⋯ menu at the toolbar's far end, on its row's right even when it wraps. */
.grades-view__post > .el-dropdown {
  margin-left: auto;
}
.grades-view__undo-text {
  display: flex;
  flex-direction: column;
}
.grades-view__undo-why {
  max-width: 280px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  white-space: normal;
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
.grades-view__no-read {
  max-width: 460px;
  margin: 0 auto 16px;
}
.grades-view__no-read-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.grades-view__no-read-links .el-button + .el-button {
  margin-left: 0;
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
  font-size: var(--app-text-sm);
}
.grades-list__time {
  margin-left: auto;
  font-size: var(--app-text-xs);
}
.grades-list__chev {
  flex-shrink: 0;
  align-self: center;
  color: var(--el-text-color-placeholder);
}
</style>
