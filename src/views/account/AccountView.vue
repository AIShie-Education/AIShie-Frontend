<script setup lang="ts">
// The caller's own account, for every signed-in actor: who they are
// (me.get), where they are seated (me.memberships), and the ways into the
// account (credential.list), with a password to set, tokens to make and
// credentials to revoke.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useSessionStore } from '@/stores/session'
import PageHeader from '@/components/PageHeader.vue'
import ProfileCard from './components/ProfileCard.vue'
import PasswordCard from './components/PasswordCard.vue'
import SeatsCard from './components/SeatsCard.vue'
import CredentialsCard from './components/CredentialsCard.vue'

const { t } = useI18n()
const session = useSessionStore()

const me = useAsync(() => read('me.get', {}), { keepData: true })
// Seats change while the app is open: read them afresh, into the session
// store the navigation also shows them from.
const seats = useAsync(() => session.loadMemberships())
const creds = useAsync(() => read('credential.list', {}).then((o) => o.credentials ?? []), { keepData: true })

const hasEmail = computed(() => !!(me.data.value ?? session.me)?.email)
</script>

<template>
  <div class="account-view">
    <PageHeader :title="t('account.title')" :subtitle="t('account.subtitle')" />

    <el-alert
      v-if="session.usingToken"
      type="warning"
      :closable="false"
      show-icon
      :title="t('account.tokenMode.title')"
      :description="t('account.tokenMode.body')"
      class="account-view__banner"
    />

    <div class="account-view__top">
      <ProfileCard
        :me="me.data.value ?? session.me ?? undefined"
        :loading="me.loading.value"
        :error="me.error.value"
        @retry="me.reload"
      />
      <PasswordCard :credentials="creds.data.value" :has-email="hasEmail" @changed="creds.reload" />
    </div>

    <SeatsCard
      :seats="session.liveMemberships"
      :loading="seats.loading.value"
      :error="seats.error.value"
      class="account-view__section"
      @retry="seats.reload"
    />

    <CredentialsCard
      :credentials="creds.data.value"
      :loading="creds.loading.value"
      :error="creds.error.value"
      class="account-view__section"
      @changed="creds.reload"
      @retry="creds.reload"
    />
  </div>
</template>

<style scoped>
.account-view__banner {
  margin-bottom: 16px;
}
.account-view__top {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  align-items: start;
}
.account-view__top > .app-card + .app-card {
  margin-top: 0;
}
.account-view__section {
  margin-top: 16px;
}
@media (max-width: 900px) {
  .account-view__top {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
