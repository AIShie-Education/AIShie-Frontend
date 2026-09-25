<script setup lang="ts">
// A token just issued, shown the one time it can be: Core keeps only its
// hash. With how to connect with it over MCP.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { MCP_ENDPOINT } from '@/api/http'
import type { ToolOut } from '@/api/types'
import IdText from '@/components/IdText.vue'
import TimeText from '@/components/TimeText.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ issued: ToolOut<'actor.issue_token'> | null; actorKind: string }>()
const emit = defineEmits<{ closed: [] }>()
const { t } = useI18n()

const copied = ref<'token' | 'endpoint' | 'header' | null>(null)
const tokenCopied = ref(false)
watch(open, (v) => {
  if (v) {
    copied.value = null
    tokenCopied.value = false
  }
})

const token = computed(() => props.issued?.token || '')
const endpoint = MCP_ENDPOINT
const header = computed(() => `Authorization: Bearer ${token.value || '…'}`)

async function copy(what: 'token' | 'endpoint' | 'header', text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    if (what === 'token' || what === 'header') tokenCopied.value = true
    setTimeout(() => {
      if (copied.value === what) copied.value = null
    }, 1500)
  } catch {
    /* clipboard refused: the text is still selectable */
  }
}

function beforeClose(done: () => void) {
  if (!token.value || tokenCopied.value) return done()
  ElMessageBox.confirm(t('admin.token.uncopied'), t('admin.token.uncopiedTitle'), {
    type: 'warning',
    confirmButtonText: t('admin.token.closeAnyway'),
    cancelButtonText: t('common.actions.cancel'),
  })
    .then(() => done())
    .catch(() => undefined)
}

function finish() {
  beforeClose(() => (open.value = false))
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="token ? t('admin.token.revealTitle') : t('admin.token.title')"
    width="560px"
    :before-close="beforeClose"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="emit('closed')"
  >
    <template v-if="issued">
      <el-alert
        v-if="token"
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.token.once')"
        class="reveal__alert"
      />
      <el-alert v-else type="info" :closable="false" show-icon :title="t('admin.token.replayed')" class="reveal__alert" />

      <div v-if="token" class="reveal__token">
        <label class="reveal__label" for="reveal-token">{{ t('admin.token.token') }}</label>
        <div class="reveal__row">
          <el-input id="reveal-token" :model-value="token" readonly class="reveal__input" @focus="($event.target as HTMLInputElement).select()" />
          <el-button type="primary" @click="copy('token', token)">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ copied === 'token' ? t('common.actions.copied') : t('common.actions.copy') }}</span>
          </el-button>
        </div>
      </div>

      <dl class="reveal__facts">
        <div>
          <dt>{{ t('admin.token.prefix') }}</dt>
          <dd><code class="app-mono">{{ issued.token_prefix }}</code></dd>
        </div>
        <div>
          <dt>{{ t('admin.token.credential') }}</dt>
          <dd><IdText :id="issued.credential_id" /></dd>
        </div>
        <div>
          <dt>{{ t('admin.token.expires') }}</dt>
          <dd>
            <TimeText v-if="issued.expires_at" :value="issued.expires_at" />
            <span v-else>{{ t('admin.token.noExpiry') }}</span>
          </dd>
        </div>
      </dl>

      <h3 class="reveal__subhead">{{ t('admin.token.mcpTitle') }}</h3>
      <div class="reveal__snippet">
        <div class="reveal__snippet-label">{{ t('admin.token.mcpEndpoint') }}</div>
        <div class="reveal__code">
          <code>{{ endpoint }}</code>
          <el-button text size="small" @click="copy('endpoint', endpoint)">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ copied === 'endpoint' ? t('common.actions.copied') : t('common.actions.copy') }}</span>
          </el-button>
        </div>
        <div class="reveal__snippet-label">{{ t('admin.token.mcpHeader') }}</div>
        <div class="reveal__code">
          <code>{{ header }}</code>
          <el-button v-if="token" text size="small" @click="copy('header', header)">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ copied === 'header' ? t('common.actions.copied') : t('common.actions.copy') }}</span>
          </el-button>
        </div>
      </div>
      <p class="app-form-hint">{{ t('admin.token.mcpNotes') }}</p>
      <p v-if="actorKind === 'human'" class="app-form-hint">{{ t('admin.token.humanHint') }}</p>
    </template>
    <template #footer>
      <el-button type="primary" @click="finish">{{ t('admin.token.doneCopying') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reveal__alert {
  margin-bottom: 16px;
}
.reveal__label {
  display: block;
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}
.reveal__row {
  display: flex;
  gap: 8px;
}
.reveal__input {
  flex: 1;
  min-width: 0;
}
.reveal__input :deep(input) {
  font-family: var(--app-font-mono);
  font-size: 13px;
}
.reveal__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 16px 0 0;
  font-size: 13px;
}
.reveal__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.reveal__facts dd {
  margin: 2px 0 0;
}
.reveal__subhead {
  margin: 20px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.reveal__snippet {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 10px 12px;
}
.reveal__snippet-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.reveal__snippet-label + .reveal__code {
  margin-bottom: 6px;
}
.reveal__code {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.reveal__code code {
  font-family: var(--app-font-mono);
  font-size: 12px;
  word-break: break-all;
  min-width: 0;
}
</style>
