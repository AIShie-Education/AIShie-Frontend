<script setup lang="ts">
// AR sources are minimal locations, not Core's already-resolved SourceView.
// Show only a safe material/position label first. A click then asks Core for
// the document (and a text part where named), so no unreadable id, title or
// target is invented in the chat.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { ChatSource } from '@/api/runtimeChat'
import { notifyError } from '@/composables/useErrors'
import { documentPreviewFiles, openPreview } from '@/components/preview/viewer'
import { versionFilesOf } from '@/utils/documentFiles'
import { joinParts } from '@/utils/parts'

const props = defineProps<{ courseId: string; sources: ChatSource[] }>()
const { t } = useI18n()
const router = useRouter()
const opening = ref<number | null>(null)

function label(s: ChatSource): string {
  return joinParts([
    t('chat.sources.material'),
    s.page ? t('chat.sources.page', { n: s.page }) : s.slide ? t('chat.sources.slide', { n: s.slide }) : null,
    s.part ? t('chat.sources.part', { n: s.part }) : null,
  ])
}

async function open(s: ChatSource, index: number) {
  if (opening.value !== null || !s.document_id) return
  opening.value = index
  try {
    const doc = await read('document.get', {
      course_id: props.courseId,
      document_id: s.document_id,
      ...(s.version_id ? { version_id: s.version_id } : {}),
    })
    const versionId = s.version_id ?? doc.version?.id ?? undefined
    const route = {
      name: 'course-document',
      params: { courseId: props.courseId, documentId: s.document_id },
      query: versionId ? { version: versionId } : {},
    }
    if (!s.file_id) {
      await router.push(route)
      return
    }
    const files = versionFilesOf(doc.version)
    const fileIndex = files.findIndex((f) => f.id === s.file_id)
    if (fileIndex < 0 || !versionId) {
      await router.push(route)
      return
    }
    if (s.part) {
      // Resolve the named part as the reader may read it before sending them to its text tab.
      await read('document.text', {
        course_id: props.courseId,
        document_id: s.document_id,
        version_id: versionId,
        file_id: s.file_id,
        part: s.part,
      })
      await router.push({ ...route, query: { ...route.query, tab: 'text', file: s.file_id } })
      return
    }
    openPreview({
      files: documentPreviewFiles(props.courseId, s.document_id, versionId, files, doc.version?.created_at),
      index: fileIndex,
      title: doc.title,
      courseId: props.courseId,
      page: s.page ?? s.slide ?? null,
    })
  } catch (e) {
    notifyError(e, t('chat.sources.material'))
  } finally {
    opening.value = null
  }
}
</script>

<template>
  <div class="ar-sources" :aria-label="t('chat.sources.label')">
    <button
      v-for="(s, i) in sources"
      :key="`${s.document_id}:${s.file_id ?? ''}:${s.part ?? s.page ?? s.slide ?? ''}`"
      type="button"
      class="ar-sources__link"
      :aria-busy="opening === i ? 'true' : undefined"
      @click="open(s, i)"
    >
      <span>{{ label(s) }}</span>
      <el-icon v-if="opening === i" class="is-loading" aria-hidden="true"><Loading /></el-icon>
    </button>
  </div>
</template>

<style scoped>
.ar-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
  padding: 0 2px;
  font-size: var(--app-text-sm);
}
.ar-sources__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-ink-3);
  font: inherit;
  text-decoration: underline;
  text-decoration-color: var(--app-line-strong);
  text-underline-offset: 2px;
  cursor: pointer;
}
.ar-sources__link:hover {
  color: var(--el-color-primary);
}
</style>
