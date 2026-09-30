import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  fetchBlob,
  forgetUploadLimits,
  isAbort,
  isFileTooLarge,
  knownUploadLimit,
  knownUploadLimits,
  uploadFile,
  uploadLimit,
  uploadLimits,
  type UploadProgress,
  type UploadRetry,
} from './http'

// The browser's XMLHttpRequest, played: each PUT is kept for the test to
// answer, report progress on, or break off.
class FakeXhr {
  static sent: FakeXhr[] = []
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown
  status = 0
  responseText = ''
  aborted = false
  upload: { onprogress: ((ev: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send(body: unknown) {
    this.body = body
    FakeXhr.sent.push(this)
  }
  abort() {
    this.aborted = true
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true } as ProgressEvent)
  }
  answer(status: number, body = '') {
    this.upload.onload?.()
    this.status = status
    this.responseText = body
    this.onload?.()
  }
  breakOff() {
    this.onerror?.()
  }
}

let urlCalls: string[] = []
let urlAnswers: Array<() => Response> = []
let seq = 0

function target(maxBytes = 50 << 20, more: Record<string, unknown> = {}) {
  seq++
  return () =>
    new Response(
      JSON.stringify({
        status: 'executed',
        result: {
          upload_url: `http://core.test/v1/blobs/put-${seq}`,
          upload_token: `tok-${seq}`,
          headers: { 'Content-Type': 'application/pdf' },
          expires_at: '2026-09-30T00:15:00Z',
          max_bytes: maxBytes,
          ...more,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
}

const file = (size: number, name = 'slides.pdf', type = 'application/pdf') =>
  new File([new Uint8Array(size)], name, { type })

/** The PUTs sent so far, once there are n of them. */
async function puts(n: number): Promise<FakeXhr[]> {
  await vi.waitFor(() => expect(FakeXhr.sent.length).toBe(n))
  return FakeXhr.sent
}

beforeEach(() => {
  FakeXhr.sent = []
  urlCalls = []
  urlAnswers = []
  seq = 0
  forgetUploadLimits()
  vi.useFakeTimers()
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  vi.stubGlobal('fetch', async (url: string) => {
    urlCalls.push(url)
    const next = urlAnswers.shift()
    if (!next) throw new Error(`no answer queued for ${url}`)
    return next()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('uploadFile', () => {
  it('asks where to put the file, PUTs it there and hands back the upload token', async () => {
    urlAnswers.push(target())
    const done = uploadFile('c1', 'material', file(1000))
    const [xhr] = await puts(1)
    // A document's file is named where its URL is asked for.
    expect(urlCalls[0]).toBe('/v1/courses/c1/upload-url?kind=material&content_type=application%2Fpdf&filename=slides.pdf')
    expect(xhr!.method).toBe('PUT')
    expect(xhr!.url).toBe('/v1/blobs/put-1')
    expect(xhr!.headers['Content-Type']).toBe('application/pdf')
    xhr!.answer(200, '{"byte_size":1000}')
    await expect(done).resolves.toEqual({
      uploadToken: 'tok-1',
      fileName: 'slides.pdf',
      contentType: 'application/pdf',
      size: 1000,
    })
  })

  it('reports how far it has come, how fast, and how long the rest will take', async () => {
    urlAnswers.push(target())
    const seen: UploadProgress[] = []
    const done = uploadFile('c1', 'material', file(10_000_000), { onProgress: (p) => seen.push({ ...p }) })
    const [xhr] = await puts(1)
    expect(seen.map((p) => p.phase)).toEqual(['preparing', 'sending'])
    // A megabyte a second, from when sending began.
    vi.advanceTimersByTime(2_000)
    xhr!.progress(2_000_000, 10_000_000)
    vi.advanceTimersByTime(2_000)
    xhr!.progress(4_000_000, 10_000_000)
    const last = seen[seen.length - 1]!
    expect(last).toMatchObject({ phase: 'sending', loaded: 4_000_000, total: 10_000_000, fraction: 0.4, attempt: 1 })
    expect(last.bytesPerSecond).toBeGreaterThan(950_000)
    expect(last.bytesPerSecond).toBeLessThanOrEqual(1_000_000)
    expect([6, 7]).toContain(last.secondsLeft)
    xhr!.answer(200)
    await done
    expect(seen[seen.length - 1]).toMatchObject({ phase: 'finishing', fraction: 1, loaded: 10_000_000 })
  })

  it('refuses a file larger than the known limit before anything is asked or sent', async () => {
    const err = await uploadFile('c1', 'material', file(2_000), { maxBytes: 1_000 }).catch((e) => e)
    expect(isFileTooLarge(err)).toBe(true)
    expect(err.details).toEqual({ size: 2_000, max_bytes: 1_000 })
    expect(urlCalls).toEqual([])
    expect(FakeXhr.sent).toEqual([])
  })

  it('refuses a file larger than the upload URL says, without sending it, and remembers the limit', async () => {
    urlAnswers.push(target(1_000))
    const err = await uploadFile('c1', 'submission', file(2_000)).catch((e) => e)
    expect(isFileTooLarge(err)).toBe(true)
    expect(FakeXhr.sent).toEqual([])
    expect(knownUploadLimit('c1', 'submission')).toBe(1_000)
    // The next one is refused at once.
    const again = await uploadFile('c1', 'submission', file(3_000)).catch((e) => e)
    expect(isFileTooLarge(again)).toBe(true)
    expect(urlCalls).toHaveLength(1)
  })

  it('takes a 413 from a proxy on the way as a file too large', async () => {
    urlAnswers.push(target(10_000))
    const done = uploadFile('c1', 'material', file(5_000)).catch((e) => e)
    const [xhr] = await puts(1)
    xhr!.answer(413, '<html>Request Entity Too Large</html>')
    const err = await done
    expect(isFileTooLarge(err)).toBe(true)
    expect(err.details).toEqual({ size: 5_000, max_bytes: 10_000 })
  })

  it('tries a transfer that broke off again, at a fresh URL, after a second', async () => {
    urlAnswers.push(target(), target())
    const retries: UploadRetry[] = []
    const done = uploadFile('c1', 'material', file(1000), { onRetry: (r) => retries.push(r) })
    const [first] = await puts(1)
    first!.breakOff()
    await vi.advanceTimersByTimeAsync(0)
    expect(retries).toHaveLength(1)
    expect(retries[0]).toMatchObject({ attempt: 2, delayMs: 1_000, offline: false })
    expect(retries[0]!.error.isNetwork).toBe(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(FakeXhr.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    const [, second] = await puts(2)
    expect(second!.url).toBe('/v1/blobs/put-2')
    second!.answer(200)
    await expect(done).resolves.toMatchObject({ uploadToken: 'tok-2' })
  })

  it('tries a gateway error again, waiting twice as long each time, and gives up after the retries', async () => {
    urlAnswers.push(target(), target(), target())
    const retries: UploadRetry[] = []
    const done = uploadFile('c1', 'material', file(10), { retries: 2, onRetry: (r) => retries.push(r) }).catch((e) => e)
    ;(await puts(1))[0]!.answer(502, '')
    await vi.advanceTimersByTimeAsync(1_000)
    ;(await puts(2))[1]!.answer(503, '{"error":{"code":"unavailable","message":"busy"}}')
    await vi.advanceTimersByTimeAsync(2_000)
    ;(await puts(3))[2]!.answer(504, '')
    const err = await done
    expect(retries.map((r) => [r.attempt, r.delayMs])).toEqual([
      [2, 1_000],
      [3, 2_000],
    ])
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(504)
  })

  it('does not try a refusal again, and says it in Core’s words', async () => {
    urlAnswers.push(target())
    const done = uploadFile('c1', 'material', file(10)).catch((e) => e)
    ;(await puts(1))[0]!.answer(
      403,
      '{"error":{"code":"forbidden","message":"the upload URL is not valid, or has expired"}}',
    )
    const err = await done
    expect(err.code).toBe('forbidden')
    expect(err.message).toBe('the upload URL is not valid, or has expired')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(FakeXhr.sent).toHaveLength(1)
  })

  it('gives up a transfer on which nothing has moved for a minute, and tries it again', async () => {
    urlAnswers.push(target(), target())
    const done = uploadFile('c1', 'material', file(1000))
    const [first] = await puts(1)
    first!.progress(100, 1000)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(first!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(first!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    ;(await puts(2))[1]!.answer(200)
    await expect(done).resolves.toMatchObject({ uploadToken: 'tok-2' })
  })

  it('waits for the browser to be online again before trying again', async () => {
    urlAnswers.push(target(), target())
    const retries: UploadRetry[] = []
    const done = uploadFile('c1', 'material', file(10), { onRetry: (r) => retries.push(r) })
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    ;(await puts(1))[0]!.breakOff()
    await vi.waitFor(() => expect(retries).toHaveLength(1))
    expect(retries[0]!.offline).toBe(true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeXhr.sent).toHaveLength(1)
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    ;(await puts(2))[1]!.answer(200)
    await expect(done).resolves.toMatchObject({ uploadToken: 'tok-2' })
    online.mockRestore()
  })

  it('is cancelled by its signal while sending, and while waiting to try again', async () => {
    urlAnswers.push(target(), target())
    const ctrl = new AbortController()
    const done = uploadFile('c1', 'material', file(10), { signal: ctrl.signal }).catch((e) => e)
    const [xhr] = await puts(1)
    ctrl.abort()
    expect(isAbort(await done)).toBe(true)
    expect(xhr!.aborted).toBe(true)

    const ctrl2 = new AbortController()
    const again = uploadFile('c1', 'material', file(10), { signal: ctrl2.signal }).catch((e) => e)
    ;(await puts(2))[1]!.breakOff()
    await vi.advanceTimersByTimeAsync(500)
    ctrl2.abort()
    expect(isAbort(await again)).toBe(true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeXhr.sent).toHaveLength(2)
  })
})

describe('uploadLimit', () => {
  it('asks Core once, and says what an upload URL said', async () => {
    urlAnswers.push(target(4_096))
    const [a, b] = await Promise.all([uploadLimit('c1', 'feedback'), uploadLimit('c1', 'feedback')])
    expect(a).toBe(4_096)
    expect(b).toBe(4_096)
    expect(urlCalls).toEqual(['/v1/courses/c1/upload-url?kind=feedback&content_type=application%2Foctet-stream'])
    expect(await uploadLimit('c1', 'feedback')).toBe(4_096)
    expect(urlCalls).toHaveLength(1)
  })

  it('is null when Core cannot be asked', async () => {
    urlAnswers.push(
      () =>
        new Response(
          JSON.stringify({ status: 'denied', action_id: 'a1', error: { code: 'forbidden', message: 'no' } }),
          {
            status: 403,
          },
        ),
    )
    expect(await uploadLimit('c1', 'material')).toBeNull()
  })
})

describe('a document version’s files', () => {
  it('are named at their upload URL as Core takes a name, and what a version holds is learnt', async () => {
    urlAnswers.push(target(8_000, { max_files: 20, max_version_bytes: 200_000 }))
    // A name Core would refuse: a character that turns the text round, and a slash.
    const done = uploadFile('c1', 'material', file(1000, 'notes\u202e/fdp.exe'))
    const [xhr] = await puts(1)
    expect(new URL(urlCalls[0]!, 'http://x').searchParams.get('filename')).toBe('notes fdp.exe')
    xhr!.answer(200, '{}')
    expect((await done).fileName).toBe('notes fdp.exe')
    expect(knownUploadLimits('c1', 'material')).toEqual({
      maxBytes: 8_000,
      maxFiles: 20,
      maxConversationBytes: null,
      maxVersionBytes: 200_000,
    })
  })
})

describe('a conversation’s files', () => {
  it('are uploaded at conversation.upload_url, whose limits are learnt with the file’s largest size', async () => {
    urlAnswers.push(target(8_000, { max_files: 4, max_conversation_bytes: 90_000 }))
    const done = uploadFile('c1', 'conversation', file(1000))
    const [xhr] = await puts(1)
    expect(urlCalls[0]).toBe('/v1/courses/c1/conversations/upload-url?content_type=application%2Fpdf')
    expect(xhr!.url).toBe('/v1/blobs/put-1')
    xhr!.answer(200, '{}')
    expect(await done).toEqual({
      uploadToken: 'tok-1',
      fileName: 'slides.pdf',
      contentType: 'application/pdf',
      size: 1000,
    })
    expect(knownUploadLimits('c1', 'conversation')).toEqual({
      maxBytes: 8_000,
      maxFiles: 4,
      maxConversationBytes: 90_000,
      maxVersionBytes: null,
    })
    // A document's limit is another's.
    expect(knownUploadLimit('c1', 'material')).toBeNull()
    // Larger than that, refused before anything is asked or sent.
    await expect(uploadFile('c1', 'conversation', file(9_000))).rejects.toSatisfy(isFileTooLarge)
    expect(urlCalls).toHaveLength(1)
  })

  it('are limited as Core says, asked once', async () => {
    urlAnswers.push(target(8_000, { max_files: 4, max_conversation_bytes: 90_000 }))
    const [a, b] = await Promise.all([uploadLimits('c1', 'conversation'), uploadLimit('c1', 'conversation')])
    expect(a).toEqual({ maxBytes: 8_000, maxFiles: 4, maxConversationBytes: 90_000, maxVersionBytes: null })
    expect(b).toBe(8_000)
    expect(urlCalls).toEqual(['/v1/courses/c1/conversations/upload-url?content_type=application%2Foctet-stream'])
  })
})

describe('fetchBlob', () => {
  it('fetches a download URL as it is, with no credentials, Core’s own store through this origin', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response('png', { status: 200, headers: { 'Content-Type': 'image/png' } })
    })
    const blob = await fetchBlob('http://core.test/v1/blobs/get-1?sig=x')
    expect(await blob.text()).toBe('png')
    expect(seen[0]!.url).toBe('/v1/blobs/get-1?sig=x')
    expect(seen[0]!.init.credentials).toBe('omit')
    expect((seen[0]!.init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
  })

  it('says a refusal as a failure with its status', async () => {
    vi.stubGlobal('fetch', async () => new Response('no', { status: 403 }))
    await expect(fetchBlob('https://bucket.test/x')).rejects.toMatchObject({ status: 403 })
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchBlob('https://bucket.test/x')).rejects.toMatchObject({ status: 0, code: 'network' })
  })
})
