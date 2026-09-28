<script setup lang="ts">
// A grade's per-criterion detail: one line per criterion with the points
// given, the most it could give and an optional comment. The rubric is prose
// the grader reads; this is what the grader made of it. v-model is the lines,
// numbers kept as the text typed.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDecimal } from '@/utils/format'
import { isNonNegativeDecimal, sumDecimals } from './decimal'

export interface BreakdownRow {
  key: number
  criterion: string
  points: string
  max: string
  comment: string
}

const model = defineModel<BreakdownRow[]>({ default: () => [] })
const props = defineProps<{
  disabled?: boolean
  /** Mark what is missing as well as what is wrong: after a save was tried. */
  strict?: boolean
}>()
const emit = defineEmits<{ useTotal: [total: string] }>()
const { t } = useI18n()

let nextKey = Date.now()
function add() {
  model.value = [...model.value, { key: nextKey++, criterion: '', points: '', max: '', comment: '' }]
}
function remove(key: number) {
  model.value = model.value.filter((r) => r.key !== key)
}
function update(key: number, field: 'criterion' | 'points' | 'max' | 'comment', value: string) {
  model.value = model.value.map((r) => (r.key === key ? { ...r, [field]: value } : r))
}

// A line not filled in yet counts as nothing, so that the total shows while typing.
const totalPoints = computed(() => sumDecimals(model.value.map((r) => r.points.trim() || '0')))
const totalMax = computed(() => sumDecimals(model.value.map((r) => r.max.trim() || '0')))

function bad(r: BreakdownRow, field: 'criterion' | 'points' | 'max'): boolean {
  if (field === 'criterion') return !r.criterion.trim() && (props.strict || !!(r.points || r.max))
  const v = r[field]
  return (props.strict || v.trim() !== '') && !isNonNegativeDecimal(v)
}
</script>

<template>
  <div class="breakdown">
    <div v-for="r in model" :key="r.key" class="breakdown__row">
      <el-input
        class="breakdown__criterion"
        :class="{ 'is-bad': bad(r, 'criterion') }"
        :model-value="r.criterion"
        :placeholder="t('submissions.breakdown.criterion')"
        :aria-label="t('submissions.breakdown.criterion')"
        :disabled="disabled"
        @update:model-value="(v: string) => update(r.key, 'criterion', v)"
      />
      <div class="breakdown__nums">
        <el-input
          class="breakdown__num"
          :class="{ 'is-bad': bad(r, 'points') }"
          :model-value="r.points"
          inputmode="decimal"
          :placeholder="t('submissions.breakdown.points')"
          :aria-label="t('submissions.breakdown.points')"
          :disabled="disabled"
          @update:model-value="(v: string) => update(r.key, 'points', v)"
        />
        <span class="breakdown__slash">/</span>
        <el-input
          class="breakdown__num"
          :class="{ 'is-bad': bad(r, 'max') }"
          :model-value="r.max"
          inputmode="decimal"
          :placeholder="t('submissions.breakdown.max')"
          :aria-label="t('submissions.breakdown.max')"
          :disabled="disabled"
          @update:model-value="(v: string) => update(r.key, 'max', v)"
        />
        <el-tooltip :content="t('submissions.breakdown.remove')" placement="top">
          <el-button
            class="breakdown__remove"
            link
            type="danger"
            :disabled="disabled"
            :aria-label="t('submissions.breakdown.remove')"
            @click="remove(r.key)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <el-input
        class="breakdown__comment"
        :model-value="r.comment"
        :placeholder="t('submissions.breakdown.comment')"
        :aria-label="t('submissions.breakdown.comment')"
        :disabled="disabled"
        @update:model-value="(v: string) => update(r.key, 'comment', v)"
      />
    </div>

    <div class="breakdown__foot">
      <el-button :disabled="disabled" @click="add">
        <el-icon><Plus /></el-icon>
        <span>{{ t('submissions.breakdown.add') }}</span>
      </el-button>
      <template v-if="model.length">
        <span class="breakdown__total">
          {{
            t('submissions.breakdown.total', {
              points: totalPoints === null ? '—' : formatDecimal(totalPoints, 4),
              max: totalMax === null ? '—' : formatDecimal(totalMax, 4),
            })
          }}
        </span>
        <el-button
          link
          type="primary"
          :disabled="disabled || totalPoints === null || totalPoints.startsWith('-')"
          @click="totalPoints !== null && emit('useTotal', totalPoints)"
        >
          {{ t('submissions.breakdown.useTotal') }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.breakdown__row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) auto;
  grid-template-areas:
    'criterion nums'
    'comment comment';
  gap: 6px 8px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-blank);
}
.breakdown__criterion {
  grid-area: criterion;
}
.breakdown__nums {
  grid-area: nums;
  display: flex;
  align-items: center;
  gap: 4px;
}
.breakdown__num {
  width: 72px;
}
.breakdown__slash {
  color: var(--el-text-color-secondary);
}
.breakdown__comment {
  grid-area: comment;
}
.breakdown__remove {
  margin-left: 2px;
}
.breakdown__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.breakdown__total {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
}
.is-bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
@media (max-width: 520px) {
  .breakdown__row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'criterion'
      'nums'
      'comment';
  }
}
</style>
