<script setup lang="ts">
// A document version's files, in order: each with an icon by its type, its
// name, what it is and its size. A click opens it in the file viewer (預覽,
// components/preview), which steps through the version's files; the button
// beside it downloads it under its name from a fresh short-lived URL
// (document.file, asked for on the click, since one handed out with the
// version may have expired). Where the version's text versions are shown
// (textStatus), each file says where its text version stands, and may open
// it (the text event). An Office file whose PDF the server has made says so
// (a PDF tag): that PDF is what the viewer shows of it.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DocumentFile } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { documentPreviewFiles, openPreview } from '@/components/preview/viewer'
import { downloadDocumentFile, FILE_REFUSAL_SCOPE } from '@/utils/documentFiles'
import { FILE_ICON, fileKind } from '@/utils/files'
import { formatBytes } from '@/utils/format'
import { renditionStage } from '@/utils/rendition'
import { TEXT_STATUS_TAG, textShown, textStatus } from '@/views/course/materials/components/textVersion'

const props = defineProps<{
  courseId: string
  documentId: string
  /** The version the files are of: their text versions are read at it. */
  versionId?: string | null
  files: DocumentFile[]
  /** Say where each file's text version stands, as the text version's tab would. */
  textStatus?: boolean
  /** The runtime's transcriber is on: a text waiting for it is shown as waiting. */
  transcriptionOn?: boolean
  /** Offer each file's text version (the text event). */
  openText?: boolean
  /** The document's title, which the viewer says the files are of. */
  docTitle?: string
  /** When the version was made, for "Download as PDF" from the viewer. */
  date?: string | null
  /** The caller may write the document: a file's PDF rendition that failed may be sent back from the viewer. */
  retryRenditions?: boolean
}>()
const emit = defineEmits<{ text: [file: DocumentFile] }>()
const { t } = useI18n()

const kindOf = (f: DocumentFile) => fileKind(f.content_type, f.filename)
const meta = (f: DocumentFile) => `${t(`common.fileKind.${kindOf(f)}`)} · ${formatBytes(f.byte_size)}`
/** "sha256:44c38a…" shown as "sha256 44c38a1b2c3d", on hover. */
function checksum(f: DocumentFile): string | undefined {
  const c = f.checksum
  if (!c) return undefined
  const i = c.indexOf(':')
  return i > 0 ? `${c.slice(0, i)} ${c.slice(i + 1, i + 13)}` : c.slice(0, 12)
}

/** A file's text version as a tab would show it; null for none worth a word. */
function textChip(f: DocumentFile) {
  if (!props.textStatus || !f.text) return null
  const shown = textShown(f.text, !!props.transcriptionOn)
  const status = textStatus(f.text)
  if (shown === 'none' || !status) return null
  return { type: TEXT_STATUS_TAG[status], label: t(`enums.textStatus.${status}`) }
}

/** Its PDF rendition is done: it is previewed as that PDF. */
const hasPdf = (f: DocumentFile) => renditionStage(f.rendition) === 'done'

/** Opens the viewer on a file, among the version's others. */
function preview(f: DocumentFile) {
  openPreview({
    files: documentPreviewFiles(props.courseId, props.documentId, props.versionId, props.files, props.date, {
      retry: props.retryRenditions,
    }),
    index: props.files.indexOf(f),
    title: props.docTitle,
    courseId: props.courseId,
  })
}

const busy = ref<string | null>(null)
async function download(f: DocumentFile) {
  const key = f.id
  if (busy.value) return
  busy.value = key
  try {
    await downloadDocumentFile(props.courseId, props.documentId, f)
  } catch (e) {
    notifyError(e, f.filename, { reasons: FILE_REFUSAL_SCOPE })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <ol class="version-files" :aria-label="t('common.files.list')">
    <li v-for="f in files" :key="f.id" class="version-file" :data-file="f.filename">
      <button
        type="button"
        class="version-file__open"
        :aria-label="`${t('preview.open', { name: f.filename })} (${meta(f)}${hasPdf(f) ? ' · PDF' : ''})`"
        :title="`${t('preview.openTip')}: ${f.filename}${checksum(f) ? ` · ${checksum(f)}` : ''}`"
        @click="preview(f)"
      >
        <span class="version-file__icon" :class="`is-${kindOf(f)}`" aria-hidden="true">
          <el-icon><component :is="FILE_ICON[kindOf(f)]" /></el-icon>
        </span>
        <span class="version-file__text">
          <span class="version-file__name">{{ f.filename }}</span>
          <span class="version-file__meta">
            <span>{{ meta(f) }}</span>
            <span v-if="hasPdf(f)" class="version-file__pdf" :title="t('preview.rendition.listedTip')">PDF</span>
          </span>
        </span>
        <el-icon class="version-file__view" aria-hidden="true"><View /></el-icon>
      </button>
      <button
        type="button"
        class="version-file__get"
        :aria-label="t('common.files.download', { name: f.filename })"
        :title="`${t('common.files.downloadTip')}: ${f.filename}`"
        :aria-busy="busy === f.id ? 'true' : undefined"
        @click="download(f)"
      >
        <el-icon aria-hidden="true"
          ><Loading v-if="busy === f.id" class="is-loading" /><Download v-else
        /></el-icon>
      </button>
      <span v-if="textChip(f) || (openText && f.text)" class="version-file__side">
        <el-tag v-if="textChip(f)" :type="textChip(f)!.type" size="small" disable-transitions class="version-file__status">
          {{ textChip(f)!.label }}
        </el-tag>
        <el-button
          v-if="openText && f.text"
          link
          type="primary"
          size="small"
          class="version-file__text-link"
          :aria-label="t('common.files.textOf', { name: f.filename })"
          @click="emit('text', f)"
        >
          {{ t('common.files.text') }}
        </el-button>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.version-files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.version-file {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  min-width: 0;
  padding: 2px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
}
.version-file__open {
  flex: 1 1 220px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: calc(var(--app-radius-item) - 2px);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.version-file__open:hover {
  background: var(--app-indigo-tint);
}
.version-file__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--app-ink-2);
  font-size: 17px;
}
.version-file__icon.is-pdf {
  color: var(--el-color-danger);
}
.version-file__icon.is-word,
.version-file__icon.is-text {
  color: var(--el-color-primary);
}
.version-file__icon.is-sheet {
  color: var(--el-color-success);
}
.version-file__icon.is-slides {
  color: var(--el-color-warning);
}
.version-file__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}
.version-file__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: var(--app-ink);
}
.version-file__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
/* Its PDF is made: the viewer shows that. */
.version-file__pdf {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 4px;
  color: var(--el-color-danger);
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  letter-spacing: 0.02em;
}
.version-file__view {
  flex-shrink: 0;
  color: var(--app-ink-3);
}
.version-file__open:hover .version-file__view {
  color: var(--el-color-primary);
}
/* The download, beside the file: last on the line, after where its text version stands. */
.version-file__get {
  order: 3;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: 2px;
  border: 0;
  border-radius: calc(var(--app-radius-item) - 2px);
  background: none;
  color: var(--app-ink-3);
  font-size: 16px;
  cursor: pointer;
}
.version-file__get:hover {
  background: var(--app-indigo-tint);
  color: var(--el-color-primary);
}
.version-file__side {
  order: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 4px 50px;
}
@media (min-width: 641px) {
  .version-file__side {
    padding: 0;
  }
}
/* A phone: the download stays beside the file, and where its text version stands goes under it. */
@media (max-width: 640px) {
  .version-file__open {
    flex-basis: 0;
  }
  .version-file__get {
    order: 2;
  }
  .version-file__side {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
