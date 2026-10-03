<script setup lang="ts">
// Whether people can ask one of the caller's agents on the site
// (agent.get's site_chat), as Core works it out from how it is hosted:
// an agent hosted on AIshie can be asked while AIshie's runtime runs it (可在
// 站內提問), and not otherwise (未在執行: not hosted yet, paused, or its token
// revoked); one with MCP access, used from its owner's own tools, never.
// Nothing here switches it: hosting or pausing it does (its hosting card),
// and so does suspending it. Only the state, and what changes it, is said.
import { ChatLineRound, Connection } from '@element-plus/icons-vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentFull } from '@/api/types'
import { siteChatState } from './agents'

const props = defineProps<{ agent: AgentFull }>()
const { t } = useI18n()

const state = computed(() => siteChatState(props.agent))
// Neutral while it can be asked, as the chat and the course's agents say it: an agent is never shown
// "online" in green (docs/CONVENTIONS.md). Not running, which wants its owner, is the amber of what waits.
const TAG = { on: 'info', off: 'warning', suspended: 'info', mcp: 'info' } as const
const label = computed(() => (state.value === 'on' ? t('common.agent.askable.on') : t('common.agent.askable.off')))
</script>

<template>
  <section class="app-card site-chat" :data-state="state">
    <h2 class="app-card__title">{{ t('agents.siteChat.title') }}</h2>
    <!-- How it runs is said once, among its facts: an agent with MCP access has no state here. -->
    <div v-if="state !== 'mcp'" class="site-chat__state">
      <AppTag size="default" :tone="toneOf(TAG[state])" :icon="state === 'on' ? ChatLineRound : Connection">
        {{ label }}
      </AppTag>
    </div>
    <p class="site-chat__text">{{ t(`agents.siteChat.${state}`) }}</p>
    <p v-if="state === 'on'" class="site-chat__text">{{ t('agents.siteChat.stop') }}</p>
  </section>
</template>

<style scoped>
.site-chat__state {
  margin-bottom: 10px;
}
.site-chat__text {
  margin: 0 0 10px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.site-chat__text:last-child {
  margin-bottom: 0;
}
</style>
