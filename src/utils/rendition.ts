// A file's PDF rendition (PDF 版本): every Office or OpenDocument file, a
// version's of any kind of document and a chat message's alike, is converted
// to PDF once, on the server, by the site's runtime (AIShie-Core#53), and
// previewed as that PDF (components/preview). Which files Core converts is
// Core's to say: a file it converts carries a rendition, wherever it is read
// (document.get, document.file, document.versions, conversation.messages,
// conversation.attachment); any other file has none, and neither has any
// file from a Core before renditions.
//
// A rendition is queued, then claimed while the runtime converts it, then
// done (the PDF is there, with its page count and size, and, from
// document.get, document.file and conversation.attachment, a short-lived URL
// that shows it), or failed or skipped, with the reason why. Nothing is
// pushed: while one waits, the viewer asks again, less and less often
// (renditionPollDelay). One that failed or was skipped may be sent back to be
// converted again (document.rendition_retry, conversation.rendition_retry) by
// whoever may write the document, or by the message's author.
import { fetchBlob } from '@/api/http'
import type { Perm } from '@/api/types'

/** Where a rendition stands, as Core says. */
export type RenditionState = 'queued' | 'claimed' | 'done' | 'failed' | 'skipped'

/** Why a rendition failed or was skipped, as Core and the runtime say. */
export const RENDITION_REASONS = [
  'password_protected',
  'unsupported',
  'too_large',
  'conversion_failed',
  'timeout',
  'attempts_exhausted',
] as const
export type RenditionReason = (typeof RENDITION_REASONS)[number]

/** A rendition as any read gives it: where it stands, and as much more as that read tells. */
export interface Rendition {
  state: string
  page_count?: number | null
  byte_size?: number | null
  reason?: string | null
  /** A short-lived URL that shows the PDF, once it is done, from the reads that give URLs. */
  download_url?: string | null
  download_expires_at?: string | null
}

/**
 * What the viewer makes of where a rendition stands: waiting for it (queued,
 * or claimed and being converted), done, or none to show (failed or skipped,
 * or a state this app does not know).
 */
export type RenditionStage = 'waiting' | 'done' | 'none'

export function renditionStage(r: Pick<Rendition, 'state'> | null | undefined): RenditionStage | null {
  if (!r) return null
  switch (r.state) {
    case 'queued':
    case 'claimed':
      return 'waiting'
    case 'done':
      return 'done'
    default:
      return 'none'
  }
}

/** Why there is no PDF, in words of the app's: a reason Core names, or 'other' for none or another. */
export function renditionReason(r: Pick<Rendition, 'reason'> | null | undefined): RenditionReason | 'other' {
  const reason = r?.reason
  return reason && (RENDITION_REASONS as readonly string[]).includes(reason) ? (reason as RenditionReason) : 'other'
}

/** How soon a waiting rendition is asked after first: 2 seconds, doubling each time after. */
export const RENDITION_POLL_FIRST_MS = 2_000
/** The longest it waits between two asks: 30 seconds. */
export const RENDITION_POLL_MAX_MS = 30_000

/** How long to wait before asking for the nth time (from 0) where a waiting rendition stands. */
export function renditionPollDelay(n: number): number {
  const times = Math.max(0, Math.min(Math.floor(n), 16))
  return Math.min(RENDITION_POLL_MAX_MS, RENDITION_POLL_FIRST_MS * 2 ** times)
}

/** The PDF's name: the file's, with .pdf in place of its extension, as Core names it. */
export function pdfNameOf(filename: string): string {
  const name = (filename ?? '').trim() || 'file'
  const stem = name.replace(/\.[^.\s/\\]{1,16}$/, '')
  return `${stem || name}.pdf`
}

/**
 * The permission that lets a member send a document's renditions back to be
 * converted again (document.rendition_retry): its kind's own write
 * permission, as a new version of it is written. Core decides, in scope.
 */
export function retryPermOf(kind: string | null | undefined): Perm | null {
  switch (kind) {
    case 'material':
    case 'instructions':
    case 'rubric':
      return 'document_write'
    case 'submission':
      return 'submission_write'
    case 'feedback':
      return 'grade_submit'
    default:
      return null
  }
}

/** Where the words for Core's refusals of a retry are (preview.rendition.refusal.<reason>). */
export const RENDITION_REFUSAL_SCOPE = 'preview.rendition.refusal'

/**
 * Refusals of a retry that the viewer answers by reading the rendition again,
 * since it has changed meanwhile: it is done (rendition_done), or there is
 * none (no_rendition).
 */
export const RETRY_READS_AGAIN: ReadonlySet<string> = new Set(['rendition_done', 'no_rendition'])

/**
 * Saves a rendition's PDF under its name, from its short-lived URL: fetched
 * with no credentials (the URL is the credential), as the viewer fetches it,
 * and saved from an object URL, which the download attribute names wherever
 * the URL was (it is ignored across origins, and Core serves the PDF to be
 * shown, not saved).
 */
export async function savePdf(url: string, name: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
  const blob = await fetchBlob(url, opts)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}
