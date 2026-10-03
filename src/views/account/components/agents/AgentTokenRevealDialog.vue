<script setup lang="ts">
// Shows the new token of an agent with MCP access once, ready to connect
// with: the token, and Core's MCP endpoint, the header that carries it and
// Claude Desktop's configuration with it, for one's own tool. Core keeps
// only its hash, and a replay of the call that made it comes back without
// it: then all there is to do is say so and offer to revoke it. The same
// pattern as the account's own TokenRevealDialog.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { AgentToken } from '@/api/types'
import TimeText from '@/components/TimeText.vue'
import { maskedToken } from '../credentials'
import ConnectToolSteps from './ConnectToolSteps.vue'
import CopyBlock from './CopyBlock.vue'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ issued: AgentToken | null; name: string }>()
// closed: the dialog has gone, and the parent can forget the token.
const emit = defineEmits<{ revoke: [credentialId: string]; closed: [] }>()
const { t } = useI18n()

const copied = ref(false)
watch(
  () => props.issued,
  () => (copied.value = false),
)

const token = computed(() => props.issued?.token || '')

async function beforeClose(done: () => void) {
  if (token.value && !copied.value) {
    try {
      await ElMessageBox.confirm(t('agents.reveal.closeUncopied'), t('agents.reveal.closeUncopiedTitle'), {
        type: 'warning',
        confirmButtonText: t('agents.reveal.closeAnyway'),
        cancelButtonText: t('common.actions.cancel'),
      })
    } catch {
      return
    }
  }
  done()
}

function close() {
  void beforeClose(() => (open.value = false))
}

function revoke() {
  if (!props.issued) return
  open.value = false
  emit('revoke', props.issued.credential_id)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="token ? t('agents.reveal.title', { name }) : t('agents.reveal.missingTitle')"
    width="600px"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    destroy-on-close
    @closed="emit('closed')"
  >
    <template v-if="issued && token">
      <el-alert type="warning" :closable="false" show-icon :title="t('agents.reveal.warning')" />
      <CopyBlock :text="token" :label="t('agents.reveal.token')" inline class="reveal__block" @copied="copied = true" />
      <h3 class="reveal__h">{{ t('agents.reveal.connect') }}</h3>
      <ConnectToolSteps :token="token" @copied="copied = true" />
      <dl class="reveal__meta">
        <dt>{{ t('agents.reveal.listedAs') }}</dt>
        <dd>
          <code>{{ maskedToken(issued.token_prefix) }}</code>
        </dd>
        <dt>{{ t('agents.tokens.expires') }}</dt>
        <dd>
          <TimeText v-if="issued.expires_at" :value="issued.expires_at" />
          <span v-else>{{ t('agents.tokens.noExpiry') }}</span>
        </dd>
      </dl>
    </template>
    <template v-else-if="issued">
      <el-alert type="error" :closable="false" show-icon :title="t('agents.reveal.missing')" />
      <dl class="reveal__meta">
        <dt>{{ t('agents.reveal.listedAs') }}</dt>
        <dd>
          <code>{{ maskedToken(issued.token_prefix) }}</code>
        </dd>
      </dl>
    </template>
    <template #footer>
      <el-button v-if="token" type="primary" @click="close">{{ t('agents.reveal.done') }}</el-button>
      <template v-else>
        <el-button @click="close">{{ t('common.actions.close') }}</el-button>
        <el-button type="danger" @click="revoke">{{ t('agents.reveal.revokeIt') }}</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.reveal__block {
  margin-top: 16px;
}
.reveal__h {
  margin: 18px 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.reveal__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 16px 0 0;
  font-size: var(--app-text-sm);
}
.reveal__meta dt {
  color: var(--el-text-color-secondary);
}
.reveal__meta dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}
.reveal__meta code {
  font-family: var(--app-font-mono);
}
</style>
