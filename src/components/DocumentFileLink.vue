<script setup lang="ts">
// A file kept in a document. Download URLs are short-lived, so a fresh one is
// asked for (document.get) when the link is clicked, not when it is shown.
import { ref } from 'vue'
import { blobUrl, read } from '@/api/http'
import { notifyError } from '@/composables/useErrors'
import { downloadName } from '@/utils/format'

const props = defineProps<{
  courseId: string
  documentId: string
  versionId?: string | null
  /** The document's title: the link's text, unless the default slot gives another. */
  title: string
  /**
   * The name the file is saved under; defaults to the document's title as
   * Core has it (a type's usual extension is added where it has none).
   */
  fileName?: string
}>()
const busy = ref(false)

async function open() {
  busy.value = true
  try {
    const doc = await read('document.get', {
      course_id: props.courseId,
      document_id: props.documentId,
      version_id: props.versionId ?? undefined,
    })
    const url = doc.version?.download_url
    const name = props.fileName || doc.title || props.title
    if (url) {
      const a = document.createElement('a')
      a.href = blobUrl(url)
      if (new URL(a.href, window.location.href).origin === window.location.origin) {
        // Core's own store (here through this origin) serves the file as an
        // attachment with no name, so the browser would name it after the
        // signed token. Same-origin, the download attribute names it, and no
        // tab is left open.
        a.download = downloadName(name, doc.version?.content_type)
      } else {
        // An object store's presigned URL, which carries its own disposition;
        // the download attribute is ignored across origins.
        a.rel = 'noopener'
        a.target = '_blank'
      }
      a.click()
    } else if (doc.version?.body_md) {
      const blob = new Blob([doc.version.body_md], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = downloadName(name, 'text/markdown')
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }
  } catch (e) {
    notifyError(e, props.title)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-button link type="primary" :loading="busy" @click="open">
    <el-icon v-if="!busy"><Paperclip /></el-icon>
    <span><slot>{{ title }}</slot></span>
  </el-button>
</template>
