<script setup lang="ts">
// One of the caller's agents (agent.get): its name (agent.update), its
// standing (agent.suspend, agent.reactivate: an administrator's suspension is
// theirs to lift), how it runs, chosen when it was created and never changed
// (hosting), whether people can ask it on the site now (SiteChatCard, which
// switches nothing), the courses it is seated in (agent.withdraw) and the
// requests to seat it that wait (action.withdraw), and bringing it into a
// course (member.add_delegate).
//
// Hosted on AIshie (runtime): the site's agent runtime runs it, and alone is
// issued its token (HostingPanel: hosting it by its id, its model and key);
// the page shows no token, lists none and offers none. With MCP access
// (mcp): its owner's own tools use it (McpAccessCard: the token, Core's MCP
// endpoint and Claude Desktop's configuration), with tokens issued, listed
// and revoked here (agent.issue_token, agent.list_credentials,
// agent.revoke_credential); while it has a token but has never used one, the
// page looks again every few seconds, so that the checklist turns green once
// the tool connects.
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { ApiError, read } from '@/api/http'
import type { AgentToken } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { useWrite } from '@/composables/useWrite'
import { hostingOf } from '@/utils/agents'
import { isUuid } from '@/utils/format'
import AppTag from '@/components/AppTag.vue'
import AgentBadge from '@/components/AgentBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import HostingTag from '@/components/HostingTag.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import PresenceText from '@/components/PresenceText.vue'
import TimeText from '@/components/TimeText.vue'
import AgentIssueTokenDialog from './components/agents/AgentIssueTokenDialog.vue'
import AgentSeatsCard from './components/agents/AgentSeatsCard.vue'
import AgentTokenRevealDialog from './components/agents/AgentTokenRevealDialog.vue'
import AgentTokensCard from './components/agents/AgentTokensCard.vue'
import BringIntoCourseDialog from './components/agents/BringIntoCourseDialog.vue'
import HostingPanel from './components/agents/HostingPanel.vue'
import McpAccessCard from './components/agents/McpAccessCard.vue'
import RenameAgentDialog from './components/agents/RenameAgentDialog.vue'
import SiteChatCard from './components/agents/SiteChatCard.vue'
import { agentStanding, noteAgentLimit, setupProgress } from './components/agents/agents'

const props = defineProps<{ actorId: string }>()
const { t } = useI18n()
const id = computed(() => props.actorId.trim().toLowerCase())

const state = useAsync(
  () => {
    if (!isUuid(id.value)) {
      return Promise.reject(new ApiError({ status: 404, code: 'not_found', message: t('agents.detail.notFound') }))
    }
    return read('agent.get', { actor_id: id.value })
  },
  { watch: [id], keepData: true },
)
const agent = computed(() => (state.data.value?.actor_id === id.value ? state.data.value : undefined))
/** Hosted on AIshie: the site's runtime alone holds its token, and the page shows none. */
const hostedOnAIshie = computed(() => hostingOf(agent.value?.hosting) === 'runtime')
/** With MCP access (or a hosting this page does not know, as before hosting was chosen): tokens of its owner's. */
const withTokens = computed(() => !!agent.value && !hostedOnAIshie.value)
const creds = useAsync(
  () =>
    withTokens.value
      ? read('agent.list_credentials', { actor_id: id.value }).then((o) => o.credentials ?? [])
      : Promise.resolve([]),
  { immediate: false, keepData: true },
)
watch([id, withTokens], () => void (withTokens.value ? creds.reload() : (creds.data.value = undefined)), {
  immediate: true,
})

const standing = computed(() => (agent.value ? agentStanding(agent.value) : 'active'))
const suspended = computed(() => standing.value !== 'active')
const progress = computed(() =>
  setupProgress({
    credentials: creds.data.value,
    lastSeenAt: agent.value?.last_seen_at,
    seats: agent.value?.seats,
    requests: agent.value?.requests,
  }),
)

function reloadAll() {
  void state.reload()
  if (withTokens.value) void creds.reload()
}

// --- Waiting for the first connection -------------------------------------------------
// Only what agent.get says changes when a tool connects; it is read quietly
// (no loading state), and a failure slows the next look down.
const watching = computed(
  () => withTokens.value && !suspended.value && progress.value.connected === 'waiting',
)
usePolling(
  async () => {
    const a = await read('agent.get', { actor_id: id.value })
    if (a.actor_id === id.value) state.data.value = a
  },
  { intervalMs: 10_000, immediate: false, enabled: watching },
)

// --- Name and standing --------------------------------------------------------------
const renaming = ref(false)
function onRenamed(name: string) {
  if (agent.value) state.data.value = { ...agent.value, display_name: name }
}

const suspendW = useWrite('agent.suspend')
const reactivateW = useWrite('agent.reactivate')

async function suspend() {
  const a = agent.value
  if (!a) return
  const ok = await ElMessageBox.confirm(
    t('agents.detail.suspendBody'),
    t('agents.detail.suspendTitle', { name: a.display_name }),
    {
      type: 'warning',
      confirmButtonText: t('agents.detail.suspend'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  const out = await suspendW.run(
    { actor_id: a.actor_id },
    { success: t('agents.detail.suspended', { name: a.display_name }) },
  )
  if (out) await state.reload()
}

async function reactivate() {
  const a = agent.value
  if (!a) return
  const out = await reactivateW.run(
    { actor_id: a.actor_id },
    { success: t('agents.detail.reactivated', { name: a.display_name }) },
  )
  if (!out) noteAgentLimit(reactivateW.lastError.value)
  // Refused because an administrator suspended it meanwhile: the page shows so.
  await state.reload()
}

// --- Tokens (an agent with MCP access) --------------------------------------------------
const issueOpen = ref(false)
const revealOpen = ref(false)
const issued = ref<AgentToken | null>(null)
const tokensCard = useTemplateRef<InstanceType<typeof AgentTokensCard>>('tokensCard')

function onIssued(out: AgentToken) {
  issued.value = out
  revealOpen.value = true
  void creds.reload()
}
// The token is not kept any longer than the dialog that shows it.
function forgetSecret() {
  if (issued.value) issued.value = { ...issued.value, token: '' }
}
function revokeIssued(credentialId: string) {
  void tokensCard.value?.revokeById(credentialId, issued.value?.token_prefix)
}

// --- Courses ---------------------------------------------------------------------------
const bringOpen = ref(false)
function onBrought() {
  void state.reload()
}
</script>

<template>
  <div class="agent-view">
    <PageHeader
      :title="agent?.display_name ?? t('agents.detail.title')"
      :subtitle="agent ? t('agents.detail.subtitle') : undefined"
      :back="{ name: 'account-agents' }"
    >
      <template #tags>
        <template v-if="agent">
          <AgentBadge mine size="default" />
          <AppTag v-if="suspended" size="default" :tone="standing === 'suspendedByMe' ? 'wait' : 'danger'">
            {{ t(`agents.standing.${standing}`) }}
          </AppTag>
        </template>
      </template>
      <template v-if="agent">
        <el-button @click="renaming = true">
          <el-icon><Edit /></el-icon>
          <span>{{ t('agents.detail.rename') }}</span>
        </el-button>
        <el-button v-if="standing === 'active'" type="danger" plain :loading="suspendW.pending.value" @click="suspend">
          <el-icon><CircleClose /></el-icon>
          <span>{{ t('agents.detail.suspend') }}</span>
        </el-button>
        <el-tooltip
          v-else
          :disabled="standing === 'suspendedByMe'"
          :content="t('agents.detail.adminOnly')"
          placement="bottom"
        >
          <span>
            <el-button
              type="primary"
              plain
              :disabled="standing !== 'suspendedByMe'"
              :loading="reactivateW.pending.value"
              @click="reactivate"
            >
              <el-icon><CircleCheck /></el-icon>
              <span>{{ t('agents.detail.reactivate') }}</span>
            </el-button>
          </span>
        </el-tooltip>
        <el-button type="primary" :disabled="suspended" @click="bringOpen = true">
          <el-icon><Plus /></el-icon>
          <span>{{ t('agents.bring.open') }}</span>
        </el-button>
      </template>
    </PageHeader>

    <AsyncState
      :loading="state.loading.value && !agent"
      :error="agent ? null : state.error.value"
      @retry="state.reload"
    >
      <template v-if="agent">
        <el-alert
          v-if="standing === 'suspendedByMe'"
          type="warning"
          :closable="false"
          show-icon
          :title="t('agents.detail.suspendedByMe')"
          class="agent-view__alert"
        />
        <el-alert
          v-else-if="standing === 'suspendedByAdmin'"
          type="error"
          :closable="false"
          show-icon
          :title="t('agents.detail.suspendedByAdmin')"
          :description="t('agents.detail.suspendedByAdminBody')"
          class="agent-view__alert"
        />

        <div class="agent-view__grid app-columns">
          <HostingPanel
            v-if="hostedOnAIshie"
            :agent="agent"
            :standing="standing"
            @bring="bringOpen = true"
            @changed="state.reload"
          />
          <div v-else class="hosting-panel app-column">
            <McpAccessCard
              :progress="progress"
              :last-seen-at="agent.last_seen_at"
              :seats="(agent.seats ?? []).length"
              :watching="watching"
              :disabled="suspended"
              @issue="issueOpen = true"
              @bring="bringOpen = true"
            />
          </div>
          <div class="agent-view__side app-column">
            <section class="app-card">
              <h2 class="app-card__title">{{ t('agents.detail.about') }}</h2>
              <el-descriptions :column="1" border size="small" class="agent-view__desc">
                <el-descriptions-item :label="t('common.agent.hosting.label')">
                  <HostingTag :hosting="agent.hosting" />
                  <div class="app-form-hint agent-view__fixed">{{ t('agents.detail.hostingFixed') }}</div>
                </el-descriptions-item>
                <el-descriptions-item :label="t('agents.detail.presence')">
                  <PresenceText :value="agent.last_seen_at" />
                </el-descriptions-item>
                <el-descriptions-item :label="t('agents.detail.created')">
                  <TimeText :value="agent.created_at" />
                </el-descriptions-item>
                <el-descriptions-item :label="t('agents.detail.id')">
                  <IdText :id="agent.actor_id" />
                </el-descriptions-item>
              </el-descriptions>
              <p class="app-form-hint agent-view__note">{{ t('agents.detail.delegateNote') }}</p>
              <p v-if="withTokens" class="app-form-hint agent-view__note">{{ t('agents.detail.tokenNote') }}</p>
            </section>
            <SiteChatCard :agent="agent" />
          </div>
        </div>

        <AgentSeatsCard :agent="agent" class="agent-view__section" @changed="state.reload" />

        <AgentTokensCard
          v-if="withTokens"
          ref="tokensCard"
          :actor-id="agent.actor_id"
          :name="agent.display_name"
          :credentials="creds.data.value"
          :loading="creds.loading.value"
          :error="creds.error.value"
          class="agent-view__section"
          @changed="reloadAll"
          @retry="creds.reload"
          @issue="issueOpen = true"
        />

        <RenameAgentDialog
          v-model="renaming"
          :actor-id="agent.actor_id"
          :name="agent.display_name"
          @saved="onRenamed"
        />
        <template v-if="withTokens">
          <AgentIssueTokenDialog
            v-model="issueOpen"
            :actor-id="agent.actor_id"
            :name="agent.display_name"
            :suspended="suspended"
            @issued="onIssued"
          />
          <AgentTokenRevealDialog
            v-model="revealOpen"
            :issued="issued"
            :name="agent.display_name"
            @revoke="revokeIssued"
            @closed="forgetSecret"
          />
        </template>
        <BringIntoCourseDialog v-model="bringOpen" :agent="agent" @done="onBrought" />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.agent-view__alert {
  margin-bottom: 12px;
}
/* The page's own width decides its columns, not the window's: the side bar takes from it. */
.agent-view {
  container-type: inline-size;
}
.agent-view__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
}
.agent-view__desc :deep(.el-descriptions__label) {
  white-space: nowrap;
}
.agent-view__note {
  margin: 12px 0 0;
}
.agent-view__fixed {
  margin-top: 2px;
}
.agent-view__section {
  margin-top: 16px;
}
/* Two columns (3 : 2) while the main one keeps 420 px or more. */
@container (max-width: 719px) {
  .agent-view__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
