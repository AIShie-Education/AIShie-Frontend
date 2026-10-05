<script setup lang="ts">
// The class's gradebook where it is as narrow as a phone: a line for each
// student, with their course total and what waits on them (drafts, missing
// work, work to grade), which opens on the list of their grades, column by
// column, and a way to their own gradebook. A matrix of students by
// assignments does not fit such a width; a list a student at a time does.
// Scores are shown as the table shows them, to two decimal places at most,
// every place for a screen reader; a draft says the posted grade it would
// replace under it. A grade given from a group's says so beside it, and
// whether the member's score was set apart from the group's.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { classFigure, formatScore } from './grading'
import type { MatrixCell, MatrixColumn, MatrixRow, MatrixStudent } from './classMatrix'
import { NO_CELL } from './classMatrix'
import GroupGlyph from './GroupGlyph.vue'

const props = defineProps<{
  courseId: string
  columns: readonly MatrixColumn[]
  rows: readonly MatrixRow[]
  nameOf: (s: MatrixStudent) => string
  titleOf: (c: MatrixColumn) => string
}>()
const { t } = useI18n()

const open = ref<Set<string>>(new Set())
function toggle(id: string) {
  const next = new Set(open.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  open.value = next
}

/** The course total's column, where the seat sees one. */
const totalColumn = computed(() => props.columns.find((c) => c.isRoot) ?? null)
/** What each student's line opens on: every column but the course total, which the line shows. */
const listed = computed(() => props.columns.filter((c) => !c.isRoot))

/** A cell's score as shown (to two places at most), and with every place where that is longer. */
function scoreText(cell: MatrixCell, col: MatrixColumn): { text: string; full: string | null } {
  if (cell.score === null) return { text: '', full: null }
  const f = classFigure(cell.score, col.kind === 'total')
  if (col.kind === 'total') return f
  const of = ` ${t('classbook.outOf', { n: formatScore(col.outOf) })}`
  return { text: f.text + of, full: f.full && f.full + of }
}
/** The course total shown on the line, or null where there is none. */
function totalOf(row: MatrixRow): { text: string; full: string | null } | null {
  const c = totalColumn.value
  const cell = c ? row.cells[c.key] : undefined
  return c && cell ? scoreText(cell, c) : null
}
/** For a draft over a posted grade, the posted score it would replace. */
function postedOf(cell: MatrixCell): { text: string; full: string | null } | null {
  if (cell.state !== 'draft' || cell.postedScore === null || cell.postedScore === undefined) return null
  return classFigure(cell.postedScore)
}
const cellOf = (row: MatrixRow, col: MatrixColumn) => row.cells[col.key] ?? NO_CELL
/** Paused or removed, said beside the name; nothing for a student who is simply in the class. */
function statusOf(s: MatrixStudent): string | null {
  return s.status === 'paused' || s.status === 'removed' ? t(`enums.memberStatus.${s.status}`) : null
}
/** A grade given from a group's, in words: whose group, and how the member's score was set apart. */
function groupWords(cell: MatrixCell): string | null {
  const g = cell.group
  if (!g) return null
  const of = g.name ? t('groupGrading.classbook.groupOf', { name: g.name }) : t('groupGrading.mark.group')
  if (g.adjusted === 'grader') return t('groupGrading.classbook.adjusted', { group: of })
  if (g.adjusted === 'peer') return t('groupGrading.classbook.peer', { group: of })
  return t('groupGrading.classbook.sentence', { group: of })
}
const headId = (id: string) => `sgl-head-${id}`
const bodyId = (id: string) => `sgl-body-${id}`
</script>

<template>
  <ul class="sgl">
    <li v-for="r in rows" :key="r.student.id" class="sgl__item">
      <button
        :id="headId(r.student.id)"
        type="button"
        class="sgl__head"
        :aria-expanded="open.has(r.student.id)"
        :aria-controls="bodyId(r.student.id)"
        @click="toggle(r.student.id)"
      >
        <span class="sgl__who">
          <span class="sgl__name"
            >{{ nameOf(r.student)
            }}<span v-if="statusOf(r.student)" class="sgl__status" :class="`is-${r.student.status}`">{{
              statusOf(r.student)
            }}</span></span
          >
          <span v-if="r.student.loginId" class="sgl__login">{{ r.student.loginId }}</span>
          <span v-if="r.drafts || r.missing || r.toGrade" class="sgl__counts">
            <span v-if="r.drafts" class="sgl__flag is-draft">{{
              t('classbook.counts.drafts', { n: r.drafts }, r.drafts)
            }}</span>
            <span v-if="r.missing" class="sgl__flag is-missing">{{
              t('classbook.counts.missing', { n: r.missing })
            }}</span>
            <span v-if="r.toGrade" class="sgl__flag is-wait">{{
              t('classbook.counts.toGrade', { n: r.toGrade })
            }}</span>
          </span>
        </span>
        <span v-if="totalColumn" class="sgl__total">
          <span class="sgl__total-label">{{ t('grades.courseTotal') }}</span>
          <span v-if="totalOf(r) === null" class="sgl__total-value sgl__none"
            ><span aria-hidden="true">–</span><span class="sgl__sr">{{ t('classbook.state.none') }}</span></span
          >
          <span v-else class="sgl__total-value">
            <span :aria-hidden="totalOf(r)!.full ? 'true' : undefined">{{ totalOf(r)!.text }}</span
            ><span v-if="totalOf(r)!.full" class="sgl__sr">{{ totalOf(r)!.full }}</span
            ><template v-if="r.cells[totalColumn.key]?.overridden"
              ><span aria-hidden="true">*</span
              ><span class="sgl__sr">{{ t('classbook.state.overridden') }}</span></template
            >
          </span>
        </span>
        <el-icon class="sgl__chev" :class="{ 'is-open': open.has(r.student.id) }" aria-hidden="true"
          ><ArrowDown
        /></el-icon>
      </button>
      <div
        v-if="open.has(r.student.id)"
        :id="bodyId(r.student.id)"
        class="sgl__body"
        role="region"
        :aria-labelledby="headId(r.student.id)"
      >
        <ul class="sgl__grades">
          <li v-for="c in listed" :key="c.key" class="sgl__grade" :class="`is-${c.kind}`">
            <span class="sgl__what">
              <span v-if="c.group || !c.counted" class="sgl__group">{{
                c.counted ? c.group : t('classbook.practice')
              }}</span>
              <span>{{ titleOf(c) }}</span>
            </span>
            <span class="sgl__value">
              <template v-if="cellOf(r, c).gradeId">
                <span class="sgl__line">
                  <router-link
                    :to="{ name: 'course-grade', params: { courseId, gradeId: cellOf(r, c).gradeId } }"
                    class="sgl__score"
                    :class="{ 'is-draft': cellOf(r, c).state === 'draft' }"
                    ><span :aria-hidden="scoreText(cellOf(r, c), c).full ? 'true' : undefined">{{
                      scoreText(cellOf(r, c), c).text
                    }}</span
                    ><span v-if="scoreText(cellOf(r, c), c).full" class="sgl__sr">{{
                      scoreText(cellOf(r, c), c).full
                    }}</span></router-link
                  >
                  <template v-if="cellOf(r, c).overridden"
                    ><span aria-hidden="true">*</span
                    ><span class="sgl__sr">{{ t('classbook.state.overridden') }}</span></template
                  >
                  <span v-if="cellOf(r, c).state === 'draft'" class="sgl__flag is-draft">{{
                    t('classbook.state.draft')
                  }}</span>
                  <span v-if="cellOf(r, c).waiting" class="sgl__flag is-wait" :title="t('classbook.waiting')">{{
                    t('classbook.state.toGrade')
                  }}</span>
                </span>
                <span v-if="cellOf(r, c).group" class="sgl__group">
                  <GroupGlyph />
                  <span>{{ groupWords(cellOf(r, c)) }}</span>
                </span>
                <span v-if="postedOf(cellOf(r, c))" class="sgl__posted">
                  <span :aria-hidden="postedOf(cellOf(r, c))!.full ? 'true' : undefined">{{
                    t('classbook.postedUnder', { score: postedOf(cellOf(r, c))!.text })
                  }}</span>
                  <span v-if="postedOf(cellOf(r, c))!.full" class="sgl__sr">{{
                    t('classbook.postedUnder', { score: postedOf(cellOf(r, c))!.full })
                  }}</span>
                </span>
              </template>
              <span v-else-if="cellOf(r, c).state === 'missing'" class="sgl__flag is-missing">{{
                t('classbook.state.missing')
              }}</span>
              <span v-else-if="cellOf(r, c).state === 'submitted'" class="sgl__flag is-wait">{{
                t('classbook.state.toGrade')
              }}</span>
              <span v-else class="sgl__none">{{ t('classbook.state.none') }}</span>
            </span>
          </li>
        </ul>
        <router-link
          :to="{ name: 'course-gradebook', params: { courseId, studentMemberId: r.student.id } }"
          class="sgl__book"
        >
          {{ t('classbook.openGradebook', { name: nameOf(r.student) }) }}
          <el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </router-link>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.sgl {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sgl__item {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.sgl__head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sgl__head:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}
.sgl__who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sgl__name {
  font-weight: 500;
  word-break: break-word;
}
.sgl__status {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: var(--app-text-xs);
  font-weight: 400;
  line-height: 16px;
  vertical-align: 1px;
  border: 1px solid currentColor;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
.sgl__status.is-removed {
  border-style: dashed;
}
.sgl__login {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.sgl__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.sgl__total {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-variant-numeric: tabular-nums;
}
.sgl__total-label {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.sgl__total-value {
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-lg);
}
.sgl__chev {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
  transition: transform 0.15s;
}
.sgl__chev.is-open {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .sgl__chev {
    transition: none;
  }
}
.sgl__body {
  padding: 0 0 12px;
}
.sgl__grades {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sgl__grade {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: var(--app-text-sm);
  border-top: 1px dashed var(--el-border-color-extra-light);
}
.sgl__grade.is-total {
  font-weight: var(--app-weight-strong);
}
.sgl__what {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  word-break: break-word;
}
.sgl__group {
  font-size: var(--app-text-xs);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
/*
 * What a column says of the student: its own width first, the column's name
 * the rest; where that is more than the line has room for (a long score, a
 * draft's flag and work to grade), its flags wrap under it rather than run
 * past the screen.
 */
.sgl__value {
  flex: 0 1 auto;
  max-width: 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.sgl__line {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}
.sgl__posted {
  margin-top: 2px;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
/* Given from a group's grade: in words, under the score, with the group's mark. */
.sgl__group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-xs);
  margin-top: 2px;
  font-size: var(--app-text-xs);
  color: var(--app-ink-2);
  text-align: right;
}
.sgl__score.is-draft {
  font-style: italic;
}
.sgl__flag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 4px;
  font-size: var(--app-text-xs);
  line-height: 17px;
  font-weight: 400;
  border: 1px solid currentColor;
}
.sgl__flag.is-draft {
  border-style: dashed;
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
  background: var(--el-color-warning-light-9);
}
.sgl__flag.is-missing {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  font-weight: var(--app-weight-strong);
}
.sgl__flag.is-wait {
  border-style: dotted;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
.sgl__none {
  color: var(--el-text-color-placeholder);
  font-size: var(--app-text-xs);
}
.sgl__book {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: var(--app-text-sm);
}
.sgl__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
