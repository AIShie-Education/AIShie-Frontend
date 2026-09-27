<script setup lang="ts">
// One agent's tokens (agent.list_credentials) and revoking one
// (agent.revoke_credential). Issuing is the page's (the "Connect a runtime"
// card asks for it too): this card asks for it with `issue`.
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { ApiError } from '@/api/http'
import type { AgentCredential } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import TimeText from '@/components/TimeText.vue'
import { credentialState, maskedToken, type CredentialState } from '../credentials'

const props = defineProps<{
  actorId: string
  name: string
  credentials: AgentCredential[] | undefined
  loading: boolean
  error: ApiError | null
}>()
const emit = defineEmits<{ changed: []; retry: []; issue: [] }>()
const { t } = useI18n()
const session = useSessionStore()

const showInactive = ref(false)
const tokens = computed(() =>
  (props.credentials ?? []).filter((c) => c.kind === 'api_token').map((c) => ({ c, state: credentialState(c) })),
)
const inactiveCount = computed(() => tokens.value.filter((x) => x.state !== 'active').length)
const shown = computed(() =>
  tokens.value
    .filter((x) => showInactive.value || x.state === 'active')
    .sort((a, b) => Number(b.state === 'active') - Number(a.state === 'active')),
)

const STATE_TAG: Record<CredentialState, 'success' | 'info' | 'danger'> = {
  active: 'success',
  revoked: 'danger',
  expired: 'info',
}

/** Who issued a token, when it was not the caller: an administrator (actor.issue_token). */
function issuer(c: AgentCredential): string | null {
  const id = c.issued_by_actor_id
  if (!id || id.toLowerCase() === session.me?.id?.toLowerCase()) return null
  return c.issued_by_name?.trim() || t('agents.tokens.someoneElse')
}

const { run: runRevoke } = useWrite('agent.revoke_credential')
const revoking = ref<string | null>(null)

async function revoke(credentialId: string, prefix: string | null | undefined) {
  try {
    await ElMessageBox.confirm(
      h('div', [
        h(
          'p',
          { style: 'margin: 0 0 8px' },
          t('agents.tokens.revokeBody', { token: maskedToken(prefix), name: props.name }),
        ),
        h('p', { style: 'margin: 0' }, t('agents.tokens.revokeKeeps')),
      ]),
      t('agents.tokens.revokeTitle'),
      {
        type: 'warning',
        confirmButtonText: t('agents.tokens.revoke'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  revoking.value = credentialId
  const out = await runRevoke(
    { actor_id: props.actorId, credential_id: credentialId },
    { success: t('agents.tokens.revoked') },
  )
  revoking.value = null
  if (out) emit('changed')
}

/** Revokes a token known only by its id and prefix: one just made, which the list may not show yet. */
function revokeById(id: string, prefix: string | null | undefined) {
  return revoke(id, props.credentials?.find((c) => c.id === id)?.token_prefix ?? prefix)
}
defineExpose({ revokeById })
</script>

<template>
  <section class="app-card tokens-card">
    <h2 class="app-card__title">
      <span>{{ t('agents.tokens.title') }}</span>
      <el-button type="primary" plain size="small" @click="emit('issue')">
        <el-icon><Plus /></el-icon>
        <span>{{ t('agents.tokens.new') }}</span>
      </el-button>
    </h2>
    <p class="app-form-hint tokens-card__sub">{{ t('agents.tokens.intro') }}</p>
    <div v-if="inactiveCount" class="tokens-card__toolbar">
      <el-switch v-model="showInactive" :active-text="t('agents.tokens.showInactive', { n: inactiveCount })" />
    </div>
    <AsyncState :loading="loading && !credentials" :error="credentials ? null : error" @retry="emit('retry')">
      <p v-if="!shown.length" class="app-muted tokens-card__empty">{{ t('agents.tokens.empty') }}</p>
      <ul v-else class="tokens-list">
        <li v-for="{ c, state } in shown" :key="c.id" class="token" :class="{ 'is-inactive': state !== 'active' }">
          <el-icon :size="20" class="token__icon"><Key /></el-icon>
          <div class="token__main">
            <div class="token__head">
              <span class="token__label">{{ c.label?.trim() || t('agents.tokens.unlabelled') }}</span>
              <el-tag v-if="state !== 'active'" :type="STATE_TAG[state]" size="small" disable-transitions>
                {{ t(`agents.tokens.state.${state}`) }}
              </el-tag>
            </div>
            <div class="token__meta">
              <span>
                <code class="token__code">{{ maskedToken(c.token_prefix) }}</code>
              </span>
              <span>
                <span class="token__k">{{ t('agents.tokens.lastUsed') }}</span>
                <TimeText v-if="c.last_used_at" :value="c.last_used_at" relative />
                <template v-else>{{ t('agents.tokens.neverUsed') }}</template>
              </span>
              <span>
                <span class="token__k">{{ t('agents.tokens.created') }}</span>
                <TimeText :value="c.created_at" />
              </span>
              <span>
                <span class="token__k">{{ t('agents.tokens.expires') }}</span>
                <TimeText v-if="c.expires_at" :value="c.expires_at" />
                <template v-else>{{ t('agents.tokens.noExpiry') }}</template>
              </span>
              <span v-if="issuer(c)">
                <span class="token__k">{{ t('agents.tokens.issuedBy') }}</span>
                {{ issuer(c) }}
              </span>
              <span v-if="c.revoked_at">
                <span class="token__k">{{ t('agents.tokens.revokedAt') }}</span>
                <TimeText :value="c.revoked_at" />
              </span>
            </div>
          </div>
          <div v-if="state === 'active'" class="token__actions">
            <el-button
              type="danger"
              plain
              size="small"
              :loading="revoking === c.id"
              @click="revoke(c.id, c.token_prefix)"
            >
              {{ t('agents.tokens.revoke') }}
            </el-button>
          </div>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>

<style scoped>
.tokens-card__sub {
  margin: -6px 0 12px;
}
.tokens-card__empty {
  margin: 0;
  padding: 4px 0;
}
.tokens-card__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.tokens-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.token {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.token:first-child {
  padding-top: 0;
}
.token:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.token.is-inactive {
  opacity: 0.6;
}
.token__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}
.token__main {
  flex: 1;
  min-width: 0;
}
.token__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.token__label {
  font-weight: 500;
  word-break: break-word;
}
.token__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.token__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.token__code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
}
.token__actions {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .token {
    flex-wrap: wrap;
  }
  .token__actions {
    width: 100%;
    padding-left: 32px;
  }
}
</style>
