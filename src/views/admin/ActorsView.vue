<script setup lang="ts">
// People and agents. Core has no tool that lists actors, deliberately, so
// this page registers them (actor.register), finds one by id (actor.get),
// and remembers in this browser those registered or looked up here.
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { isApiError, MCP_ENDPOINT, read } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import ActorSummary from './components/ActorSummary.vue'
import RegisterActorDialog from './components/RegisterActorDialog.vue'
import { useRecentActors, type RegisteredActor } from './components/adminShared'

const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
const { recent, remember, forget, clear } = useRecentActors()

const registering = ref(false)
const justRegistered = ref<RegisteredActor | null>(null)

function onRegistered(a: RegisteredActor) {
  justRegistered.value = a
  remember(a, { registered: true })
}

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
    remember(a)
    router.push({ name: 'admin-actor', params: { actorId: a.id } })
  } catch (e) {
    lookupError.value = isApiError(e) && e.isNotFound ? t('admin.actors.notFound') : errorMessage(e)
  } finally {
    looking.value = false
  }
}

async function clearAll() {
  const ok = await ElMessageBox.confirm(t('admin.actors.clearConfirm'), t('admin.actors.clearRecent'), {
    type: 'warning',
    confirmButtonText: t('admin.actors.clearRecent'),
    cancelButtonText: t('common.actions.cancel'),
  }).catch(() => false)
  if (ok) clear()
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

    <el-alert type="info" :closable="false" show-icon :title="t('admin.actors.noDirectory')" class="actors__intro" />

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
          <template #prefix><el-icon><Search /></el-icon></template>
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

    <section class="app-card">
      <h2 class="app-card__title">
        <span>
          {{ t('admin.actors.recentTitle') }}
          <span class="app-muted actors__hint">{{ t('admin.actors.recentHint') }}</span>
        </span>
        <el-button v-if="recent.length" text size="small" @click="clearAll">{{ t('admin.actors.clearRecent') }}</el-button>
      </h2>
      <el-empty v-if="!recent.length" :description="t('admin.actors.recentEmpty')" :image-size="80" />
      <ul v-else class="actors__recent">
        <li v-for="a in recent" :key="a.id" class="actors__recent-item">
          <ActorSummary :actor="a" link>
            <template #meta>
              <el-tag v-if="a.registered" size="small" type="success" effect="plain">{{ t('admin.actors.registeredHere') }}</el-tag>
              {{ t('admin.actors.seen') }} <TimeText :value="a.seen_at" relative />
            </template>
            <el-tooltip :content="t('admin.actors.forget')" placement="top">
              <el-button text circle :aria-label="t('admin.actors.forget')" @click="forget(a.id)">
                <el-icon><Close /></el-icon>
              </el-button>
            </el-tooltip>
          </ActorSummary>
        </li>
      </ul>
    </section>

    <RegisterActorDialog v-model="registering" @registered="onRegistered" />
  </div>
</template>

<style scoped>
.actors__intro {
  margin-bottom: 16px;
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
.actors__hint {
  font-size: 12px;
  font-weight: 400;
  margin-left: 6px;
}
.actors__recent {
  list-style: none;
  margin: 0;
  padding: 0;
}
.actors__recent-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.actors__recent-item:last-child {
  border-bottom: none;
}
</style>
