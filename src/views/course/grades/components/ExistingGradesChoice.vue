<script setup lang="ts">
// What becomes of the grades already entered on a piece of work whose points
// change (existing_grades): rescaled in proportion, or kept as they are, out
// of the new points. Each is explained with an example in the actual numbers,
// and one Core would refuse is greyed out with why.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StatusTag from '@/components/StatusTag.vue'
import { formatScore, percentOf } from './grading'
import { pointsPlan, type ExistingGrades } from './pointsChange'

const model = defineModel<ExistingGrades | ''>({ required: true })
const props = defineProps<{
  /** The live entered scores, or null when they could not be read. */
  scores: string[] | null
  from: string | number
  to: string
  /** Saving it will wait for approval. */
  needsApproval?: boolean
  disabled?: boolean
}>()
const { t } = useI18n()

const plan = computed(() => pointsPlan(props.scores, props.from, props.to))
const OPTIONS: ExistingGrades[] = ['rescale', 'keep_scores']

// A choice Core would refuse is taken back.
watch(
  plan,
  (p) => {
    if (model.value && p[model.value].blocked) model.value = ''
  },
  { immediate: true },
)

function exampleText(o: ExistingGrades): string {
  const p = plan.value
  const e = p[o].example
  const args = {
    score: formatScore(e.score),
    from: formatScore(p.from),
    becomes: formatScore(e.becomes),
    to: formatScore(p.to),
    before: percentOf(e.score, p.from),
    after: percentOf(e.becomes, p.to),
  }
  return t(`grades.pointsChange.${o}.example`, args)
}

function blockText(o: ExistingGrades): string | null {
  const b = plan.value[o].blocked
  if (!b) return null
  if (b.reason === 'nothing_to_rescale') return t('grades.pointsChange.blocked.nothing_to_rescale')
  return t('grades.pointsChange.blocked.score_above_points', { n: b.count, to: formatScore(plan.value.to) }, b.count)
}
</script>

<template>
  <div class="existing-grades" role="group" :aria-label="t('grades.pointsChange.question')">
    <div class="existing-grades__head">
      <el-icon class="existing-grades__icon"><WarningFilled /></el-icon>
      <div>
        <div class="existing-grades__title">
          {{
            plan.count === null
              ? t('grades.pointsChange.titleUnknown')
              : t('grades.pointsChange.title', { n: plan.count }, plan.count)
          }}
        </div>
        <div class="existing-grades__question">
          {{ t('grades.pointsChange.question', { from: formatScore(plan.from), to: formatScore(plan.to) }) }}
        </div>
      </div>
    </div>
    <el-radio-group v-model="model" class="existing-grades__options" :disabled="disabled">
      <el-radio
        v-for="o in OPTIONS"
        :key="o"
        :value="o"
        :disabled="!!plan[o].blocked"
        border
        class="existing-grades__option"
        :data-choice="o"
      >
        <span class="existing-grades__label">{{ t(`grades.pointsChange.${o}.label`) }}</span>
        <span class="existing-grades__help">{{ t(`grades.pointsChange.${o}.help`) }}</span>
        <span class="existing-grades__example">{{ exampleText(o) }}</span>
        <span v-if="blockText(o)" class="existing-grades__blocked">
          <el-icon><Lock /></el-icon>{{ blockText(o) }}
        </span>
      </el-radio>
    </el-radio-group>
    <p class="app-form-hint existing-grades__note">{{ t('grades.pointsChange.totals') }}</p>
    <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
  </div>
</template>

<style scoped>
.existing-grades {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--app-radius-item);
  border: 1px solid var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}
.existing-grades__head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 10px;
}
.existing-grades__icon {
  color: var(--el-color-warning);
  margin-top: 3px;
  flex-shrink: 0;
}
.existing-grades__title {
  font-weight: 600;
  line-height: 1.4;
}
.existing-grades__question {
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.existing-grades__options {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.existing-grades__option {
  height: auto;
  margin-right: 0;
  padding: 10px 12px;
  align-items: flex-start;
  white-space: normal;
  background: var(--el-bg-color);
}
.existing-grades__option :deep(.el-radio__input) {
  margin-top: 3px;
}
.existing-grades__option :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.45;
}
.existing-grades__label {
  font-weight: 600;
}
.existing-grades__help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}
.existing-grades__example {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.existing-grades__blocked {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-color-warning-dark-2);
}
.existing-grades__blocked .el-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.existing-grades__note {
  margin: 8px 0 6px;
}
</style>
