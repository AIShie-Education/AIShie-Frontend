<script setup lang="ts">
// Every current student the caller's scope reaches on one assignment, with
// where each stands (submission.roster): not started, a draft, handed in,
// late or missing. Someone who has not started can be recorded as having
// handed in nothing (submission.record_missing), so that it can be graded; if
// they hand work in later, it takes that record's place. The page loads the
// rows; this shows them, and marks.
import { computed, h, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import type { ApiError } from '@/api/http'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatDateTime } from '@/utils/format'
import {
  ROSTER_STATES,
  countByState,
  forStudent,
  mayMarkMissing,
  needsMoreFor,
  proposalKey,
  rememberProposal,
  rosterName,
  showsSeatStatus,
  wasProposed,
  type RosterEntry,
} from './roster'

const props = defineProps<{
  courseId: string
  assignmentId: string
  /** Every row loaded so far. */
  rows: RosterEntry[]
  /** The student the page is filtered to, if any. */
  studentId?: string
  loading: boolean
  error: ApiError | null
  hasMore: boolean
}>()
const emit = defineEmits<{ more: []; retry: []; changed: [] }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
// A card per student where the roster is as narrow as on a phone: its summary
// 566 px or less, the width it has in a window of 640 px without the side bar
// (the page's 592 px, less the card's edges). By its own width, not the
// window's: the side bar takes from it.
const summaryLine = useTemplateRef<HTMLElement>('summaryLine')
const narrow = useContainerNarrow(summaryLine, 566)

const shown = computed(() => forStudent(props.rows, props.studentId))
const summary = computed(() => countByState(props.rows))

// The student the page is filtered to may be on a page not read yet.
watch(
  () => needsMoreFor(props.rows, props.studentId, props.hasMore) && !props.loading && !props.error,
  (more) => {
    if (more) emit('more')
  },
  { immediate: true },
)

const assignment = computed(() => course.assignments.get(props.assignmentId) ?? null)
/** Whether the assignment is published; null when the page does not know. */
const published = computed<boolean | null>(() => (assignment.value ? !!assignment.value.published_at : null))

// Marking someone missing that became a proposal: the row still says "not
// started" until someone approves it, so it says that it waits instead of
// offering the same thing again.
const keyOf = (row: RosterEntry, assignmentId = props.assignmentId) =>
  proposalKey(props.courseId, assignmentId, row.student_member_id)
const isProposed = (row: RosterEntry) => row.state === 'not_started' && wasProposed(keyOf(row))
const markable = (row: RosterEntry) =>
  mayMarkMissing(row, {
    canGrade: course.can('grade_submit'),
    writable: course.writable,
    published: published.value,
    proposed: isProposed(row),
  })
const needsApproval = computed(() => course.needsApproval('grade_submit'))

const { run, lastError } = useWrite('submission.record_missing')
const busy = ref<string | null>(null)

/** A row's name: Core gives it only to a caller who may read the member list. */
const nameOf = (row: RosterEntry) => rosterName(row, (id) => course.memberName(id))

async function markMissing(row: RosterEntry) {
  // The row is this assignment's: if the page moves to another while the
  // question is open, the answer is not for that one.
  const assignmentId = props.assignmentId
  const name = nameOf(row)
  const title = course.assignmentTitle(assignmentId) ?? t('submissions.roster.confirm.thisAssignment')
  const lines = [t('submissions.roster.confirm.body', { name, assignment: title })]
  const due = assignment.value?.due_at
  if (due && dayjs(due).isAfter(dayjs()))
    lines.push(t('submissions.roster.confirm.notDue', { due: formatDateTime(due) }))
  if (needsApproval.value) lines.push(t('submissions.roster.confirm.needsApproval'))
  // One paragraph a sentence: joined with spaces, Chinese would get a stray
  // one after each 。.
  const message = h(
    'div',
    lines.map((line) => h('p', { style: 'margin: 0 0 8px; line-height: 1.55' }, line)),
  )
  try {
    await ElMessageBox.confirm(message, t('submissions.roster.confirm.title', { name }), {
      type: 'warning',
      confirmButtonText: t('submissions.roster.markMissing'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  if (props.assignmentId !== assignmentId) return
  busy.value = row.student_member_id
  const out = await run(
    { course_id: props.courseId, assignment_id: assignmentId, student_member_id: row.student_member_id },
    { success: t('submissions.roster.done', { name }) },
  )
  busy.value = null
  if (out?.status === 'proposed') rememberProposal(keyOf(row, assignmentId))
  // Read the roster again once Core has answered, whatever it said: a
  // refusal because they have just started shows what they have now.
  const err = lastError.value
  if (out || (err && !err.isNetwork && err.status < 500)) emit('changed')
}

function submissionRoute(row: RosterEntry) {
  return { name: 'course-submission', params: { courseId: props.courseId, submissionId: row.submission_id } }
}
function open(row: RosterEntry) {
  if (row.submission_id) void router.push(submissionRoute(row))
}
const rowClass = ({ row }: { row: RosterEntry }) => (row.submission_id ? 'roster-table__row--link' : '')

const nameOrder = (a: RosterEntry, b: RosterEntry) => nameOf(a).localeCompare(nameOf(b))

function stateOrder(a: RosterEntry, b: RosterEntry) {
  const i = (s: string) => {
    const n = (ROSTER_STATES as readonly string[]).indexOf(s)
    return n === -1 ? ROSTER_STATES.length : n
  }
  return i(a.state) - i(b.state)
}

const emptyText = computed(() =>
  props.studentId ? t('submissions.roster.emptyStudent') : t('submissions.roster.empty'),
)
</script>

<template>
  <div class="roster">
    <el-alert
      v-if="published === false"
      class="roster__notice"
      type="info"
      :closable="false"
      show-icon
      :title="t('submissions.roster.unpublished')"
    />
    <AsyncState
      :loading="loading && !shown.length"
      :error="error"
      :empty="!shown.length"
      :empty-text="emptyText"
      @retry="emit('retry')"
    >
      <div ref="summaryLine" class="roster-summary">
        <span class="roster-summary__total">
          {{ t('submissions.roster.summary.total', { n: summary.total }, summary.total) }}
        </span>
        <span v-for="c in summary.counts" :key="c.state" class="roster-summary__item">
          <StatusTag vocab="submissionState" :value="c.state" />
          <span class="roster-summary__count">{{ c.count }}</span>
        </span>
        <span v-if="hasMore" class="roster-summary__partial">{{ t('submissions.roster.summary.partial') }}</span>
      </div>

      <ul v-if="narrow" class="roster-cards">
        <li v-for="row in shown" :key="row.student_member_id">
          <router-link
            v-if="row.submission_id"
            :to="submissionRoute(row)"
            class="roster-cards__item roster-cards__link"
          >
            <div class="roster-cards__top">
              <span class="roster-cards__name">
                <span v-if="row.display_name">{{ row.display_name }}</span>
                <MemberName v-else :id="row.student_member_id" />
                <StatusTag v-if="showsSeatStatus(row)" vocab="memberStatus" :value="row.member_status" />
              </span>
              <StatusTag vocab="submissionState" :value="row.state" />
            </div>
            <div class="roster-cards__meta">
              <span v-if="row.attempt">{{ t('submissions.detail.attempt', { n: row.attempt }) }}</span>
              <TimeText v-if="row.submitted_at" :value="row.submitted_at" />
              <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
            </div>
          </router-link>
          <div v-else class="roster-cards__item">
            <div class="roster-cards__top">
              <span class="roster-cards__name">
                <span v-if="row.display_name">{{ row.display_name }}</span>
                <MemberName v-else :id="row.student_member_id" />
                <StatusTag v-if="showsSeatStatus(row)" vocab="memberStatus" :value="row.member_status" />
              </span>
              <StatusTag vocab="submissionState" :value="row.state" />
            </div>
            <div v-if="markable(row)" class="roster-action">
              <el-button
                size="small"
                :loading="busy === row.student_member_id"
                :disabled="loading || (!!busy && busy !== row.student_member_id)"
                @click="markMissing(row)"
              >
                <el-icon><DocumentRemove /></el-icon>
                <span>{{ t('submissions.roster.markMissing') }}</span>
              </el-button>
              <el-tag v-if="needsApproval" type="warning" size="small" disable-transitions>
                {{ t('enums.level.confirm_required') }}
              </el-tag>
            </div>
            <div v-else-if="isProposed(row)" class="roster-action">
              <el-tag type="warning" size="small" disable-transitions>{{ t('enums.actionStatus.proposed') }}</el-tag>
              <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
                {{ t('submissions.roster.myActions') }}
              </router-link>
            </div>
          </div>
        </li>
      </ul>
      <el-table
        v-else
        :data="shown"
        row-key="student_member_id"
        class="roster-table"
        :row-class-name="rowClass"
        @row-click="open"
      >
        <el-table-column :label="t('submissions.columns.student')" sortable :sort-method="nameOrder" min-width="180">
          <template #default="{ row }">
            <span v-if="row.display_name" class="roster-table__name">{{ row.display_name }}</span>
            <MemberName v-else :id="row.student_member_id" />
            <StatusTag
              v-if="showsSeatStatus(row)"
              class="roster-table__status"
              vocab="memberStatus"
              :value="row.member_status"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('submissions.columns.state')" sortable :sort-method="stateOrder" min-width="120">
          <template #default="{ row }">
            <StatusTag vocab="submissionState" :value="row.state" />
          </template>
        </el-table-column>
        <el-table-column :label="t('submissions.columns.attempt')" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.attempt">{{ row.attempt }}</span>
            <span v-else class="app-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('submissions.columns.submittedAt')" min-width="160">
          <template #default="{ row }">
            <TimeText v-if="row.submitted_at" :value="row.submitted_at" />
            <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
          </template>
        </el-table-column>
        <el-table-column min-width="220" align="right">
          <template #default="{ row }">
            <div v-if="markable(row)" class="roster-action roster-action--end">
              <el-tag v-if="needsApproval" type="warning" size="small" disable-transitions>
                {{ t('enums.level.confirm_required') }}
              </el-tag>
              <el-button
                size="small"
                :loading="busy === row.student_member_id"
                :disabled="loading || (!!busy && busy !== row.student_member_id)"
                @click.stop="markMissing(row)"
              >
                <el-icon><DocumentRemove /></el-icon>
                <span>{{ t('submissions.roster.markMissing') }}</span>
              </el-button>
            </div>
            <div v-else-if="isProposed(row)" class="roster-action roster-action--end">
              <el-tag type="warning" size="small" disable-transitions>{{ t('enums.actionStatus.proposed') }}</el-tag>
              <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
                {{ t('submissions.roster.myActions') }}
              </router-link>
            </div>
            <el-icon v-else-if="row.submission_id" class="roster-table__chevron"><ArrowRight /></el-icon>
          </template>
        </el-table-column>
      </el-table>
      <LoadMore :has-more="hasMore" :loading="loading" @more="emit('more')" />
    </AsyncState>
  </div>
</template>

<style scoped>
.roster__notice {
  margin: 4px 0 8px;
}
.roster-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  padding: 6px 0 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.roster-summary__total {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.roster-summary__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.roster-summary__count {
  font-variant-numeric: tabular-nums;
}
.roster-summary__partial {
  color: var(--el-text-color-secondary);
}
.roster-table :deep(.roster-table__row--link) {
  cursor: pointer;
}
.roster-table__name {
  word-break: break-word;
}
.roster-table__status {
  margin-left: 6px;
}
.roster-table__chevron {
  color: var(--el-text-color-secondary);
}
.roster-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.roster-action--end {
  justify-content: flex-end;
}
.roster-cards {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roster-cards__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  color: inherit;
  text-decoration: none;
}
.roster-cards__link:active,
.roster-cards__link:hover {
  background: var(--el-fill-color-light);
}
.roster-cards__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.roster-cards__name {
  font-weight: 500;
  word-break: break-word;
  min-width: 0;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.roster-cards__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
