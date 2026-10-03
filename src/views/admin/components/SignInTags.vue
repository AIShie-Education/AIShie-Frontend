<script setup lang="ts">
// How a person can sign in, as tags (signInState): a password, single
// sign-on, an invitation waiting or expired, or no way in yet. An agent
// signs in with API tokens, which no list shows: a dash.
import { Connection, Key } from '@element-plus/icons-vue'
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Actor } from '@/api/types'
import { useUiStore } from '@/stores/ui'
import { formatDate } from '@/utils/format'
import { zonedText } from '@/utils/parts'
import { signInState } from './signIn'

const props = defineProps<{
  actor: Pick<Actor, 'kind' | 'email' | 'has_password' | 'has_sso' | 'invite_expires_at'>
}>()
const { t } = useI18n()
const ui = useUiStore()

const state = computed(() => signInState(props.actor))
// Recomputed when the language changes, as TimeText is.
const until = computed(() => (ui.locale, formatDate(state.value?.inviteExpiresAt)))
const untilFull = computed(() => (ui.locale, zonedText(state.value?.inviteExpiresAt)))
</script>

<template>
  <span v-if="!state" class="app-muted">—</span>
  <span v-else class="sign-in-tags">
    <AppTag v-if="state.password" variant="outline" :icon="Key">
      {{ t('admin.signIn.password') }}
    </AppTag>
    <AppTag v-if="state.sso" variant="outline" :icon="Connection">
      {{ t('admin.signIn.sso') }}
    </AppTag>
    <el-tooltip v-if="state.invite === 'pending'" :content="untilFull" placement="top">
      <AppTag tone="wait">
        {{ t('admin.signIn.invitedUntil', { date: until }) }}
      </AppTag>
    </el-tooltip>
    <el-tooltip v-else-if="state.invite === 'expired'" :content="untilFull" placement="top">
      <AppTag :tone="toneOf(state.canSignIn ? 'info' : 'warning')">
        {{ t('admin.signIn.inviteExpired') }}
      </AppTag>
    </el-tooltip>
    <AppTag v-if="!state.canSignIn && state.invite === 'none'" tone="wait">
      {{ t('admin.signIn.cannot') }}
    </AppTag>
  </span>
</template>

<style scoped>
.sign-in-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
