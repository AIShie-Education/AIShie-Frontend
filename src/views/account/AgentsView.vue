<script setup lang="ts">
// My agents: the agents the caller owns (agent.list), with whether each is
// connected (last_seen_at), where it is seated and what waits for approval,
// and registering a new one (agent.create) — not offered when Core says only
// an administrator registers agents here, and held back at the limit, with
// the reason said. Each opens on its own page
// (account-agent). Only a person owns agents: an agent signed in here is told
// so, and offered nothing.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { AgentSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import PresenceText from '@/components/PresenceText.vue'
import TimeText from '@/components/TimeText.vue'
import AboutAgentsCard from './components/agents/AboutAgentsCard.vue'
import CreateAgentDialog from './components/agents/CreateAgentDialog.vue'
import { agentStanding, countedAgents, createBlock, knownAgentLimit, noteAgentList } from './components/agents/agents'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()

/** Only a person owns agents; whether the caller is one is known once me.get has answered. */
const isHuman = computed(() => !session.me || session.me.kind === 'human')

const list = useAsync(
  () =>
    read('agent.list', {}).then((o) => {
      noteAgentList(o)
      return o.agents ?? []
    }),
  { keepData: true },
)
const agents = computed<AgentSummary[]>(() => list.data.value ?? [])
const counted = computed(() => countedAgents(agents.value))
const countText = computed(() =>
  knownAgentLimit.value !== null
    ? t('agents.list.countOf', { n: counted.value, limit: knownAgentLimit.value })
    : t('agents.list.count', { n: counted.value }, counted.value),
)
const suspendedCount = computed(() => agents.value.length - counted.value)
/** Why a new agent cannot be registered now, once agent.list has said. */
const blocked = computed(() => (list.data.value ? createBlock(counted.value) : null))

const creating = ref(false)
function onCreated(actorId: string) {
  void router.push({ name: 'account-agent', params: { actorId } })
}
function open(a: AgentSummary) {
  void router.push({ name: 'account-agent', params: { actorId: a.actor_id } })
}

const STANDING_TAG = { active: 'success', suspendedByMe: 'warning', suspendedByAdmin: 'danger' } as const
</script>

<template>
  <div class="agents-view">
    <PageHeader :title="t('agents.title')" :subtitle="t('agents.subtitle')" :back="{ name: 'account' }">
      <el-tooltip
        v-if="isHuman && blocked !== 'noSelfService'"
        :disabled="!blocked"
        :content="t('agents.limit.reached', { limit: knownAgentLimit ?? 0 })"
        placement="bottom"
      >
        <span>
          <el-button type="primary" :disabled="!!blocked" @click="creating = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('agents.list.new') }}</span>
          </el-button>
        </span>
      </el-tooltip>
    </PageHeader>

    <el-alert
      v-if="!isHuman"
      type="info"
      :closable="false"
      show-icon
      :title="t('agents.notHuman')"
      class="agents-view__alert"
    />

    <el-alert
      v-else-if="blocked"
      :type="blocked === 'atLimit' ? 'warning' : 'info'"
      :closable="false"
      show-icon
      :title="
        blocked === 'atLimit'
          ? t('agents.limit.reached', { limit: knownAgentLimit ?? 0 })
          : t('agents.limit.noSelfService')
      "
      class="agents-view__alert"
    />

    <AboutAgentsCard v-if="isHuman && list.data.value && !agents.length" />

    <section v-if="isHuman" class="app-card">
      <h2 class="app-card__title">
        <span>{{ t('agents.list.title') }}</span>
        <span v-if="agents.length || knownAgentLimit !== null" class="agents-list__count">{{ countText }}</span>
      </h2>
      <p v-if="suspendedCount" class="app-form-hint agents-list__hint">{{ t('agents.list.suspendedDoNotCount') }}</p>
      <AsyncState
        :loading="list.loading.value && !list.data.value"
        :error="list.data.value ? null : list.error.value"
        :empty="!agents.length"
        :empty-text="blocked === 'noSelfService' ? t('agents.list.emptyNoSelfService') : t('agents.list.empty')"
        @retry="list.reload"
      >
        <ul class="agents-list">
          <li v-for="a in agents" :key="a.actor_id" class="agents-item" @click="open(a)">
            <el-avatar :size="36" class="agents-item__avatar" aria-hidden="true">
              <el-icon><Cpu /></el-icon>
            </el-avatar>
            <div class="agents-item__main">
              <div class="agents-item__head">
                <router-link
                  :to="{ name: 'account-agent', params: { actorId: a.actor_id } }"
                  class="agents-item__name"
                  @click.stop
                >
                  {{ a.display_name }}
                </router-link>
                <el-tag
                  v-if="agentStanding(a) !== 'active'"
                  :type="STANDING_TAG[agentStanding(a)]"
                  size="small"
                  disable-transitions
                >
                  {{ t(`agents.standing.${agentStanding(a)}`) }}
                </el-tag>
                <el-tag v-if="a.pending_requests" type="warning" effect="plain" size="small" disable-transitions>
                  {{ t('agents.list.requests', { n: a.pending_requests }, a.pending_requests) }}
                </el-tag>
              </div>
              <div class="agents-item__meta">
                <PresenceText :value="a.last_seen_at" />
                <span>{{ t('agents.list.seats', { n: a.live_seats }, a.live_seats) }}</span>
                <span class="agents-item__created">
                  {{ t('agents.list.created') }}
                  <TimeText :value="a.created_at" />
                </span>
              </div>
            </div>
            <el-icon class="agents-item__chevron" aria-hidden="true"><ArrowRight /></el-icon>
          </li>
        </ul>
      </AsyncState>
    </section>

    <AboutAgentsCard v-if="isHuman && agents.length" class="agents-view__about-after" />

    <CreateAgentDialog v-model="creating" :counted="counted" @created="onCreated" />
  </div>
</template>

<style scoped>
.agents-view__alert {
  margin-bottom: 16px;
}
.agents-view__about-after {
  margin-top: 16px;
}
.agents-list__count {
  font-size: 13px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.agents-list__hint {
  margin: -6px 0 12px;
}
.agents-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agents-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  margin: 0 -8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
}
.agents-item:last-child {
  border-bottom: none;
}
.agents-item:hover {
  background: var(--el-fill-color-light);
}
.agents-item__avatar {
  flex-shrink: 0;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}
.agents-item__main {
  flex: 1;
  min-width: 0;
}
.agents-item__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.agents-item__name {
  font-weight: 600;
  text-decoration: none;
  word-break: break-word;
}
.agents-item__name:hover {
  text-decoration: underline;
}
.agents-item__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.agents-item__created {
  color: var(--el-text-color-secondary);
}
.agents-item__chevron {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}
</style>
