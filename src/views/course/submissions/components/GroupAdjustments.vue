<script setup lang="ts">
// Each member's score from the group's, as it will be written: the group's
// score, a score of their own, or plus or minus, each of the last two with a
// reason the member reads with their grade. Every line shows the score it
// comes to as the group's score is typed, and says what is wrong with it.
// Where the work's grades cannot be read (unseen), each line starts kept as
// the member's grade has it, which is not shown, and may be left so.
// v-model is the lines, numbers kept as the text typed.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Decimal } from '@/api/types'
import MemberName from '@/components/MemberName.vue'
import { formatScore } from '@/views/course/grades/components/grading'
import AdjustmentText from './AdjustmentText.vue'
import { isDecimal } from '@/utils/format'
import {
  ADJUST_KINDS,
  REASON_MAX,
  isNegative,
  magnitude,
  memberScore,
  rowProblem,
  type AdjustRow,
  type LineKind,
} from './groupGrading'

export interface WorkMember {
  member_id: string
  /** Core names a work's members to its members and to readers of the member list. */
  display_name?: string | null
}

const rows = defineModel<AdjustRow[]>({ required: true })
const props = defineProps<{
  members: readonly WorkMember[]
  /** The group's score as typed. */
  groupScore: string
  pointsPossible?: Decimal | null
  allowExtra?: boolean
  /** Mark what is missing as well as what is wrong: after a save was tried. */
  strict?: boolean
  disabled?: boolean
  /** The work's grades cannot be read: a line may be kept as the member's grade has it, unseen. */
  unseen?: boolean
}>()
const { t } = useI18n()

const kinds = computed<readonly LineKind[]>(() => (props.unseen ? ['keep', ...ADJUST_KINDS] : ADJUST_KINDS))
/** A line set apart from the group's score here: a score of their own, or plus or minus. */
const setApart = (row: AdjustRow) => row.kind === 'replace' || row.kind === 'delta'

const nameOf = (id: string) => props.members.find((m) => m.member_id === id)?.display_name ?? null

function update(id: string, patch: Partial<AdjustRow>) {
  rows.value = rows.value.map((r) => (r.memberId === id ? { ...r, ...patch } : r))
}
function setKind(id: string, kind: LineKind) {
  update(id, { kind })
}

interface Line {
  row: AdjustRow
  name: string | null
  score: string | null
  /** Before the group's score is typed: what the line does to it, in words. */
  pending: string | null
  problem: string | null
}
function pendingWords(row: AdjustRow): string | null {
  if (row.kind === 'keep') return t('groupGrading.editor.resultKept')
  if (row.kind === 'none') return t('groupGrading.editor.resultPending')
  const p = row.points.trim()
  if (row.kind !== 'delta' || !isDecimal(p)) return null
  const points = formatScore(magnitude(p))
  return isNegative(p) ? t('groupGrading.adjustment.minus', { points }) : t('groupGrading.adjustment.plus', { points })
}
const lines = computed<Line[]>(() =>
  rows.value.map((row) => {
    const p = rowProblem(row, props.groupScore, props.pointsPossible, !!props.allowExtra)
    // Before a save is tried, a line still being filled in is not called wrong.
    const shown =
      p && (props.strict || (p !== 'reason' && p !== 'points') || (p === 'points' && row.points.trim() !== ''))
        ? p
        : null
    return {
      row,
      name: nameOf(row.memberId),
      score: memberScore(props.groupScore, row),
      pending: pendingWords(row),
      problem: shown
        ? t(`groupGrading.editor.problem.${shown}`, { points: formatScore(props.pointsPossible), max: REASON_MAX })
        : null,
    }
  }),
)
const outOf = computed(() =>
  props.pointsPossible === null || props.pointsPossible === undefined ? null : formatScore(props.pointsPossible),
)
</script>

<template>
  <div class="group-adjust">
    <p v-if="!rows.length" class="app-muted group-adjust__none">{{ t('groupGrading.editor.noMembers') }}</p>
    <ul v-else class="group-adjust__list">
      <li
        v-for="l in lines"
        :key="l.row.memberId"
        class="group-adjust__item"
        :class="{ 'is-adjusted': setApart(l.row), 'is-bad': !!l.problem }"
      >
        <div class="group-adjust__head">
          <span class="group-adjust__name">
            <template v-if="l.name">{{ l.name }}</template>
            <MemberName v-else :id="l.row.memberId" />
          </span>
          <span class="group-adjust__result" aria-live="polite">
            <template v-if="l.score !== null">{{
              outOf
                ? t('groupGrading.editor.resultOutOf', { score: formatScore(l.score), points: outOf })
                : t('groupGrading.editor.result', { score: formatScore(l.score) })
            }}</template>
            <span v-else-if="l.pending" class="app-muted">{{ l.pending }}</span>
          </span>
        </div>
        <el-select
          :model-value="l.row.kind"
          class="group-adjust__kind"
          :disabled="disabled"
          :aria-label="t('groupGrading.editor.kindLabel', { name: l.name ?? t('groupGrading.editor.thisMember') })"
          @update:model-value="(v: LineKind) => setKind(l.row.memberId, v)"
        >
          <el-option v-for="k in kinds" :key="k" :value="k" :label="t(`groupGrading.editor.kind.${k}`)" />
        </el-select>
        <div v-if="setApart(l.row)" class="group-adjust__fields">
          <el-input
            :model-value="l.row.points"
            inputmode="decimal"
            class="group-adjust__points"
            :disabled="disabled"
            :placeholder="t(`groupGrading.editor.pointsPlaceholder.${l.row.kind}`)"
            :aria-label="t(`groupGrading.editor.points.${l.row.kind}`)"
            @update:model-value="(v: string) => update(l.row.memberId, { points: v })"
          />
          <el-input
            :model-value="l.row.reason"
            class="group-adjust__reason"
            :disabled="disabled"
            :maxlength="REASON_MAX"
            :placeholder="t('groupGrading.editor.reasonPlaceholder')"
            :aria-label="t('groupGrading.editor.reason')"
            @update:model-value="(v: string) => update(l.row.memberId, { reason: v })"
          />
        </div>
        <p v-if="l.row.kind === 'none' && l.row.peer" class="group-adjust__peer">
          <AdjustmentText :adjustment="l.row.peer" />
          <span>{{ t('groupGrading.editor.peer') }}</span>
        </p>
        <p v-if="l.problem" class="group-adjust__problem" role="alert">{{ l.problem }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* The list's own width decides how each line is laid out, not the window's. */
.group-adjust {
  container-type: inline-size;
  width: 100%;
}
.group-adjust__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
.group-adjust__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-sm);
}
.group-adjust__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  align-items: center;
  gap: var(--app-space-xs) var(--app-space-md);
  padding: var(--app-space-sm) var(--app-space-md);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
}
.group-adjust__item.is-bad {
  border-color: var(--el-color-danger-light-5);
}
.group-adjust__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-sm);
  flex-wrap: wrap;
}
.group-adjust__name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.group-adjust__result {
  font-variant-numeric: tabular-nums;
  font-size: var(--app-text-sm);
}
.group-adjust__item.is-adjusted .group-adjust__result {
  font-weight: var(--app-weight-strong);
}
.group-adjust__kind {
  width: 180px;
}
.group-adjust__fields {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--app-space-sm);
}
.group-adjust__peer,
.group-adjust__problem {
  grid-column: 1 / -1;
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.group-adjust__peer {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--app-space-sm);
  color: var(--app-ink-3);
}
.group-adjust__problem {
  color: var(--el-color-danger);
}
/* As narrow as a phone's card: the choice under the name, the points over the reason. */
@container (max-width: 420px) {
  .group-adjust__item {
    grid-template-columns: minmax(0, 1fr);
  }
  .group-adjust__kind {
    width: 100%;
  }
  .group-adjust__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
