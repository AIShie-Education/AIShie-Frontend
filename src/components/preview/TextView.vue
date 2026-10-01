<script setup lang="ts">
// A text file in the viewer: Markdown rendered as the app renders Markdown
// (MarkdownView: safe, no raw HTML, images from this origin alone); code in
// its language, highlighted as fenced code is (plain past a size, which is
// quicker); plain text as it is, its lines kept; and CSV as a table, up to a
// number of rows, saying so where more follow.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownView from '@/components/MarkdownView.vue'
import { codeAsMarkdown, CSV_MAX_ROWS, HIGHLIGHT_MAX_BYTES, parseCsv, type PreviewKind } from '@/utils/preview'

const props = defineProps<{
  text: string
  kind: Extract<PreviewKind, 'markdown' | 'code' | 'text' | 'csv'>
  /** A code file's language (a highlight.js name), '' for none. */
  language?: string
  /** The file's name, which names the table. */
  name: string
  /** Its delimiter, where the name says (a .tsv's tab). */
  delimiter?: string
}>()
const { t, n } = useI18n()

const highlighted = computed(() => props.kind === 'code' && props.text.length <= HIGHLIGHT_MAX_BYTES)
const codeSource = computed(() => (highlighted.value ? codeAsMarkdown(props.text, props.language ?? '') : ''))
const table = computed(() =>
  props.kind === 'csv' ? parseCsv(props.text, props.delimiter ? { delimiter: props.delimiter } : {}) : null,
)
const head = computed(() => table.value?.rows[0] ?? [])
const body = computed(() => table.value?.rows.slice(1) ?? [])
const columns = computed(() => Array.from({ length: table.value?.columns ?? 0 }, (_, i) => i))
</script>

<template>
  <div class="text-view" :class="`is-${kind}`">
    <div v-if="kind === 'markdown'" class="text-view__paper">
      <MarkdownView :source="text" code-tools :empty="t('preview.text.empty')" />
    </div>
    <div v-else-if="kind === 'code' && highlighted" class="text-view__code">
      <MarkdownView :source="codeSource" code-tools />
    </div>
    <pre v-else-if="kind === 'code'" class="text-view__pre is-code">{{ text }}</pre>
    <template v-else-if="kind === 'csv' && table">
      <p v-if="table.truncatedRows || table.truncatedColumns" class="text-view__cut" role="note">
        <template v-if="table.truncatedRows">{{ t('preview.csv.rowsCut', { n: n(CSV_MAX_ROWS) }) }}</template>
        <template v-if="table.truncatedColumns"> {{ t('preview.csv.columnsCut', { n: n(table.columns) }) }}</template>
      </p>
      <div class="text-view__table-wrap" tabindex="0" data-arrows :aria-label="t('preview.csv.table', { name })">
        <table class="text-view__table">
          <thead v-if="head.length">
            <tr>
              <th class="text-view__rownum" scope="col" aria-hidden="true"></th>
              <th v-for="c in columns" :key="c" scope="col">{{ head[c] ?? '' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in body" :key="i">
              <td class="text-view__rownum" aria-hidden="true">{{ i + 2 }}</td>
              <td v-for="c in columns" :key="c">{{ row[c] ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!table.rows.length" class="text-view__empty">{{ t('preview.text.empty') }}</p>
    </template>
    <pre v-else class="text-view__pre">{{ text }}</pre>
  </div>
</template>

<style scoped>
.text-view {
  min-height: 100%;
  padding: 16px;
  background: var(--app-ground-2);
}
.text-view__paper,
.text-view__pre,
.text-view__code {
  max-width: 860px;
  margin: 0 auto;
  background: var(--el-bg-color);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item, 8px);
}
.text-view__paper {
  padding: 28px 32px;
}
.text-view__pre {
  padding: 20px 24px;
  font-family: var(--app-font-sans);
  font-size: 14px;
  line-height: var(--app-line-height-prose);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--app-ink);
}
.text-view__pre.is-code {
  font-family: var(--app-font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  overflow-wrap: normal;
}
.text-view__code {
  max-width: 1100px;
  padding: 0;
  overflow: hidden;
}
.text-view__code :deep(.markdown-body pre),
.text-view__code :deep(.md-code) {
  margin: 0;
  border: 0;
  border-radius: 0;
}
.text-view.is-csv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.text-view__cut {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.text-view__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--el-bg-color);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item, 8px);
  outline: none;
}
.text-view__table-wrap:focus-visible {
  box-shadow: 0 0 0 2px var(--app-focus);
}
.text-view__table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.text-view__table th,
.text-view__table td {
  padding: 5px 10px;
  border-right: 1px solid var(--app-line-soft);
  border-bottom: 1px solid var(--app-line-soft);
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
  max-width: 28em;
  overflow-wrap: anywhere;
}
.text-view__table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--el-fill-color-light);
  font-weight: 600;
  color: var(--app-ink);
}
.text-view__rownum {
  min-width: 3em;
  color: var(--app-ink-3);
  text-align: right !important;
  background: var(--el-fill-color-lighter);
  user-select: none;
}
.text-view__empty {
  margin: 0;
  color: var(--el-text-color-secondary);
}
@media (max-width: 640px) {
  .text-view {
    padding: 8px;
  }
  .text-view__paper {
    padding: 18px 16px;
  }
  .text-view__pre {
    padding: 14px 12px;
  }
}
</style>
