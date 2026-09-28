<script setup lang="ts">
// Hosting an agent with a token its owner already has ("I have a token for
// this agent", the contract's §9.2): the token is checked first
// (POST /agents/inspect), which says whose agent it is, where it is seated
// and whether it is hosted already, then connected (POST /agents). The field
// is a password field that the browser does not fill or remember, and is
// cleared once the runtime has the token, or the dialog closes. The page
// never revokes a pasted token: the owner decides what else uses it.
//
// The one-brain rule holds here too (the contract's A.1): the runtime's
// answer names the agent's other live tokens (other_tokens), and when one was
// used lately the agent seems to run somewhere else. The dialog says so before
// connecting, and each of those tokens can be revoked from it; connecting then
// goes on only when the owner says so. Connect's answer names them again, for
// the page to warn once more after. And this very token, used lately, may be
// what a runtime of the owner's own runs on.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/api/http'
import { runtime, RuntimeError } from '@/api/runtime'
import type { HostedAgent, InspectAnswer, OtherTokens } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'
import TimeText from '@/components/TimeText.vue'
import OtherTokensNotice from './OtherTokensNotice.vue'
import {
  AGENT_TOKEN_SHAPE,
  connectedParts,
  credentialByPrefix,
  courseLabel,
  hostingErrorText,
  seatSentences,
  usedRecently,
  withoutTokens,
} from './hosting'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  credentials?: AgentCredential[] | null
}>()
const emit = defineEmits<{
  /** Connected: the agent, and its other live tokens as the runtime listed them (undefined when it did not). */
  connected: [agent: HostedAgent, others: OtherTokens | null | undefined]
  refresh: []
  credsChanged: []
}>()
const { t } = useI18n()

// What is typed: kept in the field alone, and cleared as soon as it is not needed.
const token = ref('')
const inspected = shallowRef<InspectAnswer | null>(null)
const pending = ref<'check' | 'connect' | null>(null)
const error = shallowRef<unknown>(null)

function clear() {
  token.value = ''
  inspected.value = null
  error.value = null
}
watch(open, (v) => {
  if (!v) clear()
})
// Another token, another answer.
watch(token, () => {
  inspected.value = null
  error.value = null
})
onBeforeUnmount(clear)

/** The agent's other live tokens, as inspect listed them, less those revoked here since. */
const others = computed(() => inspected.value?.other_tokens ?? null)
const othersInUse = computed(() => !!others.value?.in_use)
const sameTokenUse = computed(() => {
  const c = inspected.value ? credentialByPrefix(props.credentials, inspected.value.token.prefix) : undefined
  return c && usedRecently(c) ? c.last_used_at : null
})
const errorText = computed(() => (error.value ? hostingErrorText(error.value, t) : ''))
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

function typed(): string | null {
  const v = token.value.trim()
  if (!AGENT_TOKEN_SHAPE.test(v)) {
    error.value = new RuntimeError({
      status: 400,
      code: 'invalid_argument',
      message: 'not an agent token',
      reason: 'token_malformed',
    })
    return null
  }
  return v
}

async function check() {
  if (pending.value) return
  error.value = null
  const v = typed()
  if (!v) return
  pending.value = 'check'
  try {
    const r = await runtime.inspect({ token: v, core_actor_id: props.actorId })
    // The field may have changed while the runtime looked.
    if (token.value.trim() === v) inspected.value = r.data
  } catch (e) {
    error.value = e
  } finally {
    pending.value = null
  }
}

/** A token revoked from the notice: left out, and the warning with it once none in use is left. */
function onRevoked(prefix: string) {
  const i = inspected.value
  if (i) inspected.value = { ...i, other_tokens: withoutTokens(i.other_tokens, [prefix]) ?? null }
}

async function connect() {
  if (pending.value || !inspected.value) return
  const v = typed()
  if (!v) return
  pending.value = 'connect'
  error.value = null
  try {
    const r = await runtime.connect({ token: v, core_actor_id: props.actorId })
    clear()
    ElMessage({ type: 'success', message: t('hosting.connect.done', { name: props.name }) })
    open.value = false
    const { agent, others } = connectedParts(r.data)
    emit('connected', agent, others)
  } catch (e) {
    if (e instanceof RuntimeError && e.reason === 'already_hosted') emit('refresh')
    error.value = e
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('hosting.paste.title', { name })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    class="paste-dialog"
  >
    <p class="paste-dialog__intro">{{ t('hosting.paste.intro') }}</p>
    <el-form label-position="top" @submit.prevent="check">
      <el-form-item :label="t('hosting.paste.token')">
        <el-input
          v-model="token"
          type="password"
          autocomplete="off"
          name="aishie-agent-token"
          :placeholder="t('hosting.paste.placeholder')"
          :disabled="pending === 'connect'"
          class="paste-dialog__token"
          @keyup.enter="check"
        />
      </el-form-item>
    </el-form>

    <div v-if="inspected" class="paste-dialog__result">
      <dl class="paste-dialog__facts">
        <dt>{{ t('hosting.paste.agent') }}</dt>
        <dd>{{ inspected.display_name }}</dd>
        <dt>{{ t('hosting.card.token') }}</dt>
        <dd><code>{{ inspected.token.hint }}</code></dd>
      </dl>
      <h3 class="paste-dialog__h">{{ t('hosting.paste.seats') }}</h3>
      <ul v-if="inspected.seats.length" class="paste-dialog__seats">
        <li v-for="s in inspected.seats" :key="s.course_id">
          <span class="paste-dialog__course">{{ courseLabel(s) }}</span>
          <span v-for="(line, i) in seatSentences(s, t)" :key="i" class="paste-dialog__line">{{ line }}</span>
        </li>
      </ul>
      <p v-else class="app-form-hint">{{ t('hosting.seat.none') }}</p>
      <el-alert
        v-if="inspected.hosted?.by_you && inspected.hosted.same_token"
        type="info"
        :closable="false"
        show-icon
        :title="t('hosting.paste.alreadyConnected')"
        class="paste-dialog__alert"
      />
      <el-alert
        v-else-if="inspected.hosted && !inspected.hosted.by_you"
        type="info"
        :closable="false"
        show-icon
        :title="t('hosting.paste.takesOver')"
        class="paste-dialog__alert"
      />
      <el-alert
        v-if="sameTokenUse"
        type="warning"
        :closable="false"
        show-icon
        :title="t('hosting.oneBrain.sameTokenTitle')"
        class="paste-dialog__alert one-brain-same"
      >
        <span>{{ t('hosting.oneBrain.sameToken') }}</span>
        <TimeText :value="sameTokenUse" relative />
      </el-alert>
      <OtherTokensNotice
        :actor-id="actorId"
        :others="others"
        say-unknown
        class="paste-dialog__alert"
        @revoked="onRevoked"
        @creds-changed="emit('credsChanged')"
      />
    </div>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="paste-dialog__alert">
      <details v-if="errorDetail" class="paste-dialog__details">
        <summary>{{ t('hosting.errors.details') }}</summary>
        <p>{{ errorDetail }}</p>
      </details>
    </el-alert>

    <template #footer>
      <el-button :disabled="!!pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button v-if="!inspected" type="primary" :loading="pending === 'check'" :disabled="!token" @click="check">
        {{ t('hosting.paste.check') }}
      </el-button>
      <el-button
        v-else
        :type="othersInUse ? 'warning' : 'primary'"
        class="paste-dialog__submit"
        :class="{ 'is-anyway': othersInUse }"
        :loading="pending === 'connect'"
        @click="connect"
      >
        {{ othersInUse ? t('hosting.otherTokens.anyway') : t('hosting.paste.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.paste-dialog__intro {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.paste-dialog__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
  font-size: 13px;
}
.paste-dialog__facts dt {
  color: var(--el-text-color-secondary);
}
.paste-dialog__facts dd {
  margin: 0;
  min-width: 0;
  word-break: break-word;
}
.paste-dialog__facts code {
  font-family: var(--app-font-mono);
}
.paste-dialog__h {
  margin: 12px 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.paste-dialog__seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.paste-dialog__seats li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.paste-dialog__course {
  font-weight: 500;
}
.paste-dialog__alert {
  margin-top: 12px;
}
.paste-dialog__details summary {
  cursor: pointer;
}
.paste-dialog__details p {
  margin: 4px 0 0;
  word-break: break-word;
}
</style>
