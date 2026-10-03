<script setup lang="ts">
// How a new agent is run, asked whenever one is registered (agent.create,
// actor.register) and kept for good: Core refuses any other afterwards
// (hosting_fixed). Two choices, neither chosen until the person chooses:
// hosted on AIshie (runtime: the site's agent runtime runs it, and people in
// its courses ask it in the site), or MCP access (mcp: its owner's own tools
// use it over MCP, and nobody asks it in the site). Each says so in a line,
// and the note under them that it cannot be changed after.
import { useI18n } from 'vue-i18n'
import { AGENT_HOSTINGS, type AgentHosting } from '@/api/types'

const model = defineModel<AgentHosting | ''>({ required: true })
defineProps<{ disabled?: boolean }>()
const { t } = useI18n()

const ICON: Record<AgentHosting, string> = { runtime: 'Monitor', mcp: 'Connection' }
</script>

<template>
  <div class="hosting-choice">
    <el-radio-group
      v-model="model"
      class="hosting-choice__options"
      :aria-label="t('common.agent.hosting.label')"
      :disabled="disabled"
    >
      <el-radio
        v-for="h in AGENT_HOSTINGS"
        :key="h"
        :value="h"
        border
        class="hosting-choice__option"
        :class="`hosting-choice__option--${h}`"
      >
        <span class="hosting-choice__title">
          <el-icon aria-hidden="true"><component :is="ICON[h]" /></el-icon>
          {{ t(`common.agent.hosting.${h}`) }}
        </span>
        <span class="hosting-choice__hint">{{ t(`common.agent.hosting.${h}Hint`) }}</span>
      </el-radio>
    </el-radio-group>
    <p class="hosting-choice__fixed">
      <el-icon aria-hidden="true"><Lock /></el-icon>
      <span>{{ t('common.agent.hosting.fixed') }}</span>
    </p>
  </div>
</template>

<style scoped>
.hosting-choice {
  position: relative;
  width: 100%;
}
.hosting-choice__options {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.hosting-choice__option {
  height: auto;
  margin: 0;
  padding: 10px 14px;
  align-items: flex-start;
  white-space: normal;
}
.hosting-choice__option :deep(.el-radio__input) {
  margin-top: 3px;
}
.hosting-choice__option :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
  min-width: 0;
}
.hosting-choice__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: var(--app-weight-strong);
  color: var(--el-text-color-primary);
}
.hosting-choice__hint {
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  font-weight: normal;
  color: var(--el-text-color-secondary);
}
/* Left unchosen in a form that asks for it: both choices say so. */
.el-form-item.is-error .hosting-choice__option {
  border-color: var(--el-color-danger);
}
.hosting-choice__fixed {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 6px 0 0;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--el-color-warning-dark-2);
}
</style>
