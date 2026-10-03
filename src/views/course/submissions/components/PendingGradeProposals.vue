<script setup lang="ts">
// Grades proposed for this work that wait for someone to approve them. Each
// links to its action, where a decider approves or rejects it and its
// proposer follows it; beside it, what approving it would come to, as far as
// the grades that can be read show.
import { useI18n } from 'vue-i18n'
import type { ActionSummary, Decimal, GradeSummary } from '@/api/types'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { formatDecimal, formatPercent } from '@/utils/format'
import { proposalFate, proposedOutOf, proposedScore } from './proposals'

const props = defineProps<{
  courseId: string
  proposals: ActionSummary[]
  pointsPossible?: Decimal | null
  liveDraft?: GradeSummary
  livePosted?: GradeSummary
}>()
const { t } = useI18n()

function outOf(p: ActionSummary): Decimal | null | undefined {
  return proposedOutOf(p) ?? props.pointsPossible
}
</script>

<template>
  <div class="pending-proposals">
    <h3 class="pending-proposals__title">{{ t('submissions.proposals.title') }}</h3>
    <ul class="pending-proposals__list">
      <li v-for="p in proposals" :key="p.id">
        <router-link
          :to="{ name: 'course-action', params: { courseId, actionId: p.id } }"
          class="pending-proposals__row"
        >
          <div class="pending-proposals__score">
            <span class="pending-proposals__value">{{ formatDecimal(proposedScore(p), 4) }}</span>
            <span v-if="outOf(p) !== undefined && outOf(p) !== null" class="app-muted">
              / {{ formatDecimal(outOf(p), 4) }}{{ t('common.sep') }}{{ formatPercent(proposedScore(p), outOf(p)) }}
            </span>
          </div>
          <StatusTag vocab="actionStatus" :value="p.status" />
          <div class="pending-proposals__meta">
            <span>
              <span class="app-muted">{{ t('submissions.proposals.proposer') }}</span>
              <MemberName :id="p.member_id" show-kind />
            </span>
            <span>
              <span class="app-muted">{{ t('submissions.proposals.proposedAt') }}</span>
              <TimeText :value="p.created_at" />
            </span>
          </div>
          <el-icon class="pending-proposals__chevron"><ArrowRight /></el-icon>
        </router-link>
        <p
          v-if="proposalFate(p, liveDraft, livePosted)"
          class="pending-proposals__fate"
          :class="{ 'is-warning': proposalFate(p, liveDraft, livePosted) !== 'replacesDraft' }"
        >
          <el-icon><Warning /></el-icon>
          <span>{{ t(`submissions.proposals.fate.${proposalFate(p, liveDraft, livePosted)}`) }}</span>
        </p>
      </li>
    </ul>
    <p class="app-form-hint">{{ t('submissions.proposals.hint') }}</p>
  </div>
</template>

<style scoped>
.pending-proposals {
  margin-top: 16px;
}
.pending-proposals__title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.pending-proposals__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pending-proposals__row {
  display: flex;
  align-items: center;
  gap: 8px 14px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px dashed var(--el-color-warning-light-5);
  border-radius: var(--app-radius-item);
  background: var(--el-color-warning-light-9);
  color: inherit;
  text-decoration: none;
}
.pending-proposals__row:hover {
  border-color: var(--el-color-warning);
}
.pending-proposals__score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.pending-proposals__value {
  font-size: 18px;
  font-weight: 600;
}
.pending-proposals__meta {
  display: flex;
  gap: 4px 14px;
  flex-wrap: wrap;
  font-size: 13px;
  flex: 1 1 260px;
  min-width: 0;
}
.pending-proposals__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pending-proposals__chevron {
  color: var(--el-text-color-secondary);
}
.pending-proposals__fate {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 6px 2px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.pending-proposals__fate .el-icon {
  flex: none;
  margin-top: 3px;
}
.pending-proposals__fate.is-warning {
  color: var(--el-color-warning-dark-2);
}
</style>
