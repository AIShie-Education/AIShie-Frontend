<script setup lang="ts">
// Who the caller is (me.get): with the email and the login ID (a student or
// staff number) a person signs in with.
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import type { Me } from '@/api/types'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'

defineProps<{ me: Me | undefined; loading: boolean; error: ApiError | null }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="app-card profile-card">
    <h2 class="app-card__title">{{ t('account.profile.title') }}</h2>
    <AsyncState :loading="loading && !me" :error="me ? null : error" @retry="emit('retry')">
      <template v-if="me">
        <div class="profile-card__head">
          <el-avatar :size="48" class="profile-card__avatar">{{ me.display_name.slice(0, 1) }}</el-avatar>
          <div class="profile-card__who">
            <div class="profile-card__name">{{ me.display_name }}</div>
            <div class="profile-card__tags">
              <StatusTag vocab="actorKind" :value="me.kind" />
              <StatusTag vocab="actorStatus" :value="me.status" />
              <StatusTag v-if="me.platform_role" vocab="platformRole" :value="me.platform_role" />
            </div>
          </div>
        </div>
        <dl class="profile-card__list">
          <dt>{{ t('account.profile.email') }}</dt>
          <dd>
            <span v-if="me.email" class="profile-card__email">{{ me.email }}</span>
            <span v-else class="app-muted">{{ t('account.profile.noEmail') }}</span>
          </dd>
          <template v-if="me.kind === 'human'">
            <dt>{{ t('account.profile.loginId') }}</dt>
            <dd>
              <code v-if="me.login_id" class="profile-card__login-id">{{ me.login_id }}</code>
              <span v-else class="app-muted">{{ t('account.profile.noLoginId') }}</span>
              <AppTag v-if="me.login_id && me.login_id_verified === false" tone="wait">
                {{ t('account.profile.unverified') }}
              </AppTag>
              <div class="app-form-hint">{{ t('account.profile.loginIdNote') }}</div>
            </dd>
          </template>
          <dt>{{ t('account.profile.kind') }}</dt>
          <dd>
            {{ t(`enums.actorKind.${me.kind}`) }}
            <div class="app-form-hint">{{ t('account.profile.kindNote') }}</div>
          </dd>
          <dt>{{ t('account.profile.status') }}</dt>
          <dd>{{ t(`enums.actorStatus.${me.status}`) }}</dd>
          <dt>{{ t('account.profile.platformRole') }}</dt>
          <dd>
            <template v-if="me.platform_role">{{ t(`enums.platformRole.${me.platform_role}`) }}</template>
            <span v-else class="app-muted">{{ t('account.profile.noPlatformRole') }}</span>
          </dd>
          <dt>{{ t('account.profile.id') }}</dt>
          <dd><IdText :id="me.id" full /></dd>
        </dl>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
.profile-card__login-id {
  font-family: var(--app-font-mono);
  margin-right: 6px;
}
.profile-card__head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.profile-card__avatar {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-xl);
  flex-shrink: 0;
}
.profile-card__who {
  min-width: 0;
}
.profile-card__name {
  font-size: var(--app-text-xl);
  font-weight: var(--app-weight-strong);
  word-break: break-word;
}
.profile-card__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.profile-card__list {
  display: grid;
  grid-template-columns: minmax(110px, max-content) 1fr;
  gap: 10px 16px;
  margin: 0;
  font-size: var(--app-text-md);
}
.profile-card__list dt {
  color: var(--el-text-color-secondary);
}
.profile-card__list dd {
  margin: 0;
  min-width: 0;
  word-break: break-word;
}
.profile-card__email {
  word-break: break-all;
}
.profile-card :deep(.id-text) {
  white-space: normal;
  flex-wrap: wrap;
}
.profile-card :deep(.id-text__code) {
  word-break: break-all;
}
@media (max-width: 480px) {
  .profile-card__list {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .profile-card__list dd {
    margin-bottom: 10px;
  }
}
</style>
