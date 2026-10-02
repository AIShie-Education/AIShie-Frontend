<script setup lang="ts">
// "AI", after an agent's name, wherever the name is shown: the same two
// letters in every language, small and quiet (11 px on the indigo tint), so
// that nobody takes an agent for a person, whatever its name. It is text, so
// a screen reader says it with the name; its tooltip says it in words.
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <span class="ai-badge" :title="t('common.agent.aiHint')">AI</span>
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
</style>
