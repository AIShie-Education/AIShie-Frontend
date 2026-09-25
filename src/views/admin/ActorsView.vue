<script setup lang="ts">
// People and agents: everyone registered on the platform (actor.list), found
// by part of a name or an email address, by kind, standing and platform role,
// and registering more (actor.register). The address keeps the search and
// the filters, so coming back to the list finds it as it was left.
//
// A Core older than actor.list answers GET /v1/actors with 405. The page then
// says so, and offers what it had before there was a directory: opening an
// actor by id (actor.get).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { isApiError, MCP_ENDPOINT, read } from '@/api/http'
import type { Actor } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { lacksActorList, listActors } from '@/composables/useActorList'
import { errorMessage } from '@/composables/useErrors'
import { useNarrow } from '@/composables/useMediaQuery'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActorSummary from './components/ActorSummary.vue'
import RegisterActorDialog from './components/RegisterActorDialog.vue'
import type { RegisteredActor } from './components/adminShared'
import {
  filtersFromQuery,
  hiddenByKind,
  matches,
  MAX_SEARCH,
  queryFromFilters,
  searchedId,
  listArgs,
  type DirectoryFilters,
} from './components/directory'

const ROUTE = 'admin-actors'
const PAGE = 50
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const narrow = useNarrow(767)

// --- The search and the filters, kept in the address ---------------------------
// Read only while this is the page shown: leaving it changes the address
// first, and the list should not be asked again for the next page's.
const filters = ref<DirectoryFilters>(filtersFromQuery(route.query))
watch(
  () => route.query,
  (q) => {
    if (route.name === ROUTE) filters.value = filtersFromQuery(q)
  },
)
function setFilters(patch: Partial<DirectoryFilters>) {
  void router.replace({ query: queryFromFilters({ ...filters.value, ...patch }) })
}
const byId = computed(() => searchedId(filters.value))
const filtered = computed(() => {
  const f = filters.value
  return !!(f.q.trim() || f.kind || f.status || f.role)
})

// The box is written to the address once typing pauses. Back and forward
// change the address under it: it follows, unless that is what it holds.
const search = ref(filters.value.q)
let typing: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(typing)
  typing = setTimeout(() => setFilters({ q: v }), 300)
})
watch(
  () => filters.value.q,
  (q) => {
    if (q.trim() !== search.value.trim()) search.value = q
  },
)
function searchNow() {
  clearTimeout(typing)
  setFilters({ q: search.value })
}
onBeforeUnmount(() => clearTimeout(typing))

// --- The list --------------------------------------------------------------------
const list = usePaged<Actor>(
  async (after) => {
    const id = byId.value
    if (id) {
      try {
        return { items: [await read('actor.get', { actor_id: id })] }
      } catch (e) {
        if (isApiError(e) && e.isNotFound) return { items: [] }
        throw e
      }
    }
    const out = await listActors(listArgs(filters.value, after, PAGE))
    return { items: out.actors, next: out.next }
  },
  { watch: [() => JSON.stringify(filters.value)] },
)
/** This Core has no actor.list. */
const unsupported = computed(() => !!list.error.value && lacksActorList(list.error.value))

// Those registered from this page, newest first. Core lists in the order
// actors were registered, so someone new is on the last page: they are shown
// at the top instead, while the filters take them in.
const registeredHere = ref<Actor[]>([])
const pinned = computed(() => (byId.value ? [] : registeredHere.value.filter((a) => matches(a, filters.value))))
const rows = computed(() => {
  const top = new Set(pinned.value.map((a) => a.id))
  const listed = list.items.value.filter((a) => !top.has(a.id) && (!!byId.value || !hiddenByKind(a, filters.value)))
  return [...pinned.value, ...listed]
})
const isNew = (a: Actor) => registeredHere.value.some((x) => x.id === a.id)
/** Nobody shown, and the system actor was: it is left out unless asked for. */
const onlySystem = computed(
  () => !rows.value.length && !byId.value && !filters.value.kind && list.items.value.some((a) => a.kind === 'system'),
)
const emptyText = computed(() => {
  if (byId.value) return t('admin.actors.notFound')
  if (onlySystem.value) return t('admin.actors.onlySystem')
  return filtered.value ? t('admin.actors.emptyFiltered') : t('admin.actors.empty')
})

function open(a: Actor) {
  router.push({ name: 'admin-actor', params: { actorId: a.id } })
}
function rowClass({ row }: { row: Actor }) {
  return row.status === 'suspended' ? 'actors__row--suspended' : ''
}

// --- Registering -----------------------------------------------------------------
const registering = ref(false)
const justRegistered = ref<RegisteredActor | null>(null)

async function onRegistered(a: RegisteredActor) {
  justRegistered.value = a
  let row: Actor
  try {
    row = await read('actor.get', { actor_id: a.id })
  } catch {
    // Shown from what was registered; their own page reads them afresh.
    row = { ...a, status: 'active', created_at: new Date().toISOString() }
  }
  registeredHere.value = [row, ...registeredHere.value.filter((x) => x.id !== row.id)]
  void list.reload()
}

// --- By id, on a Core without the directory -------------------------------------
const lookupId = ref('')
const lookupError = ref<string | null>(null)
const looking = ref(false)
watch(lookupId, () => (lookupError.value = null))

async function lookUp() {
  const id = lookupId.value.trim()
  lookupError.value = null
  if (!isUuid(id)) {
    lookupError.value = t('admin.actors.invalidId')
    return
  }
  looking.value = true
  try {
    const a = await read('actor.get', { actor_id: id })
    router.push({ name: 'admin-actor', params: { actorId: a.id } })
  } catch (e) {
    lookupError.value = isApiError(e) && e.isNotFound ? t('admin.actors.notFound') : errorMessage(e)
  } finally {
    looking.value = false
  }
}
</script>

<template>
  <div>
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
        <li>{{ t('admin.registered.human.signIn') }}</li>
        <li v-if="!justRegistered.email">{{ t('admin.registered.human.noEmail') }}</li>
        <li>
          {{ t('admin.registered.human.seat') }}
          <router-link :to="{ name: 'admin-courses' }">{{ t('admin.nav.courses') }}</router-link>
        </li>
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
            <span>{{ t('admin.registered.open') }}</span>
            <el-icon class="el-icon--right"><Right /></el-icon>
          </el-button>
        </router-link>
      </div>
    </section>

    <template v-if="unsupported">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.actors.unsupported.title')"
        :description="t('admin.actors.unsupported.body')"
        class="actors__unsupported"
      />
      <section class="app-card">
        <h2 class="app-card__title">{{ t('admin.actors.lookUpTitle') }}</h2>
        <form class="actors__lookup" @submit.prevent="lookUp">
          <el-input
            v-model="lookupId"
            :placeholder="t('admin.actors.lookUpPlaceholder')"
            clearable
            class="actors__lookup-input app-mono"
            :aria-label="t('admin.actors.lookUpPlaceholder')"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
          <el-button native-type="submit" type="primary" plain :loading="looking" :disabled="!lookupId.trim()">
            {{ t('admin.actors.lookUp') }}
          </el-button>
          <router-link v-if="session.me" :to="{ name: 'admin-actor', params: { actorId: session.me.id } }">
            <el-button text>{{ t('admin.actors.myRecord') }}</el-button>
          </router-link>
        </form>
        <div v-if="lookupError" class="actors__error">{{ lookupError }}</div>
      </section>
    </template>

    <div v-else class="app-card">
      <div class="app-toolbar actors__toolbar">
        <el-input
          v-model="search"
          clearable
          :maxlength="MAX_SEARCH"
          :placeholder="t('admin.actors.searchPlaceholder')"
          :aria-label="t('admin.actors.search')"
          class="actors__search"
          @keydown.enter.prevent="searchNow"
          @clear="searchNow"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <div class="actors__filters">
          <el-select
            :model-value="filters.kind"
            :placeholder="t('admin.actors.filters.peopleAndAgents')"
            :disabled="!!byId"
            :aria-label="t('admin.actors.filters.kind')"
            class="actors__filter"
            @update:model-value="(v: DirectoryFilters['kind']) => setFilters({ kind: v })"
          >
            <el-option value="" :label="t('admin.actors.filters.peopleAndAgents')" />
            <el-option value="human" :label="t('admin.actors.filters.people')" />
            <el-option value="agent" :label="t('admin.actors.filters.agents')" />
            <el-option value="system" :label="t('admin.actors.filters.system')" />
          </el-select>
          <el-select
            :model-value="filters.status"
            :placeholder="t('admin.actors.filters.anyStatus')"
            :disabled="!!byId"
            :aria-label="t('admin.actors.filters.status')"
            class="actors__filter"
            @update:model-value="(v: DirectoryFilters['status']) => setFilters({ status: v })"
          >
            <el-option value="" :label="t('admin.actors.filters.anyStatus')" />
            <el-option value="active" :label="t('enums.actorStatus.active')" />
            <el-option value="suspended" :label="t('enums.actorStatus.suspended')" />
          </el-select>
          <el-select
            :model-value="filters.role"
            :placeholder="t('admin.actors.filters.anyRole')"
            :disabled="!!byId"
            :aria-label="t('admin.actors.filters.role')"
            class="actors__filter"
            @update:model-value="(v: DirectoryFilters['role']) => setFilters({ role: v })"
          >
            <el-option value="" :label="t('admin.actors.filters.anyRole')" />
            <el-option value="root" :label="t('enums.platformRole.root')" />
            <el-option value="admin" :label="t('enums.platformRole.admin')" />
            <el-option value="none" :label="t('admin.actors.filters.noRole')" />
          </el-select>
          <!-- On a phone, beside the last filter rather than on a row of its own. -->
          <el-button
            v-if="narrow"
            circle
            :loading="list.loading.value"
            :aria-label="t('common.actions.refresh')"
            @click="list.reload()"
          >
            <el-icon v-if="!list.loading.value"><Refresh /></el-icon>
          </el-button>
        </div>
        <template v-if="!narrow">
          <span class="app-toolbar__spacer" />
          <el-button :loading="list.loading.value" @click="list.reload()">
            <el-icon><Refresh /></el-icon>
            <span>{{ t('common.actions.refresh') }}</span>
          </el-button>
        </template>
      </div>
      <p v-if="byId" class="app-form-hint actors__by-id">{{ t('admin.actors.byIdHint') }}</p>

      <AsyncState
        :loading="list.loading.value && !rows.length"
        :error="list.error.value"
        :empty="!rows.length"
        :empty-text="emptyText"
        @retry="list.reload"
      >
        <template #empty>
          <el-button v-if="onlySystem" @click="setFilters({ kind: 'system' })">
            {{ t('admin.actors.showSystem') }}
          </el-button>
        </template>
        <el-table
          v-loading="list.loading.value"
          :data="rows"
          row-key="id"
          class="actors__table"
          :row-class-name="rowClass"
          @row-click="open"
        >
          <el-table-column :label="t('admin.actors.col.name')" min-width="220">
            <template #default="{ row }">
              <div class="actors__name">
                <el-icon class="actors__kind-icon" :class="`is-${row.kind}`">
                  <Cpu v-if="row.kind === 'agent'" /><Setting v-else-if="row.kind === 'system'" /><User v-else />
                </el-icon>
                <router-link
                  :to="{ name: 'admin-actor', params: { actorId: row.id } }"
                  class="actors__name-link"
                  @click.stop
                >
                  {{ row.display_name }}
                </router-link>
                <span v-if="row.id === session.me?.id" class="actors__me">({{ t('common.labels.you') }})</span>
                <el-tag v-if="isNew(row)" size="small" type="success" effect="plain">{{
                  t('admin.actors.new')
                }}</el-tag>
              </div>
              <template v-if="narrow">
                <div v-if="row.email" class="actors__email actors__email--stacked">{{ row.email }}</div>
                <div class="actors__stack">
                  <StatusTag v-if="row.kind !== 'human'" vocab="actorKind" :value="row.kind" />
                  <StatusTag v-if="row.platform_role" vocab="platformRole" :value="row.platform_role" />
                  <StatusTag v-if="row.status !== 'active'" vocab="actorStatus" :value="row.status" />
                  <span class="actors__when">
                    {{ t('admin.actors.col.registered') }} <TimeText :value="row.created_at" relative />
                  </span>
                </div>
              </template>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.actors.col.kind')" min-width="100">
            <template #default="{ row }"><StatusTag vocab="actorKind" :value="row.kind" /></template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.actors.col.email')" min-width="220">
            <template #default="{ row }">
              <span v-if="row.email" class="actors__email">{{ row.email }}</span>
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.actors.col.role')" min-width="120">
            <template #default="{ row }">
              <StatusTag v-if="row.platform_role" vocab="platformRole" :value="row.platform_role" />
              <span v-else class="app-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.actors.col.status')" min-width="100">
            <template #default="{ row }"><StatusTag vocab="actorStatus" :value="row.status" /></template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.actors.col.registered')" min-width="160">
            <template #default="{ row }"><TimeText :value="row.created_at" /></template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </div>

    <RegisterActorDialog v-model="registering" @registered="onRegistered" />
  </div>
</template>

<style scoped>
.actors__new {
  border-color: var(--el-color-success-light-5);
  margin-bottom: 16px;
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
.actors__unsupported {
  margin-bottom: 16px;
}
.actors__unsupported :deep(.el-alert__description) {
  line-height: 1.6;
}
.actors__lookup {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.actors__lookup-input {
  flex: 1 1 300px;
  min-width: 0;
  max-width: 460px;
}
.actors__error {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-color-danger);
}
.actors__search {
  flex: 3 1 280px;
  min-width: 0;
  max-width: 440px;
}
.actors__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actors__filter {
  width: 170px;
}
.actors__by-id {
  margin: -8px 0 12px;
}
.actors__table :deep(.el-table__row) {
  cursor: pointer;
}
.actors__table :deep(.actors__row--suspended) {
  color: var(--el-text-color-secondary);
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
.actors__kind-icon.is-agent {
  color: var(--el-color-primary);
}
.actors__kind-icon.is-system {
  color: var(--el-color-warning);
}
.actors__name-link {
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.actors__name-link:hover {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.actors__me {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.actors__email {
  word-break: break-all;
}
.actors__email--stacked {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.actors__stack {
  display: flex;
  align-items: center;
  gap: 4px 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.actors__when {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
@media (max-width: 767px) {
  .actors__search {
    flex-basis: 100%;
    max-width: none;
  }
  .actors__filters {
    width: 100%;
  }
  .actors__filter {
    flex: 1 1 140px;
    width: auto;
  }
}
</style>
