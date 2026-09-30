// A document version's text version (文字版): its file transcribed into
// Markdown by the school's transcriber (the agent runtime's, when it is on),
// or written by staff. Core keeps it and says where it stands (pending,
// working, done, failed, skipped); readers of the version read it, and those
// who may write the document edit it, or send it to be transcribed again.
//
// A long text is read in parts (document.text, at most 65536 bytes each), all
// at one revision: readWholeText starts again from the first part when the
// revision moves on between two of them. What the tab shows of a text that
// is not done follows the transcriber: its place in the queue (pending,
// working) only while the runtime says it is on (info.features.transcription);
// a text that is done is shown whatever the runtime says.
import { ApiError, read } from '@/api/http'
import type { DocumentFull, TextStatus, TextVersion } from '@/api/types'
import { TEXT_STATUSES } from '@/api/types'

type T = (key: string, params?: Record<string, unknown>) => string
type Te = (key: string) => boolean

/** How many times reading a text's parts starts again when it changes meanwhile, before giving up. */
export const TEXT_READ_RESTARTS = 3

/** Where a version stands, as document.text and document.get give it. */
export interface TextRef {
  course_id: string
  document_id: string
  version_id: string
}

/** A text version read whole: as it stood at one revision, its whole body ('' while it is not done). */
export interface WholeText {
  text: TextVersion
  body: string
  parts: number
}

/**
 * Reads a version's text version whole: the first part, then each part after
 * it, each at the revision the first was read at. A revision that has moved
 * on meanwhile (an edit, a transcription done, a retranscribe) starts it
 * again from the first part, at most TEXT_READ_RESTARTS times; then it is
 * given up, as a conflict. Rejects with Core's error otherwise (a version
 * without a text version is 404, reason no_text).
 */
export async function readWholeText(
  ref: TextRef,
  opts: { signal?: AbortSignal; onProgress?: (read: number, parts: number) => void } = {},
): Promise<WholeText> {
  for (let attempt = 0; attempt <= TEXT_READ_RESTARTS; attempt++) {
    const first = await read('document.text', { ...ref, part: 1 }, { signal: opts.signal })
    const revision = first.text.revision
    const bodies = [first.text.body ?? '']
    const parts = first.parts ?? 0
    opts.onProgress?.(Math.min(1, parts), parts)
    let moved = false
    for (let part = 2; part <= parts; part++) {
      let next: Awaited<ReturnType<typeof read<'document.text'>>>
      try {
        next = await read('document.text', { ...ref, part }, { signal: opts.signal })
      } catch (e) {
        // A text made shorter meanwhile has no such part now: it has moved on.
        if (e instanceof ApiError && e.status === 400 && e.details?.parts !== undefined) {
          moved = true
          break
        }
        throw e
      }
      if (next.text.revision !== revision || next.parts !== parts) {
        moved = true
        break
      }
      bodies.push(next.text.body ?? '')
      opts.onProgress?.(part, parts)
    }
    if (moved) continue
    const body = first.text.status === 'done' ? bodies.join('') : ''
    return { text: { ...first.text, body }, body, parts }
  }
  throw new ApiError({
    status: 409,
    code: 'conflict',
    message: 'the text kept changing while it was read',
    details: { reason: 'text_kept_changing' },
  })
}

/** A version's text version as document.get gives it, or null where it has none (no text key). */
export function textOfVersion(v: DocumentFull['version'] | null | undefined): TextVersion | null {
  return (v as { text?: TextVersion | null } | null | undefined)?.text ?? null
}

/** Core's status, as one of those this app knows; anything else is taken for pending. */
export function textStatus(t: Pick<TextVersion, 'status'> | null | undefined): TextStatus | null {
  if (!t) return null
  return (TEXT_STATUSES as readonly string[]).includes(t.status) ? (t.status as TextStatus) : 'pending'
}

/** Waiting for the transcriber, or being transcribed: a place in the queue. */
export function isQueued(s: TextStatus | null): boolean {
  return s === 'pending' || s === 'working'
}

/**
 * What the tab shows of a version's text version:
 * - text: it is done; shown to every reader, whether the transcriber is on or not;
 * - queued: it waits for the transcriber, or is being transcribed, and the transcriber is on;
 * - failed: it failed or was skipped, with why;
 * - none: there is none to show (none at all, or one waiting for a transcriber that is off).
 */
export type TextShown = 'text' | 'queued' | 'failed' | 'none'

export function textShown(t: TextVersion | null | undefined, transcriptionOn: boolean): TextShown {
  const s = textStatus(t)
  if (s === 'done') return 'text'
  if (s === 'failed' || s === 'skipped') return 'failed'
  if (isQueued(s) && transcriptionOn) return 'queued'
  return 'none'
}

/**
 * Whether a version gets the tab at all: one of material, instructions or a
 * rubric, not purged. Staff (whoever may write the document) get it for
 * every version with a file or a text version, to transcribe one or write
 * one by hand; readers where there is something to read or to wait for.
 */
export function textTabShown(opts: {
  text: TextVersion | null
  courseLevel: boolean
  purged: boolean
  hasFile: boolean
  canWrite: boolean
  transcriptionOn: boolean
}): boolean {
  if (!opts.courseLevel || opts.purged) return false
  if (opts.canWrite) return opts.hasFile || !!opts.text
  const shown = textShown(opts.text, opts.transcriptionOn)
  return shown === 'text' || (opts.transcriptionOn && shown !== 'none')
}

/** Reasons the transcriber and Core give for a text that failed or was skipped, which have words here. */
export const TEXT_REASONS = [
  'too_many_pages',
  'quota_exhausted',
  'unsupported_format',
  'encrypted',
  'too_large',
  'model_error',
  'conversion_failed',
  'attempts_exhausted',
] as const

/**
 * Why a text failed or was skipped, in the reader's words where the reason
 * is one of the codes they have words for (enums.textReason), and as the
 * transcriber wrote it otherwise.
 */
export function textReasonText(reason: string | null | undefined, t: T, te: Te): string {
  const r = (reason ?? '').trim()
  if (!r) return ''
  const key = `enums.textReason.${r}`
  return /^[a-z][a-z_]*$/.test(r) && te(key) ? t(key) : r
}

/** The Element Plus tag type for a status. */
export const TEXT_STATUS_TAG: Record<TextStatus, 'info' | 'primary' | 'success' | 'danger' | 'warning'> = {
  pending: 'info',
  working: 'primary',
  done: 'success',
  failed: 'danger',
  skipped: 'warning',
}

/** The refusal's current revision, where Core says the text changed since the one named (text_changed). */
export function changedRevision(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.details?.reason !== 'text_changed') return null
  const r = Number(e.details?.revision)
  return Number.isInteger(r) ? r : null
}

/** Whether Core refused because the text has changed since the revision named. */
export function isTextChanged(e: unknown): boolean {
  return e instanceof ApiError && e.details?.reason === 'text_changed'
}

/** Whether Core refused because the version has no text version (or none can be made for it). */
export function isNoText(e: unknown): boolean {
  return e instanceof ApiError && e.details?.reason === 'no_text'
}
