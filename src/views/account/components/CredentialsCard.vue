<script setup lang="ts">
// Every way into the caller's account (credential.list), revoking one
// (credential.revoke), and making an API token (credential.issue_token).
import { computed, h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ApiError } from '@/api/http'
import type { Credential, ToolOut } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import IssueTokenDialog from './IssueTokenDialog.vue'
import TokenRevealDialog from './TokenRevealDialog.vue'
import {
  credentialState,
  isCurrentToken,
  linkedBy,
  maskedToken,
  sessionOrigin,
  thisBrowserSession,
  type CredentialState,
} from './credentials'

const props = defineProps<{
  credentials: Credential[] | undefined
  /** When the list was asked for (Date.now()), to tell this browser's session by. */
  listedAt?: number
  loading: boolean
  error: ApiError | null
}>()
const emit = defineEmits<{ changed: []; retry: [] }>()
const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()

const showInactive = ref(false)
// The session this browser signs in with, when it can be told; null when it
// cannot, and when this tab signs in with a token instead.
const thisSession = computed(() => thisBrowserSession(props.credentials ?? [], props.listedAt))
function isCurrent(c: Credential): boolean {
  return isCurrentToken(c) || (!!thisSession.value && c.id === thisSession.value)
}
const all = computed(() =>
  (props.credentials ?? []).map((c) => ({ c, state: credentialState(c), current: isCurrent(c) })),
)
const inactiveCount = computed(() => all.value.filter((x) => x.state !== 'active').length)
const shown = computed(() =>
  all.value
    .filter((x) => showInactive.value || x.state === 'active')
    // This tab's own token or session first, then live before dead; Core's order (newest first) otherwise.
    .sort(
      (a, b) => Number(b.current) - Number(a.current) || Number(b.state === 'active') - Number(a.state === 'active'),
    ),
)
const hasSessions = computed(() => all.value.some((x) => x.c.kind === 'session' && x.state === 'active'))

const KIND_ICON: Record<string, string> = {
  password: 'Lock',
  sso: 'Connection',
  api_token: 'Key',
  session: 'Monitor',
}
const STATE_TAG: Record<CredentialState, 'success' | 'info' | 'danger'> = {
  active: 'success',
  revoked: 'danger',
  expired: 'info',
}

// A token is named by whoever made it. Core names the rest itself, in English
// and for its own records ("password login", "linked by …"): those are put in
// the reader's words, or shown as a note when they say something unforeseen.
function title(c: Credential): string {
  switch (c.kind) {
    case 'api_token':
      return c.label?.trim() || t('enums.credentialKind.api_token')
    case 'session': {
      const o = sessionOrigin(c.label)
      if (o?.via === 'password') return t('account.credentials.sessionVia.password')
      if (o?.via === 'sso') return t('account.credentials.sessionVia.sso', { provider: o.provider })
      return t('enums.credentialKind.session')
    }
    case 'sso':
      return c.provider || t('enums.credentialKind.sso')
    default:
      return t(`enums.credentialKind.${c.kind}`)
  }
}

function linker(c: Credential): string | null {
  return c.kind === 'sso' ? linkedBy(c.label) : null
}

/** Core's label, when the title and the rest do not already say it. */
function note(c: Credential): string | null {
  if (!c.label || c.kind === 'api_token') return null
  if (c.kind === 'session' && sessionOrigin(c.label)) return null
  if (linker(c)) return null
  return c.label
}

// --- Revoking ---------------------------------------------------------------
const { run: runRevoke } = useWrite('credential.revoke')
const revoking = ref<string | null>(null)

function revokeLines(c: Credential, current: boolean): string[] {
  const lines: string[] = []
  switch (c.kind) {
    case 'api_token':
      lines.push(t('account.revoke.api_token', { name: maskedToken(c.token_prefix) }))
      if (current) lines.push(t('account.revoke.current'))
      break
    case 'session':
      lines.push(t('account.revoke.session'))
      if (current) lines.push(t('account.revoke.currentSession'))
      // When this browser's session cannot be told from the others, warn
      // whenever this tab signs in with a cookie at all.
      else if (!session.usingToken && !thisSession.value) lines.push(t('account.revoke.sessionMaybeMine'))
      break
    case 'password':
      lines.push(t('account.revoke.password'))
      break
    case 'sso':
      lines.push(t('account.revoke.sso', { provider: c.provider || t('enums.credentialKind.sso') }))
      break
  }
  // An identity linked to this account again is the same credential revived
  // (actor.link_sso): only the others are gone for good.
  if (c.kind !== 'sso') lines.push(t('account.revoke.irreversible'))
  return lines
}

async function revoke(c: Credential) {
  const current = isCurrent(c)
  try {
    await ElMessageBox.confirm(
      h(
        'div',
        { class: 'revoke-confirm' },
        revokeLines(c, current).map((line) => h('p', { style: 'margin: 0 0 8px' }, line)),
      ),
      t('account.revoke.title'),
      {
        type: 'warning',
        confirmButtonText: t('account.revoke.confirm'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  revoking.value = c.id
  const out = await runRevoke({ credential_id: c.id }, { success: t('account.revoke.done') })
  revoking.value = null
  if (!out) return
  if (out.status === 'executed' && current) {
    // Signed out already: reading the list again would only be refused.
    await session.signOut().catch(() => undefined)
    const message = c.kind === 'session' ? t('account.revoke.signedOutSession') : t('account.revoke.signedOut')
    ElMessage({ type: 'warning', message, duration: 6000 })
    router.push({ name: 'login' })
    return
  }
  emit('changed')
}

async function revokeById(id: string) {
  // The list may not have caught up with a token just made: what is known of
  // it from the call that made it is enough to revoke it.
  const fromList = props.credentials?.find((x) => x.id === id)
  const made = issued.value
  const c: Credential | null =
    fromList ??
    (made && made.credential_id === id
      ? { id, kind: 'api_token', token_prefix: made.token_prefix, created_at: new Date().toISOString() }
      : null)
  if (c) await revoke(c)
}

// --- Issuing ----------------------------------------------------------------
const issueOpen = ref(false)
const revealOpen = ref(false)
const issued = ref<ToolOut<'credential.issue_token'> | null>(null)

function onIssued(out: ToolOut<'credential.issue_token'>) {
  issued.value = out
  revealOpen.value = true
  emit('changed')
}

// The token is not kept any longer than the dialog that shows it: what is
// left is enough to revoke it by (revokeById).
function forgetSecret() {
  if (issued.value) issued.value = { ...issued.value, token: '' }
}
</script>

<template>
  <section class="app-card creds-card">
    <h2 class="app-card__title">
      <span>{{ t('account.credentials.title') }}</span>
      <el-button type="primary" @click="issueOpen = true">
        <el-icon><Plus /></el-icon>
        <span>{{ t('account.credentials.newToken') }}</span>
      </el-button>
    </h2>
    <p class="app-form-hint creds-card__sub">{{ t('account.credentials.subtitle') }}</p>

    <div v-if="inactiveCount" class="creds-card__toolbar">
      <el-switch v-model="showInactive" :active-text="t('account.credentials.showInactive', { n: inactiveCount })" />
    </div>

    <AsyncState
      :loading="loading && !credentials"
      :error="credentials ? null : error"
      :empty="!shown.length"
      :empty-text="t('account.credentials.empty')"
      @retry="emit('retry')"
    >
      <ul class="creds-list">
        <li
          v-for="{ c, state, current } in shown"
          :key="c.id"
          class="creds-item"
          :class="{ 'is-inactive': state !== 'active', 'is-current': current }"
        >
          <el-icon :size="22" class="creds-item__icon">
            <component :is="KIND_ICON[c.kind] ?? 'Key'" />
          </el-icon>
          <div class="creds-item__main">
            <div class="creds-item__head">
              <span class="creds-item__title">{{ title(c) }}</span>
              <StatusTag vocab="credentialKind" :value="c.kind" />
              <el-tag v-if="state !== 'active'" :type="STATE_TAG[state]" size="small" disable-transitions>
                {{ t(`account.credentials.state.${state}`) }}
              </el-tag>
              <el-tag v-if="current" type="warning" effect="dark" size="small" disable-transitions>
                {{ c.kind === 'session' ? t('account.credentials.thisBrowser') : t('account.credentials.thisTab') }}
              </el-tag>
            </div>
            <div class="creds-item__meta">
              <span v-if="c.kind === 'api_token' && c.token_prefix">
                <span class="creds-item__k">{{ t('account.credentials.token') }}</span>
                <code class="creds-item__code">{{ maskedToken(c.token_prefix) }}</code>
              </span>
              <span v-if="c.kind === 'sso' && c.subject" class="creds-item__subject">
                <span class="creds-item__k">{{ t('account.credentials.subject') }}</span>
                {{ c.subject }}
              </span>
              <span v-if="linker(c)">
                <span class="creds-item__k">{{ t('account.credentials.linkedBy') }}</span>
                {{ linker(c) }}
              </span>
              <span>
                <span class="creds-item__k">{{ t('account.credentials.created') }}</span>
                <TimeText :value="c.created_at" />
              </span>
              <span v-if="c.kind === 'api_token' || c.kind === 'session' || c.last_used_at">
                <span class="creds-item__k">{{ t('account.credentials.lastUsed') }}</span>
                <TimeText v-if="c.last_used_at" :value="c.last_used_at" relative />
                <template v-else>{{ t('account.credentials.neverUsed') }}</template>
              </span>
              <span v-if="c.kind === 'api_token' || c.kind === 'session'">
                <span class="creds-item__k">{{ t('account.credentials.expires') }}</span>
                <TimeText v-if="c.expires_at" :value="c.expires_at" />
                <template v-else>{{ t('account.credentials.noExpiry') }}</template>
              </span>
              <span v-if="c.revoked_at">
                <span class="creds-item__k">{{ t('account.credentials.revokedAt') }}</span>
                <TimeText :value="c.revoked_at" />
              </span>
              <span v-if="note(c)" class="creds-item__note">
                <span class="creds-item__k">{{ t('account.credentials.note') }}</span>
                {{ note(c) }}
              </span>
            </div>
          </div>
          <div v-if="state === 'active'" class="creds-item__actions">
            <el-button type="danger" plain size="small" :loading="revoking === c.id" @click="revoke(c)">
              {{ t('account.credentials.revoke') }}
            </el-button>
          </div>
        </li>
      </ul>
      <p v-if="hasSessions && !session.usingToken" class="app-form-hint creds-card__note">
        {{ thisSession ? t('account.credentials.sessionNote') : t('account.credentials.sessionNoteUnsure') }}
      </p>
    </AsyncState>

    <IssueTokenDialog v-model="issueOpen" @issued="onIssued" @proposed="emit('changed')" />
    <TokenRevealDialog v-model="revealOpen" :issued="issued" @revoke="revokeById" @closed="forgetSecret" />
  </section>
</template>

<style scoped>
.creds-card__sub {
  margin: -6px 0 12px;
}
.creds-card__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.creds-card__note {
  margin: 12px 0 0;
}
.creds-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.creds-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.creds-item:last-child {
  border-bottom: none;
}
.creds-item.is-inactive {
  opacity: 0.6;
}
.creds-item__icon {
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}
.creds-item.is-current .creds-item__icon {
  color: var(--el-color-warning);
}
.creds-item__main {
  flex: 1;
  min-width: 0;
}
.creds-item__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.creds-item__title {
  font-weight: 500;
  word-break: break-word;
}
.creds-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.creds-item__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.creds-item__code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
}
.creds-item__subject {
  word-break: break-all;
}
.creds-item__note {
  word-break: break-word;
}
.creds-item__actions {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .creds-item {
    flex-wrap: wrap;
  }
  .creds-item__actions {
    width: 100%;
    padding-left: 34px;
  }
}
</style>
