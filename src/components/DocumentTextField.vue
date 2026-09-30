<script setup lang="ts">
// The text that goes with a document's file: the second part of a version,
// under its drop zone. Folded away until it is wanted, behind one line
// ("Add a text note (optional)", or what the text is once there is one), it
// opens on a Markdown editor. The caller may put actions of its own on that
// line (#actions: leaving the text out, putting the last version's back).
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/utils/format'
import MarkdownEditor from './MarkdownEditor.vue'

const model = defineModel<string>({ default: '' })
/** Whether the editor is shown. */
const open = defineModel<boolean>('open', { default: false })
const props = withDefaults(
  defineProps<{
    /** What the line says while there is text ("Text (120 characters)" otherwise). */
    summary?: string
    /** What the line says while there is none ("Add a text note (optional)" otherwise). */
    emptyLabel?: string
    rows?: number
    disabled?: boolean
  }>(),
  { rows: 8 },
)
const { t } = useI18n()
const id = useId()

const hasText = computed(() => model.value.trim() !== '')
const label = computed(() =>
  hasText.value
    ? (props.summary ?? t('common.docText.chars', { chars: formatNumber(model.value.length, 0) }))
    : (props.emptyLabel ?? t('common.docText.add')),
)
</script>

<template>
  <div class="doc-text" :class="{ 'is-open': open }">
    <div class="doc-text__line">
      <button
        type="button"
        class="doc-text__toggle"
        :aria-expanded="open"
        :aria-controls="`${id}-editor`"
        :disabled="disabled"
        @click="open = !open"
      >
        <el-icon class="doc-text__chevron" aria-hidden="true"><ArrowRight /></el-icon>
        <el-icon aria-hidden="true"><Document /></el-icon>
        <span>{{ label }}</span>
      </button>
      <slot name="actions" />
    </div>
    <div v-show="open" :id="`${id}-editor`" class="doc-text__editor">
      <MarkdownEditor v-model="model" :rows="rows" :disabled="disabled" />
    </div>
  </div>
</template>

<style scoped>
.doc-text {
  width: 100%;
}
.doc-text__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
  line-height: 1.5;
}
.doc-text__line :deep(.el-button + .el-button) {
  margin-left: 0;
}
.doc-text__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.doc-text__toggle:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.doc-text__toggle:disabled {
  color: var(--app-ink-disabled);
  cursor: not-allowed;
  text-decoration: none;
}
.doc-text__chevron {
  transition: transform 0.15s;
}
.is-open .doc-text__chevron {
  transform: rotate(90deg);
}
.doc-text__editor {
  margin-top: 8px;
}
</style>
