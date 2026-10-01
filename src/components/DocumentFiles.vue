<script setup lang="ts">
// The files of a document known here only by its id and title: a submitted
// file, a feedback file, each of which may hold several files now (AIShie-Core
// #49). Its version is read (document.get, once for the page's life: such a
// document has exactly one version, which never changes) and its files are
// listed, each to download under its name (VersionFileList). A document of
// one file whose name is its title is that file alone; otherwise its title
// heads its files. One with no file downloads its text, as Markdown.
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read, type ApiError } from '@/api/http'
import type { DocumentFull } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { errorMessage } from '@/composables/useErrors'
import { versionFilesOf } from '@/utils/documentFiles'
import { downloadName } from '@/utils/format'
import VersionFileList from './VersionFileList.vue'

const props = defineProps<{
  courseId: string
  documentId: string
  versionId?: string | null
  title: string
}>()
const { t } = useI18n()

const doc = shallowRef<DocumentFull | null>(null)
const error = shallowRef<ApiError | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    doc.value = await readDocument(props.courseId, props.documentId, props.versionId)
  } catch (e) {
    error.value = toApiError(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [props.documentId, props.versionId], load)

const version = computed(() => doc.value?.version ?? null)
const files = computed(() => versionFilesOf(version.value, doc.value?.title ?? props.title))
const stem = (name: string) => name.replace(/\.[^.\s]{1,16}$/, '').trim().toLowerCase()
/** One file named as the document is: the file says it all. */
const alone = computed(
  () => files.value.length === 1 && stem(files.value[0]!.filename) === stem(doc.value?.title ?? props.title),
)

function downloadText() {
  const body = version.value?.body_md
  if (!body) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }))
  a.download = downloadName(doc.value?.title || props.title, 'text/markdown')
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
</script>

<script lang="ts">
// What was read of each document, for the page's life (a few, the latest):
// a submitted or feedback file has one version, which never changes, and the
// URLs it came with are not used (a download asks for a fresh one).
const KEPT = 100
const kept = new Map<string, Promise<DocumentFull>>()

function readDocument(courseId: string, documentId: string, versionId?: string | null): Promise<DocumentFull> {
  const key = `${courseId}/${documentId}/${versionId ?? ''}`
  let p = kept.get(key)
  if (!p) {
    p = read('document.get', { course_id: courseId, document_id: documentId, version_id: versionId ?? undefined })
    p.catch(() => kept.delete(key))
    kept.set(key, p)
    while (kept.size > KEPT) kept.delete(kept.keys().next().value!)
  }
  return p
}

/** Forgets what was read (tests). */
export function forgetDocumentFiles() {
  kept.clear()
}
</script>

<template>
  <div class="doc-files" :data-document="documentId">
    <div v-if="!alone" class="doc-files__title">
      <el-icon aria-hidden="true"><Folder v-if="files.length > 1" /><Paperclip v-else /></el-icon>
      <span>{{ doc?.title || title }}</span>
      <span v-if="files.length > 1" class="doc-files__count">{{ t('common.files.count', { n: files.length }, files.length) }}</span>
      <el-icon v-if="loading" class="is-loading" :aria-label="t('common.files.loading')"><Loading /></el-icon>
    </div>
    <VersionFileList
      v-if="files.length"
      :course-id="courseId"
      :document-id="documentId"
      :version-id="version?.id"
      :files="files"
      :doc-title="doc?.title || title"
      :date="version?.created_at"
    />
    <el-button v-else-if="version?.body_md" link type="primary" class="doc-files__text" @click="downloadText">
      <el-icon><Download /></el-icon>
      <span>{{ t('common.files.downloadText') }}</span>
    </el-button>
    <p v-if="error" class="doc-files__error">
      {{ errorMessage(error) }}
      <el-button link type="primary" size="small" @click="load">{{ t('common.actions.retry') }}</el-button>
    </p>
  </div>
</template>

<style scoped>
.doc-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.doc-files__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.doc-files__count {
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.doc-files__text {
  align-self: flex-start;
}
.doc-files__error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
