import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type UploadedFile, type UploadLimits, type UploadOptions } from '@/api/http'
import type { UploadFn } from '@/composables/useUploadQueue'

const { setLocale } = await import('@/i18n')
const { errorMessage } = await import('@/composables/useErrors')
const {
  attachmentReason,
  attachmentRefusalText,
  createChatAttachments,
  DEFAULT_MAX_FILES,
  fileKind,
  forgetAttachments,
  rememberSent,
  sentFilesOf,
  attachmentsFor,
} = await import('./attachments')

interface Call {
  file: File
  opts: UploadOptions
  resolve: (v: UploadedFile) => void
  reject: (e: unknown) => void
}

/** Uploads played by the test: each waits until it is settled. */
function played() {
  const calls: Call[] = []
  const upload: UploadFn = (_course, kind, file, opts) => {
    expect(kind).toBe('conversation')
    return new Promise((resolve, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
      calls.push({ file, opts, resolve, reject })
    })
  }
  const finish = (c: Call, n = calls.indexOf(c)) =>
    c.resolve({
      uploadToken: `tok-${n}-${c.file.name}`,
      fileName: c.file.name,
      contentType: c.file.type,
      size: c.file.size,
    })
  return { calls, upload, finish }
}

const LIMITS: UploadLimits = { maxBytes: 1_000, maxFiles: 3, maxConversationBytes: 10_000 }
const file = (name: string, size = 10, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type })
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

function attachments(p = played(), limits: UploadLimits | null = LIMITS) {
  const asked = vi.fn(async () => limits)
  const a = createChatAttachments({ courseId: 'k1', upload: p.upload, limits: asked })
  return { a, p, asked }
}

const refusal = (reason: string, details: Record<string, unknown> = {}, code = 'failed_precondition') =>
  new ApiError({
    status: 422,
    code,
    message: reason,
    details: { reason, ...details },
    actionId: 'a1',
    actionStatus: 'failed',
  })

beforeEach(() => setLocale('en'))
afterEach(() => forgetAttachments())

describe('the files attached to a message', () => {
  it('upload as soon as they are added, and are sent by their tokens and names, in the order added', async () => {
    const { a, p, asked } = attachments()
    await a.add([file('notes.pdf'), file('plot.png', 20, 'image/png')])
    await flush()
    expect(asked).toHaveBeenCalledTimes(1)
    expect(p.calls.map((c) => c.file.name)).toEqual(['notes.pdf', 'plot.png'])
    expect(a.busy.value).toBe(true)
    expect(a.block.value).toBe('uploading')
    // The second is up first; the order sent is still the order added.
    p.finish(p.calls[1]!)
    await flush()
    expect(a.payload()).toEqual([{ upload_token: 'tok-1-plot.png', filename: 'plot.png' }])
    expect(a.block.value).toBe('uploading')
    p.finish(p.calls[0]!)
    await flush()
    expect(a.block.value).toBeNull()
    expect(a.payload()).toEqual([
      { upload_token: 'tok-0-notes.pdf', filename: 'notes.pdf' },
      { upload_token: 'tok-1-plot.png', filename: 'plot.png' },
    ])
    expect(a.files().map((f) => f.name)).toEqual(['notes.pdf', 'plot.png'])
    a.clear()
    expect(a.count.value).toBe(0)
    expect(a.payload()).toEqual([])
  })

  it('takes no more than a message carries, and says how many were left out', async () => {
    const { a, p } = attachments()
    await a.add([file('a'), file('b')])
    await a.add([file('c'), file('d'), file('e')])
    expect(a.items.map((i) => i.name)).toEqual(['a', 'b', 'c'])
    expect(a.full.value).toBe(true)
    expect(a.notice.value).toEqual({ kind: 'tooMany', max: 3, skipped: 2 })
    await flush()
    expect(p.calls).toHaveLength(3)
    // Room again once one is taken off, and nothing more to say.
    a.remove(a.items[0]!.id)
    expect(a.full.value).toBe(false)
    expect(a.notice.value).toBeNull()
  })

  it('carries ten where Core has not said how many', async () => {
    const { a } = attachments(played(), null)
    await a.add(Array.from({ length: 12 }, (_, i) => file(`f${i}`)))
    expect(a.count.value).toBe(DEFAULT_MAX_FILES)
    expect(a.notice.value).toEqual({ kind: 'tooMany', max: 10, skipped: 2 })
  })

  it('fails a file larger than Core takes at once, before anything is sent, and keeps the message waiting for it', async () => {
    const { a, p } = attachments()
    await a.add([file('huge.pdf', 5_000), file('ok.pdf')])
    await flush()
    const [huge, ok] = a.items
    expect(huge!.status).toBe('failed')
    expect(huge!.tooLarge).toBe(true)
    expect(p.calls.map((c) => c.file.name)).toEqual(['ok.pdf'])
    p.finish(p.calls[0]!)
    await flush()
    expect(a.block.value).toBe('failed')
    // Too large is not tried again; taken off, the rest may go.
    a.retry(huge!.id)
    await flush()
    expect(p.calls).toHaveLength(1)
    a.remove(huge!.id)
    expect(a.block.value).toBeNull()
    expect(a.payload()).toEqual([{ upload_token: 'tok-0-ok.pdf', filename: 'ok.pdf' }])
    expect(ok!.status).toBe('done')
  })

  it('tries a failed upload again, and takes one off while it uploads', async () => {
    const { a, p } = attachments()
    await a.add([file('a.pdf'), file('b.pdf')])
    await flush()
    p.calls[0]!.reject(new ApiError({ status: 0, code: 'network', message: 'gone' }))
    await flush()
    expect(a.items[0]!.status).toBe('failed')
    expect(a.failed.value).toHaveLength(1)
    a.retry(a.items[0]!.id)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a.pdf', 'b.pdf', 'a.pdf'])
    a.remove(a.items[1]!.id)
    expect(a.items.map((i) => i.name)).toEqual(['a.pdf'])
  })

  it('says which folders it could not take', async () => {
    const { a } = attachments()
    await a.add([], 2)
    expect(a.notice.value).toEqual({ kind: 'folders', n: 2 })
  })

  it('marks what Core refused as too large, learning its limit, and says why', async () => {
    const { a, p } = attachments(played(), { maxBytes: null, maxFiles: 3, maxConversationBytes: null })
    await a.add([file('small.pdf', 10), file('big.pdf', 900)])
    await flush()
    p.calls.forEach((c) => p.finish(c))
    await flush()
    const e = refusal('file_too_large', { byte_size: 900, max_bytes: 500 })
    expect(a.refused(e)).toBe(true)
    expect(a.items.map((i) => [i.name, i.status, i.tooLarge])).toEqual([
      ['small.pdf', 'done', false],
      ['big.pdf', 'failed', true],
    ])
    expect(a.limits.value?.maxBytes).toBe(500)
    expect(a.notice.value).toEqual({ kind: 'refused', error: e, again: false })
    expect(attachmentRefusalText(e)).toBe(
      'A file is larger than a message may carry (500 B): remove it, or attach a smaller one.',
    )
  })

  it('uploads again what can no longer be attached as it is, to be sent once more', async () => {
    const { a, p } = attachments()
    await a.add([file('a.pdf'), file('b.pdf')])
    await flush()
    p.calls.forEach((c) => p.finish(c))
    await flush()
    const e = refusal('not_uploaded')
    expect(a.refused(e)).toBe(true)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a.pdf', 'b.pdf', 'a.pdf', 'b.pdf'])
    expect(a.block.value).toBe('uploading')
    expect(a.notice.value).toMatchObject({ kind: 'refused', again: true })
  })

  it('leaves alone a refusal that is not about its files', () => {
    const { a } = attachments()
    const closed = new ApiError({ status: 409, code: 'conflict', message: 'closed', details: { reason: 'closed' } })
    expect(a.refused(closed)).toBe(false)
    expect(a.refused(null)).toBe(false)
    expect(a.notice.value).toBeNull()
    expect(attachmentReason(closed)).toBeNull()
    expect(attachmentRefusalText(closed)).toBeNull()
  })

  it('has words for every refusal Core gives because of a message’s files, with sizes as sizes', () => {
    const reasons = [
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
    ]
    for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
      setLocale(locale)
      for (const r of reasons) {
        const text = attachmentRefusalText(refusal(r))
        expect(text, `${locale} ${r}`).toBeTruthy()
        expect(text, `${locale} ${r}`).not.toContain(`chat.attach`)
      }
    }
    setLocale('en')
    expect(attachmentRefusalText(refusal('too_many_attachments', { max_files: 4 }, 'invalid_argument'))).toBe(
      'A message carries at most 4 files: remove some, and send again.',
    )
    expect(
      attachmentRefusalText(
        refusal('conversation_attachments_full', { held_bytes: 400 << 20, max_conversation_bytes: 500 << 20 }),
      ),
    ).toBe('This conversation holds as many files as it can (500 MB in all): start a new conversation to send more.')
  })

  it('has words for why an upload URL or a file is refused, where a chip or a download says it', () => {
    const refused = (reason: string, status = 403) =>
      errorMessage(new ApiError({ status, code: 'forbidden', message: reason, details: { reason } }), {
        reasons: 'chat.attach.refusal',
      })
    expect(refused('permission_denied')).toBe('Your seat in this course may not send files in the chat.')
    expect(refused('not_a_member')).toBe('You no longer have a seat in this course, so no files can be sent in it.')
    expect(refused('membership_not_active')).toBe(
      'Your seat in this course is paused or has ended, so no files can be sent in it.',
    )
    expect(refused('course_archived')).toBe('This course is archived: nothing more can be sent in it.')
    expect(refused('no_file_storage', 422)).toBe(
      'This site has nowhere to keep files, so none can be sent: ask its administrator.',
    )
  })

  it('are kept with their draft for the page’s life, by its key', () => {
    const a = attachmentsFor('k1:c:c1', 'k1')
    expect(attachmentsFor('k1:c:c1', 'k1')).toBe(a)
    expect(attachmentsFor('k1:c:c2', 'k1')).not.toBe(a)
    forgetAttachments()
    expect(attachmentsFor('k1:c:c1', 'k1')).not.toBe(a)
  })

  it('remembers the files a message sent from here carried, for bringing them back', () => {
    const f = file('notes.pdf')
    rememberSent('m1', [f])
    rememberSent('m2', [])
    rememberSent(null, [f])
    expect(sentFilesOf('m1')).toEqual([f])
    expect(sentFilesOf('m2')).toBeNull()
  })
})

describe('what a file is', () => {
  it('goes by its type, and by its name where its type says nothing', () => {
    expect(fileKind('application/pdf')).toBe('pdf')
    expect(fileKind('image/png')).toBe('image')
    expect(fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word')
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('sheet')
    expect(fileKind('text/csv')).toBe('sheet')
    expect(fileKind('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('slides')
    expect(fileKind('application/zip')).toBe('archive')
    expect(fileKind('text/plain; charset=utf-8')).toBe('text')
    expect(fileKind('audio/mpeg')).toBe('audio')
    expect(fileKind('video/mp4')).toBe('video')
    expect(fileKind('application/octet-stream', 'essay.DOCX')).toBe('word')
    expect(fileKind('application/octet-stream', 'data.bin')).toBe('other')
    expect(fileKind('', 'notes')).toBe('other')
  })
})
