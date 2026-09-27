<script setup lang="ts">
// Text a person copies into a terminal or a configuration file (an endpoint,
// environment variables), shown as it is, with a button that copies it.
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const props = defineProps<{ text: string; label?: string; inline?: boolean }>()
const emit = defineEmits<{ copied: [] }>()
const { t } = useI18n()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    emit('copied')
    ElMessage({ type: 'success', message: t('agents.copy.done') })
  } catch {
    ElMessage({ type: 'warning', message: t('agents.copy.failed') })
  }
}
</script>

<template>
  <div class="copy-block" :class="{ 'is-inline': inline }">
    <div v-if="label" class="copy-block__label">{{ label }}</div>
    <div class="copy-block__body">
      <pre class="copy-block__text" @copy="emit('copied')">{{ text }}</pre>
      <el-button size="small" class="copy-block__button" :aria-label="t('common.actions.copy')" @click="copy">
        <el-icon><CopyDocument /></el-icon>
        <span>{{ t('common.actions.copy') }}</span>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.copy-block__label {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.copy-block__body {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.copy-block__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding-top: 3px;
  font-family: var(--app-font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.copy-block__button {
  flex-shrink: 0;
}
.copy-block.is-inline .copy-block__body {
  align-items: center;
}
.copy-block.is-inline .copy-block__text {
  padding-top: 0;
}
</style>
