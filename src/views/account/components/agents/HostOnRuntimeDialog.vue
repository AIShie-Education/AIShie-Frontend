<script setup lang="ts">
// Hosting an agent on the school's runtime, with a token this page issues
// and hands over unseen (D6; the contract's §9.2): step one of the wizard,
// "Confirm", before "Model and key" (ModelKeyDialog). The same flow gives a
// hosted agent a new token (mode replace, or reconnect when AIShie refused
// the one it had), calling PUT /token instead of POST /agents.
//
// The one-brain rule: an agent has one brain at a time. When another of its
// live tokens was used in the last few minutes, something else is running
// it, and hosting it too would have both answer every question; the dialog
// says so, and the owner revokes those tokens or goes on regardless.
//
// The token itself is in handOverNewToken's local variable only: nothing
// here holds it.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, RevokedToken } from '@/api/runtime-types'
import type { AgentCredential, AgentSeat } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { seatPurpose } from '@/utils/agents'
import TimeText from '@/components/TimeText.vue'
import { maskedToken } from '../credentials'
import { hostingErrorText, otherRecentTokens, type HostMode } from './hosting'
import { handOverNewToken, ownerRevokeByPrefix, revokeAllAsOwner } from './hostingFlow'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  mode: HostMode
  /** Core's seats of the agent (agent.get), for the confirmation. */
  seats?: AgentSeat[] | null
  /** Core's list of its tokens, for the one-brain rule. */
  credentials?: AgentCredential[] | null
  /** The hosted agent, when replacing its token. */
  hosted?: HostedAgent | null
}>()
const emit = defineEmits<{
  connected: [agent: HostedAgent]
  replaced: [agent: HostedAgent]
  /** The runtime's list should be read again (already hosted; gone). */
  refresh: []
  /** Tokens were issued or revoked: Core's list should be read again. */
  credsChanged: []
}>()
const { t } = useI18n()

const pending = ref(false)
const error = shallowRef<unknown>(null)
const note = ref('')

watch(open, (v) => {
  if (!v) return
  error.value = null
  note.value = ''
})

const others = computed(() =>
  otherRecentTokens(props.credentials, props.mode === 'connect' ? null : (props.hosted?.token.prefix ?? null)),
)
const sortedSeats = computed(() =>
  [...(props.seats ?? [])].sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)

const title = computed(() => {
  if (props.mode === 'replace') return t('hosting.connect.replaceTitle', { name: props.name })
  if (props.mode === 'reconnect') return t('hosting.connect.reconnectTitle', { name: props.name })
  return t('hosting.connect.title', { name: props.name })
})
const errorText = computed(() => (error.value ? hostingErrorText(error.value, t) : ''))
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

function courseName(s: { code: string; section: string }): string {
  return s.section ? `${s.code} · ${s.section}` : s.code
}

type Replaced = { agent: HostedAgent; previous: RevokedToken | null }

async function connect() {
  const { result } = await handOverNewToken<HostedAgent>(props.actorId, {
    hand: (token) => runtime.connect({ token, core_actor_id: props.actorId }).then((r) => r.data),
    check: async () =>
      (await runtime.list()).data.agents.find((a) => a.core_actor_id.toLowerCase() === props.actorId.toLowerCase()) ??
      null,
  })
  ElMessage({ type: 'success', message: t('hosting.connect.done', { name: props.name }) })
  emit('connected', result)
}

async function replace() {
  const h = props.hosted
  if (!h) return
  const { result, issued } = await handOverNewToken<Replaced>(props.actorId, {
    hand: (token) =>
      runtime.replaceToken(h.id, token).then((r) => ({ agent: r.data.agent, previous: r.data.previous_token })),
    check: async (iss) => {
      const r = await runtime.get(h.id)
      return r.data.token.prefix === iss.prefix ? { agent: r.data, previous: null } : null
    },
  })
  // The runtime revokes the token it had with the new one; when it could not
  // (or it cannot be told), the owner does, as §9.4 says.
  const previous = result.previous
  const oldPrefix = previous?.prefix ?? h.token.prefix
  if ((!previous || previous.revocation === 'failed') && oldPrefix && oldPrefix !== issued.prefix) {
    const r = await ownerRevokeByPrefix(props.actorId, oldPrefix)
    if (r === 'failed') note.value = t('hosting.connect.previousNotRevoked')
  }
  if (note.value) ElMessage({ type: 'warning', message: note.value, duration: 10_000, showClose: true })
  else ElMessage({ type: 'success', message: t('hosting.connect.replaced', { name: props.name }) })
  emit('replaced', result.agent)
}

async function go(revokeOthers: boolean) {
  if (pending.value) return
  pending.value = true
  error.value = null
  try {
    if (revokeOthers && others.value.length) {
      const failed = await revokeAllAsOwner(
        props.actorId,
        others.value.map((c) => c.id),
      )
      if (failed) {
        error.value = new ApiError({ status: 0, code: 'revoke_failed', message: t('hosting.oneBrain.revokeFailed') })
        return
      }
    }
    if (props.mode === 'connect') await connect()
    else await replace()
    open.value = false
  } catch (e) {
    if (isRuntimeError(e)) {
      if (e.reason === 'already_hosted' || e.reason === 'agent_not_found') emit('refresh')
      error.value = e
    } else {
      // Core's own refusals (issuing a token, say) are shown as the app shows them.
      notifyError(e)
    }
  } finally {
    pending.value = false
    emit('credsChanged')
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    :close-on-press-escape="!pending"
    :show-close="!pending"
    class="host-dialog"
  >
    <el-steps v-if="mode === 'connect'" :active="0" finish-status="success" simple class="host-dialog__steps">
      <el-step :title="t('hosting.connect.steps.confirm')" />
      <el-step :title="t('hosting.connect.steps.model')" />
    </el-steps>

    <template v-if="mode === 'connect'">
      <p class="host-dialog__body">{{ t('hosting.connect.body') }}</p>
      <h3 class="host-dialog__h">{{ t('hosting.connect.seats') }}</h3>
      <ul v-if="sortedSeats.length" class="host-dialog__seats">
        <li v-for="s in sortedSeats" :key="s.course_id" class="host-dialog__seat">
          <span class="host-dialog__course">{{ courseName(s) }}</span>
          <span class="app-muted">{{ s.title }}</span>
          <el-tag v-if="seatPurpose(s)" size="small" disable-transitions>
            {{ t(`hosting.connect.purpose.${seatPurpose(s)}`) }}
          </el-tag>
        </li>
      </ul>
      <p v-else class="app-form-hint">{{ t('hosting.connect.noSeats') }}</p>
    </template>
    <p v-else-if="mode === 'reconnect'" class="host-dialog__body">{{ t('hosting.connect.reconnectBody') }}</p>
    <p v-else class="host-dialog__body">{{ t('hosting.connect.replaceBody') }}</p>

    <el-alert
      v-if="others.length"
      type="warning"
      :closable="false"
      show-icon
      :title="t('hosting.oneBrain.title')"
      class="host-dialog__alert one-brain"
    >
      <p class="one-brain__body">{{ t('hosting.oneBrain.body') }}</p>
      <ul class="one-brain__list">
        <li v-for="c in others" :key="c.id">
          <strong>{{ c.label?.trim() || t('agents.tokens.unlabelled') }}</strong>
          <code>{{ maskedToken(c.token_prefix) }}</code>
          <span>
            {{ t('hosting.oneBrain.used') }}
            <TimeText :value="c.last_used_at" relative />
          </span>
        </li>
      </ul>
    </el-alert>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="host-dialog__alert">
      <details v-if="errorDetail" class="host-dialog__details">
        <summary>{{ t('hosting.errors.details') }}</summary>
        <p>{{ errorDetail }}</p>
      </details>
    </el-alert>

    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <template v-if="others.length">
        <el-button class="one-brain__anyway" :disabled="pending" @click="go(false)">
          {{ mode === 'connect' ? t('hosting.oneBrain.anyway') : t('hosting.oneBrain.anywayReplace') }}
        </el-button>
        <el-button type="primary" class="one-brain__revoke" :loading="pending" @click="go(true)">
          {{ mode === 'connect' ? t('hosting.oneBrain.revoke') : t('hosting.oneBrain.revokeReplace') }}
        </el-button>
      </template>
      <el-button v-else type="primary" class="host-dialog__submit" :loading="pending" @click="go(false)">
        {{
          mode === 'connect'
            ? t('hosting.connect.submit')
            : mode === 'reconnect'
              ? t('hosting.connect.reconnectSubmit')
              : t('hosting.connect.replaceSubmit')
        }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.host-dialog__steps {
  margin-bottom: 16px;
}
.host-dialog__body {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.host-dialog__h {
  margin: 12px 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.host-dialog__seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.host-dialog__seat {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 13px;
}
.host-dialog__course {
  font-weight: 500;
}
.host-dialog__alert {
  margin-top: 12px;
}
.one-brain__body {
  margin: 0 0 6px;
  line-height: 1.5;
}
.one-brain__list {
  margin: 0;
  padding-left: 18px;
}
.one-brain__list li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.one-brain__list code {
  font-family: var(--app-font-mono);
}
.host-dialog__details summary {
  cursor: pointer;
}
.host-dialog__details p {
  margin: 4px 0 0;
  word-break: break-word;
}
</style>
