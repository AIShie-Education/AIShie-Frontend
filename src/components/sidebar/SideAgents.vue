<script setup lang="ts">
// The side bar's agents: those the caller owns (agent.list, as My agents
// reads them), each with its name, whether it is suspended and whether it is
// connected; registering a new one, in the same dialog as My agents (not
// offered where only an administrator registers agents, held back at the
// limit); and a link to My agents. Only a person owns agents, and only a
// person is offered this view. Whether an agent is connected changes by
// itself: the list is read again every minute while it is shown, and on
// going to one of the agents' pages, where it may have changed.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { AgentSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import AgentName from '@/components/AgentName.vue'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import PresenceText from '@/components/PresenceText.vue'
import CreateAgentDialog from '@/views/account/components/agents/CreateAgentDialog.vue'
import {
  agentStanding,
  countedAgents,
  createBlock,
  knownAgentLimit,
  noteAgentList,
} from '@/views/account/components/agents/agents'
import { viewForPath } from './frame'

/** How often the list is read again while it is shown, for whether each agent is connected. */
const REFRESH_MS = 60_000

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const list = useAsync(
  () =>
    read('agent.list', {}).then((o) => {
      noteAgentList(o)
      return o.agents ?? []
    }),
  { keepData: true },
)
usePolling(() => list.reload(), { intervalMs: REFRESH_MS, immediate: false })
watch(
  () => route.path,
  (path) => {
    if (viewForPath(path) === 'agents') void list.reload()
  },
)

const agents = computed<AgentSummary[]>(() => list.data.value ?? [])
const counted = computed(() => countedAgents(agents.value))
/** Why a new agent cannot be registered now, once agent.list has said. */
const blocked = computed(() => (list.data.value ? createBlock(counted.value) : null))

const creating = ref(false)
function onCreated(actorId: string) {
  void list.reload()
  void router.push({ name: 'account-agent', params: { actorId } })
}

const shownAgent = computed(() =>
  route.name === 'account-agent' && typeof route.params.actorId === 'string' ? route.params.actorId : null,
)
const STANDING_TAG = { active: 'success', suspendedByMe: 'warning', suspendedByAdmin: 'danger' } as const
</script>

<template>
  <div class="side-agents">
    <div v-if="blocked !== 'noSelfService'" class="side-agents__tools">
      <el-button
        size="small"
        class="side-agents__new"
        :disabled="!!blocked"
        :title="blocked === 'atLimit' ? t('agents.limit.reached', { limit: knownAgentLimit ?? 0 }) : undefined"
        @click="creating = true"
      >
        <el-icon aria-hidden="true"><Plus /></el-icon>
        <span>{{ t('agents.list.new') }}</span>
      </el-button>
    </div>

    <div v-if="list.loading.value && !list.data.value" v-loading="true" class="side-loading" />
    <p v-else-if="list.error.value && !list.data.value" class="side-note">
      {{ t('layout.side.failed') }}
      <el-button text size="small" type="primary" @click="list.reload()">{{ t('common.actions.retry') }}</el-button>
    </p>
    <p v-else-if="!agents.length" class="side-note">{{ t('layout.side.noAgents') }}</p>
    <nav v-else class="side-list" :aria-label="t('layout.agents')">
      <router-link
        v-for="a in agents"
        :key="a.actor_id"
        :to="{ name: 'account-agent', params: { actorId: a.actor_id } }"
        class="side-item side-agent"
        :class="{ 'is-active': shownAgent === a.actor_id }"
        :aria-current="shownAgent === a.actor_id ? 'page' : undefined"
      >
        <AgentName :name="a.display_name" ellipsis class="side-agent__name" />
        <span class="side-agent__meta">
          <PresenceText :value="a.last_seen_at" />
          <el-tag
            v-if="agentStanding(a) !== 'active'"
            :type="STANDING_TAG[agentStanding(a)]"
            size="small"
            disable-transitions
          >
            {{ t(`agents.standing.${agentStanding(a)}`) }}
          </el-tag>
        </span>
      </router-link>
    </nav>

    <router-link
      :to="{ name: 'account-agents' }"
      class="side-item side-link"
      :class="{ 'is-active': route.name === 'account-agents' }"
    >
      <el-icon aria-hidden="true"><AgentSeatIcon /></el-icon>
      <span>{{ t('common.nav.agents') }}</span>
    </router-link>

    <!-- Out of the side bar, over the whole page. -->
    <CreateAgentDialog v-model="creating" :counted="counted" append-to-body @created="onCreated" />
  </div>
</template>

<style scoped>
.side-agents__tools {
  padding: 0 4px 8px;
}
.side-agents__new {
  width: 100%;
}
.side-agents__new .el-icon + span {
  margin-left: 4px;
}
.side-item.side-agent {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.side-agent__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.side-agent__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.side-agent__meta :deep(.presence) {
  font-size: var(--app-text-xs);
}
</style>
