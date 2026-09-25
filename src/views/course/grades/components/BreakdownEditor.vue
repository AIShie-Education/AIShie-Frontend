<script setup lang="ts">
// A grade's per-criterion breakdown, being written: criterion, points, max,
// comment. Decimals stay strings. The rubric is prose; this is what the
// grader made of it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDecimal, isDecimal } from '@/utils/format'
import { addDecimals, type BreakdownDraft } from './grading'

const model = defineModel<BreakdownDraft[]>({ default: () => [] })
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ useTotal: [total: string] }>()
const { t } = useI18n()

function add() {
  model.value = [...model.value, { criterion: '', points: '', max: '', comment: '' }]
}
function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i)
}
function set(i: number, field: keyof BreakdownDraft, v: string) {
  model.value = model.value.map((r, j) => (j === i ? { ...r, [field]: v } : r))
}

const used = computed(() =>
  model.value.filter((r) => r.criterion.trim() || r.points.trim() || r.max.trim() || r.comment.trim()),
)
const totalPoints = computed(() => addDecimals(used.value.map((r) => r.points)))
const totalMax = computed(() => addDecimals(used.value.map((r) => r.max)))

function bad(v: string): boolean {
  return v.trim() !== '' && (!isDecimal(v) || Number(v) < 0)
}
</script>

<template>
  <div class="bd-editor">
    <div v-for="(r, i) in model" :key="i" class="bd-editor__row">
      <el-input
        :model-value="r.criterion"
        :placeholder="t('grades.breakdown.criterion')"
        :disabled="disabled"
        class="bd-editor__criterion"
        @update:model-value="(v: string) => set(i, 'criterion', v)"
      />
      <div class="bd-editor__points">
        <el-input
          :model-value="r.points"
          :placeholder="t('grades.breakdown.points')"
          :disabled="disabled"
          inputmode="decimal"
          :class="{ 'is-bad': bad(r.points) }"
          @update:model-value="(v: string) => set(i, 'points', v)"
        />
        <span class="bd-editor__slash">/</span>
        <el-input
          :model-value="r.max"
          :placeholder="t('grades.breakdown.max')"
          :disabled="disabled"
          inputmode="decimal"
          :class="{ 'is-bad': bad(r.max) }"
          @update:model-value="(v: string) => set(i, 'max', v)"
        />
      </div>
      <el-input
        :model-value="r.comment"
        :placeholder="t('grades.breakdown.comment')"
        :disabled="disabled"
        class="bd-editor__comment"
        @update:model-value="(v: string) => set(i, 'comment', v)"
      />
      <el-button link type="danger" :disabled="disabled" :aria-label="t('common.actions.remove')" @click="remove(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <div class="bd-editor__foot">
      <el-button size="small" :disabled="disabled" @click="add">
        <el-icon><Plus /></el-icon>
        <span>{{ t('grades.breakdown.addRow') }}</span>
      </el-button>
      <template v-if="used.length">
        <span class="bd-editor__total">
          {{ t('grades.breakdown.total') }}: <strong>{{ formatDecimal(totalPoints) }}</strong> /
          {{ formatDecimal(totalMax) }}
        </span>
        <el-button size="small" link type="primary" :disabled="disabled" @click="emit('useTotal', totalPoints)">
          {{ t('grades.breakdown.useTotal') }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bd-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bd-editor__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.bd-editor__criterion {
  flex: 2 1 160px;
}
.bd-editor__points {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 150px;
}
.bd-editor__slash {
  color: var(--el-text-color-secondary);
}
.bd-editor__comment {
  flex: 3 1 180px;
}
.bd-editor__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.bd-editor__total {
  font-size: 13px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}
.is-bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
