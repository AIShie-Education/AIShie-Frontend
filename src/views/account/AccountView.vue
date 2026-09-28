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
// When the list was asked for goes with it: it tells which session is this
// browser's (see thisBrowserSession).
const creds = useAsync(
  async () => {
    const listedAt = Date.now()
    const o = await read('credential.list', {})
    return { list: o.credentials ?? [], listedAt }
  },
  { keepData: true },
)

/** A name to sign in with a password: an email, or a login ID (a student or staff number). */
const hasEmail = computed(() => {
  const m = me.data.value ?? session.me
  return !!m?.email || !!m?.login_id
})
const hasLoginId = computed(() => !!(me.data.value ?? session.me)?.login_id)
/** Only a person owns agents (agent.create refuses an agent). */
const ownsAgents = computed(() => (me.data.value ?? session.me)?.kind === 'human')
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
      <PasswordCard
        :credentials="creds.data.value?.list"
        :loading="creds.loading.value"
        :error="creds.error.value"
        :has-email="hasEmail"
        :has-login-id="hasLoginId"
        @changed="creds.reload"
        @retry="creds.reload"
      />
    </div>

    <SeatsCard
      :seats="session.liveMemberships"
      :loading="seats.loading.value"
      :error="seats.error.value"
      class="account-view__section"
      @retry="seats.reload"
    />

    <section v-if="ownsAgents" class="app-card account-view__section account-agents">
      <el-icon :size="28" class="account-agents__icon" aria-hidden="true"><Cpu /></el-icon>
      <div class="account-agents__text">
        <h2 class="account-agents__title">{{ t('agents.accountCard.title') }}</h2>
        <p class="app-form-hint account-agents__body">{{ t('agents.accountCard.body') }}</p>
      </div>
      <router-link :to="{ name: 'account-agents' }" class="account-agents__link">
        <el-button>
          <span>{{ t('agents.accountCard.open') }}</span>
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </router-link>
    </section>

    <CredentialsCard
      :credentials="creds.data.value?.list"
      :listed-at="creds.data.value?.listedAt"
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
.account-agents {
  display: flex;
  align-items: center;
  gap: 14px;
}
.account-agents__icon {
  flex-shrink: 0;
  color: var(--el-color-primary);
}
.account-agents__text {
  flex: 1;
  min-width: 0;
}
.account-agents__title {
  margin: 0;
  font-size: 18px;
}
.account-agents__body {
  margin: 4px 0 0;
}
.account-agents__link {
  flex-shrink: 0;
}
@media (max-width: 600px) {
  .account-agents {
    flex-wrap: wrap;
  }
  .account-agents__link {
    width: 100%;
    padding-left: 42px;
  }
}
@media (max-width: 900px) {
  .account-view__top {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
