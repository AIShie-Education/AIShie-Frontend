<script setup lang="ts">
// Which file's text version (文字版) the tab shows, where a version holds
// several: a button for each file, in order, numbered, with an icon by its
// type and its name, saying where its text version stands (done, waiting,
// being transcribed, failed); the one shown is pressed. A version of one
// file names it alone.
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { useI18n } from 'vue-i18n'
import type { DocumentFile } from '@/api/types'
import { FILE_ICON, fileKind } from '@/utils/files'
import { TEXT_STATUS_TAG, textShown, textStatus } from './textVersion'

const props = defineProps<{
  files: DocumentFile[]
  /** The file shown. */
  selected: DocumentFile | null
  /** The runtime's transcriber is on: a text waiting for it is shown as waiting. */
  transcriptionOn: boolean
}>()
const emit = defineEmits<{ pick: [file: DocumentFile] }>()
const { t } = useI18n()

const icon = (f: DocumentFile) => FILE_ICON[fileKind(f.content_type, f.filename)]
/** A file's text version as its tab would show it; null for none worth a word. */
function chip(f: DocumentFile) {
  const status = textStatus(f.text)
  if (!status || textShown(f.text, props.transcriptionOn) === 'none') return null
  return { type: TEXT_STATUS_TAG[status], label: t(`enums.textStatus.${status}`) }
}
</script>

<template>
  <div v-if="files.length > 1" class="text-files" role="group" :aria-label="t('materials.document.text.pickFile')">
    <button
      v-for="(f, i) in files"
      :key="f.id"
      type="button"
      class="text-file"
      :class="{ 'is-on': f === selected }"
      :aria-pressed="f === selected"
      :data-file="f.filename"
      @click="emit('pick', f)"
    >
      <span class="text-file__n" aria-hidden="true">{{ i + 1 }}</span>
      <el-icon aria-hidden="true"><component :is="icon(f)" /></el-icon>
      <span class="text-file__name">{{ f.filename }}</span>
      <AppTag v-if="chip(f)" :tone="toneOf(chip(f)!.type)" class="text-file__status">
        {{ chip(f)!.label }}
      </AppTag>
    </button>
  </div>
  <p v-else-if="selected" class="text-files__one">
    <el-icon aria-hidden="true"><component :is="icon(selected)" /></el-icon>
    <span>{{ selected.filename }}</span>
  </p>
</template>

<style scoped>
/* The files whose text version to read: one pressed at a time. */
.text-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 14px;
}
.text-file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-bg-color);
  color: var(--app-ink-2);
  font: inherit;
  font-size: var(--app-text-sm);
  cursor: pointer;
}
.text-file:hover {
  border-color: var(--app-indigo-line);
  background: var(--app-indigo-tint);
}
.text-file.is-on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}
.text-file__n {
  font-size: var(--app-text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--app-ink-3);
}
.text-file__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 240px;
}
.text-files__one {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
</style>
