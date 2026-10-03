<script setup lang="ts">
// A revision's line to the proposal it revises (revises_action_id): one its
// proposer made before, which was sent back for changes. Whoever is shown the
// revision may open that one too: a decider reads any action, and its proposer,
// or the owner of the agent that proposed it, reads their own. Nothing more is
// said on the earlier one.
// Under a label that already says "Revises" (labelled), the link names only
// the earlier proposal. The icon hangs beside the text, which wraps under
// itself: it stays on the line of the link's first word, however narrow.
import { useI18n } from 'vue-i18n'
import IdText from '@/components/IdText.vue'

defineProps<{ courseId: string; actionId: string; labelled?: boolean }>()
const { t } = useI18n()
</script>

<template>
  <span class="revises-line">
    <el-icon class="revises-line__icon"><RefreshRight /></el-icon>
    <span class="revises-line__text">
      <router-link :to="{ name: 'course-action', params: { courseId, actionId } }" @click.stop>
        {{ labelled ? t('actions.revises.earlier') : t('actions.revises.line') }}
      </router-link>
      <IdText :id="actionId" />
    </span>
  </span>
</template>

<style scoped>
.revises-line {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
  color: var(--el-text-color-secondary);
}
/* Centred on the first line: (1.5em - 1em) / 2 above it. */
.revises-line__icon {
  flex-shrink: 0;
  margin-top: 0.25em;
}
.revises-line__text {
  min-width: 0;
}
.revises-line__text > a {
  margin-right: 6px;
}
</style>
