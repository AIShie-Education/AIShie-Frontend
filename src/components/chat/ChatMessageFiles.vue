<script setup lang="ts">
// The files a message carries, in order: each a card with an icon by its
// type, its name, what it is and its size, which opens it in the file viewer
// (預覽, components/preview), stepping through the message's files, with a
// button on it that downloads it (a fresh short-lived URL,
// conversation.attachment, asked for on the click). A small
// image is shown as a thumbnail, fetched once the message is on screen and
// shown from an object URL (attachments.ts): the page's policy for images
// allows this origin, data: and blob: only, and a download URL may be an
// object store's. Until it has come, or where it cannot, the icon stands.
// An Office file whose PDF the server has made says so (a PDF tag): that PDF
// is what the viewer shows of it, and whoever may withdraw the message may
// send one that failed back to be converted again from there.
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageAttachment } from '@/api/types'
import { notifyError } from '@/composables/useErrors'
import { attachmentPreviewFiles, openPreview } from '@/components/preview/viewer'
import { formatBytes } from '@/utils/format'
import { renditionStage } from '@/utils/rendition'
import { downloadAttachment, FILE_ICON, fileKind, hasThumbnail, REFUSAL_SCOPE, thumbnailOf } from './attachments'
import { joinParts } from '@/utils/parts'

const props = defineProps<{
  courseId: string
  files: MessageAttachment[]
  /** The caller may withdraw the message (its author, staff deciding for its opener): a file's failed PDF may be sent back. */
  retryRenditions?: boolean
}>()
const { t } = useI18n()

const kindOf = (f: MessageAttachment) => fileKind(f.content_type, f.filename)
const meta = (f: MessageAttachment) => joinParts([t(`common.fileKind.${kindOf(f)}`), formatBytes(f.byte_size)])
/** Its PDF rendition is done: it is previewed as that PDF. */
const hasPdf = (f: MessageAttachment) => renditionStage(f.rendition) === 'done'

// --- Thumbnails, once on screen ------------------------------------------------------
const thumbs = reactive<Record<string, string>>({})
const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let gone = false
function loadThumbnails() {
  for (const f of props.files) {
    if (!hasThumbnail(f) || thumbs[f.id]) continue
    void thumbnailOf(props.courseId, f.id).then((url) => {
      if (url && !gone) thumbs[f.id] = url
    })
  }
}
onMounted(() => {
  if (!props.files.some(hasThumbnail)) return
  if (typeof IntersectionObserver === 'undefined' || !root.value) return loadThumbnails()
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer?.disconnect()
      observer = null
      loadThumbnails()
    },
    { rootMargin: '200px' },
  )
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  gone = true
  observer?.disconnect()
})
/** An object URL that no longer loads (given up to make room): the icon again. */
function thumbFailed(id: string) {
  delete thumbs[id]
}

// --- Previewing, downloading -----------------------------------------------------------
function preview(f: MessageAttachment) {
  openPreview({
    files: attachmentPreviewFiles(props.courseId, props.files, { retry: props.retryRenditions }),
    index: props.files.indexOf(f),
    courseId: props.courseId,
  })
}

const busy = ref<string | null>(null)
async function download(f: MessageAttachment) {
  if (busy.value) return
  busy.value = f.id
  try {
    await downloadAttachment(props.courseId, f.id)
  } catch (e) {
    notifyError(e, f.filename, { reasons: REFUSAL_SCOPE })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <ul ref="root" class="msg-files" :aria-label="t('chat.attach.list')">
    <li
      v-for="f in files"
      :key="f.id"
      class="msg-file"
      :class="{ 'has-thumb': !!thumbs[f.id] }"
      :data-file="f.filename"
    >
      <button
        type="button"
        class="msg-file__open"
        :aria-label="
          t('common.aside', {
            text: t('preview.open', { name: f.filename }),
            aside: joinParts([meta(f), hasPdf(f) && 'PDF']),
          })
        "
        :title="t('common.pair', { label: t('preview.openTip'), value: f.filename })"
        @click="preview(f)"
      >
        <img
          v-if="thumbs[f.id]"
          class="msg-file__thumb"
          :src="thumbs[f.id]"
          alt=""
          draggable="false"
          @error="thumbFailed(f.id)"
        />
        <span class="msg-file__row">
          <span v-if="!thumbs[f.id]" class="msg-file__icon" :class="`is-${kindOf(f)}`" aria-hidden="true">
            <el-icon><component :is="FILE_ICON[kindOf(f)]" /></el-icon>
          </span>
          <span class="msg-file__text">
            <span class="msg-file__name">{{ f.filename }}</span>
            <span class="msg-file__meta">
              <span>{{ meta(f) }}</span>
              <span v-if="hasPdf(f)" class="msg-file__pdf" :title="t('preview.rendition.listedTip')">PDF</span>
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        class="msg-file__get"
        :aria-label="t('chat.attach.download', { name: f.filename })"
        :title="t('common.pair', { label: t('chat.attach.downloadTip'), value: f.filename })"
        :aria-busy="busy === f.id ? 'true' : undefined"
        @click="download(f)"
      >
        <el-icon aria-hidden="true"><Loading v-if="busy === f.id" class="is-loading" /><Download v-else /></el-icon>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.msg-files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}
.msg-file {
  position: relative;
  max-width: 100%;
  min-width: 0;
}
.msg-file__open {
  display: flex;
  flex-direction: column;
  width: 240px;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--app-line);
  border-radius: 10px;
  background: var(--el-bg-color);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.msg-file__open:hover {
  border-color: var(--app-indigo-line);
  background: var(--app-indigo-tint);
}
.msg-file__open:focus-visible {
  outline-offset: 1px;
}
.msg-file__thumb {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: cover;
  background: var(--app-ground-2);
  border-bottom: 1px solid var(--app-line-soft);
}
.msg-file__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  /* Room on the right for the download over it. */
  padding: 8px 44px 8px 10px;
}
.msg-file__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--app-ground-2);
  color: var(--app-ink-2);
  font-size: var(--app-text-xl);
}
.msg-file__icon.is-pdf {
  color: var(--el-color-danger);
}
.msg-file__icon.is-word,
.msg-file__icon.is-text {
  color: var(--el-color-primary);
}
.msg-file__icon.is-sheet {
  color: var(--el-color-success);
}
.msg-file__icon.is-slides {
  color: var(--el-color-warning);
}
.msg-file__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}
.msg-file__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-text-sm);
  font-weight: 500;
  color: var(--app-ink);
}
.msg-file__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
/* Its PDF is made: the viewer shows that. */
.msg-file__pdf {
  flex-shrink: 0;
  padding: 0 4px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 4px;
  color: var(--el-color-danger);
  font-size: var(--app-text-mark);
  font-weight: var(--app-weight-strong);
  line-height: 15px;
  letter-spacing: 0.02em;
}
/* The download, on the card at its bottom right. */
.msg-file__get {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--app-ink-3);
  font-size: var(--app-text-lg);
  cursor: pointer;
}
.msg-file__get:hover {
  background: var(--app-indigo-tint);
  color: var(--el-color-primary);
}
</style>
