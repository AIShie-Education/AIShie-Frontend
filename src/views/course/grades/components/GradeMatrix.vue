<script setup lang="ts">
// The class's gradebook as a table: a row for each student, a column for
// each assignment, directly graded component and total, the header row and
// the students' names held in place as it scrolls either way, and the class's
// averages along its foot. Only the rows near the screen are drawn (a class
// of hundreds has thousands of cells): the rows above and below are blank
// space of their height, every row being the same height. A column's heading
// sorts by it; a student's name opens their gradebook, a grade the grade.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { formatNumber } from '@/utils/format'
import { formatPct, formatScore } from './grading'
import type { ColumnSummary, MatrixCell, MatrixColumn, MatrixRow, MatrixStudent, SortBy } from './classMatrix'
import { NO_CELL } from './classMatrix'

const props = defineProps<{
  courseId: string
  columns: readonly MatrixColumn[]
  rows: readonly MatrixRow[]
  /** Every student in the class, for the row count a screen reader is told. */
  total: number
  sort: SortBy
  summaries: ReadonlyMap<string, ColumnSummary>
  nameOf: (s: MatrixStudent) => string
  titleOf: (c: MatrixColumn) => string
}>()
const emit = defineEmits<{ sort: [key: string] }>()
const { t } = useI18n()
const router = useRouter()

/** Every row is this tall, so that where each is can be worked out from the scroll alone. */
const ROW = 44
/** Rows drawn beyond the screen each way, so that a quick scroll does not show blank space. */
const OVERSCAN = 8
const NAME_WIDTH = 208
const widthOf = (c: MatrixColumn) => (c.kind === 'total' ? 96 : 104)
const tableWidth = computed(() => NAME_WIDTH + props.columns.reduce((s, c) => s + widthOf(c), 0))

// ---------------------------------------------------------------------------
// What is near the screen
// ---------------------------------------------------------------------------

const scroller = useTemplateRef<HTMLElement>('scroller')
const scrollTop = ref(0)
const viewport = ref(720)
let frame = 0
function onScroll() {
  if (frame) return
  const update = () => {
    frame = 0
    scrollTop.value = scroller.value?.scrollTop ?? 0
  }
  if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(update)
  else update()
}
let observer: ResizeObserver | null = null
onMounted(() => {
  const el = scroller.value
  if (!el) return
  viewport.value = el.clientHeight || viewport.value
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    const h = entries.at(-1)?.contentRect.height
    if (h) viewport.value = h
  })
  observer.observe(el)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
})
// Rows filtered or sorted anew: back to the top, where the change is seen.
watch(
  () => props.rows,
  () => {
    if (scroller.value && scroller.value.scrollTop > 0) scroller.value.scrollTop = 0
    scrollTop.value = 0
  },
)

const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW) - OVERSCAN))
const last = computed(() => Math.min(props.rows.length, Math.ceil((scrollTop.value + viewport.value) / ROW) + OVERSCAN))
const padTop = computed(() => first.value * ROW)
const padBottom = computed(() => (props.rows.length - last.value) * ROW)

// ---------------------------------------------------------------------------
// Links, worked out once and filled in for each row: a router.resolve for
// every cell drawn would cost more than the drawing.
// ---------------------------------------------------------------------------

const ID = '00000000-0000-0000-0000-00000000cafe'
const gradeLink = computed(() =>
  router.resolve({ name: 'course-grade', params: { courseId: props.courseId, gradeId: ID } }),
)
const bookLink = computed(() =>
  router.resolve({ name: 'course-gradebook', params: { courseId: props.courseId, studentMemberId: ID } }),
)
const href = (base: { href: string }, id: string) => base.href.replace(ID, id)
/** A plain click on a link of the table goes there in the app; a click with a modifier is the browser's. */
function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = (e.target as Element | null)?.closest?.('a[data-to]')
  if (!a) return
  e.preventDefault()
  void router.push(a.getAttribute('data-to')!)
}

// ---------------------------------------------------------------------------
// The rows drawn, each cell's words worked out once
// ---------------------------------------------------------------------------

interface CellView {
  key: string
  col: MatrixColumn
  cell: MatrixCell
  text: string
  title: string
}
function scoreText(cell: MatrixCell, col: MatrixColumn): string {
  if (cell.score === null) return ''
  return col.kind === 'total' ? formatPct(cell.score) : formatScore(cell.score)
}
function cellTitle(cell: MatrixCell, text: string): string {
  if (cell.state === 'draft')
    return cell.postedScore !== null && cell.postedScore !== undefined
      ? t('classbook.draftOver', { score: formatScore(cell.postedScore) })
      : t('classbook.draftOnly')
  if (cell.overridden) return `${text} · ${t('classbook.state.overridden')}`
  return ''
}
const drawn = computed(() =>
  props.rows.slice(first.value, last.value).map((row, i) => ({
    row,
    index: first.value + i,
    name: props.nameOf(row.student),
    book: href(bookLink.value, row.student.id),
    bookTo: bookLink.value.fullPath.replace(ID, row.student.id),
    cells: props.columns.map<CellView>((col) => {
      const cell = row.cells[col.key] ?? NO_CELL
      const text = scoreText(cell, col)
      return { key: col.key, col, cell, text, title: cellTitle(cell, text) }
    }),
  })),
)

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
  if (props.sort.key !== key) return 'none'
  return props.sort.dir === 'asc' ? 'ascending' : 'descending'
}
function outOf(col: MatrixColumn): string {
  return col.kind === 'total' ? '%' : t('classbook.outOf', { n: formatScore(col.outOf) })
}
function gradesOf(col: MatrixColumn) {
  return { name: 'course-grades', params: { courseId: props.courseId }, query: { assignment: col.id } }
}
function mean(col: MatrixColumn): string {
  const m = props.summaries.get(col.key)?.mean
  if (m === null || m === undefined) return '—'
  return col.kind === 'total' ? `${formatNumber(m, 2)}%` : formatNumber(m, 2)
}
function meanHint(col: MatrixColumn): string {
  const s = props.summaries.get(col.key)
  return t('classbook.averageHint', { posted: s?.posted ?? 0, drafts: s?.drafts ?? 0 })
}
</script>

<template>
  <div
    ref="scroller"
    class="matrix"
    role="region"
    tabindex="0"
    :aria-label="t('grades.gradebook.title')"
    @scroll.passive="onScroll"
  >
    <table
      class="matrix__table"
      :style="{ width: `${tableWidth}px` }"
      :aria-rowcount="total + 2"
      :aria-colcount="columns.length + 1"
      @click="onClick"
    >
      <colgroup>
        <col :style="{ width: `${NAME_WIDTH}px` }" />
        <col v-for="c in columns" :key="c.key" :style="{ width: `${widthOf(c)}px` }" />
      </colgroup>
      <thead>
        <tr aria-rowindex="1">
          <th scope="col" class="matrix__corner" :aria-sort="ariaSort('name')">
            <button type="button" class="matrix__sort" @click="emit('sort', 'name')">
              <span class="matrix__head-title">{{ t('classbook.student') }}</span>
              <el-icon v-if="sort.key === 'name'" class="matrix__arrow" aria-hidden="true">
                <component :is="sort.dir === 'asc' ? 'SortUp' : 'SortDown'" />
              </el-icon>
            </button>
          </th>
          <th
            v-for="c in columns"
            :key="c.key"
            scope="col"
            class="matrix__head"
            :class="[`is-${c.kind}`, { 'is-root': c.isRoot, 'is-practice': !c.counted }]"
            :aria-sort="ariaSort(c.key)"
          >
            <div class="matrix__group" :title="c.group ?? ''">
              {{ c.counted ? (c.group ?? '') : t('classbook.practice') }}
            </div>
            <button
              type="button"
              class="matrix__sort"
              :title="titleOf(c)"
              :aria-label="t('classbook.sortBy', { name: titleOf(c) })"
              @click="emit('sort', c.key)"
            >
              <span class="matrix__head-title">{{ titleOf(c) }}</span>
              <el-icon v-if="sort.key === c.key" class="matrix__arrow" aria-hidden="true">
                <component :is="sort.dir === 'asc' ? 'SortUp' : 'SortDown'" />
              </el-icon>
            </button>
            <div class="matrix__outof">
              <span>{{ outOf(c) }}</span>
              <router-link
                v-if="c.kind === 'assignment'"
                :to="gradesOf(c)"
                class="matrix__open"
                :aria-label="t('classbook.openGrades', { name: titleOf(c) })"
                :title="t('classbook.openGrades', { name: titleOf(c) })"
              >
                <el-icon aria-hidden="true"><Medal /></el-icon>
              </router-link>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="padTop" class="matrix__pad" aria-hidden="true">
          <td :colspan="columns.length + 1" :style="{ height: `${padTop}px` }" />
        </tr>
        <tr v-for="d in drawn" :key="d.row.student.id" class="matrix__row" :aria-rowindex="d.index + 2">
          <th scope="row" class="matrix__name">
            <a
              :href="d.book"
              :data-to="d.bookTo"
              class="matrix__student"
              :title="t('classbook.openGradebook', { name: d.name })"
            >
              <span class="matrix__student-name">{{ d.name }}</span>
              <span v-if="d.row.student.loginId" class="matrix__login">{{ d.row.student.loginId }}</span>
            </a>
          </th>
          <td
            v-for="v in d.cells"
            :key="v.key"
            class="matrix__cell"
            :class="[`is-${v.cell.state}`, `is-${v.col.kind}`, { 'is-root': v.col.isRoot }]"
          >
            <a
              v-if="v.cell.gradeId"
              :href="href(gradeLink, v.cell.gradeId)"
              :data-to="gradeLink.fullPath.replace(ID, v.cell.gradeId)"
              class="matrix__value"
              :title="v.title || t('classbook.openGrade')"
            >
              <span class="matrix__score">{{ v.text }}</span>
              <template v-if="v.cell.overridden">
                <span class="matrix__star" aria-hidden="true">*</span>
                <span class="matrix__sr">{{ t('classbook.state.overridden') }}</span>
              </template>
              <span v-if="v.cell.state === 'draft'" class="matrix__flag is-draft">{{
                t('classbook.state.draft')
              }}</span>
            </a>
            <span v-else-if="v.cell.state === 'missing'" class="matrix__flag is-missing">{{
              t('classbook.state.missing')
            }}</span>
            <span v-else-if="v.cell.state === 'submitted'" class="matrix__flag is-wait">{{
              t('classbook.state.toGrade')
            }}</span>
            <span v-else class="matrix__none">
              <span aria-hidden="true">–</span>
              <span class="matrix__sr">{{ t('classbook.state.none') }}</span>
            </span>
          </td>
        </tr>
        <tr v-if="padBottom" class="matrix__pad" aria-hidden="true">
          <td :colspan="columns.length + 1" :style="{ height: `${padBottom}px` }" />
        </tr>
      </tbody>
      <tfoot>
        <tr :aria-rowindex="total + 2">
          <th scope="row" class="matrix__name matrix__foot-label">{{ t('classbook.average') }}</th>
          <td
            v-for="c in columns"
            :key="c.key"
            class="matrix__foot"
            :class="[`is-${c.kind}`, { 'is-root': c.isRoot }]"
            :title="meanHint(c)"
          >
            {{ mean(c) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
/*
 * The table scrolls in a box of its own, so that its header row stays at
 * the top and the names at the left as it scrolls either way, and the
 * averages at its foot. Rows are a fixed 44 px, which the drawing of only
 * the rows near the screen relies on.
 */
.matrix {
  position: relative;
  width: fit-content;
  max-width: 100%;
  overflow: auto;
  max-height: max(360px, calc(100dvh - 300px));
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  overscroll-behavior: contain;
}
.matrix:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.matrix__table {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.matrix__table th,
.matrix__table td {
  padding: 0 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-right: 1px solid var(--el-border-color-extra-light);
  background: var(--app-card, var(--el-bg-color));
  box-sizing: border-box;
}
.matrix__row {
  height: 44px;
}
.matrix__row > th,
.matrix__row > td {
  height: 44px;
  max-height: 44px;
  overflow: hidden;
  white-space: nowrap;
}
.matrix__pad td {
  padding: 0;
  border: 0;
  background: transparent;
}
/* The header row, the names, and the corner where they meet, held in place. */
.matrix__table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  vertical-align: bottom;
  padding-top: 6px;
  padding-bottom: 6px;
  text-align: left;
  font-weight: 500;
  border-bottom: 1px solid var(--el-border-color);
}
.matrix__table tbody th,
.matrix__table tfoot th {
  position: sticky;
  left: 0;
  z-index: 1;
  text-align: left;
  font-weight: 400;
  border-right: 1px solid var(--el-border-color);
}
.matrix__table thead th.matrix__corner {
  left: 0;
  z-index: 3;
  border-right: 1px solid var(--el-border-color);
}
.matrix__table tfoot th,
.matrix__table tfoot td {
  position: sticky;
  bottom: 0;
  height: 40px;
  border-top: 1px solid var(--el-border-color);
  border-bottom: 0;
  background: var(--el-fill-color-light);
  font-weight: 600;
}
.matrix__table tfoot th {
  z-index: 3;
}
.matrix__table tfoot td {
  z-index: 2;
  text-align: right;
}
.matrix__group {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 15px;
}
.matrix__sort {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.matrix__sort:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
  border-radius: 2px;
}
.matrix__head-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
  word-break: break-word;
}
.matrix__corner .matrix__head-title {
  font-weight: 600;
}
.matrix__arrow {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--el-color-primary);
}
.matrix__outof {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.matrix__open {
  display: inline-flex;
  color: var(--el-text-color-secondary);
}
.matrix__open:hover,
.matrix__open:focus-visible {
  color: var(--el-color-primary);
}
.matrix__head.is-total .matrix__head-title {
  font-weight: 600;
}
/* Totals stand apart from the work they add up: a tint, and a heavier figure. */
.matrix__table .is-total:not(.matrix__foot) {
  background: var(--el-fill-color-lighter);
}
.matrix__table thead .is-total {
  background: var(--el-fill-color-light);
}
.matrix__student {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  min-width: 0;
  color: var(--el-text-color-primary);
  text-decoration: none;
}
.matrix__student:hover .matrix__student-name,
.matrix__student:focus-visible .matrix__student-name {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.matrix__student-name,
.matrix__login {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.matrix__student-name {
  font-weight: 500;
}
.matrix__login {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.matrix__cell {
  text-align: right;
}
.matrix__value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
}
.matrix__value:hover .matrix__score,
.matrix__value:focus-visible .matrix__score {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.matrix__cell.is-total .matrix__score {
  font-weight: 600;
}
.matrix__star {
  color: var(--el-color-primary);
  font-weight: 700;
}
/* A draft is set apart in words and in its figure, never by colour alone. */
.matrix__cell.is-draft .matrix__score {
  font-style: italic;
  color: var(--el-text-color-regular);
}
.matrix__flag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  border: 1px solid currentColor;
}
.matrix__flag.is-draft {
  border-style: dashed;
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
  background: var(--el-color-warning-light-9);
}
.matrix__flag.is-missing {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  font-weight: 600;
}
.matrix__flag.is-wait {
  border-style: dotted;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
.matrix__none {
  color: var(--el-text-color-placeholder);
}
.matrix__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.matrix__foot-label {
  font-weight: 600;
}
</style>
