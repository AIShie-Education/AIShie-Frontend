<script setup lang="ts">
// "AI", after an agent's name, wherever the name is shown: the same two
// letters in every language (common.agent.ai), small and quiet (11 px on the
// indigo tint), so that nobody takes an agent for a person, whatever its
// name. It is text, so a screen reader says it with the name; its tooltip,
// on hover, says it in words. It takes no focus of its own: it sits in rows
// that are buttons and links, and the two letters say what the tooltip does.
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <span class="ai-badge">
    <el-tooltip :content="t('common.agent.aiHint')" placement="top" :show-after="300">
      <span class="ai-badge__label">{{ t('common.agent.ai') }}</span>
    </el-tooltip>
  </span>
</template>

<style scoped>
.ai-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-family: 'IBM Plex Sans', var(--app-font-sans);
  font-size: 11px;
  font-weight: var(--app-weight-strong, 600);
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  vertical-align: middle;
  cursor: default;
}
/* What is hovered: the whole badge. */
.ai-badge__label {
  padding: 3px 4px;
  margin: -3px -4px;
}
</style>
