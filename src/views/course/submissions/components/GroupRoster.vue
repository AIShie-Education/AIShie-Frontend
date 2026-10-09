<script setup lang="ts">
// A group assignment's roster (submission.roster): by group, each group of
// its set with its members now, where its latest work stands, and when and
// by whom it was handed in; a group with someone in it and no work at all is
// recorded as having handed in nothing (submission.record_missing with
// group_id), for its members now, by someone whose seat reaches every one of
// them: a seat listed to some students is shown only those of each group's
// members, and is told how many more there are (the group's size, from its
// set). Under the groups, the students in no
// group of the set, who hand nothing in and are not recorded as missing:
// the teacher places them in a group, on the set's page. By student, the
// roster's own table, each student with their group. The page loads the
// rows; this shows them, and marks.
import { computed, h, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { read, type ApiError } from '@/api/http'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import FilterChips from '@/components/FilterChips.vue'
import LoadMore from '@/components/LoadMore.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { zonedText } from '@/utils/parts'
import { groupSetRoute } from '@/views/course/assignments/components/groupWork'
import { useWorkNames } from '@/views/course/assignments/components/useWorkNames'
import RosterTable from './RosterTable.vue'
import WorkStateTag from './WorkStateTag.vue'
import {
  byGroupName,
  groupProposalKey,
  groupRosterView,
  mayMarkGroupMissing,
  NO_GROUP,
  unreachedMembers,
  workMembersIfOthers,
  type GroupReach,
  type RosterGroup,
} from './rosterByGroup'
import { ROSTER_STATES, rememberProposal, rosterName, showsSeatStatus, wasProposed, type RosterEntry } from './roster'

const props = defineProps<{
  courseId: string
  assignmentId: string
  /** The assignment's group set, where the page knows it: its page is linked to. */
  setId?: string | null
  /** Its groups, from the roster's first page; null while not read. */
  groups: RosterGroup[] | null
  /** Its students, every page loaded so far. */
  rows: RosterEntry[]
  /** The student the page is filtered to, if any. */
  studentId?: string
  loading: boolean
  error: ApiError | null
  hasMore: boolean
}>()
const emit = defineEmits<{ more: []; retry: []; changed: [] }>()
const { t, te } = useI18n()
const router = useRouter()
const course = useCourseStore()
const { namesOf, nameIn } = useWorkNames()

/** By group, or the roster's own table by student: a view's mode, not a filter. */
const mode = ref<'group' | 'student'>('group')

// A card per group where the roster is as narrow as on a phone, as RosterTable's.
const summaryLine = useTemplateRef<HTMLElement>('summaryLine')
const narrow = useContainerNarrow(summaryLine, 566)

const stateFilter = ref('')
const view = computed(() =>
  groupRosterView([...(props.groups ?? [])].sort(byGroupName), props.rows, props.studentId, stateFilter.value),
)
const summary = computed(() => view.value.summary)
const stateChips = computed(() =>
  (summary.value?.counts ?? []).map((c) => ({
    value: c.state,
    label: te(`enums.submissionState.${c.state}`) ? t(`enums.submissionState.${c.state}`) : c.state,
    count: c.count,
  })),
)
watch(stateChips, (chips) => {
  if (summary.value && stateFilter.value && !chips.some((c) => c.value === stateFilter.value)) stateFilter.value = ''
})
const visible = computed(() => view.value.visible)
const noGroup = computed(() => view.value.noGroup)
const setPage = computed(() => (props.setId ? groupSetRoute(router, props.courseId, props.setId) : null))

const assignment = computed(() => course.assignments.get(props.assignmentId) ?? null)
const published = computed<boolean | null>(() => (assignment.value ? !!assignment.value.published_at : null))
const needsApproval = computed(() => course.needsApproval('grade_submit'))

// --- How far the caller's seat reaches into each group -----------------------------
/**
 * The caller's seat reaches every student, and is nobody's delegate (whose
 * principal's seat may reach fewer): the members the roster names are all
 * of each group's.
 */
const reachesAll = computed(() => (course.seat ?? course.membership)?.student_scope === 'all' && !course.isDelegate)
/**
 * Each group's size now, from its set (group_set.get, read by whoever reads
 * the course), where the seat may reach only some students: read again with
 * the roster's groups. Not known, nothing is recorded missing from here.
 */
const sizes = useAsync<Map<string, number>>(
  async () => {
    if (reachesAll.value || !props.setId || props.groups === null) return new Map()
    const set = await read('group_set.get', { course_id: props.courseId, set_id: props.setId })
    return new Map((set.groups ?? []).map((g) => [g.id, g.size]))
  },
  { watch: [() => props.setId, () => props.groups, reachesAll], keepData: true },
)
const reach = computed<GroupReach>(() => (reachesAll.value ? null : (sizes.data.value ?? new Map())))
/** How many of a group's members the roster does not name, the seat not reaching them. */
const unreached = (g: RosterGroup) => unreachedMembers(g, reach.value)

const keyOf = (g: RosterGroup, assignmentId = props.assignmentId) =>
  groupProposalKey(props.courseId, assignmentId, g.group_id)
const isProposed = (g: RosterGroup) => g.state === 'not_started' && wasProposed(keyOf(g))
function markContext(g: RosterGroup) {
  return {
    canGrade: course.can('grade_submit'),
    writable: course.writable,
    published: published.value,
    proposed: isProposed(g),
  }
}
const markable = (g: RosterGroup) => mayMarkGroupMissing(g, { ...markContext(g), reach: reach.value })
/** A group that would be recorded missing from here but for members the seat does not reach. */
const outOfReach = (g: RosterGroup) => unreached(g) > 0 && mayMarkGroupMissing(g, { ...markContext(g), reach: null })
/** How many members the seat does not reach, and, where that is why, that the group is not recorded missing from here. */
function unreachedLine(g: RosterGroup): string {
  const n = unreached(g)
  return t(outOfReach(g) ? 'groupWork.roster.unreachedMissing' : 'groupWork.roster.unreached', { n }, n)
}

const { run, lastError } = useWrite('submission.record_missing')
const busy = ref<string | null>(null)

async function markMissing(g: RosterGroup) {
  const assignmentId = props.assignmentId
  const title = course.assignmentTitle(assignmentId) ?? t('submissions.roster.confirm.thisAssignment')
  const lines = [t('groupWork.roster.confirmBody', { group: g.name, assignment: title, names: namesOf(g.members) })]
  const due = assignment.value?.due_at
  if (due && dayjs(due).isAfter(dayjs())) lines.push(t('submissions.roster.confirm.notDue', { due: zonedText(due) }))
  if (needsApproval.value) lines.push(t('submissions.roster.confirm.needsApproval'))
  // One paragraph a sentence: joined with spaces, Chinese would get a stray one after each 。.
  const message = h(
    'div',
    lines.map((line) => h('p', { style: 'margin: 0 0 8px; line-height: 1.55' }, line)),
  )
  try {
    await ElMessageBox.confirm(message, t('groupWork.roster.confirmTitle', { group: g.name }), {
      type: 'warning',
      confirmButtonText: t('groupWork.roster.recordMissing'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  if (props.assignmentId !== assignmentId) return
  busy.value = g.group_id
  const out = await run(
    { course_id: props.courseId, assignment_id: assignmentId, group_id: g.group_id },
    { success: t('groupWork.roster.done', { group: g.name }), reasons: 'groupWork.refusal' },
  )
  busy.value = null
  if (out?.status === 'proposed') rememberProposal(keyOf(g, assignmentId))
  // Read the roster again once Core has answered, whatever it said: a
  // refusal because the group has just started shows what it has now.
  const err = lastError.value
  if (out || (err && !err.isNetwork && err.status < 500)) emit('changed')
}

function submissionRoute(g: RosterGroup) {
  return { name: 'course-submission', params: { courseId: props.courseId, submissionId: g.submission_id } }
}
function open(g: RosterGroup) {
  if (g.submission_id) void router.push(submissionRoute(g))
}
const rowClass = ({ row }: { row: RosterGroup }) => (row.submission_id ? 'group-roster__row--link' : '')
function stateOrder(a: RosterGroup, b: RosterGroup) {
  const i = (s: string) => {
    const n = (ROSTER_STATES as readonly string[]).indexOf(s)
    return n === -1 ? ROSTER_STATES.length : n
  }
  return i(a.state) - i(b.state)
}
const nameOf = (row: RosterEntry) => rosterName(row, (id) => course.memberName(id))
/** Whose a group's work is, where that is not its members now: said under them. */
function workLine(g: RosterGroup): string | null {
  const of = workMembersIfOthers(g, props.rows)
  if (!of) return null
  return t(g.state === 'missing' ? 'groupWork.roster.missingFor' : 'groupWork.roster.handedInFor', {
    names: namesOf(of),
  })
}
const emptyText = computed(() => (props.studentId ? t('groupWork.roster.emptyStudent') : t('groupWork.roster.empty')))
</script>

<template>
  <div class="group-roster">
    <div class="group-roster__mode">
      <el-radio-group v-model="mode" size="small" :aria-label="t('groupWork.roster.view')">
        <el-radio-button value="group">{{ t('groupWork.roster.byGroup') }}</el-radio-button>
        <el-radio-button value="student">{{ t('groupWork.roster.byStudent') }}</el-radio-button>
      </el-radio-group>
    </div>

    <RosterTable
      v-if="mode === 'student'"
      :course-id="courseId"
      :assignment-id="assignmentId"
      :student-id="studentId"
      :rows="rows"
      :loading="loading"
      :error="error"
      :has-more="hasMore"
      group-mode
      :groups="groups"
      @more="emit('more')"
      @retry="emit('retry')"
      @changed="emit('changed')"
    />

    <template v-else>
      <AppNote v-if="published === false" class="group-roster__notice">
        {{ t('submissions.roster.unpublished') }}
      </AppNote>
      <AsyncState
        :loading="loading && groups === null"
        :error="groups === null ? error : null"
        :empty="groups !== null && !view.visible.length && !stateFilter && !noGroup.length"
        :empty-text="emptyText"
        @retry="emit('retry')"
      >
        <div ref="summaryLine" class="group-roster__summary">
          <FilterChips
            v-if="summary"
            v-model="stateFilter"
            :options="stateChips"
            :all-count="summary.total"
            :label="t('groupWork.roster.chipsLabel')"
          />
        </div>
        <AppEmpty v-if="!visible.length && (groups ?? []).length" :text="t('submissions.roster.emptyState')" />

        <ul v-else-if="narrow" class="group-cards">
          <li v-for="g in visible" :key="g.group_id">
            <component
              :is="g.submission_id ? 'router-link' : 'div'"
              v-bind="g.submission_id ? { to: submissionRoute(g) } : {}"
              class="group-cards__item"
              :class="{ 'group-cards__link': g.submission_id }"
            >
              <div class="group-cards__top">
                <span class="group-cards__name">{{ g.name }}</span>
                <WorkStateTag :value="g.state" />
              </div>
              <div class="group-cards__members">
                <template v-if="g.members?.length">{{ namesOf(g.members) }}</template>
                <span v-else class="app-muted">{{ t('groupWork.roster.nobody') }}</span>
                <div v-if="unreached(g)" class="group-roster__work-of group-roster__unreached">
                  {{ unreachedLine(g) }}
                </div>
                <div v-if="workLine(g)" class="group-roster__work-of">{{ workLine(g) }}</div>
              </div>
              <div class="group-cards__meta">
                <span v-if="g.attempt">{{ t('submissions.detail.attempt', { n: g.attempt }) }}</span>
                <TimeText v-if="g.submitted_at" :value="g.submitted_at" />
                <span v-if="g.submitted_by_member_id">{{
                  t('groupWork.roster.handedInBy', { name: nameIn(g.submitted_by_member_id, g.members) })
                }}</span>
              </div>
            </component>
            <div v-if="markable(g)" class="roster-action group-cards__action">
              <el-button
                size="small"
                :loading="busy === g.group_id"
                :disabled="loading || (!!busy && busy !== g.group_id)"
                @click="markMissing(g)"
              >
                <el-icon><DocumentRemove /></el-icon>
                <span>{{ t('groupWork.roster.recordMissing') }}</span>
              </el-button>
              <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
            </div>
            <div v-else-if="isProposed(g)" class="roster-action group-cards__action">
              <AppTag tone="wait">{{ t('enums.actionStatus.proposed') }}</AppTag>
              <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
                {{ t('submissions.roster.myActions') }}
              </router-link>
            </div>
          </li>
        </ul>
        <el-table
          v-else
          :data="visible"
          row-key="group_id"
          class="group-roster__table"
          :row-class-name="rowClass"
          @row-click="open"
        >
          <el-table-column :label="t('groupWork.roster.group')" sortable :sort-method="byGroupName" min-width="120">
            <template #default="{ row }">
              <span class="group-roster__name">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('groupWork.roster.members')" min-width="200">
            <template #default="{ row }">
              <span v-if="row.members?.length" class="group-roster__members">{{ namesOf(row.members) }}</span>
              <span v-else class="app-muted">{{ t('groupWork.roster.nobody') }}</span>
              <div v-if="unreached(row)" class="group-roster__work-of group-roster__unreached">
                {{ unreachedLine(row) }}
              </div>
              <div v-if="workLine(row)" class="group-roster__work-of">{{ workLine(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.state')" sortable :sort-method="stateOrder" min-width="110">
            <template #default="{ row }">
              <WorkStateTag :value="row.state" />
            </template>
          </el-table-column>
          <el-table-column :label="t('submissions.columns.attempt')" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.attempt">{{ row.attempt }}</span>
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('groupWork.roster.handedIn')" min-width="170">
            <template #default="{ row }">
              <template v-if="row.submitted_at">
                <TimeText :value="row.submitted_at" />
                <div v-if="row.submitted_by_member_id" class="group-roster__by">
                  {{ t('groupWork.roster.handedInBy', { name: nameIn(row.submitted_by_member_id, row.members) }) }}
                </div>
              </template>
              <span v-else class="app-muted">{{ t('submissions.notHandedIn') }}</span>
            </template>
          </el-table-column>
          <el-table-column min-width="200" align="right">
            <template #default="{ row }">
              <div v-if="markable(row)" class="roster-action roster-action--end">
                <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
                <el-button
                  size="small"
                  :loading="busy === row.group_id"
                  :disabled="loading || (!!busy && busy !== row.group_id)"
                  @click.stop="markMissing(row)"
                >
                  <el-icon><DocumentRemove /></el-icon>
                  <span>{{ t('groupWork.roster.recordMissing') }}</span>
                </el-button>
              </div>
              <div v-else-if="isProposed(row)" class="roster-action roster-action--end">
                <AppTag tone="wait">{{ t('enums.actionStatus.proposed') }}</AppTag>
                <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
                  {{ t('submissions.roster.myActions') }}
                </router-link>
              </div>
              <el-icon v-else-if="row.submission_id" class="group-roster__chevron"><ArrowRight /></el-icon>
            </template>
          </el-table-column>
        </el-table>

        <!-- The students in no group of the set: nothing to hand in, nothing recorded missing -->
        <section v-if="noGroup.length" class="group-roster__no-group" :aria-labelledby="`no-group-${assignmentId}`">
          <h3 :id="`no-group-${assignmentId}`" class="group-roster__no-group-title">
            <WorkStateTag :value="NO_GROUP" />
            <span>{{ t('groupWork.roster.noGroupTitle', { n: noGroup.length }, noGroup.length) }}</span>
          </h3>
          <p class="group-roster__no-group-note">
            {{ t('groupWork.roster.noGroupNote') }}
            <router-link v-if="setPage" :to="setPage">{{ t('groupWork.roster.openSet') }}</router-link>
          </p>
          <ul class="group-roster__no-group-list">
            <li v-for="r in noGroup" :key="r.student_member_id">
              <span v-if="r.display_name">{{ nameOf(r) }}</span>
              <MemberName v-else :id="r.student_member_id" />
              <StatusTag v-if="showsSeatStatus(r)" vocab="memberStatus" :value="r.member_status" />
            </li>
          </ul>
        </section>
        <p v-if="hasMore" class="group-roster__more app-muted">{{ t('groupWork.roster.noGroupMore') }}</p>
        <LoadMore :has-more="hasMore" :loading="loading" @more="emit('more')" />
      </AsyncState>
    </template>
  </div>
</template>

<style scoped>
.group-roster__mode {
  display: flex;
  justify-content: flex-end;
  padding: 4px 0 8px;
}
.group-roster__notice {
  margin: 4px 0 8px;
}
.group-roster__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  padding: 0 0 10px;
}
.group-roster__summary:empty {
  padding: 0;
}
.group-roster__table :deep(.group-roster__row--link) {
  cursor: pointer;
}
.group-roster__name {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
}
.group-roster__members {
  word-break: break-word;
}
.group-roster__work-of {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
.group-roster__by {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.group-roster__chevron {
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
.group-cards {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-cards > li {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-cards__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  color: inherit;
  text-decoration: none;
}
.group-cards__link:active,
.group-cards__link:hover {
  background: var(--el-fill-color-light);
}
.group-cards__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.group-cards__name {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
  min-width: 0;
}
.group-cards__members {
  font-size: var(--app-text-sm);
  word-break: break-word;
}
.group-cards__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
}
.group-cards__action {
  padding: 0 12px;
}
.group-roster__no-group {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.group-roster__no-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.group-roster__no-group-note {
  margin: 0 0 8px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.group-roster__no-group-note a {
  margin-left: 6px;
}
.group-roster__no-group-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: var(--app-text-sm);
}
.group-roster__no-group-list li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.group-roster__more {
  margin: 8px 0 0;
  font-size: var(--app-text-sm);
}
</style>
