<script setup lang="ts">
// One student's gradebook (gradebook.get): every component of the grading
// scheme with what it comes to, computed now from posted grades, and the
// working behind it. Nothing is stored by reading it. The totals written down
// when grades were posted (computed grades, from grade.list) are shown beside
// it: those are what the student was shown, and they do not drift.
// Percentages are Core's own, to two places, as the written-down totals are.
// A total a person overrode shows the override beside the figure worked out,
// with its comment; whoever may regrade over the whole course overrides a
// total, takes an override off and comments on one here, and undoes final
// grades for the student.
//
// A student sees their own; staff pick a student, whose id goes in the path.
// Before one is picked, staff see the whole class at once (ClassGradebook),
// kept alive while a student's own is open.
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { read, type ToolOut } from '@/api/http'
import type { Decimal, GradeSummary, GradebookLine } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { isUuid, shortId } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import ClassGradebook from './components/ClassGradebook.vue'
import TotalMenu from './components/TotalMenu.vue'
import {
  formatPct,
  formatScore,
  fractionPercent,
  mulDecimals,
  parseWorking,
  shares,
  useGradeLookups,
} from './components/grading'

const props = defineProps<{ courseId: string; studentMemberId?: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)

const mine = computed(() => course.role === 'student')
/** Whose gradebook: the one in the path, or a student's own. */
const student = computed(() => props.studentMemberId || (mine.value ? (course.myMemberId ?? undefined) : undefined))
const isOwn = computed(() => !!student.value && student.value === course.myMemberId)
/** Staff with no student chosen: the whole class. */
const classWide = computed(() => !mine.value && !props.studentMemberId)

// ---------------------------------------------------------------------------
// Choosing a student
// ---------------------------------------------------------------------------

const pick = computed({
  get: () => props.studentMemberId,
  set: (v: string | string[] | undefined) => {
    const id = typeof v === 'string' && v.trim() ? v.trim() : undefined
    if (id && !isUuid(id)) {
      ElMessage({ type: 'warning', message: t('grades.gradebook.notAnId') })
      return
    }
    void router.push({
      name: 'course-gradebook',
      params: { courseId: props.courseId, studentMemberId: id },
    })
  },
})

if (!mine.value) void course.ensureMembers()
/**
 * The member list cannot be read (a tutor agent's seat): offer the students
 * whose work or grades this seat sees instead, and take a pasted member id.
 */
const rosterUnreadable = computed(
  () => !mine.value && (course.membersState === 'forbidden' || course.membersState === 'error'),
)
const seenStudents = useAsync(
  async () => {
    if (!rosterUnreadable.value || classWide.value) return []
    const ids = new Set<string>()
    async function collect(page: (after?: string) => Promise<{ ids: string[]; next?: string | null }>) {
      let after: string | undefined
      for (let i = 0; i < 5; i++) {
        const o = await page(after)
        o.ids.forEach((id) => ids.add(id))
        if (!o.next) break
        after = o.next
      }
    }
    await Promise.all([
      course.can('grade_read')
        ? collect((after) =>
            read('grade.list', { course_id: props.courseId, limit: 200, after }).then((o) => ({
              ids: (o.grades ?? []).map((g) => g.student_member_id),
              next: o.next,
            })),
          ).catch(() => undefined)
        : undefined,
      course.can('submission_read')
        ? collect((after) =>
            read('submission.list', { course_id: props.courseId, limit: 200, after }).then((o) => ({
              ids: (o.submissions ?? []).map((x) => x.student_member_id),
              next: o.next,
            })),
          ).catch(() => undefined)
        : undefined,
    ])
    return [...ids]
  },
  { watch: [rosterUnreadable, classWide] },
)
const studentOptions = computed(() => {
  const ids = new Set(seenStudents.data.value ?? [])
  if (props.studentMemberId) ids.add(props.studentMemberId)
  return [...ids]
    .map((id) => ({
      id,
      label: course.memberName(id) ?? t('grades.gradebook.studentShort', { id: shortId(id) }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

// ---------------------------------------------------------------------------
// The gradebook, and the totals written down at posting
// ---------------------------------------------------------------------------

const whatIf = ref(false)

/** An answer, with what it was asked for: the page never shows one student's figures under another's name. */
interface Book {
  student: string
  whatIf: boolean
  out: ToolOut<'gradebook.get'>
}
const book = useAsync<Book | undefined>(
  async () => {
    const s = student.value
    const w = whatIf.value
    if (!s) return undefined
    const out = await read('gradebook.get', {
      course_id: props.courseId,
      student_member_id: s,
      treat_ungraded_as_zero: w || undefined,
    })
    return { student: s, whatIf: w, out }
  },
  { watch: [student, whatIf], keepData: true },
)
/** The answer for the student in the path; while another's is all there is, nothing. */
const shown = computed(() => (book.data.value?.student === student.value ? book.data.value : undefined))
/** Whether the figures shown count ungraded work as zero: the answer's, not the switch's. */
const shownWhatIf = computed(() => !!shown.value?.whatIf)

// The totals written down at posting: live posted computed grades.
const snapshots = useAsync(
  async () => {
    const map = new Map<string, GradeSummary>()
    if (!student.value) return map
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const out = await read('grade.list', {
        course_id: props.courseId,
        student_member_id: student.value,
        limit: 200,
        after,
      })
      for (const g of out.grades ?? []) {
        if (g.origin === 'computed' && g.state === 'posted' && g.component_id) map.set(g.component_id, g)
      }
      if (!out.next) break
      after = out.next
    }
    return map
  },
  { watch: [student] },
)

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

interface Row {
  key: string
  kind: 'component' | 'assignment'
  id: string
  name: string | null
  fraction: Decimal | null
  /** Out of 100, to two places: Core's for a component, worked out alike for an assignment. */
  percent: string | null
  /** A person's override of the total, out of 100, which counts in its place above it. */
  overridePercent: string | null
  complete: boolean
  /** The child's weight, or the assignment's points, as the parent weighs it. */
  weight: Decimal | null
  /** Its part in the parent's result; null when it did not count. */
  share: number | null
  dropped: boolean
  dropLowest: number
  /** A directly graded component's, or the assignment's, points possible. */
  points: Decimal | null
  /** A bucket (assignments) or a parent (sub-components). */
  rolled: boolean
  isRoot: boolean
  snapshot?: GradeSummary
  children?: Row[]
}

const lines = computed(() => shown.value?.out.components ?? [])
const root = computed(() => lines.value[0])

const tree = computed<Row[]>(() => {
  const byId = new Map(lines.value.map((l) => [l.component_id, l]))
  const seen = new Set<string>()
  const snaps = snapshots.data.value
  function componentRow(
    line: GradebookLine,
    weight: Decimal | null,
    share: number | null,
    dropped: boolean,
    isRoot: boolean,
  ): Row {
    seen.add(line.component_id)
    const c = lookups.components.value.get(line.component_id)
    const items = line.items ?? []
    const shareOf = shares(items)
    const children: Row[] = []
    for (const it of items) {
      const sh = shareOf.get(it.id) ?? null
      if (it.kind === 'component') {
        const child = byId.get(it.id)
        if (child && !seen.has(it.id)) children.push(componentRow(child, it.weight, sh, !!it.dropped, false))
      } else {
        const graded = it.fraction !== null && it.fraction !== undefined
        children.push({
          key: `a:${it.id}`,
          kind: 'assignment',
          id: it.id,
          name: course.assignmentTitle(it.id),
          fraction: it.fraction,
          percent: graded ? fractionPercent(it.fraction) : null,
          overridePercent: null,
          complete: graded,
          weight: it.weight,
          share: sh,
          dropped: !!it.dropped,
          dropLowest: 0,
          points: it.weight,
          rolled: false,
          isRoot: false,
        })
      }
    }
    return {
      key: `c:${line.component_id}`,
      kind: 'component',
      id: line.component_id,
      name: isRoot ? t('grades.courseTotal') : line.name,
      fraction: line.fraction,
      percent: line.percent === null || line.percent === undefined ? null : formatPct(line.percent),
      overridePercent:
        line.override_percent === null || line.override_percent === undefined ? null : formatPct(line.override_percent),
      complete: line.complete,
      weight,
      share,
      dropped,
      dropLowest: c?.drop_lowest ?? 0,
      points: c?.points_possible ?? null,
      rolled: items.length > 0 || c?.points_possible === null || c?.points_possible === undefined,
      isRoot,
      snapshot: snaps?.get(line.component_id),
      children: children.length ? children : undefined,
    }
  }
  if (!root.value) return []
  return [componentRow(root.value, null, null, false, true)]
})

/**
 * The score behind a result: fraction × points, worked out exactly. The
 * fraction is score ÷ points to sixteen places, so ten places give back the
 * score as entered (9.125, not 9.13).
 */
function score(row: Row): string | null {
  if (row.fraction === null || row.fraction === undefined || row.points === null || row.points === undefined)
    return null
  if (row.rolled && row.kind === 'component') return null
  const s = mulDecimals(row.fraction, row.points)
  return s === null ? null : formatScore(s)
}

function shareText(row: Row): string | null {
  return row.share === null ? null : fractionPercent(row.share)
}

function openGrades(row: Row) {
  if (!student.value || row.kind !== 'assignment') return
  void router.push({
    name: 'course-grades',
    params: { courseId: props.courseId },
    query: {
      assignment: row.id,
      student: mine.value ? undefined : student.value,
    },
  })
}

/** The gradebook's own line for a component row: the percentage worked out, as Core gives it. */
function lineOf(row: Row): GradebookLine | undefined {
  return row.kind === 'component' ? lines.value.find((l) => l.component_id === row.id) : undefined
}

function refresh() {
  void book.reload()
  void snapshots.reload()
}

const rootSnapshot = computed(() => (root.value ? snapshots.data.value?.get(root.value.component_id) : undefined))
const rootRow = computed(() => tree.value[0])

// ---------------------------------------------------------------------------
// A person's say on a total: overrides and comments, and undoing final grades
// ---------------------------------------------------------------------------

/** A total spans every assignment: a seat listed to some reaches none (Core refuses it). */
const spansAssignments = computed(() => course.membership?.assignment_scope !== 'listed')
/** Overriding a total, or commenting on one, is a regrade: grade_submit and grade_post, over the whole course. */
const grader = computed(
  () => !mine.value && !isOwn.value && spansAssignments.value && course.canAll(['grade_submit', 'grade_post']),
)
// Every column of the breakdown where its card has the 930 px they take (1060
// with a grader's actions); with less, what they say goes under each line's
// name. By the card's own width (its title's), not the window's: the side bar
// takes from it.
const breakdownTitle = useTemplateRef<HTMLElement>('breakdownTitle')
const narrow = useContainerNarrow(breakdownTitle, () => (grader.value ? 1059 : 929))
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)
/** The words for a total, as its menu and dialogs name it. */
function totalName(row: Row): string {
  return row.isRoot ? t('grades.courseTotal') : t('activity.subject.componentTotal', { name: row.name ?? '' })
}
/** Who made an override and why, where Core says (to those who grade). */
function overrideDetail(g: GradeSummary | undefined): string {
  const o = g?.override
  if (!o) return ''
  const parts: string[] = []
  if (o.by_member_id) parts.push(t('grades.override.by', { name: course.memberName(o.by_member_id) ?? '' }))
  if (o.reason) parts.push(t('grades.override.why', { reason: o.reason }))
  return parts.join(' · ')
}

/** Undoing final grades (grade.undo_ungraded_as_zero) is posting's own undo: grade_post, over the whole course. */
const canUndoFinal = computed(() => !mine.value && spansAssignments.value && course.can('grade_post'))
const undoWrite = useWrite('grade.undo_ungraded_as_zero')
async function undoFinal() {
  const s = student.value
  if (!s) return
  try {
    await ElMessageBox.confirm(
      `${t('grades.undoFinal.confirmOne', { name: course.memberName(s) ?? t('grades.gradebook.studentShort', { id: shortId(s) }) })} ${t('grades.undoFinal.intro')}` +
        (course.needsApproval('grade_post') ? ` ${t('grades.undoFinal.approvalNote')}` : ''),
      t('grades.undoFinal.confirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('grades.undoFinal.confirmButton'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  const out = await undoWrite.run(
    { course_id: props.courseId, student_member_id: s },
    { success: false, reasons: 'grades.undoFinal.refusal' },
  )
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage({
      type: 'success',
      message: t('grades.undoFinal.done', { n: out.result.students, s: out.result.snapshots }, out.result.students),
    })
  }
  refresh()
}

/** The student's totals were written as final: ungraded work counts as zero from then on. */
const finalWritten = computed(
  () => !!rootSnapshot.value && !!parseWorking(rootSnapshot.value.breakdown)?.ungradedAsZero,
)

watch(
  () => props.studentMemberId,
  () => {
    whatIf.value = false
  },
)
</script>

<template>
  <!-- Kept alive while a student's gradebook is open: back to the class finds it as it was left. -->
  <KeepAlive>
    <ClassGradebook v-if="classWide" :course-id="courseId" />
  </KeepAlive>
  <div v-if="!classWide" class="gradebook">
    <PageHeader
      :title="t('grades.gradebook.title')"
      :subtitle="isOwn ? t('grades.gradebook.subtitleOwn') : t('grades.gradebook.subtitle')"
    >
      <router-link v-if="!mine" :to="{ name: 'course-gradebook', params: { courseId } }">
        <el-button>
          <el-icon><Grid /></el-icon>
          <span>{{ t('classbook.wholeClass') }}</span>
        </el-button>
      </router-link>
      <router-link
        :to="{
          name: 'course-grades',
          params: { courseId },
          query: mine || !student ? {} : { student },
        }"
      >
        <el-button>
          <el-icon><Medal /></el-icon>
          <span>{{ mine ? t('grades.mine.title') : t('grades.gradebook.toGrades') }}</span>
        </el-button>
      </router-link>
    </PageHeader>

    <section class="app-card gradebook__controls">
      <div v-if="!mine" class="gradebook__control">
        <span class="gradebook__control-label">{{ t('grades.columns.student') }}</span>
        <MemberSelect
          v-if="!rosterUnreadable"
          v-model="pick"
          role="student"
          include-inactive
          :placeholder="t('grades.gradebook.pickStudent')"
        />
        <el-select
          v-else
          v-model="pick"
          filterable
          allow-create
          default-first-option
          :loading="seenStudents.loading.value"
          :placeholder="t('grades.gradebook.pasteMemberId')"
          :no-data-text="t('grades.gradebook.noSeenStudents')"
          class="gradebook__pick"
        >
          <el-option v-for="o in studentOptions" :key="o.id" :value="o.id" :label="o.label" />
        </el-select>
      </div>
      <div class="gradebook__control gradebook__control--grow">
        <el-switch v-model="whatIf" :disabled="!student" />
        <div>
          <div class="gradebook__control-label">
            {{ t('grades.gradebook.whatIf') }}
          </div>
          <div class="app-form-hint">
            {{ t('grades.gradebook.whatIfHelp') }}
          </div>
        </div>
      </div>
      <el-button :disabled="!student" :loading="book.loading.value" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
    </section>

    <section v-if="!student" class="app-card">
      <el-empty :description="t('grades.gradebook.pickFirst')" />
    </section>

    <!-- Reloading the same student's figures keeps them under a spinner; another student's are not shown. -->
    <AsyncState
      v-else
      class="gradebook__body"
      :loading="book.loading.value"
      :error="book.error.value"
      :empty="!!shown && !lines.length"
      :empty-text="t('grades.gradebook.empty')"
      :overlay="!!shown"
      @retry="book.reload"
    >
      <template v-if="root">
        <section class="app-card gradebook__total">
          <div class="gradebook__total-main">
            <div class="gradebook__total-label">
              {{ t('grades.courseTotal') }}
              <span v-if="!isOwn && !mine" class="gradebook__who"> · <MemberName :id="student" /></span>
            </div>
            <div class="gradebook__total-value" :class="{ 'is-overridden': rootRow?.overridePercent }">
              {{ rootRow?.overridePercent ?? formatPct(root.percent) }}
            </div>
            <div v-if="rootRow?.overridePercent" class="gradebook__computed">
              {{ t('grades.override.computed', { value: formatPct(root.percent) }) }}
            </div>
            <div class="gradebook__total-tags">
              <el-tag v-if="root.fraction === null || root.fraction === undefined" type="info">
                {{ t('grades.gradebook.nothingYet') }}
              </el-tag>
              <el-tag v-else-if="!root.complete" type="warning">{{ t('grades.gradebook.soFar') }}</el-tag>
              <el-tag v-else type="success">{{ t('grades.gradebook.complete') }}</el-tag>
              <el-tag v-if="shownWhatIf" type="danger" effect="plain">{{ t('grades.gradebook.whatIfTag') }}</el-tag>
              <el-tooltip
                v-if="rootRow?.overridePercent"
                :content="overrideDetail(rootSnapshot)"
                :disabled="!overrideDetail(rootSnapshot)"
                placement="top"
              >
                <el-tag type="primary" effect="dark" class="gradebook__overridden" tabindex="0">
                  {{ t('grades.override.overridden') }}
                </el-tag>
              </el-tooltip>
            </div>
            <div v-if="grader && rootRow" class="gradebook__total-actions">
              <TotalMenu
                :course-id="courseId"
                :student-member-id="student"
                :component-id="rootRow.id"
                :what="totalName(rootRow)"
                :computed-percent="root.percent"
                :total="rootSnapshot ?? null"
                size="default"
                @changed="refresh"
              />
            </div>
          </div>
          <div class="gradebook__total-side">
            <p class="app-form-hint gradebook__explain">
              {{ shownWhatIf ? t('grades.gradebook.explainWhatIf') : t('grades.gradebook.explainSoFar') }}
            </p>
            <el-alert
              v-if="finalWritten && !shownWhatIf"
              type="warning"
              :closable="false"
              show-icon
              :title="isOwn ? t('grades.gradebook.finalWrittenOwn') : t('grades.gradebook.finalWritten')"
              class="gradebook__final"
            >
              <div class="gradebook__final-actions">
                <el-button size="small" @click="whatIf = true">{{ t('grades.gradebook.showFinal') }}</el-button>
                <el-tooltip
                  v-if="canUndoFinal"
                  :content="t('common.archivedCourse')"
                  :disabled="course.writable"
                  placement="top"
                >
                  <span>
                    <el-button
                      size="small"
                      :disabled="!course.writable"
                      :loading="undoWrite.pending.value"
                      @click="undoFinal"
                    >
                      <el-icon><RefreshLeft /></el-icon><span>{{ t('grades.undoFinal.one') }}</span>
                    </el-button>
                  </span>
                </el-tooltip>
                <el-tag
                  v-if="canUndoFinal && course.needsApproval('grade_post')"
                  size="small"
                  type="warning"
                  effect="plain"
                >
                  {{ t('enums.level.confirm_required') }}
                </el-tag>
              </div>
            </el-alert>
            <p v-if="rootSnapshot" class="gradebook__snapshot">
              <i18n-t keypath="common.pair" scope="global">
                <template #label>{{ t('grades.gradebook.lastWritten') }}</template>
                <template #value>
                  <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: rootSnapshot.id } }">{{
                    formatPct(rootSnapshot.override?.score ?? rootSnapshot.score)
                  }}</router-link>
                </template>
              </i18n-t>
              <span v-if="rootSnapshot.override" class="app-muted">{{
                t('grades.override.computed', { value: formatPct(rootSnapshot.score) })
              }}</span>
              <TimeText :value="rootSnapshot.posted_at" relative />
            </p>
            <p v-else-if="!snapshots.loading.value" class="app-form-hint gradebook__snapshot">
              {{ t('grades.gradebook.noSnapshot') }}
            </p>
            <div v-if="rootSnapshot?.feedback" class="gradebook__comment">
              <div class="gradebook__comment-label">
                <el-icon><ChatLineSquare /></el-icon>{{ t('grades.override.commentLabel') }}
              </div>
              <MarkdownView :source="rootSnapshot.feedback" />
            </div>
          </div>
        </section>

        <section class="app-card">
          <h2 ref="breakdownTitle" class="app-card__title">{{ t('grades.gradebook.breakdown') }}</h2>
          <el-table
            ref="tableRef"
            :data="tree"
            row-key="key"
            default-expand-all
            :tree-props="{ children: 'children' }"
            class="gradebook__table"
            :row-class-name="({ row }: { row: Row }) => (row.dropped ? 'is-dropped' : row.isRoot ? 'is-root' : '')"
          >
            <el-table-column :label="t('grades.gradebook.item')" :min-width="narrow ? 200 : 260">
              <template #default="{ row }">
                <div class="gradebook__namebox">
                  <span class="gradebook__name">
                    <el-icon v-if="row.kind === 'assignment'" class="gradebook__icon"><Document /></el-icon>
                    <el-icon v-else-if="row.rolled" class="gradebook__icon"><Folder /></el-icon>
                    <el-icon v-else class="gradebook__icon"><EditPen /></el-icon>
                    <a
                      v-if="row.kind === 'assignment'"
                      class="gradebook__link"
                      role="link"
                      tabindex="0"
                      @click="openGrades(row)"
                      @keydown.enter="openGrades(row)"
                    >
                      <span v-if="row.name">{{ row.name }}</span>
                      <IdText v-else :id="row.id" />
                    </a>
                    <span v-else-if="row.name">{{ row.name }}</span>
                    <IdText v-else :id="row.id" />
                  </span>
                  <!-- Narrow: what the other columns say, beneath the name -->
                  <span v-if="narrow" class="gradebook__sub">
                    <span v-if="score(row) !== null" class="gradebook__num"
                      >{{ score(row) }} / {{ formatScore(row.points) }}</span
                    >
                    <span v-else-if="!row.rolled && row.points !== null" class="gradebook__num app-muted"
                      >— / {{ formatScore(row.points) }}</span
                    >
                    <span v-if="row.weight !== null" class="gradebook__num app-muted">
                      {{ t('grades.gradebook.weight') }}
                      {{
                        row.kind === 'assignment'
                          ? t('grades.working.points', {
                              n: formatScore(row.weight),
                            })
                          : formatScore(row.weight)
                      }}
                      <template v-if="shareText(row) !== null">({{ shareText(row) }})</template>
                    </span>
                    <el-tag v-if="row.dropped" size="small" type="info">{{ t('grades.working.dropped') }}</el-tag>
                    <template v-if="row.kind === 'component'">
                      <el-tag
                        v-if="row.fraction === null || row.fraction === undefined"
                        size="small"
                        type="info"
                        effect="plain"
                      >
                        {{ t('grades.gradebook.nothingYet') }}
                      </el-tag>
                      <el-tag v-else-if="!row.complete" size="small" type="warning" effect="plain">
                        {{ t('grades.gradebook.incomplete') }}
                      </el-tag>
                    </template>
                    <el-tag v-if="row.dropLowest > 0" size="small" effect="plain">{{
                      t('grades.gradebook.dropLowest', { n: row.dropLowest })
                    }}</el-tag>
                    <TotalMenu
                      v-if="grader && row.kind === 'component' && !row.isRoot"
                      :course-id="courseId"
                      :student-member-id="student"
                      :component-id="row.id"
                      :what="totalName(row)"
                      :computed-percent="lineOf(row)?.percent ?? null"
                      :total="row.snapshot ?? null"
                      :direct="!row.rolled"
                      @changed="refresh"
                    />
                    <router-link
                      v-if="row.snapshot"
                      :to="{
                        name: 'course-grade',
                        params: { courseId, gradeId: row.snapshot.id },
                      }"
                      class="gradebook__num"
                    >
                      {{ t('grades.gradebook.snapshot') }}
                      {{ formatPct(row.snapshot.override?.score ?? row.snapshot.score) }}
                    </router-link>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('grades.gradebook.percent')" min-width="110" align="right">
              <template #default="{ row }">
                <template v-if="row.overridePercent !== null">
                  <el-tooltip
                    :content="overrideDetail(row.snapshot)"
                    :disabled="!overrideDetail(row.snapshot)"
                    placement="top"
                  >
                    <span class="gradebook__num gradebook__pct is-overridden" tabindex="0">
                      {{ row.overridePercent }}
                    </span>
                  </el-tooltip>
                  <div class="gradebook__computed">
                    <el-tag size="small" type="primary" effect="plain" disable-transitions>
                      {{ t('grades.override.overridden') }}
                    </el-tag>
                    {{ t('grades.override.computed', { value: row.percent ?? '—' }) }}
                  </div>
                </template>
                <span v-else-if="row.percent !== null" class="gradebook__num gradebook__pct">
                  {{ row.percent }}
                </span>
                <span v-else class="app-muted">{{ t('grades.working.notGraded') }}</span>
                <el-popover v-if="row.snapshot?.feedback && !row.isRoot" trigger="click" :width="320" placement="left">
                  <template #reference>
                    <el-button link type="primary" size="small" class="gradebook__comment-btn">
                      <el-icon><ChatLineSquare /></el-icon><span>{{ t('grades.override.comment') }}</span>
                    </el-button>
                  </template>
                  <MarkdownView :source="row.snapshot.feedback" />
                </el-popover>
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('grades.columns.score')" min-width="110" align="right">
              <template #default="{ row }">
                <span v-if="score(row) !== null" class="gradebook__num">
                  {{ score(row) }}
                  <span class="app-muted">/ {{ formatScore(row.points) }}</span>
                </span>
                <span v-else-if="!row.rolled && row.points !== null" class="app-muted gradebook__num">
                  — / {{ formatScore(row.points) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('grades.gradebook.weight')" min-width="130" align="right">
              <template #default="{ row }">
                <template v-if="row.weight !== null">
                  <span class="gradebook__num">
                    {{
                      row.kind === 'assignment'
                        ? t('grades.working.points', {
                            n: formatScore(row.weight),
                          })
                        : formatScore(row.weight)
                    }}
                  </span>
                  <span class="app-muted gradebook__share">{{ shareText(row) ?? '—' }}</span>
                </template>
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('grades.gradebook.status')" min-width="190">
              <template #default="{ row }">
                <span class="gradebook__tags">
                  <el-tag v-if="row.dropped" size="small" type="info">{{ t('grades.working.dropped') }}</el-tag>
                  <template v-if="row.kind === 'component'">
                    <el-tag
                      v-if="row.fraction === null || row.fraction === undefined"
                      size="small"
                      type="info"
                      effect="plain"
                    >
                      {{ t('grades.gradebook.nothingYet') }}
                    </el-tag>
                    <el-tag v-else-if="!row.complete" size="small" type="warning" effect="plain">
                      {{ t('grades.gradebook.incomplete') }}
                    </el-tag>
                    <el-tag v-if="row.dropLowest > 0" size="small" effect="plain">
                      {{ t('grades.gradebook.dropLowest', { n: row.dropLowest }) }}
                    </el-tag>
                  </template>
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="grader && !narrow" :label="t('grades.override.actions')" min-width="130">
              <template #default="{ row }">
                <TotalMenu
                  v-if="row.kind === 'component' && !row.isRoot"
                  :course-id="courseId"
                  :student-member-id="student"
                  :component-id="row.id"
                  :what="totalName(row)"
                  :computed-percent="lineOf(row)?.percent ?? null"
                  :total="row.snapshot ?? null"
                  :direct="!row.rolled"
                  @changed="refresh"
                />
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('grades.gradebook.snapshot')" min-width="130" align="right">
              <template #default="{ row }">
                <router-link
                  v-if="row.snapshot"
                  :to="{
                    name: 'course-grade',
                    params: { courseId, gradeId: row.snapshot.id },
                  }"
                  class="gradebook__num"
                  :title="t('grades.gradebook.snapshotHint')"
                >
                  {{ formatPct(row.snapshot.override?.score ?? row.snapshot.score) }}
                </router-link>
              </template>
            </el-table-column>
          </el-table>
          <ul class="gradebook__legend app-form-hint">
            <li>{{ t('grades.gradebook.legendBucket') }}</li>
            <li>{{ t('grades.gradebook.legendParent') }}</li>
            <li>{{ t('grades.gradebook.legendShare') }}</li>
            <li>{{ t('grades.gradebook.legendIncomplete') }}</li>
            <li>{{ t('grades.gradebook.legendSnapshot') }}</li>
          </ul>
        </section>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.gradebook__controls {
  display: flex;
  align-items: center;
  gap: 16px 24px;
  flex-wrap: wrap;
}
.gradebook__control {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gradebook__control--grow {
  flex: 1 1 280px;
}
.gradebook__control-label {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
}
.gradebook__control .app-form-hint {
  margin-top: 2px;
}
.gradebook__pick {
  width: 260px;
  max-width: 100%;
}
/* The cards inside are not siblings of the controls card, so .app-card + .app-card does not space them. */
.gradebook__body {
  margin-top: 16px;
}
.gradebook__total {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: center;
}
.gradebook__total-main {
  flex: 0 0 auto;
}
.gradebook__total-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.gradebook__who {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.gradebook__total-value {
  font-size: 40px;
  font-weight: 650;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.gradebook__total-value.is-overridden,
.gradebook__pct.is-overridden {
  color: var(--el-color-primary);
}
.gradebook__computed {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.gradebook__total-actions {
  margin-top: 10px;
}
.gradebook__final-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.gradebook__final-actions .el-button + .el-button {
  margin-left: 0;
}
.gradebook__comment {
  margin-top: 10px;
  padding: 8px 12px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
  border-radius: var(--app-radius-item);
}
.gradebook__comment-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.gradebook__comment-btn {
  margin-left: 6px;
}
.gradebook__total-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.gradebook__total-side {
  flex: 1 1 260px;
  min-width: 0;
}
.gradebook__final {
  margin-bottom: 8px;
}
.gradebook__explain {
  margin: 0 0 8px;
}
.gradebook__snapshot {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}
.gradebook__name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  word-break: break-word;
}
.gradebook__icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.gradebook__link {
  cursor: pointer;
  color: var(--el-color-primary);
}
.gradebook__link:hover {
  text-decoration: underline;
}
.gradebook__num {
  font-variant-numeric: tabular-nums;
}
.gradebook__pct {
  font-weight: 600;
}
.gradebook__share {
  margin-left: 6px;
  font-size: 12px;
}
.gradebook__tags {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}
/* Keep the tree's indent, the expander and the name on one line, the name wrapping within it. */
.gradebook__table :deep(td.el-table__cell:first-child .cell) {
  display: flex;
  align-items: flex-start;
}
.gradebook__table :deep(td.el-table__cell:first-child .cell > .el-table__expand-icon),
.gradebook__table :deep(td.el-table__cell:first-child .cell > .el-table__placeholder) {
  margin-top: 2px;
}
.gradebook__table :deep(td.el-table__cell:first-child .cell > .el-table__indent),
.gradebook__table :deep(td.el-table__cell:first-child .cell > .el-table__placeholder),
.gradebook__table :deep(td.el-table__cell:first-child .cell > .el-table__expand-icon) {
  flex-shrink: 0;
}
.gradebook__name {
  min-width: 0;
}
.gradebook__namebox {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gradebook__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
}
.gradebook__table :deep(.is-dropped) {
  color: var(--el-text-color-secondary);
}
.gradebook__table :deep(.is-dropped .gradebook__name) {
  text-decoration: line-through;
}
.gradebook__table :deep(.is-root) {
  font-weight: 600;
}
.gradebook__legend {
  margin: 12px 0 0;
  padding-left: 18px;
}
</style>
