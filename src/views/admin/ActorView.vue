<script setup lang="ts">
// One actor: their registration (actor.get), their standing (actor.suspend,
// actor.reactivate) and their credentials (actor.issue_token, actor.link_sso).
// What an administrator may do to whom is Core's rule, mirrored here to say
// why a control is off: not to yourself, only root to a holder of a platform
// role, and nobody to the system actor.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { ApiError, read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import { isUuid } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import IssueTokenCard from './components/IssueTokenCard.vue'
import LinkSsoCard from './components/LinkSsoCard.vue'
import { useNarrow, useRecentActors } from './components/adminShared'

const props = defineProps<{ actorId: string }>()
const { t } = useI18n()
const session = useSessionStore()
const narrow = useNarrow()
const { remember } = useRecentActors()

const state = useAsync(
  () => {
    if (!isUuid(props.actorId)) {
      return Promise.reject(new ApiError({ status: 404, code: 'not_found', message: t('admin.actors.notFound') }))
    }
    return read('actor.get', { actor_id: props.actorId })
  },
  { watch: [() => props.actorId], keepData: true },
)
const actor = computed(() => (state.data.value?.id === props.actorId ? state.data.value : undefined))
watch(actor, (a) => a && remember(a))

// Who registered them, by name where they can be read.
const creatorId = computed(() => actor.value?.created_by_actor_id ?? null)
const creator = useAsync(
  () => (creatorId.value ? read('actor.get', { actor_id: creatorId.value }) : Promise.resolve(null)),
  { watch: [creatorId] },
)

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
/** Why credentials cannot be given; one's own account is fine. */
const credentialBlocker = computed<string | null>(() => {
  if (isSystem.value) return t('admin.actor.cannot.system')
  if (!isSelf.value && roleBlocked.value) return t('admin.actor.cannot.role')
  return null
})

const suspendW = useWrite('actor.suspend')
const reactivateW = useWrite('actor.reactivate')

async function suspend() {
  const a = actor.value
  if (!a) return
  const ok = await ElMessageBox.confirm(t('admin.actor.suspendConfirm'), t('admin.actor.suspendTitle', { name: a.display_name }), {
    type: 'warning',
    confirmButtonText: t('admin.actor.suspend'),
    cancelButtonText: t('common.actions.cancel'),
    confirmButtonClass: 'el-button--danger',
  }).catch(() => false)
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
  const out = await reactivateW.run({ actor_id: a.id }, { success: t('admin.actor.reactivated', { name: a.display_name }) })
  if (out) await state.reload()
}
</script>

<template>
  <div>
    <PageHeader
      :title="actor?.display_name ?? t('admin.actor.title')"
      :subtitle="actor ? (actor.email ?? t(`enums.actorKind.${actor.kind}`)) : undefined"
      :back="{ name: 'admin-actors' }"
    >
      <template #tags>
        <template v-if="actor">
          <StatusTag vocab="actorKind" :value="actor.kind" size="default" />
          <StatusTag vocab="actorStatus" :value="actor.status" size="default" />
          <StatusTag v-if="actor.platform_role" vocab="platformRole" :value="actor.platform_role" size="default" />
        </template>
      </template>
      <template v-if="actor">
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
      </template>
    </PageHeader>

    <AsyncState :loading="state.loading.value && !actor" :error="actor ? null : state.error.value" @retry="state.reload">
      <template v-if="actor">
        <el-alert
          v-if="actor.status === 'suspended'"
          type="error"
          :closable="false"
          show-icon
          :title="t('admin.actor.suspendedBanner')"
          class="actor__alert"
        />
        <el-alert v-if="isSelf" type="info" :closable="false" show-icon :title="t('admin.actor.you')" class="actor__alert" />
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
          <el-descriptions :column="narrow ? 1 : 2" border>
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
          <p v-if="!isSystem" class="app-form-hint actor__seats">
            {{ t('admin.actor.seatsHint') }}
            <router-link :to="{ name: 'admin-courses' }">{{ t('admin.nav.courses') }}</router-link>
          </p>
        </section>

        <div class="actor__grid">
          <IssueTokenCard :actor="actor" :is-self="isSelf" :blocked-reason="credentialBlocker" />
          <LinkSsoCard :actor="actor" :blocked-reason="credentialBlocker" />
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.actor__alert {
  margin-bottom: 12px;
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
.actor__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
}
.actor__grid > .app-card + .app-card {
  margin-top: 0;
}
@media (min-width: 1100px) {
  .actor__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}
</style>
