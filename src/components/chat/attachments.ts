// Files a message carries (Core's conversation attachments): in the composer,
// on their way before the message is sent.
//
// In the composer, each file taken (the paperclip, dropped on the chat panel,
// or pasted) is uploaded at once, through the upload queue and uploadFile
// (kind conversation: conversation.upload_url, then a PUT), a few at a time;
// its chip shows its progress, and it may be removed, or tried again where it
// failed. What Core takes (a file's largest size, how many files a message
// carries) is known before anything is sent: a file too large fails at once,
// and files past the count are left out, saying so. The message is sent with
// the uploads' tokens, in order (attachments: [{upload_token, filename}]),
// never while one is still on its way or failed; a refusal because of them
// (details.reason) marks the files it was about and says why in the reader's
// words. What is attached to a draft is kept with it, by the draft's key, for
// the page's life, as its text is (chat.ts, Drafts).
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { ApiError, FILE_TOO_LARGE, uploadLimits, type UploadLimits } from '@/api/http'
import { createUploadQueue, type UploadFn, type UploadItem, type UploadQueue } from '@/composables/useUploadQueue'
import { i18n } from '@/i18n'
import { formatBytes } from '@/utils/format'

const t = (key: string, args?: Record<string, unknown>, plural?: number) =>
  plural === undefined ? i18n.global.t(key, args ?? {}) : i18n.global.t(key, args ?? {}, plural)

/** The most files a message carries where Core has not said how many (its ATTACHMENT_MAX_PER_MESSAGE by default). */
export const DEFAULT_MAX_FILES = 10

/** What a message's attachments are sent as. */
export interface AttachmentRef {
  upload_token: string
  filename: string
}

/**
 * Core's reasons for refusing a message because of its files (details.reason),
 * and for refusing an upload URL or a file: each has words of the chat's
 * (chat.attach.refusal).
 */
export const ATTACHMENT_REASONS = [
  'too_many_attachments',
  'bad_filename',
  'duplicate_attachment',
  'attachments_need_body',
  'bad_upload_token',
  'not_your_upload',
  'already_attached',
  'not_uploaded',
  'file_too_large',
  'conversation_attachments_full',
  'upload_too_old',
  'no_file_storage',
] as const
export type AttachmentReason = (typeof ATTACHMENT_REASONS)[number]

/**
 * Refusals that say an upload can no longer be attached as it is, though the
 * file itself is fine: it is uploaded again, at a fresh URL, to be sent once
 * more.
 */
const UPLOAD_AGAIN: ReadonlySet<string> = new Set([
  'bad_upload_token',
  'not_your_upload',
  'already_attached',
  'not_uploaded',
  'upload_too_old',
])

/** Where the chat keeps words for Core's refusals by reason, for errorMessage's scopes. */
export const REFUSAL_SCOPE = 'chat.attach.refusal'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The reason Core gave for refusing, when it is about a message's files. */
export function attachmentReason(e: unknown): AttachmentReason | null {
  const reason = e instanceof ApiError ? e.details?.reason : undefined
  return typeof reason === 'string' && (ATTACHMENT_REASONS as readonly string[]).includes(reason)
    ? (reason as AttachmentReason)
    : null
}

/** A refusal of a message because of its files, in the reader's words; null for any other. */
export function attachmentRefusalText(e: unknown): string | null {
  const reason = attachmentReason(e)
  if (!reason) return null
  const d = (e as ApiError).details ?? {}
  const maxBytes = num(d.max_bytes)
  const maxTotal = num(d.max_conversation_bytes)
  const held = num(d.held_bytes)
  return t(`${REFUSAL_SCOPE}.${reason}`, {
    max_files: num(d.max_files) ?? DEFAULT_MAX_FILES,
    max: maxBytes !== null ? formatBytes(maxBytes) : '—',
    max_total: maxTotal !== null ? formatBytes(maxTotal) : '—',
    held: held !== null ? formatBytes(held) : '—',
  })
}

/** Something to tell the person about the files they added, beside the chips. */
export type AttachNotice =
  | { kind: 'tooMany'; max: number; skipped: number }
  | { kind: 'folders'; n: number }
  | { kind: 'refused'; error: ApiError; again: boolean }

export interface ChatAttachmentsOptions {
  courseId: string
  /** What uploads a file: uploadFile, but for tests. */
  upload?: UploadFn
  /** What says what Core takes: uploadLimits, but for tests. */
  limits?: (courseId: string) => Promise<UploadLimits | null>
}

/** The files being attached to one draft: its upload queue, what Core takes, and what to say. */
export function createChatAttachments(opts: ChatAttachmentsOptions) {
  const askLimits = opts.limits ?? ((courseId: string) => uploadLimits(courseId, 'conversation'))
  /** What Core takes, once known; null while it is not (or cannot be). */
  const limits = shallowRef<UploadLimits | null>(null)
  let asked: Promise<UploadLimits | null> | null = null
  /** Asks what Core takes, once (again after a failure), and keeps it. */
  function ensureLimits(): Promise<UploadLimits | null> {
    if (limits.value) return Promise.resolve(limits.value)
    asked ??= askLimits(opts.courseId)
      .catch(() => null)
      .then((l) => {
        if (l) limits.value = { ...l, ...pick(limits.value) }
        else asked = null
        return limits.value
      })
    return asked
  }
  /** What a refusal has taught, over what was read. */
  function learn(more: Partial<UploadLimits>) {
    limits.value = { maxBytes: null, maxFiles: null, maxConversationBytes: null, ...limits.value, ...pick(more) }
  }

  const queue: UploadQueue = createUploadQueue({
    courseId: opts.courseId,
    kind: 'conversation',
    upload: opts.upload,
    limit: () => ensureLimits().then((l) => l?.maxBytes ?? null),
  })
  const notice = ref<AttachNotice | null>(null)

  const maxFiles = computed(() => limits.value?.maxFiles ?? DEFAULT_MAX_FILES)
  const count = computed(() => queue.items.length)
  /** Any file still to upload or uploading: the message waits for it. */
  const busy = computed(() => queue.busy.value)
  /** Files that did not upload (failed, cancelled, or refused where they were to be attached). */
  const failed = computed(() => queue.items.filter((i) => i.status === 'failed' || i.status === 'cancelled'))
  /** As many files as a message carries. */
  const full = computed(() => count.value >= maxFiles.value)
  /** Why the message cannot be sent with its files now; null when it can. */
  const block = computed<'uploading' | 'failed' | null>(() =>
    busy.value ? 'uploading' : failed.value.length ? 'failed' : null,
  )

  /**
   * Adds files, which start uploading at once, up to as many as a message
   * carries (what does not fit is left out, and said so). A file larger than
   * Core takes fails before it is sent.
   */
  async function add(files: File[], folders = 0): Promise<UploadItem[]> {
    notice.value = folders ? { kind: 'folders', n: folders } : null
    if (!files.length) return []
    await ensureLimits()
    const room = Math.max(0, maxFiles.value - queue.items.length)
    const take = files.slice(0, room)
    if (take.length < files.length)
      notice.value = { kind: 'tooMany', max: maxFiles.value, skipped: files.length - take.length }
    return take.length ? queue.add(take) : []
  }

  function remove(id: number) {
    queue.remove(id)
    // What was said of the files is said no longer once it no longer holds.
    if (notice.value?.kind === 'tooMany' && !full.value) notice.value = null
    if (notice.value?.kind === 'refused' && !failed.value.length) notice.value = null
  }
  function retry(id: number) {
    queue.retry(id)
  }
  function cancel(id: number) {
    queue.cancel(id)
  }

  /** What the message is sent with: each uploaded file's token and name, in the order they were added. */
  function payload(): AttachmentRef[] {
    return queue.items
      .filter((i) => i.status === 'done' && i.result)
      .map((i) => ({ upload_token: i.result!.uploadToken, filename: i.name }))
  }
  /** The files uploaded, in order: what a message sent with them carried. */
  function files(): File[] {
    return queue.items.filter((i) => i.status === 'done' && i.result).map((i) => i.file)
  }

  /** Empties it: the message went with its files, or they are all taken off. */
  function clear() {
    queue.clear()
    notice.value = null
  }

  /**
   * Takes Core's refusal of the message, if it was about its files: marks the
   * files it was about (a file too large fails, as it would have before it
   * was sent; uploads that can no longer be attached are uploaded again, at
   * fresh URLs), learns the limits it names, and says why. False for any
   * other refusal, which is not the files'.
   */
  function refused(e: unknown): boolean {
    const reason = attachmentReason(e)
    if (!reason) return false
    const err = e as ApiError
    const d = err.details ?? {}
    const done = queue.items.filter((i) => i.status === 'done')
    let again = false
    if (reason === 'file_too_large') {
      const max = num(d.max_bytes)
      const size = num(d.byte_size)
      if (max) learn({ maxBytes: max })
      for (const item of done) {
        if ((max && item.size > max) || (size !== null && item.size === size)) {
          queue.fail(item.id, tooLargeError(item.size, max))
        }
      }
    } else if (UPLOAD_AGAIN.has(reason)) {
      for (const item of done) {
        queue.fail(item.id, err)
        queue.retry(item.id)
      }
      again = done.length > 0
    } else if (reason === 'too_many_attachments') {
      const max = num(d.max_files)
      if (max) learn({ maxFiles: max })
    } else if (reason === 'conversation_attachments_full') {
      const max = num(d.max_conversation_bytes)
      if (max) learn({ maxConversationBytes: max })
    }
    notice.value = { kind: 'refused', error: err, again }
    return true
  }

  return {
    courseId: opts.courseId,
    queue,
    items: queue.items,
    limits: limits as Readonly<Ref<UploadLimits | null>>,
    maxFiles: maxFiles as ComputedRef<number>,
    notice,
    count,
    busy,
    failed,
    full,
    block,
    ensureLimits,
    add,
    remove,
    retry,
    cancel,
    payload,
    files,
    clear,
    refused,
  }
}

export type ChatAttachments = ReturnType<typeof createChatAttachments>

function pick(l: Partial<UploadLimits> | null | undefined): Partial<UploadLimits> {
  const out: Partial<UploadLimits> = {}
  if (!l) return out
  for (const k of ['maxBytes', 'maxFiles', 'maxConversationBytes'] as const) if (l[k]) out[k] = l[k]
  return out
}

function tooLargeError(size: number, max: number | null): ApiError {
  return new ApiError({
    status: 422,
    code: FILE_TOO_LARGE,
    message: max ? `the file is ${size} bytes; the limit is ${max}` : `the file is ${size} bytes, more than is taken`,
    details: max ? { size, max_bytes: max } : { size },
  })
}

// --- Kept by draft, for the page's life ----------------------------------------------------

const drafts = new Map<string, ChatAttachments>()

/**
 * The files being attached to a draft (by its key, chat.ts's draftKey), kept
 * while the page lives, as the draft's text is: looking at another
 * conversation, or closing the chat, loses none of them, and an upload under
 * way goes on meanwhile.
 */
export function attachmentsFor(key: string, courseId: string): ChatAttachments {
  let a = drafts.get(key)
  if (!a) {
    a = createChatAttachments({ courseId })
    drafts.set(key, a)
  }
  return a
}

/** Forgets every draft's files, stopping their uploads (tests). */
export function forgetAttachments() {
  for (const a of drafts.values()) a.clear()
  drafts.clear()
  sentFiles.clear()
}

// What the caller sent from this page, by message: the files a question
// carried, so that one taken back to the composer (withdrawn, to edit it or
// to stop the wait) comes back with its files, uploaded again (an upload is
// attached once). A few are kept, the latest.
const sentFiles = new Map<string, File[]>()
const SENT_KEPT = 20

/** Remembers the files a message sent from this page carried. */
export function rememberSent(messageId: string | null | undefined, files: File[]) {
  if (!messageId || !files.length) return
  sentFiles.delete(messageId)
  sentFiles.set(messageId, files)
  while (sentFiles.size > SENT_KEPT) sentFiles.delete(sentFiles.keys().next().value!)
}

/** The files a message sent from this page carried, or null when they are not known here. */
export function sentFilesOf(messageId: string): File[] | null {
  return sentFiles.get(messageId) ?? null
}

// --- What a file is ------------------------------------------------------------------------

/** What a file is, by its type (as its uploader declared it) or, failing that, its name: for its icon and its word. */
export type FileKind = 'image' | 'pdf' | 'word' | 'sheet' | 'slides' | 'text' | 'archive' | 'audio' | 'video' | 'other'

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  pages: 'word',
  xls: 'sheet',
  xlsx: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  numbers: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  key: 'slides',
  txt: 'text',
  md: 'text',
  json: 'text',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tar: 'archive',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  svg: 'image',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
}

export function fileKind(contentType: string | null | undefined, filename = ''): FileKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.startsWith('video/')) return 'video'
  if (ct === 'application/pdf') return 'pdf'
  if (/(msword|wordprocessingml|opendocument\.text|rtf)/.test(ct)) return 'word'
  if (/(ms-excel|spreadsheetml|opendocument\.spreadsheet)/.test(ct) || ct === 'text/csv') return 'sheet'
  if (/(ms-powerpoint|presentationml|opendocument\.presentation)/.test(ct)) return 'slides'
  if (/(zip|x-7z|x-rar|gzip|x-tar|compressed)/.test(ct)) return 'archive'
  if (ct.startsWith('text/') || ct === 'application/json') return 'text'
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1]?.toLowerCase()
  return (ext && BY_EXTENSION[ext]) || 'other'
}

/** Each kind's icon (Element Plus's, by name). */
export const FILE_ICON: Record<FileKind, string> = {
  image: 'Picture',
  pdf: 'Document',
  word: 'Notebook',
  sheet: 'Grid',
  slides: 'DataBoard',
  text: 'Tickets',
  archive: 'Box',
  audio: 'Headset',
  video: 'VideoCamera',
  other: 'Paperclip',
}
