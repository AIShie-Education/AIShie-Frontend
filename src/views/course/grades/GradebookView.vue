<script setup lang="ts">
// One student's gradebook (gradebook.get): every component of the grading
// scheme with what it comes to, computed now from posted grades, and the
// working behind it. Nothing is stored by reading it. The totals written down
// when grades were posted (computed grades, from grade.list) are shown beside
// it: those are what the student was shown, and they do not drift.
//
// A student sees their own; staff pick a student, whose id goes in the path.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { Decimal, GradeSummary, GradebookLine } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatDecimal, formatFraction } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import { parseWorking, useGradeLookups, useNarrow } from './components/grading'

const props = defineProps<{ courseId: string; studentMemberId?: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
const lookups = useGradeLookups(() => props.courseId)
const narrow = useNarrow()

const mine = computed(() => course.role === 'student')
/** Whose gradebook: the one in the path, or a student's own. */
const student = computed(() => props.studentMemberId || (mine.value ? (course.myMemberId ?? undefined) : undefined))
const isOwn = computed(() => !!student.value && student.value === course.myMemberId)

const pick = computed({
  get: () => props.studentMemberId,
  set: (v: string | string[] | undefined) => {
    const id = typeof v === 'string' && v ? v : undefined
    void router.push({
      name: 'course-gradebook',
      params: { courseId: props.courseId, studentMemberId: id },
    })
  },
})

const whatIf = ref(false)

const book = useAsync(
  async () => {
    if (!student.value) return undefined
    return read('gradebook.get', {
      course_id: props.courseId,
      student_member_id: student.value,
      treat_ungraded_as_zero: whatIf.value || undefined,
    })
  },
  { watch: [student, whatIf], keepData: true },
)

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
  complete: boolean
  /** The child's weight, or the assignment's points, as the parent weighs it. */
  weight: Decimal | null
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

const lines = computed(() => book.data.value?.components ?? [])
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
    const total = items.reduce((s, i) => s + (Number(i.weight) || 0), 0)
    const children: Row[] = []
    for (const it of items) {
      const sh = total ? (Number(it.weight) || 0) / total : null
      if (it.kind === 'component') {
        const child = byId.get(it.id)
        if (child && !seen.has(it.id)) children.push(componentRow(child, it.weight, sh, !!it.dropped, false))
      } else {
        children.push({
          key: `a:${it.id}`,
          kind: 'assignment',
          id: it.id,
          name: course.assignmentTitle(it.id),
          fraction: it.fraction,
          complete: it.fraction !== null && it.fraction !== undefined,
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

function score(row: Row): string | null {
  if (row.fraction === null || row.fraction === undefined || row.points === null || row.points === undefined)
    return null
  if (row.rolled && row.kind === 'component') return null
  return formatDecimal(Number(row.fraction) * Number(row.points))
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

function refresh() {
  void book.reload()
  void snapshots.reload()
}

const rootSnapshot = computed(() => (root.value ? snapshots.data.value?.get(root.value.component_id) : undefined))

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
  <div class="gradebook">
    <PageHeader
      :title="t('grades.gradebook.title')"
      :subtitle="isOwn ? t('grades.gradebook.subtitleOwn') : t('grades.gradebook.subtitle')"
    >
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
        <MemberSelect v-model="pick" role="student" include-inactive :placeholder="t('grades.gradebook.pickStudent')" />
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

    <AsyncState
      v-else
      :loading="book.loading.value && !book.data.value"
      :error="book.error.value"
      :empty="!!book.data.value && !lines.length"
      :empty-text="t('grades.gradebook.empty')"
      overlay
      @retry="book.reload"
    >
      <template v-if="root">
        <section class="app-card gradebook__total">
          <div class="gradebook__total-main">
            <div class="gradebook__total-label">
              {{ t('grades.courseTotal') }}
              <span v-if="!isOwn && !mine" class="gradebook__who"> · <MemberName :id="student" /></span>
            </div>
            <div class="gradebook__total-value">
              {{ formatFraction(root.fraction) }}
            </div>
            <div class="gradebook__total-tags">
              <el-tag v-if="root.fraction === null || root.fraction === undefined" type="info">
                {{ t('grades.gradebook.nothingYet') }}
              </el-tag>
              <el-tag v-else-if="!root.complete" type="warning">{{ t('grades.gradebook.soFar') }}</el-tag>
              <el-tag v-else type="success">{{ t('grades.gradebook.complete') }}</el-tag>
              <el-tag v-if="whatIf" type="danger" effect="plain">{{ t('grades.gradebook.whatIfTag') }}</el-tag>
            </div>
          </div>
          <div class="gradebook__total-side">
            <p class="app-form-hint gradebook__explain">
              {{ whatIf ? t('grades.gradebook.explainWhatIf') : t('grades.gradebook.explainSoFar') }}
            </p>
            <el-alert
              v-if="finalWritten && !whatIf"
              type="warning"
              :closable="false"
              show-icon
              :title="isOwn ? t('grades.gradebook.finalWrittenOwn') : t('grades.gradebook.finalWritten')"
              class="gradebook__final"
            >
              <el-button size="small" @click="whatIf = true">{{ t('grades.gradebook.showFinal') }}</el-button>
            </el-alert>
            <p v-if="rootSnapshot" class="gradebook__snapshot">
              {{ t('grades.gradebook.lastWritten') }}
              <router-link
                :to="{
                  name: 'course-grade',
                  params: { courseId, gradeId: rootSnapshot.id },
                }"
              >
                {{ formatDecimal(rootSnapshot.score) }}%
              </router-link>
              <TimeText :value="rootSnapshot.posted_at" relative />
            </p>
            <p v-else-if="!snapshots.loading.value" class="app-form-hint gradebook__snapshot">
              {{ t('grades.gradebook.noSnapshot') }}
            </p>
          </div>
        </section>

        <section class="app-card">
          <h2 class="app-card__title">{{ t('grades.gradebook.breakdown') }}</h2>
          <el-table
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
                  <!-- Phone width: what the other columns say, beneath the name -->
                  <span v-if="narrow" class="gradebook__sub">
                    <span v-if="score(row) !== null" class="gradebook__num"
                      >{{ score(row) }} / {{ formatDecimal(row.points) }}</span
                    >
                    <span v-if="row.weight !== null" class="gradebook__num app-muted">
                      {{ t('grades.gradebook.weight') }}
                      {{
                        row.kind === 'assignment'
                          ? t('grades.working.points', {
                              n: formatDecimal(row.weight),
                            })
                          : formatDecimal(row.weight)
                      }}
                      <template v-if="row.share !== null">({{ formatFraction(row.share) }})</template>
                    </span>
                    <el-tag v-if="row.dropped" size="small" type="info">{{ t('grades.working.dropped') }}</el-tag>
                    <el-tag
                      v-if="
                        row.kind === 'component' && row.fraction !== null && row.fraction !== undefined && !row.complete
                      "
                      size="small"
                      type="warning"
                      effect="plain"
                    >
                      {{ t('grades.gradebook.incomplete') }}
                    </el-tag>
                    <el-tag v-if="row.dropLowest > 0" size="small" effect="plain">{{
                      t('grades.gradebook.dropLowest', { n: row.dropLowest })
                    }}</el-tag>
                    <router-link
                      v-if="row.snapshot"
                      :to="{
                        name: 'course-grade',
                        params: { courseId, gradeId: row.snapshot.id },
                      }"
                      class="gradebook__num"
                    >
                      {{ t('grades.gradebook.snapshot') }}
                      {{ formatDecimal(row.snapshot.score) }}%
                    </router-link>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('grades.gradebook.percent')" min-width="110" align="right">
              <template #default="{ row }">
                <span v-if="row.fraction !== null && row.fraction !== undefined" class="gradebook__num gradebook__pct">
                  {{ formatFraction(row.fraction) }}
                </span>
                <span v-else class="app-muted">{{ t('grades.working.notGraded') }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="!narrow" :label="t('grades.columns.score')" min-width="110" align="right">
              <template #default="{ row }">
                <span v-if="score(row) !== null" class="gradebook__num">
                  {{ score(row) }}
                  <span class="app-muted">/ {{ formatDecimal(row.points) }}</span>
                </span>
                <span v-else-if="!row.rolled && row.points !== null" class="app-muted gradebook__num">
                  — / {{ formatDecimal(row.points) }}
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
                            n: formatDecimal(row.weight),
                          })
                        : formatDecimal(row.weight)
                    }}
                  </span>
                  <span v-if="row.share !== null" class="app-muted gradebook__share">{{
                    formatFraction(row.share)
                  }}</span>
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
                  {{ formatDecimal(row.snapshot.score) }}%
                </router-link>
              </template>
            </el-table-column>
          </el-table>
          <ul class="gradebook__legend app-form-hint">
            <li>{{ t('grades.gradebook.legendBucket') }}</li>
            <li>{{ t('grades.gradebook.legendParent') }}</li>
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
