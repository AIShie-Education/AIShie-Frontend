<script setup lang="ts">
// A revision's line to the proposal it revises (revises_action_id): one its
// proposer made before, which was sent back for changes. Whoever is shown the
// revision may open that one too: a decider reads any action, and its proposer,
// or the owner of the agent that proposed it, reads their own. Nothing more is
// said on the earlier one.
import { useI18n } from 'vue-i18n'
import IdText from '@/components/IdText.vue'

defineProps<{ courseId: string; actionId: string }>()
const { t } = useI18n()
</script>

<template>
  <span class="revises-line">
    <el-icon><RefreshRight /></el-icon>
    <router-link :to="{ name: 'course-action', params: { courseId, actionId } }" @click.stop>
      {{ t('actions.revises.line') }}
    </router-link>
    <IdText :id="actionId" />
  </span>
</template>

<style scoped>
.revises-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}
</style>
