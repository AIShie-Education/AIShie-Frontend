<script setup lang="ts">
// Deleting an agent from the school's runtime (DELETE /agents/{id}; the
// contract's §9.4). The runtime stops it, forgets its settings and key, and
// revokes its token in Core (D7). When the runtime could not revoke the
// token, the owner does, from this page (agent.revoke_credential); when that
// fails too, they are told to revoke it in the Tokens list. A token the page
// did not make (a pasted one) may be kept, for whatever else uses it.
// Deleting is also how an owner goes from hosted to running the agent
// themselves: one brain at a time.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, Revocation } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'
import { RUNTIME_TOKEN_LABEL, credentialByPrefix, hostingErrorText } from './hosting'
import { ownerRevokeByPrefix } from './hostingFlow'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  actorId: string
  name: string
  agent: HostedAgent
  credentials?: AgentCredential[] | null
}>()
const emit = defineEmits<{ deleted: [] }>()
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

const errorText = computed(() => (error.value ? hostingErrorText(error.value, t) : ''))
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

/** The owner's fallback, told as §9.4 says. */
async function fallback(prefix: string) {
  const r = await ownerRevokeByPrefix(props.actorId, prefix)
  if (r === 'failed') {
    ElNotification({ type: 'warning', title: t('hosting.delete.done', { name: props.name }), message: t('hosting.delete.fallbackFailed'), duration: 0 })
  } else {
    ElMessage({ type: 'success', message: t('hosting.delete.done', { name: props.name }) })
  }
}

async function submit() {
  if (pending.value) return
  pending.value = true
  error.value = null
  // Read before deleting: after it, the runtime knows nothing of it.
  const prefix = props.agent.token.prefix
  const revokeToken = ownToken.value || revoke.value
  try {
    let revocation: Revocation
    try {
      revocation = (await runtime.remove(props.agent.id, revokeToken)).data.token.revocation
    } catch (e) {
      // Gone already (an earlier try went through): deleted, and the token revoked as the owner.
      if (!(isRuntimeError(e) && e.reason === 'agent_not_found')) throw e
      revocation = revokeToken ? 'failed' : 'not_attempted'
    }
    switch (revocation) {
      case 'failed':
        await fallback(prefix)
        break
      case 'not_attempted':
        ElNotification({ type: 'info', title: t('hosting.delete.done', { name: props.name }), message: t('hosting.delete.notAttempted'), duration: 10_000 })
        break
      default:
        ElMessage({ type: 'success', message: t('hosting.delete.done', { name: props.name }) })
    }
    open.value = false
    emit('deleted')
  } catch (e) {
    error.value = e
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
