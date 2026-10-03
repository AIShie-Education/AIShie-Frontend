<script setup lang="ts">
// Deleting an agent from the school's runtime (DELETE /agents/{id}; the
// contract's §9.4). The runtime stops it, forgets its settings and key, and
// always revokes its token in Core (runtime-hosting-api.md): nobody can ask
// it on the site until it is hosted again. The answer says what became of
// the token; when the runtime could not revoke it, the owner is told that
// people may still be offered to ask it, and that suspending the agent stops
// that. Gone already (another tab deleted it), it is deleted all the same.
//
// DELETE names no version (§9.1). Should the runtime answer 412 all the
// same, the dialog reads the agent again, shows it as it is now, and the
// owner deletes again if they still mean to.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { HostedAgent } from '@/api/runtime-types'
import { hostingErrorText, revocationNotice } from './hosting'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  name: string
  agent: HostedAgent
}>()
const emit = defineEmits<{
  deleted: []
  /** The agent as it is now, read again after it changed meanwhile (412). */
  changed: [agent: HostedAgent]
}>()
const { t } = useI18n()

const pending = ref(false)
const error = shallowRef<unknown>(null)

watch(open, (v) => {
  if (v) error.value = null
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
  try {
    let notice: string | null = null
    try {
      notice = revocationNotice((await runtime.remove(props.agent.id)).data.revocation, 'delete', t)
    } catch (e) {
      // Gone already (an earlier try went through, or another tab deleted it): deleted.
      if (!(isRuntimeError(e) && e.reason === 'agent_not_found')) throw e
    }
    if (notice) {
      ElNotification({ type: 'warning', title: t('hosting.delete.done', { name: props.name }), message: notice, duration: 0 })
    } else {
      ElMessage({ type: 'success', message: t('hosting.delete.done', { name: props.name }) })
    }
    open.value = false
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
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.delete-hosting__alert {
  margin-top: 12px;
}
.delete-hosting__alert summary {
  cursor: pointer;
}
</style>
