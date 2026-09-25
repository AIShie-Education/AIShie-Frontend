<script setup lang="ts">
// An entered grade's breakdown, criterion by criterion, with totals.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Decimal } from '@/api/types'
import { useNarrow } from '@/composables/useMediaQuery'
import { sumDecimals } from '@/views/course/submissions/components/decimal'
import { formatScore, plainDecimal, type BreakdownItem } from './grading'

const props = defineProps<{ items: BreakdownItem[]; score?: Decimal | null }>()
const { t } = useI18n()
const narrow = useNarrow()

const sum = (vs: Decimal[]) => sumDecimals(vs.map((v) => plainDecimal(v) ?? String(v)))
const totalPoints = computed(() => sum(props.items.map((b) => b.points)))
const totalMax = computed(() => sum(props.items.map((b) => b.max)))
const differs = computed(
  () =>
    totalPoints.value !== null &&
    props.score !== null &&
    props.score !== undefined &&
    totalPoints.value !== plainDecimal(props.score),
)
</script>

<template>
  <div class="bd-table">
    <!-- Phone width: one block per criterion, the comment beneath it -->
    <ul v-if="narrow" class="bd-list">
      <li v-for="(b, i) in items" :key="i" class="bd-list__item">
        <div class="bd-list__head">
          <span class="bd-table__criterion">{{ b.criterion }}</span>
          <span class="bd-table__num bd-list__pts">
            <strong>{{ formatScore(b.points) }}</strong>
            <span class="app-muted"> / {{ formatScore(b.max) }}</span>
          </span>
        </div>
        <p v-if="b.comment" class="bd-table__comment bd-list__comment">{{ b.comment }}</p>
      </li>
    </ul>
    <el-table v-else :data="items" size="small">
      <el-table-column :label="t('grades.breakdown.criterion')" min-width="160">
        <template #default="{ row }">
          <span class="bd-table__criterion">{{ row.criterion }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('grades.breakdown.points')" min-width="90" align="right">
        <template #default="{ row }">
          <span class="bd-table__num">{{ formatScore(row.points) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('grades.breakdown.max')" min-width="80" align="right">
        <template #default="{ row }">
          <span class="bd-table__num app-muted">{{ formatScore(row.max) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('grades.breakdown.comment')" min-width="200">
        <template #default="{ row }">
          <span class="bd-table__comment">{{ row.comment || '' }}</span>
        </template>
      </el-table-column>
    </el-table>
    <div class="bd-table__total">
      <span>{{ t('grades.breakdown.total') }}</span>
      <strong class="bd-table__num">{{ formatScore(totalPoints) }}</strong>
      <span class="app-muted">/ {{ formatScore(totalMax) }}</span>
    </div>
    <p v-if="differs" class="app-form-hint">
      {{ t('grades.breakdown.differs', { total: formatScore(totalPoints), score: formatScore(score) }) }}
    </p>
  </div>
</template>

<style scoped>
.bd-table__criterion {
  font-weight: 500;
  word-break: break-word;
}
.bd-table__comment {
  white-space: pre-wrap;
  word-break: break-word;
}
.bd-table__num {
  font-variant-numeric: tabular-nums;
}
.bd-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.bd-list__item {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.bd-list__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.bd-list__pts {
  flex-shrink: 0;
  white-space: nowrap;
}
.bd-list__comment {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.bd-table__total {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px 0;
  font-size: 14px;
}
</style>
