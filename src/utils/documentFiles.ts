// A document version's files (AIShie-Core #49): a version is text, files, or
// both, and its files are in order, each named, with a text version of its
// own where it is material, instructions or a rubric's.
//
// Reading: versionFilesOf lists a version's files as document.get or
// document.versions gives them. Each downloads under its name from a fresh
// short-lived URL (document.file, asked for on the click, since a URL
// document.get gave may have expired meanwhile).
//
// Writing: a version's files are sent in order as files: [{upload_token,
// filename}] (filesPayload, uploadedPayload). What Core refuses because of
// them (details.reason) has words of the app's (common.upload.refusal), and
// versionFilesRefused marks the files it was about in the upload queue they
// came from.
import { ApiError, blobUrl, FILE_TOO_LARGE, read, type UploadedFile } from '@/api/http'
import type { DocumentFile, DocumentFull, DocumentVersion } from '@/api/types'
import type { UploadQueue } from '@/composables/useUploadQueue'

/** A version as document.get or document.versions gives it. */
type AnyVersion = NonNullable<DocumentFull['version']> | DocumentVersion

/** A version's files, in order (files); a purged version has none. */
export function versionFilesOf(v: AnyVersion | null | undefined): DocumentFile[] {
  if (!v || (v as { purged?: unknown }).purged || (v as { purged_at?: unknown }).purged_at) return []
  return [...(v.files ?? [])].sort((a, b) => a.position - b.position)
}

/** Goes to a download URL Core handed out, which saves the file under its name. */
function saveFrom(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = blobUrl(url)
  if (new URL(link.href, window.location.href).origin === window.location.origin) {
    // Core's own store, reached through this origin: the download attribute
    // names it too (Core names it in Content-Disposition as well), and no
    // tab is left open.
    link.download = filename
  } else {
    // An object store's presigned URL, which carries its own disposition;
    // the download attribute is ignored across origins.
    link.rel = 'noopener'
    link.target = '_blank'
  }
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * Downloads a file of a document: a fresh short-lived URL (document.file),
 * then the browser goes to it and saves the file under its name.
 */
export async function downloadDocumentFile(
  courseId: string,
  documentId: string,
  file: Pick<DocumentFile, 'id'>,
): Promise<void> {
  const f = await read('document.file', { course_id: courseId, document_id: documentId, file_id: file.id })
  saveFrom(f.download_url, f.filename)
}

/** What a version's files are sent as: each upload's token and name, in order. */
export interface FileRef {
  upload_token: string
  filename: string
}

/** The files a queue has uploaded, in the order listed, as a version's files are sent. */
export function filesPayload(queue: Pick<UploadQueue, 'items'>): FileRef[] {
  return queue.items
    .filter((i) => i.status === 'done' && i.result)
    .map((i) => ({ upload_token: i.result!.uploadToken, filename: i.result!.fileName }))
}

/** Uploaded files, in order, as a version's files are sent. */
export function uploadedPayload(files: readonly UploadedFile[]): FileRef[] {
  return files.map((f) => ({ upload_token: f.uploadToken, filename: f.fileName }))
}

/**
 * Where the app keeps words for Core's refusals of a version's files and of
 * their uploads, by reason (details.reason): useWrite's and errorMessage's
 * reasons scope.
 */
export const FILE_REFUSAL_SCOPE = 'common.upload.refusal'

/** Core's reasons for refusing a version because of its files, or a file's upload. */
export const FILE_REASONS = [
  'too_many_files',
  'version_too_large',
  'file_too_large',
  'bad_filename',
  'duplicate_file',
  'filename_required',
  'bad_upload_token',
  'not_your_upload',
  'already_attached',
  'not_uploaded',
  'upload_too_old',
  'no_file_storage',
] as const
export type FileReason = (typeof FILE_REASONS)[number]

/**
 * Refusals that say an upload can no longer be attached as it is, though the
 * file itself is fine: it is uploaded again, at a fresh URL.
 */
const UPLOAD_AGAIN: ReadonlySet<string> = new Set([
  'bad_upload_token',
  'not_your_upload',
  'already_attached',
  'not_uploaded',
  'upload_too_old',
])

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The reason Core gave for refusing, when it is about a version's files. */
export function fileReason(e: unknown): FileReason | null {
  const reason = e instanceof ApiError ? e.details?.reason : undefined
  return typeof reason === 'string' && (FILE_REASONS as readonly string[]).includes(reason)
    ? (reason as FileReason)
    : null
}

/**
 * Takes Core's refusal of a version, if it was about its files, and marks the
 * files it was about in the queue they were uploaded through: a file too
 * large fails, as it would have before it was sent; uploads that can no
 * longer be attached are uploaded again, at fresh URLs; a limit it names is
 * learnt, so that the list says what is too much. Says whether the files are
 * being uploaded again (the version is saved once they are up); null for a
 * refusal that is not about the files.
 */
export function versionFilesRefused(queue: UploadQueue, e: unknown): { again: boolean } | null {
  const reason = fileReason(e)
  if (!reason) return null
  const d = (e as ApiError).details ?? {}
  const done = queue.items.filter((i) => i.status === 'done')
  if (reason === 'file_too_large') {
    const max = num(d.max_bytes)
    const size = num(d.byte_size)
    if (max) queue.learn({ maxBytes: max })
    for (const item of done) {
      if ((max && item.size > max) || (size !== null && item.size === size)) {
        queue.fail(
          item.id,
          new ApiError({
            status: 422,
            code: FILE_TOO_LARGE,
            message: `the file is ${item.size} bytes`,
            details: max ? { size: item.size, max_bytes: max } : { size: item.size },
          }),
        )
      }
    }
    return { again: false }
  }
  if (UPLOAD_AGAIN.has(reason)) {
    for (const item of done) {
      queue.fail(item.id, e)
      queue.retry(item.id)
    }
    return { again: done.length > 0 }
  }
  if (reason === 'too_many_files') {
    const max = num(d.max_files)
    if (max) queue.learn({ maxFiles: max })
  } else if (reason === 'version_too_large') {
    const max = num(d.max_version_bytes)
    if (max) queue.learn({ maxVersionBytes: max })
  }
  return { again: false }
}
