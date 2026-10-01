// The file viewer (預覽): one dialog over every signed-in page (FileViewer,
// mounted by AppLayout), opened on a file from wherever files are listed
// (openPreview): a document version's files (VersionFileList, and through it
// a submitted or feedback document's, DocumentFiles) and the files a chat
// message carries (ChatMessageFiles). It steps through the files listed
// with it (a version's, a message's).
//
// A file is described by what it is (PreviewFile) and how to have it: a
// fresh short-lived URL to its bytes, asked for each time it is opened
// (document.file, conversation.attachment), since one read with the list may
// have expired; how to download it under its name, as the list does; and,
// for a file of material, instructions or a rubric, how to read its text
// version (文字版), which is what an Office file is shown as.
import { shallowReactive } from 'vue'
import { ApiError, read } from '@/api/http'
import type { DocumentFile, MessageAttachment, TextVersion } from '@/api/types'
import { downloadDocumentFile } from '@/utils/documentFiles'
import { readWholeText } from '@/views/course/materials/components/textVersion'
import { downloadAttachment } from '@/components/chat/attachments'

/** A file the viewer shows. */
export interface PreviewFile {
  /** Tells it from the others listed with it. */
  key: string
  filename: string
  /** The type its uploader declared. */
  contentType: string
  byteSize: number
  /** When it was put in (the version's or the message's time), for the print layout; now where unknown. */
  date?: string | null
  /** A fresh short-lived URL its bytes are fetched from, with no credentials (the URL is the credential). */
  url: () => Promise<string>
  /** Saves it under its name, as the list it is in does. */
  download: () => Promise<void>
  /** Its text version as the list had it; absent for a file that has none (a submitted file, a message's). */
  text?: TextVersion | null
  /** Reads its text version afresh, whole: where it stands, and its body once it is done. */
  readText?: (signal?: AbortSignal) => Promise<{ text: TextVersion; body: string }>
}

/** What the viewer is opened on: files, the one shown first, and what they belong to. */
export interface PreviewSet {
  files: PreviewFile[]
  index?: number
  /** What the files are of (the document's title), said under a file's name and in the print layout. */
  title?: string
  /** The course they are in, for the print layout. */
  courseId?: string | null
}

/** What the viewer shows: whether it is open, the files, which one, and what they belong to. */
export interface PreviewState {
  open: boolean
  files: PreviewFile[]
  index: number
  title: string
  courseId: string | null
  /** Bumped each time it is opened, so that opening the same file again reads it afresh. */
  opened: number
}

const state: PreviewState = shallowReactive({ open: false, files: [], index: 0, title: '', courseId: null, opened: 0 })

/** The viewer's state, which FileViewer shows. */
export function previewState(): PreviewState {
  return state
}

/** Opens the viewer on a file of a set (the first, unless `index` says another). */
export function openPreview(set: PreviewSet) {
  if (!set.files.length) return
  state.files = set.files
  state.index = Math.min(Math.max(0, set.index ?? 0), set.files.length - 1)
  state.title = set.title ?? ''
  state.courseId = set.courseId ?? null
  state.opened++
  state.open = true
}

/** Closes it: what it showed is let go (FileViewer revokes its object URLs). */
export function closePreview() {
  state.open = false
}

/** Shows another file of the set, by its place; past either end it stays where it is. */
export function showPreviewAt(index: number) {
  if (index < 0 || index >= state.files.length) return
  state.index = index
}

/**
 * A document version's files, to preview: each fetched from a fresh URL
 * (document.file), downloaded as VersionFileList does, and its text version
 * read by its file_id. A file with no id (a Core from before several files
 * to a version) is its version's one file, fetched from document.get's
 * deprecated download_url.
 */
export function documentPreviewFiles(
  courseId: string,
  documentId: string,
  versionId: string | null | undefined,
  files: DocumentFile[],
  date?: string | null,
): PreviewFile[] {
  return files.map((f) => ({
    key: f.id || `${documentId}/${f.position}`,
    filename: f.filename,
    contentType: f.content_type,
    byteSize: f.byte_size,
    date: date ?? null,
    text: f.text ?? null,
    url: async () => {
      if (f.id) {
        const got = await read('document.file', { course_id: courseId, document_id: documentId, file_id: f.id })
        return got.download_url
      }
      const doc = await read('document.get', {
        course_id: courseId,
        document_id: documentId,
        version_id: versionId ?? undefined,
      })
      const url = (doc.version as { download_url?: string | null } | null | undefined)?.download_url
      if (!url) throw new ApiError({ status: 404, code: 'not_found', message: 'the file is no longer there' })
      return url
    },
    download: () => downloadDocumentFile(courseId, documentId, f, versionId),
    // Only a file of material, instructions or a rubric has a text version.
    readText:
      versionId && f.text
        ? (signal) =>
            readWholeText(
              {
                course_id: courseId,
                document_id: documentId,
                version_id: versionId,
                ...(f.id ? { file_id: f.id } : {}),
              },
              { signal },
            )
        : undefined,
  }))
}

/** The files a chat message carries, to preview: each fetched from a fresh URL (conversation.attachment). */
export function attachmentPreviewFiles(courseId: string, files: MessageAttachment[]): PreviewFile[] {
  return files.map((f) => ({
    key: f.id,
    filename: f.filename,
    contentType: f.content_type,
    byteSize: f.byte_size,
    date: f.created_at ?? null,
    url: async () => {
      const got = await read('conversation.attachment', { course_id: courseId, attachment_id: f.id })
      return got.download_url
    },
    download: () => downloadAttachment(courseId, f.id),
  }))
}
