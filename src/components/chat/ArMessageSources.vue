<script setup lang="ts">
// AR stores minimal source locations. Resolve each through Core's live
// document.get as this reader may read it now, then use the established source
// presentation (title, file/page, current/other version, or restricted).
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { ChatSource } from '@/api/runtimeChat'
import type { MessageSource } from '@/api/types'
import ChatMessageSources from './ChatMessageSources.vue'

const props = defineProps<{ courseId: string; sources: ChatSource[] }>()
const { t } = useI18n()
const resolved = ref<MessageSource[] | null>(null)
let generation = 0

async function resolveOne(source: ChatSource): Promise<MessageSource> {
  try {
    const doc = await read('document.get', {
      course_id: props.courseId,
      document_id: source.document_id,
      ...(source.version_id ? { version_id: source.version_id } : {}),
    })
    const currentVersion = doc.published_version_id ?? null
    const otherVersion = !!source.version_id && !!currentVersion && source.version_id !== currentVersion
    if (otherVersion) {
      // The reader may open the material, but not the version the answer read.
      // Deliberately omit that version's file, page and part.
      return { document_id: source.document_id, title: doc.title, other_version: true }
    }
    const version = doc.version
    const versionID = version?.id ?? source.version_id ?? currentVersion ?? null
    const file = version?.files?.find((f) => f.id === source.file_id)
    return {
      document_id: source.document_id,
      version_id: versionID,
      file_id: source.file_id ?? null,
      filename: file?.filename ?? null,
      kind: doc.kind ?? null,
      title: doc.title ?? null,
      page: source.page ?? null,
      slide: source.slide ?? null,
      part: source.part ?? null,
      published: true,
      seq: version?.seq ?? null,
    }
  } catch {
    if (source.version_id) {
      try {
        // The version may no longer be readable while the document is. Core's
        // current read supplies the title and the safe "another version" link.
        const current = await read('document.get', {
          course_id: props.courseId,
          document_id: source.document_id,
        })
        return { document_id: source.document_id, title: current.title, other_version: true }
      } catch {
        // Fall through to the fully restricted answer.
      }
    }
    // No title, id or link is exposed when the reader may not open it now.
    return { restricted: true }
  }
}

async function resolveAll() {
  const mine = ++generation
  resolved.value = null
  const next = await Promise.all(props.sources.map(resolveOne))
  if (mine === generation) resolved.value = next
}

onMounted(() => void resolveAll())
</script>

<template>
  <ChatMessageSources v-if="resolved" :course-id="courseId" :sources="resolved" />
  <p v-else class="chat-sources ar-sources__loading" aria-busy="true">{{ t('common.labels.loading') }}</p>
</template>

<style scoped>
.ar-sources__loading {
  margin: 6px 2px 0;
  padding: 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-3);
}
</style>
