<script setup lang="ts">
// One actor: their registration and how they sign in (actor.get, corrected
// with actor.update), their standing (actor.suspend, actor.reactivate) and
// their ways in (actor.invite, actor.issue_token, actor.link_sso), listed and
// revoked one by one (actor.list_credentials, actor.revoke_credential). What an
// administrator may do to whom is Core's rule, mirrored here to say why a
// control is off: not to yourself (though your own name and email are yours
// to correct), only root to a holder of a platform role, and nobody to the
// system actor. An agent may have an owner, a person whose delegate alone it
// is (shown, and set or cleared with actor.set_owner); a person's page lists
// the agents they own. A suspension says who made it: one an agent's owner
// made they may lift themselves, and suspending it here as well makes it the
// administrator's.
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { ApiError, read } from '@/api/http'
import type { Actor } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useNarrow } from '@/composables/useMediaQuery'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AgentBadge from '@/components/AgentBadge.vue'
import { isUuid } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActorCredentialsCard from './components/ActorCredentialsCard.vue'
import EditActorDialog from './components/EditActorDialog.vue'
import InviteCard from './components/InviteCard.vue'
import IssueTokenCard from './components/IssueTokenCard.vue'
import LinkSsoCard from './components/LinkSsoCard.vue'
import SetOwnerDialog from './components/SetOwnerDialog.vue'
import SignInTags from './components/SignInTags.vue'
import { useCanonicalId } from './components/adminShared'
import { listActors } from './components/actorSearch'
import { suspendedBy } from './components/owner'
import { editBlocker } from './components/signIn'

const props = defineProps<{ actorId: string }>()
const { t } = useI18n()
const session = useSessionStore()
const narrow = useNarrow()
/** The actor's id as Core writes it, whatever the address says. */
const id = useCanonicalId(() => props.actorId, 'actorId')

const state = useAsync(
  () => {
    if (!isUuid(id.value)) {
      return Promise.reject(new ApiError({ status: 404, code: 'not_found', message: t('admin.actors.notFound') }))
    }
    return read('actor.get', { actor_id: id.value })
  },
  { watch: [id], keepData: true },
)
const actor = computed(() => (state.data.value?.id === id.value ? state.data.value : undefined))

// Who registered them, by name where they can be read.
const creatorId = computed(() => actor.value?.created_by_actor_id ?? null)
const creator = useAsync(
  () => (creatorId.value ? read('actor.get', { actor_id: creatorId.value }) : Promise.resolve(null)),
  { watch: [creatorId] },
)

// Who made the suspension, by name: the owner's is known already.
const suspension = computed(() => (actor.value ? suspendedBy(actor.value) : null))
const suspenderId = computed(() => (suspension.value === 'admin' ? (actor.value?.suspended_by_actor_id ?? null) : null))
const suspender = useAsync(
  () => (suspenderId.value ? read('actor.get', { actor_id: suspenderId.value }) : Promise.resolve(null)),
  { watch: [suspenderId] },
)

// The agents a person owns (actor.list, owner_actor_id): a page's worth, and
// a link to the whole list.
const ownedOf = computed(() => (actor.value?.kind === 'human' ? actor.value.id : null))
const owned = useAsync(
  () =>
    ownedOf.value
      ? listActors({ owner_actor_id: ownedOf.value, kind: 'agent', limit: 20 })
      : Promise.resolve({ actors: [], next: null }),
  { watch: [ownedOf] },
)
const ownedAgents = computed(() => owned.data.value?.actors ?? [])

const settingOwner = ref(false)
function onOwnerSet() {
  void state.reload()
  // Every token and session it had is revoked.
  reloadCredentials()
}

const isSelf = computed(() => !!actor.value && actor.value.id === session.me?.id)
const isSystem = computed(() => actor.value?.kind === 'system')
const roleBlocked = computed(() => !!actor.value?.platform_role && !session.isRoot)

/** Why suspending or reactivating is not offered. */
const standingBlocker = computed<string | null>(() => {
  if (isSystem.value) return t('admin.actor.cannot.system')
  if (isSelf.value) return t('admin.actor.cannot.self')
  if (roleBlocked.value) return t('admin.actor.cannot.role')
  return null
})
/** Why the owner cannot be set: as for its standing, and an agent with a platform role is owned by nobody. */
const ownerBlocker = computed<string | null>(() => {
  if (standingBlocker.value) return standingBlocker.value
  if (actor.value?.platform_role && !actor.value.owner_actor_id) return t('admin.actor.cannot.ownerRole')
  return null
})
/** Why credentials cannot be given or taken away; one's own account is fine. */
const credentialBlocker = computed<string | null>(() => {
  if (isSystem.value) return t('admin.actor.cannot.system')
  if (!isSelf.value && roleBlocked.value) return t('admin.actor.cannot.role')
  return null
})

/** Why correcting their name and email is not offered. */
const editBlockedReason = computed<string | null>(() => {
  const a = actor.value
  if (!a) return null
  const why = editBlocker(a, { id: session.me?.id, isRoot: session.isRoot })
  if (why === 'system') return t('admin.edit.blocked.system')
  if (why === 'role') return t('admin.actor.cannot.role')
  return null
})
const editing = ref(false)

// The list of their credentials follows every change made to them on this
// page: a token issued, an invitation made (which replaces the one before),
// an identity linked, an email changed (which withdraws a pending invitation).
const credentialsCard = useTemplateRef<InstanceType<typeof ActorCredentialsCard>>('credentialsCard')
function reloadCredentials() {
  void credentialsCard.value?.reload()
}
/** How they sign in has changed: the registration's summary as well as the list. */
function onSignInChanged() {
  void state.reload()
  reloadCredentials()
}

function onSaved(a: Actor) {
  state.data.value = a
  reloadCredentials()
  // One's own name shows in the app's frame too.
  if (a.id === session.me?.id) void session.load().catch(() => undefined)
}

const suspendW = useWrite('actor.suspend')
const reactivateW = useWrite('actor.reactivate')

async function suspend() {
  const a = actor.value
  if (!a) return
  const takeOver = suspension.value === 'owner'
  const ok = await ElMessageBox.confirm(
    takeOver ? t('admin.actor.takeOverConfirm') : t('admin.actor.suspendConfirm'),
    t('admin.actor.suspendTitle', { name: a.display_name }),
    {
      type: 'warning',
      confirmButtonText: t('admin.actor.suspend'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  const out = await suspendW.run({ actor_id: a.id }, { success: t('admin.actor.suspended', { name: a.display_name }) })
  if (out) await state.reload()
}

async function reactivate() {
  const a = actor.value
  if (!a) return
  const ok = await ElMessageBox.confirm(
    t('admin.actor.reactivateConfirm'),
    t('admin.actor.reactivateTitle', { name: a.display_name }),
    { type: 'info', confirmButtonText: t('admin.actor.reactivate'), cancelButtonText: t('common.actions.cancel') },
  ).catch(() => false)
  if (!ok) return
  const out = await reactivateW.run(
    { actor_id: a.id },
    { success: t('admin.actor.reactivated', { name: a.display_name }) },
  )
  if (out) await state.reload()
}
</script>

<template>
  <div>
    <PageHeader
      :title="actor?.display_name ?? t('admin.actor.title')"
      :subtitle="actor?.email ?? undefined"
      :back="{ name: 'admin-actors' }"
    >
      <template #tags>
        <template v-if="actor">
          <StatusTag v-if="!actor.owner_actor_id" vocab="actorKind" :value="actor.kind" size="default" />
          <AgentBadge v-else :owner-name="actor.owner_name ?? undefined" size="default" />
          <StatusTag vocab="actorStatus" :value="actor.status" size="default" />
          <StatusTag v-if="actor.platform_role" vocab="platformRole" :value="actor.platform_role" size="default" />
        </template>
      </template>
      <template v-if="actor">
        <el-tooltip :disabled="!editBlockedReason" :content="editBlockedReason ?? ''" placement="bottom">
          <span>
            <el-button :disabled="!!editBlockedReason" @click="editing = true">
              <el-icon><Edit /></el-icon>
              <span>{{ t('admin.actor.edit') }}</span>
            </el-button>
          </span>
        </el-tooltip>
        <el-tooltip :disabled="!standingBlocker" :content="standingBlocker ?? ''" placement="bottom">
          <span>
            <el-button
              v-if="actor.status === 'suspended'"
              type="primary"
              :disabled="!!standingBlocker"
              :loading="reactivateW.pending.value"
              @click="reactivate"
            >
              <el-icon><CircleCheck /></el-icon>
              <span>{{ t('admin.actor.reactivate') }}</span>
            </el-button>
            <el-button
              v-else
              type="danger"
              plain
              :disabled="!!standingBlocker"
              :loading="suspendW.pending.value"
              @click="suspend"
            >
              <el-icon><CircleClose /></el-icon>
              <span>{{ t('admin.actor.suspend') }}</span>
            </el-button>
          </span>
        </el-tooltip>
        <el-tooltip
          v-if="suspension === 'owner'"
          :content="standingBlocker ?? t('admin.actor.takeOverHint')"
          placement="bottom"
        >
          <span>
            <el-button
              type="danger"
              plain
              :disabled="!!standingBlocker"
              :loading="suspendW.pending.value"
              @click="suspend"
            >
              <el-icon><Lock /></el-icon>
              <span>{{ t('admin.actor.takeOver') }}</span>
            </el-button>
          </span>
        </el-tooltip>
      </template>
    </PageHeader>

    <AsyncState
      :loading="state.loading.value && !actor"
      :error="actor ? null : state.error.value"
      @retry="state.reload"
    >
      <template v-if="actor">
        <el-alert
          v-if="actor.status === 'suspended'"
          type="error"
          :closable="false"
          show-icon
          :title="t('admin.actor.suspendedBanner')"
          :description="suspension === 'owner' ? t('admin.actor.suspendedByOwnerBanner') : undefined"
          class="actor__alert"
        />
        <el-alert
          v-if="isSelf"
          type="info"
          :closable="false"
          show-icon
          :title="t('admin.actor.you')"
          class="actor__alert"
        />
        <el-alert
          v-if="isSystem || (roleBlocked && !isSelf)"
          type="info"
          :closable="false"
          show-icon
          :title="isSystem ? t('admin.actor.cannot.system') : t('admin.actor.cannot.role')"
          class="actor__alert"
        />

        <section class="app-card">
          <h2 class="app-card__title">{{ t('admin.actor.registration') }}</h2>
          <el-descriptions :column="narrow ? 1 : 2" border class="actor__desc">
            <el-descriptions-item :label="t('admin.actor.name')">
              <strong class="actor__name">{{ actor.display_name }}</strong>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.kind')">
              <StatusTag vocab="actorKind" :value="actor.kind" />
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.email')">
              <span v-if="actor.email" class="actor__email">{{ actor.email }}</span>
              <span v-else class="app-muted">{{ t('admin.actor.noEmail') }}</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.status')">
              <StatusTag vocab="actorStatus" :value="actor.status" />
            </el-descriptions-item>
            <el-descriptions-item v-if="suspension" :label="t('admin.actor.suspendedBy')">
              <template v-if="suspension === 'owner' && actor.owner_actor_id">
                <router-link :to="{ name: 'admin-actor', params: { actorId: actor.owner_actor_id } }">
                  <span v-if="actor.owner_name">{{ actor.owner_name }}</span>
                  <IdText v-else :id="actor.owner_actor_id" />
                </router-link>
                <span class="app-muted"> ({{ t('admin.actor.itsOwner') }})</span>
              </template>
              <template v-else-if="suspension === 'admin' && actor.suspended_by_actor_id">
                <router-link :to="{ name: 'admin-actor', params: { actorId: actor.suspended_by_actor_id } }">
                  <span v-if="suspender.data.value">{{ suspender.data.value.display_name }}</span>
                  <IdText v-else :id="actor.suspended_by_actor_id" />
                </router-link>
              </template>
              <span v-else class="app-muted">{{ t('admin.actor.suspendedByUnrecorded') }}</span>
            </el-descriptions-item>
            <el-descriptions-item v-if="actor.kind === 'agent'" :label="t('admin.actor.owner')">
              <div class="actor__owner">
                <router-link
                  v-if="actor.owner_actor_id"
                  :to="{ name: 'admin-actor', params: { actorId: actor.owner_actor_id } }"
                >
                  <span v-if="actor.owner_name">{{ actor.owner_name }}</span>
                  <IdText v-else :id="actor.owner_actor_id" />
                </router-link>
                <span v-else class="app-muted">{{ t('admin.actor.noOwner') }}</span>
                <el-tooltip :disabled="!ownerBlocker" :content="ownerBlocker ?? ''" placement="top">
                  <span>
                    <el-button link type="primary" size="small" :disabled="!!ownerBlocker" @click="settingOwner = true">
                      {{ actor.owner_actor_id ? t('admin.actor.changeOwner') : t('admin.actor.setOwner') }}
                    </el-button>
                  </span>
                </el-tooltip>
              </div>
            </el-descriptions-item>
            <el-descriptions-item
              v-if="actor.kind === 'human' && ownedAgents.length"
              :label="t('admin.actor.ownedAgents')"
            >
              <span class="actor__owned">
                <router-link
                  v-for="a in ownedAgents"
                  :key="a.id"
                  :to="{ name: 'admin-actor', params: { actorId: a.id } }"
                  class="actor__owned-item"
                >
                  {{ a.display_name }}
                </router-link>
                <router-link
                  v-if="owned.data.value?.next"
                  :to="{ name: 'admin-actors', query: { kind: 'agent', owner: actor.id } }"
                >
                  {{ t('admin.actor.ownedAll') }}
                </router-link>
              </span>
            </el-descriptions-item>
            <el-descriptions-item v-if="actor.kind === 'human'" :label="t('admin.actor.signIn')">
              <SignInTags :actor="actor" />
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.platformRole')">
              <StatusTag v-if="actor.platform_role" vocab="platformRole" :value="actor.platform_role" />
              <span v-else class="app-muted">{{ t('admin.actor.noRole') }}</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.created')">
              <TimeText :value="actor.created_at" />
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.createdBy')">
              <template v-if="actor.created_by_actor_id">
                <router-link :to="{ name: 'admin-actor', params: { actorId: actor.created_by_actor_id } }">
                  <span v-if="creator.data.value">{{ creator.data.value.display_name }}</span>
                  <IdText v-else :id="actor.created_by_actor_id" />
                </router-link>
              </template>
              <span v-else class="app-muted">{{ t('admin.actor.noCreator') }}</span>
            </el-descriptions-item>
            <el-descriptions-item :label="t('admin.actor.id')">
              <IdText :id="actor.id" :full="!narrow" />
            </el-descriptions-item>
          </el-descriptions>
          <p v-if="actor.owner_actor_id" class="app-form-hint actor__seats">
            {{ t('admin.actor.ownedHint', { owner: actor.owner_name ?? t('admin.actor.ownerUnnamed') }) }}
          </p>
          <p v-else-if="!isSystem" class="app-form-hint actor__seats">
            {{ t('admin.actor.seatsHint') }}
            <router-link :to="{ name: 'admin-courses' }">{{ t('admin.nav.courses') }}</router-link>
          </p>
        </section>

        <div class="actor__grid">
          <!-- A person signs in by an invitation or single sign-on; an agent by a token. An agent (or the
               system) has no identity at the identity provider: no single sign-on card. -->
          <template v-if="actor.kind === 'human'">
            <InviteCard :actor="actor" @edit="editing = true" @changed="onSignInChanged" />
            <LinkSsoCard :actor="actor" :blocked-reason="credentialBlocker" @linked="onSignInChanged" />
          </template>
          <!-- What they hold now, across the page's width: for an agent, its tokens first of all. -->
          <ActorCredentialsCard
            ref="credentialsCard"
            class="actor__wide"
            :actor="actor"
            :is-self="isSelf"
            :blocked-reason="credentialBlocker"
            @changed="state.reload"
          />
          <IssueTokenCard
            :actor="actor"
            :is-self="isSelf"
            :blocked-reason="credentialBlocker"
            @issued="reloadCredentials"
          />
        </div>

        <EditActorDialog v-model="editing" :actor="actor" @saved="onSaved" />
        <SetOwnerDialog v-if="actor.kind === 'agent'" v-model="settingOwner" :actor="actor" @saved="onOwnerSet" />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.actor__alert {
  margin-bottom: 12px;
}
/* A label breaks between words, never inside one (登記時 / 間). */
.actor__desc :deep(.el-descriptions__label) {
  white-space: nowrap;
}
.actor__name {
  word-break: break-word;
}
.actor__email {
  word-break: break-all;
}
.actor__seats {
  margin: 12px 0 0;
}
.actor__owner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.actor__owned {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.actor__owned-item {
  word-break: break-word;
}
.actor__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}
.actor__grid > .app-card + .app-card {
  margin-top: 0;
}
.actor__grid > .actor__wide {
  grid-column: 1 / -1;
}
@media (min-width: 1100px) {
  .actor__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
</style>
