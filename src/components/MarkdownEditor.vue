<script setup lang="ts">
// Markdown with a preview tab. v-model is the source.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownView from './MarkdownView.vue'

const model = defineModel<string>({ default: '' })
withDefaults(defineProps<{ rows?: number; placeholder?: string; disabled?: boolean }>(), { rows: 12 })
const { t } = useI18n()
const tab = ref<'write' | 'preview'>('write')
</script>

<template>
  <div class="md-editor">
    <el-tabs v-model="tab" class="md-editor__tabs">
      <el-tab-pane :label="t('common.actions.edit')" name="write">
        <el-input
          v-model="model"
          type="textarea"
          :rows="rows"
          :placeholder="placeholder ?? 'Markdown'"
          :disabled="disabled"
          class="md-editor__input"
        />
      </el-tab-pane>
      <el-tab-pane :label="t('common.actions.preview')" name="preview">
        <div class="md-editor__preview" :style="{ minHeight: `${rows * 1.5}em` }">
          <MarkdownView :source="model" :empty="t('common.labels.empty')" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.md-editor {
  width: 100%;
}
.md-editor__tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}
.md-editor__input :deep(textarea) {
  font-family: var(--app-font-mono);
  font-size: 13px;
}
.md-editor__preview {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 8px 12px;
  overflow: auto;
}
</style>
