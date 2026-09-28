<script setup lang="ts">
// Deleting an agent from the school's runtime (DELETE /agents/{id}; the
// contract's §9.4). The runtime stops it, forgets its settings and key, and
// revokes its token in Core (D7). When the runtime could not revoke the
// token (the agent suspended, Core out of reach or refusing), or the agent
// turned out to be gone already, the token may still work: the page is told
// (unrevoked), and offers the owner to revoke it themselves. A token the
// page did not make (a pasted one) may be kept, for whatever else uses it.
// Deleting is also how an owner goes from hosted to running the agent
// themselves: one brain at a time.
//
// DELETE names no version (§9.1): the runtime deletes the row holding
// whichever token it revoked, and reads it again when a new token was put
// in meanwhile. After three such races it answers 412 and keeps the agent
// (A.3.3): the dialog reads it again, shows it as it is now, and the owner
// deletes again if they still mean to.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { HostedAgent, RevokedToken } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'
import { RUNTIME_TOKEN_LABEL, credentialByPrefix, hostingErrorText, unrevoked, type UnrevokedToken } from './hosting'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  agent: HostedAgent
  credentials?: AgentCredential[] | null
}>()
const emit = defineEmits<{
  deleted: []
  /** The agent as it is now, read again after it changed meanwhile (412). */
  changed: [agent: HostedAgent]
  /** Its token may still work: the owner is offered to revoke it (§9.4). */
  unrevoked: [token: UnrevokedToken]
}>()
const { t } = useI18n()

const pending = ref(false)
const error = shallowRef<unknown>(null)
const revoke = ref(true)

/** The token is one this page made for the runtime: it is revoked, no question asked. */
const ownToken = computed(() => credentialByPrefix(props.credentials, props.agent.token.prefix)?.label === RUNTIME_TOKEN_LABEL)
const label = computed(() => credentialByPrefix(props.credentials, props.agent.token.prefix)?.label?.trim() || '')

watch(open, (v) => {
  if (!v) return
  revoke.value = true
  error.value = null
})

const errorText = computed(() => {
  if (!error.value) return ''
  if (isVersionMismatch(error.value)) return t('hosting.errors.changedMeanwhile')
  return hostingErrorText(error.value, t)
})
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

/** Reads the agent again after DELETE found it changed: kept, as it is now, or gone meanwhile. */
async function reread() {
  try {
    emit('changed', (await runtime.get(props.agent.id)).data)
  } catch (e) {
    if (!(isRuntimeError(e) && e.reason === 'agent_not_found')) return
    ElMessage({ type: 'info', message: hostingErrorText(e, t) })
    open.value = false
    emit('deleted')
  }
}

async function submit() {
  if (pending.value) return
  pending.value = true
  error.value = null
  // Read before deleting: after it, the runtime knows nothing of it.
  const token = props.agent.token
  const revokeToken = ownToken.value || revoke.value
  try {
    let left: RevokedToken
    try {
      left = (await runtime.remove(props.agent.id, revokeToken)).data.token
    } catch (e) {
      // Gone already (an earlier try went through, or another tab deleted
      // it): deleted, and whether its token was revoked cannot be told.
      if (!(isRuntimeError(e) && e.reason === 'agent_not_found')) throw e
      left = { ...token, revocation: revokeToken ? 'failed' : 'not_attempted', problem: null }
    }
    if (left.revocation === 'not_attempted') {
      ElNotification({ type: 'info', title: t('hosting.delete.done', { name: props.name }), message: t('hosting.delete.notAttempted'), duration: 10_000 })
    } else {
      ElMessage({ type: 'success', message: t('hosting.delete.done', { name: props.name }) })
    }
    open.value = false
    const u = unrevoked(left)
    if (u) emit('unrevoked', u)
    emit('deleted')
  } catch (e) {
    error.value = e
    if (isVersionMismatch(e)) await reread()
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('hosting.delete.title', { name })"
    width="520px"
    destroy-on-close
    :close-on-click-modal="!pending"
    class="delete-hosting"
  >
    <p class="delete-hosting__body">{{ t('hosting.delete.body') }}</p>
    <p v-if="agent.proposals_waiting > 0" class="delete-hosting__body delete-hosting__proposals">
      {{ t('hosting.delete.proposals', { n: agent.proposals_waiting }, agent.proposals_waiting) }}
    </p>
    <div v-if="!ownToken" class="delete-hosting__revoke">
      <el-checkbox v-model="revoke">{{ t('hosting.delete.alsoRevoke') }}</el-checkbox>
      <div class="app-form-hint">
        {{ label ? t('hosting.delete.alsoRevokeHint', { label }) : t('hosting.delete.alsoRevokeHintUnlabelled') }}
      </div>
    </div>
    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="delete-hosting__alert">
      <details v-if="errorDetail">
        <summary>{{ t('hosting.errors.details') }}</summary>
        <p>{{ errorDetail }}</p>
      </details>
    </el-alert>
    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="danger" class="delete-hosting__submit" :loading="pending" @click="submit">
        {{ t('hosting.delete.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.delete-hosting__body {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.delete-hosting__revoke {
  margin-bottom: 8px;
}
.delete-hosting__alert {
  margin-top: 12px;
}
.delete-hosting__alert summary {
  cursor: pointer;
}
</style>
