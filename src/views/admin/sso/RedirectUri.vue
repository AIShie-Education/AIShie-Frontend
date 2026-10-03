<script setup lang="ts">
// The redirect URI to register at every identity provider: Core's PUBLIC_URL
// and /v1/auth/sso/callback, the same for all of them, as sso.list gives it.
// Shown before anything else is filled in, with a button that copies it.
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { copyText } from '@/utils/clipboard'

const props = defineProps<{ uri: string; compact?: boolean }>()
const { t } = useI18n()

async function copy() {
  const ok = await copyText(props.uri)
  ElMessage({ type: ok ? 'success' : 'warning', message: t(ok ? 'ssoAdmin.redirect.copied' : 'ssoAdmin.redirect.copyFailed') })
}
</script>

<template>
  <div class="redirect-uri" :class="{ 'is-compact': compact }">
    <div class="redirect-uri__label">{{ t('ssoAdmin.redirect.label') }}</div>
    <div class="redirect-uri__body">
      <code class="redirect-uri__value">{{ uri }}</code>
      <el-button size="small" class="redirect-uri__copy" :aria-label="t('ssoAdmin.redirect.copy')" @click="copy">
        <el-icon aria-hidden="true"><CopyDocument /></el-icon>
        <span>{{ t('common.actions.copy') }}</span>
      </el-button>
    </div>
    <p class="redirect-uri__hint">{{ t('ssoAdmin.redirect.hint') }}</p>
  </div>
</template>

<style scoped>
.redirect-uri__label {
  margin: 0 0 6px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
}
.redirect-uri__body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-control);
}
.redirect-uri__value {
  flex: 1;
  min-width: 0;
  font-family: var(--app-font-mono);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  word-break: break-all;
  user-select: all;
}
.redirect-uri__copy {
  flex-shrink: 0;
}
.redirect-uri__hint {
  margin: 6px 0 0;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.redirect-uri.is-compact .redirect-uri__hint {
  display: none;
}
</style>
