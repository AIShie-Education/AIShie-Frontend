<script setup lang="ts">
// An actor's ways in (actor.list_credentials), and revoking one of them
// (actor.revoke_credential) without suspending the actor: a token that has
// leaked, a browser left signed in. API tokens come first, with who issued
// each (an agent hosted on AIshie holds one alone, issued to the site's
// agent runtime, and said so); sessions, a password, single sign-on and an invitation follow,
// compactly. Only agents are given API tokens: a person's list shows the
// tokens only when they still hold one (made before), saying it is to be
// revoked. Listing and revoking are held to the rule for issuing
// (blockedReason): where Core would refuse, the card says why and reads
// nothing. One's own are listed but revoked on the Account page, which can
// tell which session is the one in use. A Core without the tool gets a line
// saying so, not a card.
import { computed, h, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { Actor } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import {
  invitedBy,
  linkedBy,
  maskedToken,
  sessionOrigin,
  type CredentialState,
} from '@/views/account/components/credentials'
import {
  arrangeCredentials,
  credentialListMissing,
  isTemporaryPassword as temporary,
  listActorCredentials,
  tokenIssuer,
  type ActorCredential,
  type CredentialRow,
} from './actorCredentials'

const props = defineProps<{ actor: Actor; isSelf?: boolean; blockedReason?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()
const session = useSessionStore()
// Six columns and a button want about 1000px inside the card: with less, a
// card per token. The card's own width decides, not the window's; it is
// measured by its title, as wide as the table.
const title = useTemplateRef<HTMLElement>('title')
const narrow = useContainerNarrow(title, 999)

/** Core lists one's own, and another's only to whoever may act on them (the rule blockedReason gives). */
const listable = computed(() => props.isSelf || !props.blockedReason)

// The list, with whose it is and when it was read, so that another actor's
// list is never shown for a moment on this one's page. Where Core would only
// refuse, nothing is asked.
const list = useAsync(
  async () => {
    const actorId = props.actor.id
    const listedAt = Date.now()
    const credentials = credentialListMissing.value || !listable.value ? [] : await listActorCredentials(actorId)
    return { actorId, credentials, listedAt }
  },
  { watch: [() => props.actor.id, listable], keepData: true },
)
const current = computed(() => (list.data.value?.actorId === props.actor.id ? list.data.value : undefined))

const showInactive = ref(false)
const arranged = computed(() =>
  arrangeCredentials(current.value?.credentials, { showInactive: showInactive.value, now: current.value?.listedAt }),
)
const tokens = computed(() => arranged.value.tokens.map((r) => ({ ...r, issuer: tokenIssuer(r.c, props.actor.id) })))
// A person signs in in several ways; an agent normally has tokens only.
const isPerson = computed(() => props.actor.kind === 'human')
const showOthers = computed(() => isPerson.value || arranged.value.others.length > 0)
// A person is given no token, so no "none" is said of theirs: only one they still hold is shown.
const showTokens = computed(() => !isPerson.value || tokens.value.length > 0)
/** A person holds a token that still works: it is to be revoked. */
const personHoldsToken = computed(() => isPerson.value && tokens.value.some((r) => r.state === 'active'))
const canRevoke = computed(() => !props.isSelf && !props.blockedReason)

const rowKey = (r: CredentialRow) => r.c.id
const rowClass = ({ row }: { row: CredentialRow }) => (row.state === 'active' ? '' : 'is-inactive')

const STATE_TAG: Record<CredentialState, 'success' | 'info' | 'danger'> = {
  active: 'success',
  revoked: 'danger',
  expired: 'info',
}
const KIND_ICON: Record<string, string> = {
  password: 'Lock',
  sso: 'Connection',
  api_token: 'Key',
  session: 'Monitor',
  invite: 'Message',
}

function tokenLabel(c: ActorCredential): string {
  return c.label?.trim() || t('admin.credentials.unlabelled')
}

function kindName(kind: string): string {
  return te(`enums.credentialKind.${kind}`) ? t(`enums.credentialKind.${kind}`) : kind
}

// Core names sessions, identities and invitations itself, in English and for
// its own records ("password login", "linked by …"): put in the reader's
// words, or shown as a note when they say something unforeseen.
function otherTitle(c: ActorCredential): string {
  if (c.kind === 'session') {
    const o = sessionOrigin(c.label)
    if (o?.via === 'password') return t('admin.credentials.sessionVia.password')
    if (o?.via === 'invite') return t('admin.credentials.sessionVia.invite')
    if (o?.via === 'sso') return t('admin.credentials.sessionVia.sso', { provider: o.provider })
  }
  if (c.kind === 'sso' && c.provider) return c.provider
  return kindName(c.kind)
}

/** The kind is shown beside a title that does not already name it. */
function showKind(c: ActorCredential): boolean {
  return c.kind === 'session' || (c.kind === 'sso' && !!c.provider)
}

function linker(c: ActorCredential): string | null {
  return c.kind === 'sso' ? linkedBy(c.label) : null
}

function inviter(c: ActorCredential): string | null {
  return c.kind === 'invite' ? invitedBy(c.label) : null
}

function note(c: ActorCredential): string | null {
  if (!c.label) return null
  if (c.kind === 'session' && sessionOrigin(c.label)) return null
  if (linker(c) || inviter(c)) return null
  return c.label
}

// --- Revoking ---------------------------------------------------------------
const { run: runRevoke, lastError } = useWrite('actor.revoke_credential')
const revoking = ref<string | null>(null)

function confirmLines(c: ActorCredential): { text: string; strong?: boolean }[] {
  const name = props.actor.display_name
  const keeps = { text: t('admin.credentials.confirm.keeps', { name }) }
  switch (c.kind) {
    case 'api_token':
      return [
        { text: t('admin.credentials.confirm.api_token', { token: maskedToken(c.token_prefix) }) },
        { text: t('admin.credentials.confirm.irreversible', { name }), strong: true },
        keeps,
      ]
    case 'session':
      return [{ text: t('admin.credentials.confirm.session', { name }) }, keeps]
    case 'password':
      return [{ text: t('admin.credentials.confirm.password', { name }) }, keeps]
    case 'sso':
      return [{ text: t('admin.credentials.confirm.sso', { name, provider: c.provider || kindName('sso') }) }, keeps]
    case 'invite':
      return [{ text: t('admin.credentials.confirm.invite') }]
    default:
      return [{ text: t('admin.credentials.confirm.other') }, keeps]
  }
}

async function revoke(c: ActorCredential) {
  if (!canRevoke.value) return
  const isSession = c.kind === 'session'
  const title =
    c.kind === 'api_token'
      ? t('admin.credentials.confirm.titleToken', { label: tokenLabel(c) })
      : isSession
        ? t('admin.credentials.confirm.titleSession')
        : t('admin.credentials.confirm.title')
  const message = h(
    'div',
    confirmLines(c).map((l) => h('p', { style: `margin: 0 0 8px;${l.strong ? ' font-weight: 600;' : ''}` }, l.text)),
  )
  const ok = await ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText: isSession ? t('common.actions.signOut') : t('admin.credentials.revoke'),
    cancelButtonText: t('common.actions.cancel'),
    confirmButtonClass: 'el-button--danger',
  }).catch(() => false)
  if (!ok) return
  revoking.value = c.id
  const out = await runRevoke(
    { actor_id: props.actor.id, credential_id: c.id },
    { success: isSession ? t('admin.credentials.signedOut') : t('admin.credentials.revoked') },
  )
  revoking.value = null
  // Not found: it is no longer live (revoked meanwhile, or expired), which
  // the list read again shows.
  if (out || lastError.value?.isNotFound) await list.reload()
  // A password, an identity or an invitation is part of how the page says
  // they sign in.
  if (out) emit('changed')
}

defineExpose({ reload: () => list.reload() })
</script>

<template>
  <p v-if="credentialListMissing" class="app-form-hint creds-missing">
    <el-icon class="creds-missing__icon"><InfoFilled /></el-icon>
    <span>{{ t('admin.credentials.missing') }}</span>
  </p>
  <section v-else class="app-card creds">
    <h2 ref="title" class="app-card__title creds__title">
      <span>{{ t('admin.credentials.title') }}</span>
      <el-switch
        v-if="arranged.inactive"
        v-model="showInactive"
        :active-text="t('admin.credentials.showInactive', { n: arranged.inactive })"
        class="creds__toggle"
      />
    </h2>
    <!-- Where nothing can be listed (the system actor; a platform-role holder, short of root), only why is said, below. -->
    <p v-if="listable" class="app-muted creds__intro">
      {{ actor.kind === 'human' ? t('admin.credentials.introHuman') : t('admin.credentials.introAgent') }}
    </p>
    <AppNote v-if="isSelf" :title="t('admin.credentials.self')" class="creds__alert">
      <router-link :to="{ name: 'account' }">{{ t('admin.credentials.selfLink') }}</router-link>
    </AppNote>
    <p v-else-if="blockedReason" class="app-form-hint creds__blocked">{{ blockedReason }}</p>

    <AsyncState
      v-if="listable"
      :loading="list.loading.value && !current"
      :error="current ? null : list.error.value"
      @retry="list.reload"
    >
      <template v-if="showTokens">
        <h3 class="creds__subhead">{{ t('admin.credentials.tokens') }}</h3>
        <p v-if="personHoldsToken" class="creds__agents-only">{{ t('admin.credentials.personTokens') }}</p>
        <p v-if="!tokens.length" class="app-muted creds__empty">
          {{
            arranged.inactive && !showInactive ? t('admin.credentials.noLiveTokens') : t('admin.credentials.noTokens')
          }}
        </p>

        <!-- Short of a wide card, a card per token. -->
        <ul v-else-if="narrow" class="creds__list">
          <li
            v-for="{ c, state, issuer } in tokens"
            :key="c.id"
            class="creds__item creds-token"
            :class="{ 'is-inactive': state !== 'active' }"
          >
            <el-icon :size="20" class="creds__icon"><Key /></el-icon>
            <div class="creds__main">
              <div class="creds__head">
                <span class="creds__name" :class="{ 'app-muted': !c.label?.trim() }">{{ tokenLabel(c) }}</span>
                <AppTag :variant="state === 'active' ? 'quiet' : 'pill'" :tone="toneOf(STATE_TAG[state])">
                  {{ t(`admin.credentials.state.${state}`) }}
                </AppTag>
              </div>
              <div class="creds__meta">
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.token') }}</span>
                  <code class="creds__code">{{ maskedToken(c.token_prefix) }}</code>
                </span>
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.issuedBy') }}</span>
                  <span v-if="issuer?.by === 'self'">{{ t('admin.credentials.selfIssued') }}</span>
                  <span v-else-if="issuer?.by === 'runtime'" class="creds__runtime">{{
                    t('admin.credentials.issuedToRuntime')
                  }}</span>
                  <template v-else-if="issuer?.by === 'other'">
                    <router-link :to="{ name: 'admin-actor', params: { actorId: issuer.id } }" class="creds__issuer">
                      <template v-if="issuer.name">{{ issuer.name }}</template>
                      <IdText v-else :id="issuer.id" /> </router-link
                    ><span v-if="issuer.id === session.me?.id" class="app-muted app-you">{{
                      t('common.labels.youTag')
                    }}</span>
                  </template>
                  <span v-else class="app-muted">{{ t('admin.credentials.issuerUnknown') }}</span>
                </span>
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.created') }}</span>
                  <TimeText :value="c.created_at" />
                </span>
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.expires') }}</span>
                  <TimeText v-if="c.expires_at" :value="c.expires_at" />
                  <template v-else>{{ t('common.labels.never') }}</template>
                </span>
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.lastUsed') }}</span>
                  <TimeText v-if="c.last_used_at" :value="c.last_used_at" relative />
                  <template v-else>{{ t('admin.credentials.neverUsed') }}</template>
                </span>
                <span v-if="c.revoked_at">
                  <span class="creds__k">{{ t('admin.credentials.revokedAt') }}</span>
                  <TimeText :value="c.revoked_at" />
                </span>
              </div>
            </div>
            <div v-if="canRevoke && state === 'active'" class="creds__actions">
              <el-button type="danger" plain size="small" :loading="revoking === c.id" @click="revoke(c)">
                {{ t('admin.credentials.revoke') }}
              </el-button>
            </div>
          </li>
        </ul>

        <el-table v-else :data="tokens" :row-key="rowKey" :row-class-name="rowClass" class="creds__table">
          <el-table-column :label="t('admin.credentials.col.label')" min-width="170">
            <template #default="{ row }">
              <div class="creds__head">
                <span class="creds__name" :class="{ 'app-muted': !row.c.label?.trim() }">{{ tokenLabel(row.c) }}</span>
                <AppTag
                  :variant="row.state === 'active' ? 'quiet' : 'pill'"
                  :tone="toneOf(STATE_TAG[row.state as CredentialState])"
                >
                  {{ t(`admin.credentials.state.${row.state}`) }}
                </AppTag>
              </div>
              <div v-if="row.c.revoked_at" class="creds__when">
                <span class="creds__k">{{ t('admin.credentials.revokedAt') }}</span>
                <TimeText :value="row.c.revoked_at" />
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.credentials.col.token')" min-width="165">
            <template #default="{ row }">
              <code class="creds__code">{{ maskedToken(row.c.token_prefix) }}</code>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.credentials.col.issuedBy')" min-width="130">
            <template #default="{ row }">
              <span v-if="row.issuer?.by === 'self'">{{ t('admin.credentials.selfIssued') }}</span>
              <span v-else-if="row.issuer?.by === 'runtime'" class="creds__runtime">{{
                t('admin.credentials.issuedToRuntime')
              }}</span>
              <template v-else-if="row.issuer?.by === 'other'">
                <router-link :to="{ name: 'admin-actor', params: { actorId: row.issuer.id } }" class="creds__issuer">
                  <template v-if="row.issuer.name">{{ row.issuer.name }}</template>
                  <IdText v-else :id="row.issuer.id" /> </router-link
                ><span v-if="row.issuer.id === session.me?.id" class="app-muted app-you">{{
                  t('common.labels.youTag')
                }}</span>
              </template>
              <span v-else class="app-muted">{{ t('admin.credentials.issuerUnknown') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.credentials.col.created')" min-width="150">
            <template #default="{ row }"><TimeText :value="row.c.created_at" /></template>
          </el-table-column>
          <el-table-column :label="t('admin.credentials.col.expires')" min-width="150">
            <template #default="{ row }">
              <TimeText v-if="row.c.expires_at" :value="row.c.expires_at" />
              <span v-else class="app-muted">{{ t('common.labels.never') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.credentials.col.lastUsed')" min-width="110">
            <template #default="{ row }">
              <TimeText v-if="row.c.last_used_at" :value="row.c.last_used_at" relative />
              <span v-else class="app-muted">{{ t('admin.credentials.neverUsed') }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="canRevoke" :label="t('common.labels.actions')" width="100" align="right" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.state === 'active'"
                type="danger"
                plain
                size="small"
                :loading="revoking === row.c.id"
                @click="revoke(row.c)"
              >
                {{ t('admin.credentials.revoke') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-if="showOthers">
        <h3 class="creds__subhead" :class="{ 'creds__subhead--others': showTokens }">
          {{ t('admin.credentials.signIns') }}
        </h3>
        <p v-if="!arranged.others.length" class="app-muted creds__empty">{{ t('admin.credentials.noSignIns') }}</p>
        <ul v-else class="creds__list">
          <li
            v-for="{ c, state } in arranged.others"
            :key="c.id"
            class="creds__item creds-other"
            :class="{ 'is-inactive': state !== 'active' }"
          >
            <el-icon :size="18" class="creds__icon">
              <component :is="KIND_ICON[c.kind] ?? 'Key'" />
            </el-icon>
            <div class="creds__main">
              <div class="creds__head">
                <span class="creds__name">{{ otherTitle(c) }}</span>
                <StatusTag v-if="showKind(c)" vocab="credentialKind" :value="c.kind" />
                <AppTag v-if="state !== 'active'" :tone="toneOf(STATE_TAG[state])">
                  {{ t(`admin.credentials.state.${state}`) }}
                </AppTag>
                <AppTag v-else-if="temporary(c)" tone="wait">
                  {{ t('admin.credentials.temporary') }}
                </AppTag>
              </div>
              <div class="creds__meta">
                <span v-if="temporary(c) && c.issued_by_name">
                  <span class="creds__k">{{ t('admin.credentials.setBy') }}</span>
                  {{ c.issued_by_name }}
                </span>
                <span v-if="temporary(c) && state === 'active'">{{ t('admin.credentials.temporaryHint') }}</span>
                <span v-if="c.kind === 'sso' && c.subject" class="creds__subject">
                  <span class="creds__k">{{ t('admin.credentials.subject') }}</span>
                  {{ c.subject }}
                </span>
                <span v-if="linker(c)">
                  <span class="creds__k">{{ t('admin.credentials.linkedBy') }}</span>
                  {{ linker(c) }}
                </span>
                <span v-if="inviter(c)">
                  <span class="creds__k">{{ t('admin.credentials.invitedBy') }}</span>
                  {{ inviter(c) }}
                </span>
                <span>
                  <span class="creds__k">{{ t('admin.credentials.col.created') }}</span>
                  <TimeText :value="c.created_at" />
                </span>
                <span v-if="c.kind === 'session' || c.last_used_at">
                  <span class="creds__k">{{ t('admin.credentials.col.lastUsed') }}</span>
                  <TimeText v-if="c.last_used_at" :value="c.last_used_at" relative />
                  <template v-else>{{ t('admin.credentials.neverUsed') }}</template>
                </span>
                <span v-if="c.expires_at">
                  <span class="creds__k">{{ t('admin.credentials.col.expires') }}</span>
                  <TimeText :value="c.expires_at" />
                </span>
                <span v-if="c.revoked_at">
                  <span class="creds__k">{{ t('admin.credentials.revokedAt') }}</span>
                  <TimeText :value="c.revoked_at" />
                </span>
                <span v-if="note(c)" class="creds__note">
                  <span class="creds__k">{{ t('admin.credentials.note') }}</span>
                  {{ note(c) }}
                </span>
              </div>
            </div>
            <div v-if="canRevoke && state === 'active'" class="creds__actions">
              <el-button type="danger" plain size="small" :loading="revoking === c.id" @click="revoke(c)">
                {{ c.kind === 'session' ? t('common.actions.signOut') : t('admin.credentials.revoke') }}
              </el-button>
            </div>
          </li>
        </ul>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
.creds-missing {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
}
.creds-missing__icon {
  flex-shrink: 0;
  margin-top: 2px;
}
.creds__title {
  flex-wrap: wrap;
}
.creds__toggle {
  font-weight: normal;
}
.creds__intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
}
.creds__alert {
  margin-bottom: 12px;
}
.creds__blocked {
  margin: 0 0 12px;
}
.creds__subhead {
  margin: 4px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.creds__subhead--others {
  margin-top: 20px;
}
.creds__empty {
  margin: 0;
  font-size: 13px;
}
.creds__agents-only {
  margin: -4px 0 8px;
  font-size: 12px;
  color: var(--el-color-warning-dark-2);
}
.creds__table :deep(.el-table__row.is-inactive) {
  color: var(--el-text-color-secondary);
}
.creds__name {
  font-weight: 500;
  word-break: break-word;
}
.creds__code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
}
.creds__issuer {
  word-break: break-word;
}
.creds__when {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.creds__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.creds__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.creds__item:last-child {
  border-bottom: none;
}
.creds__item.is-inactive {
  opacity: 0.6;
}
.creds__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}
.creds__main {
  flex: 1;
  min-width: 0;
}
.creds__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.creds__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.creds__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.creds__subject,
.creds__note {
  word-break: break-word;
}
.creds__actions {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .creds__item {
    flex-wrap: wrap;
  }
  .creds__actions {
    width: 100%;
    padding-left: 30px;
  }
}
</style>
