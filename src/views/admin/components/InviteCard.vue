<script setup lang="ts">
// actor.invite: a link for a person to choose their password with, shown
// once. It works once and until it expires, and making another replaces it;
// taken up by someone who has a password, it replaces that password, which
// is how a forgotten one is reset. Why it is not offered mirrors Core's rule
// (inviteBlocker).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Actor, ToolOut } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import TimeText from '@/components/TimeText.vue'
import InviteRevealDialog from './InviteRevealDialog.vue'
import { DEFAULT_INVITE_DAYS, INVITE_DAYS, inviteBlocker, inviteMode, signInState } from './signIn'

const props = defineProps<{ actor: Actor }>()
const emit = defineEmits<{ edit: []; changed: [] }>()
const { t } = useI18n()
const session = useSessionStore()

const days = ref<number>(DEFAULT_INVITE_DAYS)
const { run, pending } = useWrite('actor.invite')
const issued = ref<ToolOut<'actor.invite'> | null>(null)
const revealing = ref(false)

const blocker = computed(() => inviteBlocker(props.actor, { id: session.me?.id, isRoot: session.isRoot }))
const state = computed(() => signInState(props.actor))
const mode = computed(() => inviteMode(props.actor))

const blockedText = computed(() => {
  switch (blocker.value) {
    case 'self':
      return t('admin.invite.blocked.self')
    case 'system':
      return t('admin.invite.blocked.system')
    case 'role':
      return t('admin.actor.cannot.role')
    case 'agent':
      return t('admin.invite.blocked.agent')
    case 'noEmail':
      return t('admin.invite.blocked.noEmail')
    case 'suspended':
      return t('admin.invite.blocked.suspended')
    default:
      return null
  }
})

async function submit() {
  if (blocker.value) return
  const out = await run({ actor_id: props.actor.id, expires_in_days: days.value }, { success: false })
  if (!out || out.status !== 'executed') return
  issued.value = out.result
  revealing.value = true
}

/** The token is not kept any longer than the dialog that shows it. */
function closed() {
  issued.value = null
  emit('changed')
}
</script>

<template>
  <section id="invite" class="app-card invite">
    <h2 class="app-card__title">{{ t('admin.invite.title') }}</h2>
    <p class="app-muted invite__intro">{{ t('admin.invite.intro') }}</p>

    <el-alert v-if="blockedText" type="info" :closable="false" show-icon :title="blockedText">
      <div v-if="blocker === 'self'" class="invite__blocked-action">
        <router-link :to="{ name: 'account' }">{{ t('admin.invite.blocked.selfLink') }}</router-link>
      </div>
      <div v-else-if="blocker === 'noEmail'" class="invite__blocked-action">
        <el-button size="small" type="primary" plain @click="emit('edit')">
          <el-icon><Edit /></el-icon>
          <span>{{ t('admin.invite.blocked.giveEmail') }}</span>
        </el-button>
      </div>
    </el-alert>

    <template v-else>
      <ul v-if="state && (state.invite !== 'none' || actor.has_password)" class="invite__facts">
        <li v-if="state.invite === 'pending'">
          <i18n-t keypath="admin.invite.pending" tag="span" scope="global">
            <template #date><TimeText :value="state.inviteExpiresAt" /></template>
          </i18n-t>
        </li>
        <li v-else-if="state.invite === 'expired'">
          <i18n-t keypath="admin.invite.expired" tag="span" scope="global">
            <template #date><TimeText :value="state.inviteExpiresAt" /></template>
          </i18n-t>
        </li>
        <li v-if="actor.has_password">{{ t('admin.invite.hasPassword') }}</li>
      </ul>
      <form class="invite__form" @submit.prevent="submit">
        <div class="invite__days">
          <label for="invite-days" class="invite__label">{{ t('admin.invite.days') }}</label>
          <el-select id="invite-days" v-model="days" class="invite__days-select">
            <el-option v-for="n in INVITE_DAYS" :key="n" :value="n" :label="t('admin.invite.dayOption', { n }, n)" />
          </el-select>
        </div>
        <el-button type="primary" native-type="submit" :loading="pending">
          <el-icon><Message /></el-icon>
          <span>{{ t(`admin.invite.submit.${mode}`) }}</span>
        </el-button>
      </form>
    </template>

    <InviteRevealDialog v-model="revealing" :issued="issued" @closed="closed" />
  </section>
</template>

<style scoped>
.invite__intro {
  margin: 0 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.invite__blocked-action {
  margin-top: 6px;
}
.invite__facts {
  margin: 0 0 16px;
  padding-left: 18px;
  font-size: var(--app-text-sm);
  line-height: 1.7;
}
.invite__form {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.invite__days {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.invite__label {
  font-size: var(--app-text-md);
  color: var(--el-text-color-regular);
}
.invite__days-select {
  width: 160px;
}
</style>
