<script setup lang="ts">
// Whether one of the caller's agents takes conversations in the site
// (agent.get's site_chat). Whatever runs it says so with the agent's own token
// (me.site_chat), as AIshie's runtime does each time it starts it; an agent
// operated from an external tool (Claude through MCP, say) never does, and
// nobody in the site is offered to ask it. While it takes them, its owner may
// switch them off (agent.update, site_chat false), and never on: only what
// runs it knows that it answers.
import { computed, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { AgentFull } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { siteChatState } from './agents'

const props = defineProps<{
  agent: AgentFull
  /** AIshie's runtime hosts it (HostingPanel found it there). */
  hosted?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

const state = computed(() => siteChatState(props.agent, { hosted: props.hosted }))
const label = computed(() => {
  switch (state.value) {
    case 'on':
      return t('agents.siteChat.on')
    case 'external':
      return t('common.agent.external')
  }
  return t('agents.siteChat.off')
})

const { run, pending } = useWrite('agent.update')

async function switchOff() {
  const name = props.agent.display_name
  const ok = await ElMessageBox.confirm(
    h('div', [
      h('p', { style: 'margin: 0 0 8px; line-height: 1.6' }, t('agents.siteChat.confirmBody')),
      h('p', { style: 'margin: 0; line-height: 1.6' }, t('agents.siteChat.confirmReturns')),
    ]),
    t('agents.siteChat.confirmTitle', { name }),
    {
      type: 'warning',
      confirmButtonText: t('agents.siteChat.confirm'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  const out = await run(
    { actor_id: props.agent.actor_id, site_chat: false },
    { success: t('agents.siteChat.done', { name }) },
  )
  if (out) emit('changed')
}
</script>

<template>
  <section class="app-card site-chat">
    <h2 class="app-card__title">{{ t('agents.siteChat.title') }}</h2>
    <div class="site-chat__state">
      <el-tag :type="state === 'on' ? 'success' : 'info'" effect="plain" disable-transitions>
        <el-icon aria-hidden="true"><ChatLineRound v-if="state === 'on'" /><Connection v-else /></el-icon>
        <span>{{ label }}</span>
      </el-tag>
    </div>
    <template v-if="state === 'on'">
      <p class="site-chat__text">{{ t('agents.siteChat.onBody') }}</p>
      <el-button type="danger" plain size="small" :loading="pending" @click="switchOff">
        {{ t('agents.siteChat.switchOff') }}
      </el-button>
    </template>
    <p v-else-if="state === 'hostedOff'" class="site-chat__text">{{ t('agents.siteChat.hostedOff') }}</p>
    <p v-else-if="state === 'suspended'" class="site-chat__text">{{ t('agents.siteChat.suspended') }}</p>
    <template v-else>
      <p class="site-chat__text">{{ t('common.agent.externalNote') }}</p>
      <p class="site-chat__text">{{ t('common.agent.hostedTakesChat') }}</p>
    </template>
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
