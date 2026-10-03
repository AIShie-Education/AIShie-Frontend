<script setup lang="ts">
// The agent runtime's own credential for AIshie Core: the site service
// agent_runtime (Core's service.list_credentials, .issue_credential and
// .revoke_credential, as the transcriber's is document_text). With it, and
// nothing else, the runtime checks who owns an agent and is issued, and
// revokes, the one token of each agent hosted on AIshie; without a live one
// it hosts no agent. Root and platform administrators see its credentials
// here, newest first, and may revoke one or issue one.
//
// Setting up the server makes it and gives it to the runtime, and the
// server's `aishie runtime-credential` rotates it: the card says so first.
// One issued here is shown once (Core keeps only its hash), and given to the
// runtime by nobody: the administrator puts it in the runtime's secret
// themselves. The token is kept in this card's state only while the dialog
// that shows it is open.
import { computed, h, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import type { ListItem, ToolOut } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import AsyncState from '@/components/AsyncState.vue'
import TimeText from '@/components/TimeText.vue'
import CopyBlock from '@/views/account/components/agents/CopyBlock.vue'
import ActorLink from './ActorLink.vue'

/** The service Core issues the agent runtime's credentials for. */
const SCOPE = 'agent_runtime'
/** What rotates it on the server (Deploy's wrapper). */
const ROTATE = 'aishie runtime-credential'

type ServiceCredential = ListItem<'service.list_credentials', 'credentials'>
type CredentialState = 'live' | 'revoked' | 'expired'

const { t } = useI18n()

const list = useAsync(() => read('service.list_credentials', { scope: SCOPE }), { keepData: true })
const all = computed<ServiceCredential[]>(() => list.data.value?.credentials ?? [])
const stateOf = (c: ServiceCredential): CredentialState => (c.live ? 'live' : c.revoked_at ? 'revoked' : 'expired')
const showInactive = ref(false)
const inactive = computed(() => all.value.filter((c) => !c.live).length)
const shown = computed(() => all.value.filter((c) => showInactive.value || c.live))
const live = computed(() => all.value.filter((c) => c.live).length)
const STATE_TAG: Record<CredentialState, 'success' | 'danger' | 'info'> = {
  live: 'success',
  revoked: 'danger',
  expired: 'info',
}
const masked = (prefix: string | null | undefined) => (prefix ? `aissvc_${prefix}…` : '—')

// --- Revoking one ------------------------------------------------------------------------
const revokeW = useWrite('service.revoke_credential')
const revoking = ref<string | null>(null)

async function revoke(c: ServiceCredential) {
  const ok = await ElMessageBox.confirm(
    h('p', { style: 'margin: 0; line-height: var(--app-lh-text)' }, t('runtimeAdmin.agentRuntime.revokeBody', { command: ROTATE })),
    t('runtimeAdmin.agentRuntime.revokeTitle'),
    {
      type: 'warning',
      confirmButtonText: t('runtimeAdmin.agentRuntime.revoke'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  revoking.value = c.id
  const out = await revokeW.run(
    { scope: SCOPE, credential_id: c.id },
    { success: t('runtimeAdmin.agentRuntime.revoked'), reasons: 'runtimeAdmin.agentRuntime.coreRefusal' },
  )
  revoking.value = null
  if (out) void list.reload()
}

// --- Issuing one ---------------------------------------------------------------------------
const issueOpen = ref(false)
const form = reactive({ label: '', replace: false })
const issueW = useWrite('service.issue_credential')
/** The credential just issued, while the dialog shows it once; forgotten when it closes. */
const issued = shallowRef<ToolOut<'service.issue_credential'> | null>(null)

watch(issueOpen, (v) => {
  if (!v) return
  form.label = `runtime ${typeof window !== 'undefined' ? window.location.host : ''}`.trim()
  form.replace = false
  issued.value = null
})

async function issue() {
  const label = form.label.trim()
  if (!label || issueW.pending.value) return
  const out = await issueW.run(
    { scope: SCOPE, label, ...(form.replace ? { replace: true } : {}) },
    { success: false, reasons: 'runtimeAdmin.agentRuntime.coreRefusal' },
  )
  if (!out || out.status !== 'executed') return
  issued.value = out.result
  void list.reload()
}
/** The token is not kept any longer than the dialog that shows it. */
function forget() {
  issued.value = null
}
</script>

<template>
  <section class="app-card agent-runtime-card">
    <h2 class="app-card__title agent-runtime-card__title">
      <span>{{ t('runtimeAdmin.agentRuntime.title') }}</span>
      <el-button size="small" class="agent-runtime-card__issue" @click="issueOpen = true">
        <el-icon><Key /></el-icon>
        <span>{{ t('runtimeAdmin.agentRuntime.issue') }}</span>
      </el-button>
    </h2>
    <p class="agent-runtime-card__intro">{{ t('runtimeAdmin.agentRuntime.intro') }}</p>
    <AppNote class="agent-runtime-card__setup">
      <i18n-t keypath="runtimeAdmin.agentRuntime.setup" tag="span" scope="global">
        <template #command>
          <code class="agent-runtime-card__command">{{ ROTATE }}</code>
        </template>
      </i18n-t>
    </AppNote>

    <AsyncState
      :loading="list.loading.value && !list.data.value"
      :error="list.data.value ? null : list.error.value"
      @retry="list.reload"
    >
      <el-alert
        v-if="list.data.value && !live"
        type="warning"
        :closable="false"
        show-icon
        class="agent-runtime-card__none"
      >
        <template #title>
          <i18n-t keypath="runtimeAdmin.agentRuntime.none" tag="span" scope="global">
            <template #command>
              <code class="agent-runtime-card__command">{{ ROTATE }}</code>
            </template>
          </i18n-t>
        </template>
      </el-alert>
      <div v-if="inactive" class="agent-runtime-card__toolbar">
        <el-switch
          v-model="showInactive"
          :active-text="t('runtimeAdmin.agentRuntime.showInactive', { n: inactive })"
        />
      </div>
      <ul v-if="shown.length" class="agent-runtime-card__list">
        <li
          v-for="c in shown"
          :key="c.id"
          class="agent-runtime-card__item"
          :class="{ 'is-inactive': !c.live }"
          :data-credential="c.id"
        >
          <el-icon :size="20" class="agent-runtime-card__icon"><Key /></el-icon>
          <div class="agent-runtime-card__main">
            <div class="agent-runtime-card__head">
              <span class="agent-runtime-card__label">{{ c.label?.trim() || t('admin.credentials.unlabelled') }}</span>
              <AppTag :tone="toneOf(STATE_TAG[stateOf(c)])">
                {{ t(`runtimeAdmin.agentRuntime.state.${stateOf(c)}`) }}
              </AppTag>
            </div>
            <div class="agent-runtime-card__meta">
              <code class="agent-runtime-card__code">{{ masked(c.token_prefix) }}</code>
              <span>
                <span class="agent-runtime-card__k">{{ t('runtimeAdmin.agentRuntime.issuedBy') }}</span>
                <ActorLink v-if="c.issued_by_actor_id" :id="c.issued_by_actor_id" />
                <template v-else>{{ t('runtimeAdmin.agentRuntime.bySetup') }}</template>
              </span>
              <span>
                <span class="agent-runtime-card__k">{{ t('runtimeAdmin.agentRuntime.created') }}</span>
                <TimeText :value="c.created_at" />
              </span>
              <span>
                <span class="agent-runtime-card__k">{{ t('runtimeAdmin.agentRuntime.lastUsed') }}</span>
                <TimeText v-if="c.last_used_at" :value="c.last_used_at" relative />
                <template v-else>{{ t('runtimeAdmin.agentRuntime.neverUsed') }}</template>
              </span>
              <span v-if="c.expires_at">
                <span class="agent-runtime-card__k">{{ t('runtimeAdmin.agentRuntime.expires') }}</span>
                <TimeText :value="c.expires_at" cutoff />
              </span>
              <span v-if="c.revoked_at">
                <span class="agent-runtime-card__k">{{ t('runtimeAdmin.agentRuntime.revokedAt') }}</span>
                <TimeText :value="c.revoked_at" />
              </span>
            </div>
          </div>
          <el-button
            v-if="c.live"
            type="danger"
            plain
            size="small"
            class="agent-runtime-card__revoke"
            :loading="revoking === c.id"
            @click="revoke(c)"
          >
            {{ t('runtimeAdmin.agentRuntime.revoke') }}
          </el-button>
        </li>
      </ul>
    </AsyncState>

    <el-dialog
      v-model="issueOpen"
      :title="issued ? t('runtimeAdmin.agentRuntime.issuedTitle') : t('runtimeAdmin.agentRuntime.issueTitle')"
      width="560px"
      destroy-on-close
      :close-on-click-modal="!issued && !issueW.pending.value"
      class="agent-runtime-issue"
      @closed="forget"
    >
      <template v-if="issued">
        <el-alert
          v-if="issued.token"
          type="warning"
          :closable="false"
          show-icon
          :title="t('runtimeAdmin.agentRuntime.once')"
        />
        <AppNote v-else>{{ t('runtimeAdmin.agentRuntime.replayed') }}</AppNote>
        <CopyBlock
          v-if="issued.token"
          :text="issued.token"
          :label="t('runtimeAdmin.agentRuntime.credential')"
          inline
          class="agent-runtime-issue__token"
        />
        <p class="app-form-hint agent-runtime-issue__where">
          {{ t('runtimeAdmin.agentRuntime.where') }}
        </p>
      </template>
      <template v-else>
        <p class="agent-runtime-issue__body">
          <i18n-t keypath="runtimeAdmin.agentRuntime.issueBody" tag="span" scope="global">
            <template #command>
              <code class="agent-runtime-card__command">{{ ROTATE }}</code>
            </template>
          </i18n-t>
        </p>
        <el-form label-position="top" @submit.prevent="issue">
          <el-form-item :label="t('runtimeAdmin.agentRuntime.label')">
            <el-input v-model="form.label" maxlength="200" class="agent-runtime-issue__label" />
            <div class="app-form-hint">{{ t('runtimeAdmin.agentRuntime.labelHint') }}</div>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="form.replace" :label="t('runtimeAdmin.agentRuntime.replace')" />
            <div class="app-form-hint">{{ t('runtimeAdmin.agentRuntime.replaceHint') }}</div>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button v-if="issued" type="primary" @click="issueOpen = false">
          {{ t('runtimeAdmin.agentRuntime.done') }}
        </el-button>
        <template v-else>
          <el-button @click="issueOpen = false">{{ t('common.actions.cancel') }}</el-button>
          <el-button
            type="primary"
            class="agent-runtime-issue__submit"
            :loading="issueW.pending.value"
            :disabled="!form.label.trim()"
            @click="issue"
          >
            {{ t('runtimeAdmin.agentRuntime.submit') }}
          </el-button>
        </template>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.agent-runtime-card__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.agent-runtime-card__intro {
  margin: -4px 0 12px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.agent-runtime-card__setup,
.agent-runtime-card__none {
  margin-bottom: 12px;
}
.agent-runtime-card__command {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xs);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
}
.agent-runtime-card__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.agent-runtime-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agent-runtime-card__item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.agent-runtime-card__item:last-child {
  border-bottom: none;
}
.agent-runtime-card__item.is-inactive {
  opacity: 0.6;
}
.agent-runtime-card__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}
.agent-runtime-card__main {
  flex: 1;
  min-width: 0;
}
.agent-runtime-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.agent-runtime-card__label {
  font-weight: 500;
  word-break: break-word;
}
.agent-runtime-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 4px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
}
.agent-runtime-card__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.agent-runtime-card__code {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-xs);
}
.agent-runtime-card__revoke {
  flex-shrink: 0;
}
.agent-runtime-issue__body {
  margin: 0 0 12px;
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.agent-runtime-issue__token {
  margin-top: 16px;
}
.agent-runtime-issue__where {
  margin: 12px 0 0;
}
@media (max-width: 520px) {
  .agent-runtime-card__item {
    flex-wrap: wrap;
  }
  .agent-runtime-card__revoke {
    margin-left: 32px;
  }
}
</style>
