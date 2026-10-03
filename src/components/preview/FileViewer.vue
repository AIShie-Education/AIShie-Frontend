<script setup lang="ts">
// The file viewer (預覽): a large dialog over the page, the whole screen on a
// phone (upright or on its side), showing one file of those it was opened on
// (viewer.ts), with the previous and the next, its download (under its
// name), "Download as PDF" where it is text, and its close button. It works
// from the keyboard: Tab stays in it, Escape or back closes it (focus goes
// back to what opened it), and the
// left and right arrow keys go to the previous and the next file, except
// where they move something of their own (a field, a player, a page or an
// image wider than the window).
//
// What a file is decides how it is shown (utils/preview.ts): a PDF in the
// page (PdfView, with pdf.js, loaded only then); an image as an image; text,
// Markdown, code and CSV as such (TextView); audio and video in the
// browser's players; an Office or OpenDocument file as the PDF the server
// converts it into once (its rendition, utils/rendition.ts), in the same PDF
// view, with "Download PDF" beside its own download; anything else, and
// anything larger than is fetched to be shown, as a note with its download.
//
// A rendition is read afresh as the file is shown (document.file,
// conversation.attachment), with a fresh URL to the PDF once it is done.
// While it waits (queued, or claimed while the runtime converts it), the
// viewer says it is being converted, and asks again, 2 seconds after, then
// twice as long each time, up to 30 seconds, for as long as it shows that
// file. One that failed or was skipped says why, in words, with the file's
// own download, and "Try again" where the caller may send it back
// (document.rendition_retry, conversation.rendition_retry). Where Core keeps
// no rendition (a Core before them), an Office file is shown as its text
// version (文字版) where Core has one done, since no browser shows one
// itself (one on its way is said to be, while the runtime's transcriber is
// on).
//
// Its bytes are fetched from a fresh short-lived URL (the file's own: a
// document's file by document.file, a message's by conversation.attachment),
// with no credentials, and shown from an object URL, revoked as soon as
// another file is shown or the viewer closes (ObjectUrls). A PDF's bytes go
// to pdf.js's worker instead.
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError, fetchBlob, isAbort } from '@/api/http'
import type { TextStatus, TextVersion } from '@/api/types'
import MarkdownView from '@/components/MarkdownView.vue'
import PrintButton from '@/components/PrintButton.vue'
import { toApiError } from '@/composables/useAsync'
import { errorMessage, notifyError } from '@/composables/useErrors'
import { announce } from '@/composables/useWrite'
import { useBackCloses } from '@/composables/useBackCloses'
import { useMediaQuery, usePhoneScreen } from '@/composables/useMediaQuery'
import { useRuntime, type UseRuntime } from '@/composables/useRuntime'
import { courseLine, dateLine, type PrintRequest } from '@/composables/usePrintLayout'
import { FILE_REFUSAL_SCOPE } from '@/utils/documentFiles'
import { FILE_ICON, fileKind } from '@/utils/files'
import { formatBytes } from '@/utils/format'
import {
  codeLanguageOf,
  decodeText,
  extensionOf,
  fetchesBytes,
  legacyEncodingFor,
  looksBinary,
  PREVIEW_MAX_BYTES,
  previewKind,
  previewType,
  TEXT_KINDS,
  tooLargeToPreview,
  type PreviewKind,
} from '@/utils/preview'
import {
  pdfNameOf,
  RENDITION_REFUSAL_SCOPE,
  renditionPollDelay,
  renditionReason,
  renditionStage,
  RETRY_READS_AGAIN,
  savePdf,
  type Rendition,
  type RenditionReason,
} from '@/utils/rendition'
import { isNoText, textShown, textStatus } from '@/views/course/materials/components/textVersion'
import ImageView from './ImageView.vue'
import TextView from './TextView.vue'
import { ObjectUrls } from './objectUrls'
import { closePreview, previewState, showPreviewAt, type PreviewFile } from './viewer'
import { joinParts } from '@/utils/parts'

// pdf.js and all it brings come with this, and only once a PDF is opened.
const PdfView = defineAsyncComponent(() => import('./PdfView.vue'))

const { t, locale } = useI18n()
const state = previewState()
// Back closes it, on a phone as on a desktop: it is laid over the page, which it never outlives.
useBackCloses(() => state.open, closePreview)
const phone = usePhoneScreen()
/** A phone on its side: the whole screen too, its height being too little to leave any of. */
const short = useMediaQuery('(max-height: 480px)')
// Whether anything transcribes: a text waiting for a transcriber that is off is said to be none.
// Asked of the runtime only once an Office file is shown (useRuntime asks it on first use), so that
// a page where no such file is opened never asks whether there is a runtime.
const runtime = shallowRef<UseRuntime | null>(null)
const transcriptionOn = computed(() => !!runtime.value?.info.value?.features.transcription)

const file = computed(() => state.files[state.index] ?? null)
const kind = computed<PreviewKind>(() =>
  file.value ? previewKind(file.value.contentType, file.value.filename) : 'none',
)
const icon = computed(() => FILE_ICON[fileKind(file.value?.contentType, file.value?.filename ?? '')])
const iconKind = computed(() => fileKind(file.value?.contentType, file.value?.filename ?? ''))
/** Its PDF rendition: as read as it was shown, else as listed with it; null where there is none. */
const rendition = shallowRef<Rendition | null>(null)
const shownRendition = computed(() => rendition.value ?? file.value?.rendition ?? null)
/** Its PDF is there, to download beside it ("Download PDF"). */
const pdfReady = computed(() => renditionStage(shownRendition.value) === 'done' && !!file.value?.readRendition)
const pdfName = computed(() => pdfNameOf(file.value?.filename ?? ''))
const meta = computed(() => {
  const f = file.value
  if (!f) return ''
  const pages = shownRendition.value?.page_count
  return joinParts([
    t(`common.fileKind.${iconKind.value}`),
    formatBytes(f.byteSize),
    pdfReady.value && pages ? t('preview.rendition.pages', { n: pages }, pages) : null,
  ])
})
const many = computed(() => state.files.length > 1)

/** What is shown of the file. */
type View =
  | { as: 'loading' }
  | { as: 'failed'; error: ApiError }
  | { as: 'tooLarge'; max: number }
  | { as: 'none' }
  | { as: 'notText' }
  | { as: 'cannotShow' }
  | { as: 'password' }
  | { as: 'pdf'; data: Uint8Array }
  | { as: 'image'; url: string }
  | { as: 'audio' | 'video'; url: string; type: string }
  | { as: 'text'; kind: 'markdown' | 'code' | 'text' | 'csv'; text: string; language: string; delimiter?: string }
  | { as: 'textVersion'; body: string; text: TextVersion }
  | { as: 'office'; status: TextStatus | null }
  /** Its PDF rendition is waiting to be converted, or being converted. */
  | { as: 'converting' }
  /** It has none: it failed, or was skipped, and why. */
  | { as: 'notConverted'; state: string; reason: RenditionReason | 'other' }
const view = shallowRef<View>({ as: 'loading' })
/** Bumped for each file shown: what was asked for another is dropped as it comes. */
const generation = ref(0)
const urls = new ObjectUrls()
let aborter: AbortController | null = null
/** The next time a waiting rendition is asked, and how many times it has been. */
let poll: ReturnType<typeof setTimeout> | null = null
let polls = 0

function stopPolling() {
  if (poll) clearTimeout(poll)
  poll = null
}

/** Lets go of what was shown: its fetch stopped, its object URLs revoked, nothing asked again. */
function release() {
  aborter?.abort()
  aborter = null
  stopPolling()
  polls = 0
  generation.value++
  urls.revokeAll()
  rendition.value = null
  view.value = { as: 'loading' }
}

async function load() {
  release()
  const mine = generation.value
  const f = file.value
  if (!f) return
  const k = kind.value
  const ctrl = (aborter = new AbortController())
  const current = () => mine === generation.value
  try {
    // A file Core converts: its PDF, or where that stands.
    if (f.rendition && f.readRendition) {
      const got = await renditionView(f, ctrl.signal)
      if (!current()) return
      if (got) {
        showRendition(got, mine)
        return
      }
    }
    if (k === 'office') {
      runtime.value ??= useRuntime()
      const shown = await officeView(f.readText, f.text ?? null, ctrl.signal)
      if (current()) view.value = shown
      return
    }
    if (!fetchesBytes(k)) {
      view.value = { as: 'none' }
      return
    }
    if (tooLargeToPreview(k, f.byteSize)) {
      view.value = { as: 'tooLarge', max: PREVIEW_MAX_BYTES[k] }
      return
    }
    const url = await f.url()
    if (!current()) return
    const blob = await fetchBlob(url, { signal: ctrl.signal })
    if (!current()) return
    if (blob.size > PREVIEW_MAX_BYTES[k]) {
      view.value = { as: 'tooLarge', max: PREVIEW_MAX_BYTES[k] }
      return
    }
    if (k === 'pdf') {
      const data = new Uint8Array(await blob.arrayBuffer())
      if (current()) view.value = { as: 'pdf', data }
      return
    }
    if (k === 'image' || k === 'audio' || k === 'video') {
      // Typed as what it is shown as: an SVG declared as anything else would not be drawn.
      const type = previewType(f.contentType, f.filename)
      const shown = urls.make(new Blob([blob], { type }))
      view.value = k === 'image' ? { as: 'image', url: shown } : { as: k, url: shown, type }
      return
    }
    if (TEXT_KINDS.has(k)) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (!current()) return
      if (looksBinary(bytes)) {
        view.value = { as: 'notText' }
        return
      }
      const { text } = decodeText(bytes, legacyEncodingFor(String(locale.value)))
      view.value = {
        as: 'text',
        kind: k as 'markdown' | 'code' | 'text' | 'csv',
        text,
        language: codeLanguageOf(f.contentType, f.filename),
        delimiter: extensionOf(f.filename) === 'tsv' ? '\t' : undefined,
      }
      return
    }
    view.value = { as: 'none' }
  } catch (e) {
    if (!current() || isAbort(e)) return
    view.value = { as: 'failed', error: toApiError(e) }
  }
}

/** An Office file: its text version where it is done, read afresh; otherwise where it stands. */
async function officeView(
  readText: ((signal?: AbortSignal) => Promise<{ text: TextVersion; body: string }>) | undefined,
  listed: TextVersion | null,
  signal: AbortSignal,
): Promise<View> {
  if (!readText) return { as: 'office', status: null }
  try {
    const whole = await readText(signal)
    if (textStatus(whole.text) === 'done' && whole.body.trim())
      return { as: 'textVersion', body: whole.body, text: whole.text }
    return { as: 'office', status: textStatus(whole.text) }
  } catch (e) {
    if (isAbort(e)) throw e
    return { as: 'office', status: isNoText(e) ? null : textStatus(listed) }
  }
}

// --- A file's PDF rendition --------------------------------------------------------------------

/** Where a file's rendition stands, read afresh: its PDF once it is done, fetched from the fresh URL. */
async function renditionView(
  f: PreviewFile,
  signal: AbortSignal,
): Promise<{ view: View; rendition: Rendition } | null> {
  const r = await f.readRendition!(signal)
  if (!r) return null
  const shown = (view: View) => ({ view, rendition: r })
  const stage = renditionStage(r)
  if (stage === 'waiting') return shown({ as: 'converting' })
  if (stage === 'none') return shown({ as: 'notConverted', state: r.state, reason: renditionReason(r) })
  if (!r.download_url) {
    const error = new ApiError({ status: 404, code: 'not_found', message: 'no URL for the PDF' })
    return shown({ as: 'failed', error })
  }
  const tooLarge: View = { as: 'tooLarge', max: PREVIEW_MAX_BYTES.pdf }
  if (tooLargeToPreview('pdf', r.byte_size)) return shown(tooLarge)
  const blob = await fetchBlob(r.download_url, { signal })
  if (blob.size > PREVIEW_MAX_BYTES.pdf) return shown(tooLarge)
  return shown({ as: 'pdf', data: new Uint8Array(await blob.arrayBuffer()) })
}

/** Shows where a rendition stands, and, while it waits, asks again later. */
function showRendition(got: { view: View; rendition: Rendition }, mine: number) {
  rendition.value = got.rendition
  view.value = got.view
  if (got.view.as === 'converting') askAgainLater(mine)
  else stopPolling()
}

/** Asks again where a waiting rendition stands, after a while: longer each time, up to RENDITION_POLL_MAX_MS. */
function askAgainLater(mine: number) {
  stopPolling()
  poll = setTimeout(() => void askAgain(mine), renditionPollDelay(polls++))
}

async function askAgain(mine: number) {
  poll = null
  const f = file.value
  const signal = aborter?.signal
  if (mine !== generation.value || !state.open || !f?.readRendition || !signal) return
  try {
    const got = await renditionView(f, signal)
    if (mine !== generation.value) return
    // Gone meanwhile: shown as a file Core keeps no PDF of.
    if (got) showRendition(got, mine)
    else void load()
  } catch (e) {
    if (mine !== generation.value || isAbort(e)) return
    const err = toApiError(e)
    // Nothing answered, or not now: it is asked again, as it waits.
    if (err.isNetwork || err.status >= 500 || err.code === 'rate_limited') askAgainLater(mine)
    else view.value = { as: 'failed', error: err }
  }
}

/** Sends a rendition that failed, or was skipped, back to be converted again, and shows it waiting. */
const retrying = ref(false)
async function retryRendition() {
  const f = file.value
  if (!f?.retryRendition || retrying.value) return
  const mine = generation.value
  retrying.value = true
  try {
    const out = await f.retryRendition()
    if (out.status === 'proposed') {
      // Waiting for someone to confirm it: nothing is converted until then.
      announce(out)
      return
    }
    if (mine !== generation.value) return
    if (out.result.changed) ElMessage({ type: 'success', message: t('preview.rendition.queuedAgain') })
    if (renditionStage({ state: out.result.state }) !== 'waiting') {
      void load()
      return
    }
    polls = 0
    showRendition({ view: { as: 'converting' }, rendition: { state: out.result.state } }, mine)
  } catch (e) {
    // Done meanwhile, or none: read where it stands now.
    if (e instanceof ApiError && RETRY_READS_AGAIN.has(String(e.details?.reason ?? ''))) {
      if (mine === generation.value) void load()
      return
    }
    notifyError(e, t('preview.rendition.retryFailed'), { reasons: RENDITION_REFUSAL_SCOPE })
  } finally {
    retrying.value = false
  }
}

watch(
  () => [state.open, state.opened, state.index, state.files] as const,
  ([open]) => {
    if (open) void load()
    else release()
  },
  { immediate: true },
)
onBeforeUnmount(release)

/** What is shown failed to show (a damaged file, a format this browser does not play). */
function cannotShow() {
  urls.revokeAll()
  view.value = { as: 'cannotShow' }
}
function onPdfFailed(reason: 'password' | 'invalid') {
  view.value = reason === 'password' ? { as: 'password' } : { as: 'cannotShow' }
}

// --- What the note says, where the file is not shown -------------------------------------------

const note = computed<{
  title: string
  text: string
  retry?: boolean
  /** Waiting for its PDF: a spinner in place of its icon, said as it changes. */
  waiting?: boolean
  /** "Try again": its rendition sent back to be converted. */
  retryRendition?: boolean
} | null>(() => {
  const v = view.value
  switch (v.as) {
    case 'converting':
      return { title: t('preview.rendition.converting'), text: t('preview.rendition.convertingText'), waiting: true }
    case 'notConverted':
      return {
        title: t('preview.rendition.none'),
        text: `${t(`preview.rendition.reason.${v.reason}`)} ${t('preview.rendition.downloadOriginal')}`,
        retryRendition: !!file.value?.retryRendition,
      }
    case 'failed':
      return { title: t('preview.failed'), text: errorMessage(v.error, { reasons: FILE_REFUSAL_SCOPE }), retry: true }
    case 'tooLarge':
      return { title: t('preview.tooLarge.title'), text: t('preview.tooLarge.text', { max: formatBytes(v.max) }) }
    case 'none':
      return { title: t('preview.none.title'), text: t('preview.none.text') }
    case 'notText':
      return { title: t('preview.notText.title'), text: t('preview.notText.text') }
    case 'cannotShow':
      return {
        title: t('preview.cannotShow.title'),
        text: t(
          kind.value === 'audio' || kind.value === 'video' ? 'preview.cannotShow.media' : 'preview.cannotShow.text',
        ),
      }
    case 'password':
      return { title: t('preview.password.title'), text: t('preview.password.text') }
    case 'office': {
      const shown = v.status ? textShown({ status: v.status } as TextVersion, transcriptionOn.value) : 'none'
      const text =
        shown === 'queued'
          ? t('preview.office.waiting')
          : shown === 'failed'
            ? t('preview.office.noText')
            : t('preview.office.none')
      return { title: t('preview.office.title'), text }
    }
  }
  return null
})

// --- Going from file to file -----------------------------------------------------------------------

function prev() {
  showPreviewAt(state.index - 1)
}
function next() {
  showPreviewAt(state.index + 1)
}

const dialogClass = 'file-viewer'
/** The left and right arrow keys go to the previous and the next file, where nothing in the viewer takes them. */
function onKeydown(e: KeyboardEvent) {
  if (!state.open || !many.value) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
  const target = e.target as HTMLElement | null
  const dialog = document.querySelector(`.${dialogClass}`)
  if (!dialog || (target && target !== document.body && !dialog.contains(target))) return
  if (target?.closest('input, textarea, select, audio, video, [contenteditable="true"], [role="slider"]')) return
  const own = target?.closest<HTMLElement>('[data-arrows], .pdf-view__pages')
  if (own && own.scrollWidth > own.clientWidth + 1) return
  e.preventDefault()
  if (e.key === 'ArrowLeft') prev()
  else next()
}
watch(
  () => state.open,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// --- Downloading, and "Download as PDF" ---------------------------------------------------------------

const downloading = ref(false)
async function download() {
  const f = file.value
  if (!f || downloading.value) return
  downloading.value = true
  try {
    await f.download()
  } catch (e) {
    notifyError(e, f.filename, { reasons: FILE_REFUSAL_SCOPE })
  } finally {
    downloading.value = false
  }
}

/** Saves its PDF rendition under its name ("Download PDF"), from a fresh URL. */
const downloadingPdf = ref(false)
async function downloadPdf() {
  const f = file.value
  if (!f?.readRendition || downloadingPdf.value) return
  const name = pdfNameOf(f.filename)
  downloadingPdf.value = true
  try {
    const r = await f.readRendition()
    if (!r?.download_url || renditionStage(r) !== 'done') {
      throw new ApiError({ status: 404, code: 'not_found', message: 'the PDF is not there' })
    }
    await savePdf(r.download_url, name)
  } catch (e) {
    notifyError(e, name, { reasons: FILE_REFUSAL_SCOPE })
  } finally {
    downloadingPdf.value = false
  }
}

/** Text that is laid out for paper: a text, Markdown or code file, and an Office file's text version. */
const printable = computed(
  () => (view.value.as === 'text' && view.value.kind !== 'csv') || view.value.as === 'textVersion',
)
function printSource(): PrintRequest {
  const f = file.value!
  const v = view.value
  const lines = [
    state.title && state.title !== f.filename ? state.title : null,
    courseLine(state.courseId),
    dateLine(f.date),
  ]
  if (v.as === 'textVersion') {
    return {
      title: t('preview.print.textVersionOf', { name: f.filename }),
      lines,
      body: { markdown: v.body },
      footer: t('preview.print.textVersionNote'),
    }
  }
  if (v.as === 'text' && v.kind === 'markdown') return { title: f.filename, lines, body: { markdown: v.text } }
  return {
    title: f.filename,
    lines,
    body: { text: v.as === 'text' ? v.text : '', mono: v.as === 'text' && v.kind === 'code' },
  }
}

function onClosed() {
  release()
}
</script>

<template>
  <el-dialog
    :model-value="state.open"
    :class="[dialogClass, { 'is-phone': phone, 'is-full': phone || short }]"
    :fullscreen="phone || short"
    width="min(1200px, calc(100vw - 48px))"
    top="3vh"
    :show-close="false"
    append-to-body
    destroy-on-close
    @update:model-value="(v: boolean) => !v && closePreview()"
    @closed="onClosed"
  >
    <template #header="{ titleId, titleClass }">
      <div v-if="file" class="file-viewer__head" :data-kind="kind">
        <span class="file-viewer__icon" :class="`is-${iconKind}`" aria-hidden="true">
          <el-icon><component :is="icon" /></el-icon>
        </span>
        <div class="file-viewer__titles">
          <h2 :id="titleId" :class="titleClass" class="file-viewer__name" :title="file.filename">
            {{ file.filename }}
          </h2>
          <p class="file-viewer__meta">
            <span>{{ meta }}</span>
            <template v-if="state.title && state.title !== file.filename">
              <span class="file-viewer__dot" aria-hidden="true">·</span>
              <span class="file-viewer__of">{{ state.title }}</span>
            </template>
          </p>
          <div class="file-viewer__actions">
            <el-button
              size="small"
              :loading="downloading"
              class="file-viewer__download"
              :aria-label="t('preview.downloadFile', { name: file.filename })"
              @click="download"
            >
              <el-icon v-if="!downloading"><Download /></el-icon>
              <span>{{ t('preview.download') }}</span>
            </el-button>
            <el-button
              v-if="pdfReady"
              size="small"
              :loading="downloadingPdf"
              class="file-viewer__download-pdf"
              :aria-label="t('preview.rendition.downloadPdfOf', { name: pdfName })"
              :title="t('preview.rendition.downloadPdfTip')"
              @click="downloadPdf"
            >
              <el-icon v-if="!downloadingPdf"><Download /></el-icon>
              <span>{{ t('preview.rendition.downloadPdf') }}</span>
            </el-button>
            <PrintButton v-if="printable" :source="printSource" />
          </div>
        </div>
        <div v-if="many" class="file-viewer__nav" role="group" :aria-label="t('preview.files')">
          <el-button
            circle
            size="small"
            :disabled="state.index === 0"
            :aria-label="t('preview.previous')"
            :title="t('preview.previous')"
            class="file-viewer__prev"
            @click="prev"
          >
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <span class="file-viewer__position" aria-live="polite">
            {{ t('preview.position', { n: state.index + 1, total: state.files.length }) }}
          </span>
          <el-button
            circle
            size="small"
            :disabled="state.index >= state.files.length - 1"
            :aria-label="t('preview.next')"
            :title="t('preview.next')"
            class="file-viewer__next"
            @click="next"
          >
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
        <el-button
          text
          circle
          class="file-viewer__close"
          :aria-label="t('preview.close')"
          :title="t('preview.close')"
          @click="closePreview"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </template>

    <div
      v-if="file"
      class="file-viewer__body"
      :class="`is-${view.as}`"
      :data-kind="kind"
      :data-rendition="shownRendition?.state"
    >
      <div v-if="view.as === 'loading'" class="file-viewer__loading" role="status">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ t('preview.loading', { name: file.filename }) }}</span>
      </div>
      <PdfView
        v-else-if="view.as === 'pdf'"
        :key="`${file.key}/${generation}`"
        :data="view.data"
        :name="file.filename"
        :page="state.page"
        @failed="onPdfFailed"
      />
      <ImageView
        v-else-if="view.as === 'image'"
        :key="view.url"
        :src="view.url"
        :name="file.filename"
        @failed="cannotShow"
      />
      <div v-else-if="view.as === 'audio'" class="file-viewer__media">
        <audio controls preload="metadata" :src="view.url" :aria-label="file.filename" @error="cannotShow" />
      </div>
      <div v-else-if="view.as === 'video'" class="file-viewer__media">
        <video
          controls
          playsinline
          preload="metadata"
          :src="view.url"
          :aria-label="file.filename"
          @error="cannotShow"
        />
      </div>
      <TextView
        v-else-if="view.as === 'text'"
        :text="view.text"
        :kind="view.kind"
        :language="view.language"
        :delimiter="view.delimiter"
        :name="file.filename"
      />
      <div v-else-if="view.as === 'textVersion'" class="file-viewer__text-version">
        <p class="file-viewer__text-note" role="note">
          <el-icon aria-hidden="true"><InfoFilled /></el-icon>
          <span>{{ t('preview.office.textVersion') }}</span>
        </p>
        <div class="file-viewer__paper">
          <MarkdownView :source="view.body" code-tools :empty="t('preview.text.empty')" />
        </div>
      </div>
      <div v-else-if="note" class="file-viewer__note" :class="{ 'is-waiting': note.waiting }">
        <span v-if="note.waiting" class="file-viewer__note-icon is-waiting" aria-hidden="true">
          <el-icon class="is-loading"><Loading /></el-icon>
        </span>
        <span v-else class="file-viewer__note-icon" :class="`is-${iconKind}`" aria-hidden="true">
          <el-icon><component :is="icon" /></el-icon>
        </span>
        <div class="file-viewer__note-words" :role="note.waiting ? 'status' : undefined">
          <p class="file-viewer__note-title">{{ note.title }}</p>
          <p class="file-viewer__note-text">{{ note.text }}</p>
        </div>
        <div class="file-viewer__note-actions">
          <el-button type="primary" :loading="downloading" class="file-viewer__note-download" @click="download">
            <el-icon v-if="!downloading"><Download /></el-icon>
            <span>{{ t('preview.downloadFile', { name: file.filename }) }}</span>
          </el-button>
          <el-button v-if="note.retry" @click="load">{{ t('common.actions.retry') }}</el-button>
          <el-button
            v-if="note.retryRendition"
            :loading="retrying"
            class="file-viewer__note-retry"
            @click="retryRendition"
          >
            <el-icon v-if="!retrying"><RefreshRight /></el-icon>
            <span>{{ t('preview.rendition.retry') }}</span>
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style>
/* Not scoped: Element Plus puts the dialog at the end of the page. */
.el-dialog.file-viewer {
  --el-dialog-padding-primary: 0;
  display: flex;
  flex-direction: column;
  height: 94vh;
  max-height: 94vh;
  margin-bottom: 0;
  padding: 0;
  overflow: hidden;
}
.el-dialog.file-viewer.is-fullscreen {
  height: 100%;
  max-height: none;
  max-width: none;
  border-radius: 0;
}
.file-viewer .el-dialog__header {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 12px 10px 16px;
  border-bottom: 1px solid var(--app-line);
}
.file-viewer .el-dialog__body {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* Element Plus greys a dialog's body: what is shown here is read as on a page. */
  color: var(--app-ink);
}
.file-viewer__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.file-viewer__icon,
.file-viewer__note-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--app-ground-2);
  color: var(--app-ink-2);
  font-size: 19px;
}
.file-viewer__icon.is-pdf,
.file-viewer__note-icon.is-pdf {
  color: var(--el-color-danger);
}
.file-viewer__icon.is-word,
.file-viewer__icon.is-text,
.file-viewer__note-icon.is-word,
.file-viewer__note-icon.is-text {
  color: var(--el-color-primary);
}
.file-viewer__icon.is-sheet,
.file-viewer__note-icon.is-sheet {
  color: var(--el-color-success);
}
.file-viewer__icon.is-slides,
.file-viewer__note-icon.is-slides {
  color: var(--el-color-warning);
}
.file-viewer__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file-viewer .file-viewer__name {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-viewer__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 6px;
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 0;
}
.file-viewer__of {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40ch;
}
.file-viewer__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 6px;
}
.file-viewer__actions .el-button + .el-button {
  margin-left: 0;
}
.file-viewer__nav {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  font-size: 13px;
  color: var(--app-ink-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.file-viewer__nav .el-button + .el-button {
  margin-left: 0;
}
.file-viewer__close {
  flex-shrink: 0;
  font-size: 18px;
}
.file-viewer__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--app-ground-2);
}
.file-viewer__body.is-pdf,
.file-viewer__body.is-image {
  overflow: hidden;
}
.file-viewer__loading {
  margin: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.file-viewer__loading .el-icon {
  font-size: 20px;
}
.file-viewer__media {
  margin: auto;
  padding: 16px;
  width: 100%;
  display: flex;
  justify-content: center;
}
.file-viewer__media audio {
  width: min(560px, 100%);
}
.file-viewer__media video {
  max-width: 100%;
  max-height: calc(94vh - 160px);
  background: #000;
  border-radius: 8px;
}
.file-viewer__text-version {
  padding: 16px;
}
.file-viewer__text-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 860px;
  margin: 0 auto 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-color-info-light-9);
  color: var(--app-ink-2);
  font-size: 13px;
  line-height: 1.55;
}
.file-viewer__text-note .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
  color: var(--el-color-info);
}
.file-viewer__paper {
  max-width: 860px;
  margin: 0 auto;
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item, 8px);
}
.file-viewer__note {
  margin: auto;
  max-width: 460px;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.file-viewer__note-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  font-size: 28px;
  background: var(--el-bg-color);
  margin-bottom: 4px;
}
.file-viewer__note-icon.is-waiting {
  color: var(--el-color-primary);
}
.file-viewer__note-words {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.file-viewer__note-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-ink);
}
.file-viewer__note-text {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--app-ink-2);
}
.file-viewer__note-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.file-viewer__note-actions .el-button + .el-button {
  margin-left: 0;
}
.file-viewer__note-actions .el-button > span {
  max-width: min(360px, 70vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/*
 * The whole screen (a phone, upright or on its side): the previous and the
 * next file two arrows by the close button, their position said only to a
 * screen reader, so that the one count on the screen is the pages' (#82).
 */
.file-viewer.is-full .file-viewer__position {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.file-viewer.is-full .file-viewer__nav {
  gap: 2px;
}
.file-viewer.is-full .file-viewer__nav .el-button {
  width: 32px;
  height: 32px;
  font-size: 16px;
}
/* A phone: the whole screen, the name and close on top, the rest of the head under them. */
.file-viewer.is-phone .el-dialog__header {
  padding: 10px 8px 8px 12px;
}
.file-viewer.is-phone .file-viewer__head {
  flex-wrap: wrap;
  gap: 8px 10px;
}
.file-viewer.is-phone .file-viewer__icon {
  display: none;
}
.file-viewer.is-phone .file-viewer__titles {
  flex: 1 1 0;
}
.file-viewer.is-phone .file-viewer__nav {
  padding: 0;
}
.file-viewer.is-phone .file-viewer__paper {
  padding: 18px 16px;
}
.file-viewer.is-phone .file-viewer__text-version {
  padding: 8px;
}
</style>
