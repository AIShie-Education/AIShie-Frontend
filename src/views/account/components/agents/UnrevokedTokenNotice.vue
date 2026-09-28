<script setup lang="ts">
// A token the runtime could not revoke in Core (the contract's §9.4). When
// the runtime replaces an agent's token (previous_token) or deletes its
// hosting (token), it revokes the token it had; when that failed, whatever
// the reason (the agent suspended in Core, Core out of reach, or Core
// refusing the runtime's request, core_refused, after two replacements at
// once), or when it cannot be told, the token may still work. The owner is
// told so, and offered to revoke it here as themselves: the live API token
// with that prefix in the agent's list (agent.list_credentials), revoked
// with agent.revoke_credential. Never the token the runtime holds now.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { UnrevokedToken } from './hosting'
import { ownerRevokeByPrefix } from './hostingFlow'

const props = defineProps<{
  actorId: string
  token: UnrevokedToken
  /** The prefix of the token the runtime holds now, if it hosts the agent: never revoked from here. */
  held?: string | null
}>()
const emit = defineEmits<{
  /** Revoked, found not to work any more, or put aside: the notice is done. */
  done: []
  /** Core's list of the agent's tokens should be read again. */
  credsChanged: []
}>()
const { t } = useI18n()

const busy = ref(false)
const failed = ref(false)

const why = computed(() => t(`hosting.unrevoked.why.${props.token.problem ?? 'unknown'}`))

async function revoke() {
  if (busy.value) return
  const token = props.token.hint
  if (props.held && props.held === props.token.prefix) {
    ElMessage({ type: 'info', message: t('hosting.unrevoked.held', { token }) })
    emit('done')
    return
  }
  busy.value = true
  failed.value = false
  try {
    const r = await ownerRevokeByPrefix(props.actorId, props.token.prefix)
    if (r === 'failed') {
      failed.value = true
      return
    }
    ElMessage({ type: 'success', message: t(r === 'revoked' ? 'hosting.unrevoked.revoked' : 'hosting.unrevoked.gone', { token }) })
    emit('done')
  } finally {
    busy.value = false
    emit('credsChanged')
  }
}
</script>

<template>
  <el-alert type="warning" :closable="false" show-icon :title="t('hosting.unrevoked.title')" class="unrevoked">
    <p class="unrevoked__body">{{ t('hosting.unrevoked.body', { token: token.hint, why }) }}</p>
    <p v-if="failed" class="unrevoked__failed">{{ t('hosting.unrevoked.failed') }}</p>
    <div class="unrevoked__actions">
      <el-button size="small" type="warning" class="unrevoked__revoke" :loading="busy" @click="revoke">
        {{ t('hosting.unrevoked.revoke') }}
      </el-button>
      <el-button size="small" link class="unrevoked__later" :disabled="busy" @click="emit('done')">
        {{ t('hosting.unrevoked.later') }}
      </el-button>
    </div>
  </el-alert>
</template>

<style scoped>
.unrevoked__body {
  margin: 0 0 8px;
  line-height: 1.5;
}
.unrevoked__failed {
  margin: 0 0 8px;
  color: var(--el-color-danger);
}
.unrevoked__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
