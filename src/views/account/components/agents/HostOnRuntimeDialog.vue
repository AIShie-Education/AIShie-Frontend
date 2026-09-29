<script setup lang="ts">
// Hosting an agent on the school's runtime, with a token this page issues
// and hands over unseen (D6; the contract's §9.2): step one of the wizard,
// "Confirm", before "Model and key" (ModelKeyDialog). The same flow gives a
// hosted agent a new token (mode replace, or reconnect when AIshie refused
// the one it had), calling PUT /token instead of POST /agents.
//
// The one-brain rule (the contract's A.1): an agent has one brain at a time.
// When another of its live tokens was used lately, something else seems to
// run it, and hosting it too would have both answer every question. There
// is no runtime answer to go by before the token is issued, so the dialog
// works it out from Core's list of the agent's tokens as the runtime would
// (otherTokensFrom), says so, and offers to revoke each; the owner goes on
// regardless when they will stop the other themselves. Connect's answer
// names the agent's other tokens again, for the page to warn once more.
//
// The token itself is in handOverNewToken's local variable only: nothing
// here holds it.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { ConnectAnswer, HostedAgent, OtherTokens, RevokedToken } from '@/api/runtime-types'
import type { AgentCredential, AgentSeat } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { seatPurpose } from '@/utils/agents'
import OtherTokensNotice from './OtherTokensNotice.vue'
import {
  connectedParts,
  hostingErrorText,
  otherTokensFrom,
  unrevoked,
  withoutTokens,
  type HostMode,
  type UnrevokedToken,
} from './hosting'
import { handOverNewToken } from './hostingFlow'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  mode: HostMode
  /** Core's seats of the agent (agent.get), for the confirmation. */
  seats?: AgentSeat[] | null
  /** Core's list of its tokens, for the one-brain rule. */
  credentials?: AgentCredential[] | null
  /** The next step may be the school's plan (features.school_key). */
  school?: boolean
  /** The hosted agent, when replacing its token. */
  hosted?: HostedAgent | null
}>()
const emit = defineEmits<{
  /** Hosted: the agent, and its other live tokens as the runtime listed them (undefined when it did not). */
  connected: [agent: HostedAgent, others: OtherTokens | null | undefined]
  replaced: [agent: HostedAgent]
  /** The token the runtime had may still work: the owner is offered to revoke it (§9.4). */
  unrevoked: [token: UnrevokedToken]
  /** The runtime's list should be read again (already hosted; gone; changed meanwhile). */
  refresh: []
  /** Tokens were issued or revoked: Core's list should be read again. */
  credsChanged: []
}>()
const { t } = useI18n()

const pending = ref(false)
const error = shallowRef<unknown>(null)
/** Tokens revoked from this dialog, left out until Core's list is read again. */
const revokedHere = ref<string[]>([])

watch(open, (v) => {
  if (!v) return
  error.value = null
  revokedHere.value = []
})

/** The agent's other live tokens: all of them to connect it, all but the runtime's own to replace that. */
const others = computed(() =>
  withoutTokens(
    otherTokensFrom(props.credentials, props.mode === 'connect' ? null : (props.hosted?.token.prefix ?? null)),
    revokedHere.value,
  ),
)
const othersInUse = computed(() => !!others.value?.in_use)
const sortedSeats = computed(() =>
  [...(props.seats ?? [])].sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)

const title = computed(() => {
  if (props.mode === 'replace') return t('hosting.connect.replaceTitle', { name: props.name })
  if (props.mode === 'reconnect') return t('hosting.connect.reconnectTitle', { name: props.name })
  return t('hosting.connect.title', { name: props.name })
})
const submitText = computed(() => {
  if (othersInUse.value) return t(props.mode === 'connect' ? 'hosting.otherTokens.anyway' : 'hosting.otherTokens.anywayReplace')
  if (props.mode === 'reconnect') return t('hosting.connect.reconnectSubmit')
  return t(props.mode === 'replace' ? 'hosting.connect.replaceSubmit' : 'hosting.connect.submit')
})
const errorText = computed(() => {
  if (!error.value) return ''
  // The agent changed while its token was being replaced: it is read again, to try once more.
  if (isVersionMismatch(error.value)) return t('hosting.errors.changedMeanwhile')
  return hostingErrorText(error.value, t)
})
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

function courseName(s: { code: string; section: string }): string {
  return s.section ? `${s.code} · ${s.section}` : s.code
}

type Replaced = { agent: HostedAgent; previous: RevokedToken | null }

async function connect() {
  const { result } = await handOverNewToken<ConnectAnswer | HostedAgent>(props.actorId, {
    hand: (token) => runtime.connect({ token, core_actor_id: props.actorId }).then((r) => r.data),
    check: async () =>
      (await runtime.list()).data.agents.find((a) => a.core_actor_id.toLowerCase() === props.actorId.toLowerCase()) ??
      null,
  })
  ElMessage({ type: 'success', message: t('hosting.connect.done', { name: props.name }) })
  const { agent, others } = connectedParts(result)
  emit('connected', agent, others)
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
  // The runtime revokes the token it had with the new one. When it could not,
  // whatever the reason (core_refused included: another replacement at the
  // same moment), or when it cannot be told (its answer was lost), the old
  // token may still work: the owner is told, and offered to revoke it (§9.4).
  const previous = result.previous
  const left = previous ? unrevoked(previous) : { ...h.token, problem: null }
  ElMessage({ type: 'success', message: t('hosting.connect.replaced', { name: props.name }) })
  emit('replaced', result.agent)
  if (left && left.prefix !== issued.prefix) emit('unrevoked', left)
}

async function go() {
  if (pending.value) return
  pending.value = true
  error.value = null
  try {
    if (props.mode === 'connect') await connect()
    else await replace()
    open.value = false
  } catch (e) {
    if (isRuntimeError(e)) {
      if (e.reason === 'already_hosted' || e.reason === 'agent_not_found' || isVersionMismatch(e)) emit('refresh')
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
      <p class="host-dialog__body">{{ t(school ? 'hosting.connect.bodySchool' : 'hosting.connect.body') }}</p>
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

    <OtherTokensNotice
      :actor-id="actorId"
      :others="others"
      say-unknown
      class="host-dialog__alert"
      @revoked="revokedHere = [...revokedHere, $event]"
      @creds-changed="emit('credsChanged')"
    />

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="host-dialog__alert">
      <details v-if="errorDetail" class="host-dialog__details">
        <summary>{{ t('hosting.errors.details') }}</summary>
        <p>{{ errorDetail }}</p>
      </details>
    </el-alert>

    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button
        :type="othersInUse ? 'warning' : 'primary'"
        class="host-dialog__submit"
        :class="{ 'is-anyway': othersInUse }"
        :loading="pending"
        @click="go"
      >
        {{ submitText }}
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
.host-dialog__details summary {
  cursor: pointer;
}
.host-dialog__details p {
  margin: 4px 0 0;
  word-break: break-word;
}
</style>
