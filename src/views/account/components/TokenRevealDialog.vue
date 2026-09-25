<script setup lang="ts">
// Shows a newly made token, once. Core keeps only its hash, and a replay of
// the call that made it comes back without it: then all that can be done is
// to say so and offer to revoke it.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ToolOut } from '@/api/types'
import TimeText from '@/components/TimeText.vue'
import { DIALOG_WIDTH, maskedToken } from './credentials'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ issued: ToolOut<'credential.issue_token'> | null }>()
// closed: the dialog has gone, and the parent can forget the token.
const emit = defineEmits<{ revoke: [credentialId: string]; closed: [] }>()
const { t } = useI18n()

const copied = ref(false)
watch(
  () => props.issued,
  () => (copied.value = false),
)

const token = computed(() => props.issued?.token || '')
// The header a program sends; a protocol string, not prose.
const header = computed(() => `Authorization: Bearer ${token.value}`)

async function copy(text: string, isToken: boolean) {
  try {
    await navigator.clipboard.writeText(text)
    if (isToken) copied.value = true
    ElMessage({ type: 'success', message: t('account.token.copied') })
  } catch {
    ElMessage({ type: 'warning', message: t('account.token.copyFailed') })
  }
}

function selectAll(ev: Event) {
  ;(ev.target as HTMLInputElement | null)?.select?.()
}

async function beforeClose(done: () => void) {
  if (token.value && !copied.value) {
    try {
      await ElMessageBox.confirm(t('account.token.closeUncopied'), t('account.token.closeUncopiedTitle'), {
        type: 'warning',
        confirmButtonText: t('account.token.closeAnyway'),
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
    :title="token ? t('account.token.title') : t('account.token.missingTitle')"
    :width="DIALOG_WIDTH"
    :close-on-click-modal="false"
    :before-close="beforeClose"
    destroy-on-close
    @closed="emit('closed')"
  >
    <template v-if="issued && token">
      <el-alert type="warning" :closable="false" show-icon :title="t('account.token.warning')" />
      <div class="reveal-token">
        <el-input
          :model-value="token"
          readonly
          class="reveal-token__input"
          :aria-label="t('account.credentials.token')"
          @focus="selectAll"
          @copy="copied = true"
        />
        <el-button type="primary" @click="copy(token, true)">
          <el-icon><CopyDocument /></el-icon>
          <span>{{ t('account.token.copy') }}</span>
        </el-button>
      </div>
      <p class="reveal-label">{{ t('account.token.usage') }}</p>
      <pre class="reveal-code" @copy="copied = true">{{ header }}</pre>
      <dl class="reveal-meta">
        <dt>{{ t('account.token.listedAs') }}</dt>
        <dd>
          <code>{{ maskedToken(issued.token_prefix) }}</code>
        </dd>
        <dt>{{ t('account.token.expires') }}</dt>
        <dd>
          <TimeText v-if="issued.expires_at" :value="issued.expires_at" />
          <span v-else>{{ t('account.token.never') }}</span>
        </dd>
      </dl>
    </template>
    <template v-else-if="issued">
      <el-alert type="error" :closable="false" show-icon :title="t('account.token.missing')" />
      <dl class="reveal-meta">
        <dt>{{ t('account.token.listedAs') }}</dt>
        <dd>
          <code>{{ maskedToken(issued.token_prefix) }}</code>
        </dd>
      </dl>
    </template>
    <template #footer>
      <el-button v-if="token" type="primary" @click="close">{{ t('account.token.done') }}</el-button>
      <template v-else>
        <el-button @click="close">{{ t('common.actions.close') }}</el-button>
        <el-button type="danger" @click="revoke">{{ t('account.token.revokeIt') }}</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.reveal-token {
  display: flex;
  gap: 8px;
  margin: 16px 0 12px;
}
.reveal-token__input {
  flex: 1;
  min-width: 0;
}
.reveal-token__input :deep(input) {
  font-family: var(--app-font-mono);
  font-size: 13px;
}
.reveal-label {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.reveal-code {
  margin: 0 0 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-family: var(--app-font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.reveal-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 12px 0 0;
  font-size: 13px;
}
.reveal-meta dt {
  color: var(--el-text-color-secondary);
}
.reveal-meta dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}
.reveal-meta code {
  font-family: var(--app-font-mono);
}
</style>
