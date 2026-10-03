<script setup lang="ts">
// How a person can sign in, as tags (signInState): a password, single
// sign-on, an invitation waiting or expired, or no way in yet. An agent
// signs in with API tokens, which no list shows: a dash.
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
    <el-tag v-if="state.password" type="success" size="small" disable-transitions>
      {{ t('admin.signIn.password') }}
    </el-tag>
    <el-tag v-if="state.sso" type="success" size="small" disable-transitions>
      {{ t('admin.signIn.sso') }}
    </el-tag>
    <el-tooltip v-if="state.invite === 'pending'" :content="untilFull" placement="top">
      <el-tag type="primary" size="small" disable-transitions>
        {{ t('admin.signIn.invitedUntil', { date: until }) }}
      </el-tag>
    </el-tooltip>
    <el-tooltip v-else-if="state.invite === 'expired'" :content="untilFull" placement="top">
      <el-tag :type="state.canSignIn ? 'info' : 'warning'" size="small" disable-transitions>
        {{ t('admin.signIn.inviteExpired') }}
      </el-tag>
    </el-tooltip>
    <el-tag v-if="!state.canSignIn && state.invite === 'none'" type="warning" size="small" disable-transitions>
      {{ t('admin.signIn.cannot') }}
    </el-tag>
  </span>
</template>

<style scoped>
.sign-in-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
