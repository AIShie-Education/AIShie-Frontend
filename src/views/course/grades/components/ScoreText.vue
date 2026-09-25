<script setup lang="ts">
// A score and what it is out of, with the percentage: "9.5 / 10 · 95%". A
// computed total is a percentage already and is shown as one.
import { computed } from 'vue'
import type { Decimal } from '@/api/types'
import { formatDecimal, formatPercent } from '@/utils/format'

const props = defineProps<{
  score: Decimal | null | undefined
  outOf?: Decimal | null
  /** A computed total: a percentage already. */
  asPercent?: boolean
  hidePercent?: boolean
  size?: 'default' | 'large'
}>()

const percent = computed(() =>
  props.outOf === null || props.outOf === undefined ? '—' : formatPercent(props.score, props.outOf),
)
</script>

<template>
  <span class="score-text" :class="{ 'score-text--large': size === 'large' }">
    <template v-if="asPercent">
      <strong class="score-text__score">{{ formatDecimal(score) }}%</strong>
    </template>
    <template v-else>
      <strong class="score-text__score">{{ formatDecimal(score) }}</strong>
      <span class="score-text__of"> / {{ formatDecimal(outOf) }}</span>
      <span v-if="!hidePercent && percent !== '—'" class="score-text__pct">{{ percent }}</span>
    </template>
  </span>
</template>

<style scoped>
.score-text {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.score-text__score {
  font-weight: 600;
}
.score-text__of {
  color: var(--el-text-color-secondary);
}
.score-text__pct {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.score-text--large .score-text__score {
  font-size: 32px;
  line-height: 1.1;
}
.score-text--large .score-text__of {
  font-size: 18px;
}
.score-text--large .score-text__pct {
  font-size: 16px;
  margin-left: 12px;
}
</style>
