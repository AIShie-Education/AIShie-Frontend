<script setup lang="ts">
// Everyone registered on the platform (actor.list), found by a piece of
// their name or email, or by their ID (actor.get), and narrowed by kind,
// standing and, for agents, owner (from a person's page); and registering
// someone new (actor.register), an agent with an owner if need be.
//
// A Core from before actor.list cannot list anyone. The page then says so,
// and offers what there was before the directory: opening an actor by ID.
import { computed, onScopeDispose, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { User } from '@element-plus/icons-vue'
import { isApiError, MCP_ENDPOINT, read } from '@/api/http'
import { useAsync, usePaged } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { formatDate, isUuid } from '@/utils/format'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AgentName from '@/components/AgentName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActorSummary from './components/ActorSummary.vue'
import RegisterActorDialog from './components/RegisterActorDialog.vue'
import SignInTags from './components/SignInTags.vue'
import type { ActorRow, RegisteredActor } from './components/adminShared'
import { hasActorList, listActors } from './components/actorSearch'
import type { OwnerPick } from './components/owner'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
// A card per actor where the page is narrower than 720 px (its list's toolbar
// 669 px or less), by its own width, not the window's: the side bar takes from
// it. Wider, the table, which scrolls sideways where its columns do not all fit.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const narrow = useContainerNarrow(toolbar, 669)

const PAGE = 50
const KINDS = ['human', 'agent'] as const
const STATUSES = ['active', 'suspended'] as const

// The search and the filters live in the address, so that coming back to the
// list keeps them. Only values Core takes are read from it.
function queryParam<T extends string>(name: string, allowed?: readonly T[]) {
  return computed<T | undefined>({
    get: () => {
      const v = route.query[name]
      if (typeof v !== 'string' || !v) return undefined
      return !allowed || allowed.includes(v as T) ? (v as T) : undefined
    },
    set: (v) => void router.replace({ query: { ...route.query, [name]: v || undefined } }),
  })
}
const q = queryParam<string>('q')
const kind = queryParam('kind', KINDS)
const status = queryParam('status', STATUSES)
// The agents one person owns: ?owner=<actor id>, from that person's page.
const ownerParam = queryParam<string>('owner')
const owner = computed(() =>
  ownerParam.value && isUuid(ownerParam.value) ? ownerParam.value.toLowerCase() : undefined,
)
const ownerActor = useAsync(
  () => (owner.value ? read('actor.get', { actor_id: owner.value }) : Promise.resolve(null)),
  { watch: [owner] },
)
function clearOwner() {
  ownerParam.value = undefined
}

// What is typed goes to the address a moment after typing stops.
const searchText = ref(q.value ?? '')
let typing: ReturnType<typeof setTimeout> | undefined
watch(searchText, (v) => {
  clearTimeout(typing)
  typing = setTimeout(() => (q.value = v.trim() || undefined), 300)
})
// Back and forward change the address under the box.
watch(q, (v) => {
  if ((v ?? '') !== searchText.value.trim()) searchText.value = v ?? ''
})
// A search still to be written to the address would otherwise replace the
// page being gone to, if typing is followed at once by opening someone.
onBeforeRouteLeave(() => clearTimeout(typing))
onScopeDispose(() => clearTimeout(typing))

/** A whole actor ID in the box: that one actor, whatever the filters. */
const byId = computed(() => (q.value && isUuid(q.value) ? q.value.trim().toLowerCase() : null))

const list = usePaged<ActorRow>(
  async (after) => {
    if (byId.value) {
      try {
        return { items: [await read('actor.get', { actor_id: byId.value })] }
      } catch (e) {
        if (isApiError(e) && e.isNotFound) return { items: [] }
        throw e
      }
    }
    // Known to be missing, it is not asked again: the page shows the fallback.
    if (hasActorList.value === false) return { items: [] }
    const o = await listActors({
      search: q.value,
      kind: kind.value,
      status: status.value,
      owner_actor_id: owner.value,
      limit: PAGE,
      after,
    })
    return { items: o.actors ?? [], next: o.next }
  },
  { watch: [q, kind, status, owner] },
)
const filtered = computed(() => !!q.value || !!kind.value || !!status.value || !!owner.value)
const emptyText = computed(() => {
  if (byId.value) return t('admin.actors.notFound')
  return filtered.value ? t('admin.actors.emptyFiltered') : t('admin.actors.empty')
})

/** Enter searches at once; on a whole ID it goes straight to that actor's page. */
function onEnter() {
  const text = searchText.value.trim()
  clearTimeout(typing)
  if (isUuid(text)) {
    router.push({ name: 'admin-actor', params: { actorId: text.toLowerCase() } })
    return
  }
  q.value = text || undefined
}

function open(row: ActorRow) {
  router.push({ name: 'admin-actor', params: { actorId: row.id } })
}

const registering = ref(false)
const justRegistered = ref<RegisteredActor | null>(null)
/** The owner the agent just registered was given, if any. */
const justOwner = ref<OwnerPick | null>(null)

function onRegistered(a: RegisteredActor, ownerPick: OwnerPick | null) {
  justRegistered.value = a
  justOwner.value = ownerPick
  void list.reload()
}

// --- On a Core without the directory: one actor, by ID ------------------------
/** This Core has no actor.list: there is no list to show, only look-ups by ID. */
const noList = computed(() => hasActorList.value === false)
const openId = ref('')
const openError = ref<string | null>(null)
const opening = ref(false)
watch(openId, () => (openError.value = null))

async function openById() {
  const id = openId.value.trim().toLowerCase()
  if (!isUuid(id)) {
    openError.value = t('admin.actors.openById.invalid')
    return
  }
  opening.value = true
  openError.value = null
  try {
    const a = await read('actor.get', { actor_id: id })
    await router.push({ name: 'admin-actor', params: { actorId: a.id } })
  } catch (e) {
    openError.value = isApiError(e) && e.isNotFound ? t('admin.actors.notFound') : errorMessage(e)
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <div class="actors">
    <PageHeader :title="t('admin.actors.title')" :subtitle="t('admin.actors.subtitle')">
      <el-button type="primary" @click="registering = true">
        <el-icon><Plus /></el-icon>
        <span>{{ t('admin.actors.register') }}</span>
      </el-button>
    </PageHeader>

    <section v-if="justRegistered" class="app-card actors__new">
      <h2 class="app-card__title">
        <span>{{ t('admin.registered.title', { name: justRegistered.display_name }) }}</span>
        <el-button text size="small" @click="justRegistered = null">{{ t('admin.registered.dismiss') }}</el-button>
      </h2>
      <ActorSummary :actor="{ ...justRegistered, status: 'active' }" link />
      <div class="actors__new-id">
        <span class="app-muted">{{ t('admin.registered.id') }}</span>
        <IdText :id="justRegistered.id" full />
      </div>
      <h3 class="actors__subhead">{{ t('admin.registered.nextSteps') }}</h3>
      <ol v-if="justRegistered.kind === 'human'" class="actors__steps">
        <li>
          {{
            justRegistered.email || justRegistered.login_id
              ? t('admin.registered.human.invite')
              : t('admin.registered.human.email')
          }}
        </li>
        <li>
          {{ t('admin.registered.human.seat') }}
          <router-link :to="{ name: 'admin-courses' }">{{ t('admin.nav.courses') }}</router-link>
        </li>
      </ol>
      <ol v-else-if="justOwner" class="actors__steps">
        <li>
          {{
            t(
              justRegistered.hosting === 'runtime'
                ? 'admin.registered.ownedAgent.ownerRuntime'
                : 'admin.registered.ownedAgent.owner',
              { owner: justOwner.display_name },
            )
          }}
        </li>
        <li>{{ t('admin.registered.ownedAgent.seat') }}</li>
      </ol>
      <ol v-else-if="justRegistered.hosting === 'runtime'" class="actors__steps">
        <li>{{ t('admin.registered.agent.runtime') }}</li>
        <li>{{ t('admin.registered.agent.seat') }}</li>
      </ol>
      <ol v-else class="actors__steps">
        <li>{{ t('admin.registered.agent.token') }}</li>
        <li>{{ t('admin.registered.agent.seat') }}</li>
        <li>
          {{ t('admin.registered.agent.connect', { endpoint: MCP_ENDPOINT }) }}
        </li>
      </ol>
      <div class="actors__new-actions">
        <router-link :to="{ name: 'admin-actor', params: { actorId: justRegistered.id } }">
          <el-button type="primary">
            <span v-if="justRegistered.kind !== 'human'">{{ t('admin.registered.open') }}</span>
            <span v-else-if="justRegistered.email || justRegistered.login_id">{{
              t('admin.registered.human.inviteButton')
            }}</span>
            <span v-else>{{ t('admin.registered.human.emailButton') }}</span>
            <el-icon class="el-icon--right"><Right /></el-icon>
          </el-button>
        </router-link>
      </div>
    </section>

    <template v-if="noList">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.actors.noList.title')"
        :description="t('admin.actors.noList.body')"
        class="actors__no-list"
      />
      <section class="app-card">
        <h2 class="app-card__title">{{ t('admin.actors.openById.title') }}</h2>
        <form class="actors__open" @submit.prevent="openById">
          <el-input
            v-model="openId"
            :placeholder="t('admin.actors.openById.placeholder')"
            :aria-label="t('admin.actors.openById.placeholder')"
            clearable
            name="actor_id"
            autocomplete="off"
            class="actors__open-input app-mono"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button native-type="submit" type="primary" plain :loading="opening" :disabled="!openId.trim()">
            {{ t('admin.actors.openById.submit') }}
          </el-button>
        </form>
        <div v-if="openError" class="actors__open-error">{{ openError }}</div>
        <p class="app-form-hint actors__open-hint">{{ t('admin.actors.openById.hint') }}</p>
      </section>
    </template>

    <section v-else class="app-card">
      <div ref="toolbar" class="app-toolbar">
        <el-input
          v-model="searchText"
          :placeholder="t('admin.actors.searchPlaceholder')"
          :aria-label="t('admin.actors.search')"
          clearable
          class="actors__search"
          @keyup.enter="onEnter"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select
          v-model="kind"
          clearable
          :placeholder="t('admin.actors.allKinds')"
          :aria-label="t('admin.actors.col.kind')"
          :disabled="!!byId"
          class="actors__filter"
        >
          <el-option v-for="k in KINDS" :key="k" :value="k" :label="t(`admin.actors.kinds.${k}`)" />
        </el-select>
        <el-select
          v-model="status"
          clearable
          :placeholder="t('admin.actors.anyStatus')"
          :aria-label="t('admin.actors.col.status')"
          :disabled="!!byId"
          class="actors__filter"
        >
          <el-option v-for="s in STATUSES" :key="s" :value="s" :label="t(`enums.actorStatus.${s}`)" />
        </el-select>
        <span class="app-toolbar__spacer" />
        <el-button :loading="list.loading.value" :aria-label="t('common.actions.refresh')" @click="list.reload()">
          <el-icon><Refresh /></el-icon>
          <span v-if="!narrow">{{ t('common.actions.refresh') }}</span>
        </el-button>
      </div>

      <div v-if="owner && !byId" class="actors__owner-filter">
        <AppTag variant="outline" :icon="User" size="default" closable @close="clearOwner">
          {{
            t('admin.actors.ownedBy', {
              owner: ownerActor.data.value?.display_name ?? t('admin.actor.ownerUnnamed'),
            })
          }}
        </AppTag>
      </div>
      <p v-if="byId && list.items.value.length" class="app-form-hint actors__by-id">{{ t('admin.actors.byId') }}</p>

      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="emptyText"
        @retry="list.reload"
      >
        <ul v-if="narrow" class="actors__cards">
          <li v-for="a in list.items.value" :key="a.id" class="actors__card">
            <ActorSummary :actor="a" link>
              <template #meta>
                <span class="actors__card-meta">
                  <SignInTags v-if="a.kind === 'human'" :actor="a" />
                  <span v-if="a.owner_actor_id">
                    {{ t('admin.actors.ownerIs', { owner: a.owner_name ?? t('admin.actor.ownerUnnamed') }) }}
                  </span>
                  <span>{{ t('admin.actors.registeredOn', { date: formatDate(a.created_at) }) }}</span>
                </span>
              </template>
            </ActorSummary>
          </li>
        </ul>
        <el-table v-else :data="list.items.value" row-key="id" class="actors__table" @row-click="open">
          <el-table-column :label="t('admin.actors.col.name')" min-width="200">
            <template #default="{ row }">
              <div class="actors__name">
                <AgentAvatar v-if="row.kind === 'agent'" :name="row.display_name" size="small" />
                <el-icon v-else class="actors__kind-icon">
                  <Setting v-if="row.kind === 'system'" />
                  <User v-else />
                </el-icon>
                <div class="actors__name-text">
                  <div class="actors__name-line">
                    <!-- 「（你）」 is with the name, not a flex item after it: the line's gap would part them. -->
                    <span
                      ><router-link
                        :to="{ name: 'admin-actor', params: { actorId: row.id } }"
                        class="actors__link"
                        @click.stop
                        ><AgentName v-if="row.kind === 'agent'" :name="row.display_name" /><template v-else>{{
                          row.display_name
                        }}</template></router-link
                      ><span v-if="row.id === session.me?.id" class="app-muted app-you">{{
                        t('common.labels.youTag')
                      }}</span></span
                    >
                  </div>
                  <!-- Two with the same name are told apart by their IDs. -->
                  <IdText :id="row.id" />
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.kind')" :width="110">
            <template #default="{ row }">
              <div class="actors__kind">
                <StatusTag vocab="actorKind" :value="row.kind" />
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="kind !== 'human'" :label="t('admin.actors.col.owner')" min-width="150">
            <template #default="{ row }">
              <router-link
                v-if="row.owner_actor_id"
                :to="{ name: 'admin-actor', params: { actorId: row.owner_actor_id } }"
                class="actors__owner"
                @click.stop
              >
                <span v-if="row.owner_name">{{ row.owner_name }}</span>
                <IdText v-else :id="row.owner_actor_id" />
              </router-link>
              <span v-else-if="row.kind === 'agent'" class="app-muted">{{ t('admin.actors.noOwner') }}</span>
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.email')" min-width="250">
            <template #default="{ row }">
              <span v-if="row.email" class="actors__email">{{ row.email }}</span>
              <span v-else-if="!row.login_id" class="app-muted">—</span>
              <div v-if="row.login_id" class="actors__login-id">
                <code>{{ row.login_id }}</code>
                <AppTag v-if="row.login_id_verified === false" tone="wait">
                  {{ t('admin.loginId.unverified') }}
                </AppTag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.status')" width="110">
            <template #default="{ row }"><StatusTag vocab="actorStatus" :value="row.status" /></template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.role')" width="120">
            <template #default="{ row }">
              <StatusTag v-if="row.platform_role" vocab="platformRole" :value="row.platform_role" />
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.signIn')" min-width="180">
            <template #default="{ row }"><SignInTags :actor="row" /></template>
          </el-table-column>
          <el-table-column :label="t('admin.actors.col.registered')" min-width="150">
            <template #default="{ row }"><TimeText :value="row.created_at" /></template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </section>

    <RegisterActorDialog v-model="registering" @registered="onRegistered" />
  </div>
</template>

<style scoped>
/* The page's own width decides how the list is laid out, not the window's. */
.actors {
  container-type: inline-size;
}
.actors__kind {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.actors__new {
  border-color: var(--el-color-success-light-5);
}
.actors__new-id {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 13px;
}
.actors__subhead {
  margin: 16px 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.actors__steps {
  margin: 0;
  padding-left: 20px;
  line-height: 1.7;
  font-size: 14px;
  word-break: break-word;
}
.actors__new-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.actors__no-list {
  margin-bottom: 16px;
}
.actors__no-list :deep(.el-alert__description) {
  line-height: 1.6;
}
.actors__open {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.actors__open-input {
  flex: 1 1 300px;
  min-width: 0;
  max-width: 460px;
}
.actors__open-error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
}
.actors__open-hint {
  margin: 8px 0 0;
}
.actors__search {
  flex: 1 1 280px;
  min-width: 0;
  max-width: 420px;
}
.actors__filter {
  width: 160px;
}
.actors__by-id {
  margin: -8px 0 8px;
}
.actors__owner-filter {
  margin: -4px 0 12px;
}
.actors__owner {
  text-decoration: none;
  word-break: break-word;
}
.actors__owner:hover {
  text-decoration: underline;
}
.actors__table :deep(.el-table__row) {
  cursor: pointer;
}
.actors__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.actors__kind-icon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.actors__name-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
.actors__name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.actors__card-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.actors__link {
  font-weight: 600;
  text-decoration: none;
  word-break: break-word;
  min-width: 0;
}
.actors__link:hover {
  text-decoration: underline;
}
.actors__login-id {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}
.actors__login-id code {
  font-family: var(--app-font-mono);
}
.actors__email {
  overflow-wrap: anywhere;
}
.actors__cards {
  list-style: none;
  margin: 0;
  padding: 0;
}
.actors__card {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.actors__card:last-child {
  border-bottom: none;
}
/* Where the list is a card per actor (narrow, above). */
@container (max-width: 719px) {
  .actors__search {
    max-width: none;
    flex-basis: 100%;
  }
  .actors__filter {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
  }
  .app-toolbar__spacer {
    display: none;
  }
}
</style>
