<script setup lang="ts">
// One course material an answer relied on, as Core shows it to the reader
// now (ChatMessageSources lists them). Whole, it opens the version the
// answer read: its file in the file viewer, among the version's files, at
// the page or slide the answer named (document.get with its version_id, read
// on the click), or, with no file named, the document's page at that
// version. In a version the reader may not open (other_version), it leads to
// the document as it is now, and says the answer read another version, and,
// beside the link, that it opens the material as it is now: the version read
// may be older than the one the reader may open, or newer (a draft, or one
// published before an earlier one was published again), so it is never
// called earlier. One the reader may not open at all (restricted) is said to
// be so, with no title and no link: Core says nothing else of it.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { read } from '@/api/http'
import type { MessageSource } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { documentPreviewFiles, openPreview } from '@/components/preview/viewer'
import { versionFilesOf } from '@/utils/documentFiles'
import { joinParts } from '@/utils/parts'

const props = defineProps<{
  /** The conversation's course: the document is read there. */
  courseId: string
  source: MessageSource
}>()
const { t } = useI18n()
const router = useRouter()

const s = computed(() => props.source)
/** Whole, in a version the reader may not open (other), or not to be opened. */
const shownAs = computed<'whole' | 'other' | 'restricted'>(() => {
  if (s.value.restricted || !s.value.document_id) return 'restricted'
  return s.value.other_version || !s.value.version_id ? 'other' : 'whole'
})
const title = computed(() => t('chat.sources.quoted', { title: s.value.title ?? '' }))
/** Where in it the answer read: the file, its page or slide, and the version where it is not the published one. */
const where = computed(() => {
  if (shownAs.value === 'other') return t('chat.sources.other')
  const v = s.value
  return joinParts([
    v.file_id ? v.filename : null,
    v.page ? t('chat.sources.page', { n: v.page }) : v.slide ? t('chat.sources.slide', { n: v.slide }) : null,
    v.published === false && v.seq ? t('chat.sources.version', { seq: v.seq }) : null,
  ])
})
const label = computed(() =>
  where.value ? t('chat.sources.entry', { title: title.value, where: where.value }) : title.value,
)
/** The document's page: at the version read, or, for another one, as it is now. */
const to = computed<RouteLocationRaw>(() => ({
  name: 'course-document',
  params: { courseId: props.courseId, documentId: s.value.document_id ?? '' },
  query: shownAs.value === 'whole' ? { version: s.value.version_id ?? undefined } : {},
}))

const opening = ref(false)
/** Reads the version, and opens its file in the viewer at the page or slide named; the version's page where it has gone. */
async function openFile() {
  const v = s.value
  if (opening.value || !v.document_id || !v.version_id) return
  opening.value = true
  try {
    const doc = await read('document.get', {
      course_id: props.courseId,
      document_id: v.document_id,
      version_id: v.version_id,
    })
    const files = versionFilesOf(doc.version)
    const index = files.findIndex((f) => f.id === v.file_id)
    if (index < 0) {
      await router.push(to.value)
      return
    }
    openPreview({
      files: documentPreviewFiles(props.courseId, v.document_id, v.version_id, files, doc.version?.created_at),
      index,
      title: doc.title,
      courseId: props.courseId,
      page: v.page ?? v.slide ?? null,
    })
  } catch (e) {
    notifyError(e, title.value)
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <span class="chat-source" :class="`is-${shownAs}`">
    <button
      v-if="shownAs === 'whole' && source.file_id"
      type="button"
      class="chat-source__link"
      :title="t('chat.sources.openFile')"
      :aria-busy="opening ? 'true' : undefined"
      @click="openFile"
    >
      <span>{{ label }}</span>
      <el-icon v-if="opening" class="chat-source__busy is-loading" aria-hidden="true"><Loading /></el-icon>
    </button>
    <router-link
      v-else-if="shownAs === 'whole'"
      :to="to"
      class="chat-source__link"
      :title="t('chat.sources.openVersion')"
      >{{ label }}</router-link
    >
    <i18n-t v-else-if="shownAs === 'other'" keypath="chat.sources.otherLine" scope="global">
      <template #link>
        <router-link :to="to" class="chat-source__link" :title="t('chat.sources.otherTip')">{{ label }}</router-link>
      </template>
      <template #note>
        <span class="chat-source__note">{{ t('chat.sources.otherNote') }}</span>
      </template>
    </i18n-t>
    <template v-else>
      <el-icon class="chat-source__lock" aria-hidden="true"><Lock /></el-icon>
      <span>{{ t('chat.sources.restricted') }}</span>
    </template>
  </span>
</template>

<style scoped>
/* Inline, so that a long title wraps after "Based on:" as words do. */
.chat-source__link {
  display: inline;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-ink-2);
  font: inherit;
  text-align: left;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-decoration-color: var(--app-line-strong);
  text-underline-offset: 2px;
  cursor: pointer;
}
.chat-source__link:hover {
  color: var(--el-color-primary);
  text-decoration-color: currentColor;
}
.chat-source__note {
  color: var(--app-ink-3);
}
.chat-source__busy {
  margin-left: 4px;
  font-size: 12px;
  vertical-align: -1px;
}
.chat-source__lock {
  margin-right: 4px;
  font-size: 12px;
  vertical-align: -1px;
}
</style>
