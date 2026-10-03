<script setup lang="ts">
// A score and what it is out of, with the percentage: "9.125 / 10 · 91.25%".
// A computed total is a percentage already and is shown as one. Scores keep
// every decimal place Core holds; percentages have two, as Core rounds them.
import { computed } from 'vue'
import type { Decimal } from '@/api/types'
import { formatPct, formatScore, percentOf } from './grading'

const props = defineProps<{
  score: Decimal | null | undefined
  outOf?: Decimal | null
  /** A computed total: a percentage already. */
  asPercent?: boolean
  hidePercent?: boolean
  size?: 'default' | 'large'
}>()

const percent = computed(() => percentOf(props.score, props.outOf))
</script>

<template>
  <span class="score-text" :class="{ 'score-text--large': size === 'large' }">
    <template v-if="asPercent">
      <strong class="score-text__score">{{ formatPct(score) }}</strong>
    </template>
    <template v-else>
      <strong class="score-text__score">{{ formatScore(score) }}</strong>
      <!-- The leading spaces are for reading and copying; the margins lay it out. -->
      <span class="score-text__of"> / {{ formatScore(outOf) }}</span>
      <span v-if="!hidePercent && percent !== '—'" class="score-text__pct"> {{ percent }}</span>
    </template>
  </span>
</template>

<style scoped>
.score-text {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.score-text__score {
  font-weight: var(--app-weight-strong);
}
/* A flex item's leading space collapses: the gap before the slash is a margin. */
.score-text__of {
  margin-left: 0.3em;
  color: var(--el-text-color-secondary);
}
.score-text__pct {
  margin-left: 8px;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.score-text--large .score-text__score {
  font-size: var(--app-text-3xl);
  line-height: 1.1;
}
.score-text--large .score-text__of {
  font-size: var(--app-text-xl);
}
.score-text--large .score-text__pct {
  font-size: var(--app-text-lg);
  margin-left: 12px;
}
</style>
