<script setup lang="ts">
// Whether people can ask one of the caller's agents on the site
// (agent.get's site_chat), as Core works it out from how it is hosted:
// an agent hosted on AIshie can be asked while AIshie's runtime runs it (可在
// 站內提問), and not otherwise (未在執行: not hosted yet, paused, or its token
// revoked); one with MCP access, used from its owner's own tools, never.
// Nothing here switches it: hosting or pausing it does (its hosting card),
// and so does suspending it. Only the state, and what changes it, is said.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentFull } from '@/api/types'
import { siteChatState } from './agents'

const props = defineProps<{ agent: AgentFull }>()
const { t } = useI18n()

const state = computed(() => siteChatState(props.agent))
const TAG = { on: 'success', off: 'warning', suspended: 'info', mcp: 'info' } as const
const label = computed(() => {
  switch (state.value) {
    case 'on':
      return t('common.agent.askable.on')
    case 'mcp':
      return t('common.agent.hosting.mcp')
  }
  return t('common.agent.askable.off')
})
</script>

<template>
  <section class="app-card site-chat" :data-state="state">
    <h2 class="app-card__title">{{ t('agents.siteChat.title') }}</h2>
    <div class="site-chat__state">
      <el-tag :type="TAG[state]" effect="plain" disable-transitions>
        <el-icon aria-hidden="true"><ChatLineRound v-if="state === 'on'" /><Connection v-else /></el-icon>
        <span>{{ label }}</span>
      </el-tag>
    </div>
    <p class="site-chat__text">{{ t(`agents.siteChat.${state}`) }}</p>
    <p v-if="state === 'on'" class="site-chat__text">{{ t('agents.siteChat.stop') }}</p>
  </section>
</template>

<style scoped>
.site-chat__state {
  margin-bottom: 10px;
}
.site-chat__state :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.site-chat__text {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.site-chat__text:last-child {
  margin-bottom: 0;
}
</style>
