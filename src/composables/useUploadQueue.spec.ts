import { describe, expect, it, vi } from 'vitest'
import { ApiError, FILE_TOO_LARGE, type UploadedFile, type UploadOptions } from '@/api/http'
import { createUploadQueue, type UploadFn } from './useUploadQueue'

interface Call {
  file: File
  opts: UploadOptions
  resolve: (v: UploadedFile) => void
  reject: (e: unknown) => void
  aborted: boolean
}

/** An upload played by the test: each call waits until the test settles it. */
function played() {
  const calls: Call[] = []
  const upload: UploadFn = (_course, _kind, file, opts) =>
    new Promise((resolve, reject) => {
      const call: Call = { file, opts, resolve, reject, aborted: false }
      opts.signal?.addEventListener('abort', () => {
        call.aborted = true
        reject(new DOMException('cancelled', 'AbortError'))
      })
      calls.push(call)
    })
  const uploaded = (c: Call): UploadedFile => ({
    uploadToken: `tok-${c.file.name}`,
    fileName: c.file.name,
    contentType: c.file.type,
    size: c.file.size,
  })
  return { calls, upload, finish: (c: Call) => c.resolve(uploaded(c)) }
}

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'text/plain' })
const flush = () => new Promise((r) => setTimeout(r, 0))

function queue(p: ReturnType<typeof played>, extra: Partial<Parameters<typeof createUploadQueue>[0]> = {}) {
  return createUploadQueue({
    courseId: 'c1',
    kind: 'material',
    concurrency: 2,
    upload: p.upload,
    limit: async () => 1_000,
    ...extra,
  })
}

describe('the upload queue', () => {
  it('uploads a few at a time, in order, and starts the next as each one ends', async () => {
    const p = played()
    const done: string[] = []
    const q = queue(p, { onDone: (i) => done.push(i.name) })
    q.add([file('a'), file('b'), file('c'), file('d')])
    expect(q.busy.value).toBe(true)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'b'])
    expect(q.items.map((i) => i.status)).toEqual(['uploading', 'uploading', 'queued', 'queued'])

    p.finish(p.calls[1]!)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'b', 'c'])
    expect(q.items.map((i) => i.status)).toEqual(['uploading', 'done', 'uploading', 'queued'])
    expect(q.items[1]!.result?.uploadToken).toBe('tok-b')

    p.finish(p.calls[0]!)
    p.finish(p.calls[2]!)
    await flush()
    p.finish(p.calls[3]!)
    await flush()
    expect(q.items.every((i) => i.status === 'done')).toBe(true)
    expect(done).toEqual(['b', 'a', 'c', 'd'])
    expect(q.done.value.map((i) => i.name)).toEqual(['a', 'b', 'c', 'd'])
    expect(q.busy.value).toBe(false)
  })

  it('shows each upload’s progress, speed and time left, and when it will be tried again', async () => {
    const p = played()
    const q = queue(p)
    const [item] = q.add([file('a', 500)])
    await flush()
    const opts = p.calls[0]!.opts
    opts.onProgress!({
      phase: 'sending',
      loaded: 250,
      total: 500,
      fraction: 0.5,
      bytesPerSecond: 100,
      secondsLeft: 3,
      attempt: 1,
    })
    expect(item).toMatchObject({ phase: 'sending', loaded: 250, fraction: 0.5, bytesPerSecond: 100, secondsLeft: 3 })

    vi.spyOn(Date, 'now').mockReturnValue(10_000)
    opts.onRetry!({
      attempt: 2,
      delayMs: 1_000,
      offline: false,
      error: new ApiError({ status: 0, code: 'network', message: 'x' }),
    })
    vi.restoreAllMocks()
    expect(item).toMatchObject({ attempt: 2, retrying: { at: 11_000, offline: false }, bytesPerSecond: null })
    opts.onProgress!({
      phase: 'preparing',
      loaded: 0,
      total: 500,
      fraction: 0,
      bytesPerSecond: null,
      secondsLeft: null,
      attempt: 2,
    })
    expect(item!.retrying).toBeNull()
  })

  it('fails a file larger than Core takes at once, without sending it, and the others go on', async () => {
    const p = played()
    const limit = vi.fn(async () => 1_000)
    const failed: string[] = []
    const q = queue(p, { limit, onFail: (i) => failed.push(i.name) })
    q.add([file('big', 5_000), file('small', 10)])
    // Nothing starts before the limit is known.
    expect(p.calls).toHaveLength(0)
    await flush()
    expect(q.maxBytes.value).toBe(1_000)
    expect(q.items[0]).toMatchObject({ status: 'failed', tooLarge: true })
    expect(failed).toEqual(['big'])
    expect(p.calls.map((c) => c.file.name)).toEqual(['small'])
    // A file too large is not tried again.
    q.retry(q.items[0]!.id)
    expect(q.items[0]!.status).toBe('failed')
    // Asked once only.
    q.add([file('another', 2_000)])
    await flush()
    expect(q.items[2]!.tooLarge).toBe(true)
    expect(limit).toHaveBeenCalledTimes(1)
  })

  it('hands the limit to each upload, and takes Core’s refusal of a file too large as one', async () => {
    const p = played()
    const q = queue(p, { limit: async () => null })
    const [item] = q.add([file('a')])
    await flush()
    expect(p.calls[0]!.opts.maxBytes).toBeNull()
    p.calls[0]!.reject(new ApiError({ status: 413, code: FILE_TOO_LARGE, message: 'too large', details: { size: 10 } }))
    await flush()
    expect(item).toMatchObject({ status: 'failed', tooLarge: true })
  })

  it('cancels an upload on its way, which starts the next, and tries it again when asked', async () => {
    const p = played()
    const q = queue(p, { concurrency: 1 })
    const [a, b] = q.add([file('a'), file('b')])
    await flush()
    q.cancel(a!.id)
    expect(p.calls[0]!.aborted).toBe(true)
    expect(a!.status).toBe('cancelled')
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'b'])
    expect(b!.status).toBe('uploading')

    q.retry(a!.id)
    expect(a!.status).toBe('queued')
    p.finish(p.calls[1]!)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'b', 'a'])
    p.finish(p.calls[2]!)
    await flush()
    expect(a!.status).toBe('done')
  })

  it('keeps a cancelled file that was waiting from starting', async () => {
    const p = played()
    const q = queue(p, { concurrency: 1 })
    const [a, b] = q.add([file('a'), file('b')])
    await flush()
    q.cancel(b!.id)
    p.finish(p.calls[0]!)
    await flush()
    expect(a!.status).toBe('done')
    expect(b!.status).toBe('cancelled')
    expect(p.calls).toHaveLength(1)
    expect(q.busy.value).toBe(false)
  })

  it('says why an upload failed, and tries it again from the start', async () => {
    const p = played()
    const q = queue(p)
    const [a] = q.add([file('a')])
    await flush()
    const err = new ApiError({ status: 0, code: 'network', message: 'upload failed: network error' })
    p.calls[0]!.reject(err)
    await flush()
    expect(a).toMatchObject({ status: 'failed', tooLarge: false, error: err })
    q.retry(a!.id)
    await flush()
    expect(a).toMatchObject({ status: 'uploading', error: null, attempt: 1 })
    p.finish(p.calls[1]!)
    await flush()
    expect(a!.status).toBe('done')
  })

  it('takes an item off the list, stopping its upload, and empties it all when cleared', async () => {
    const p = played()
    const q = queue(p)
    const [a, b, c] = q.add([file('a'), file('b'), file('c')])
    await flush()
    q.remove(a!.id)
    expect(p.calls[0]!.aborted).toBe(true)
    expect(q.items.map((i) => i.name)).toEqual(['b', 'c'])
    await flush()
    expect(c!.status).toBe('uploading')
    q.clear()
    expect(q.items).toHaveLength(0)
    expect(p.calls[1]!.aborted).toBe(true)
    expect(p.calls[2]!.aborted).toBe(true)
    expect(b).toBeDefined()
  })
  it('fails an uploaded item after the fact, as a refusal where it was attached says, to be tried again', async () => {
    const p = played()
    const failed: string[] = []
    const q = queue(p, { onFail: (i) => failed.push(i.name) })
    const [a, b] = q.add([file('a'), file('big', 500)])
    await flush()
    p.finish(p.calls[0]!)
    p.finish(p.calls[1]!)
    await flush()
    expect(q.done.value).toHaveLength(2)

    const gone = new ApiError({
      status: 422,
      code: 'failed_precondition',
      message: 'not uploaded',
      details: { reason: 'not_uploaded' },
    })
    q.fail(a!.id, gone)
    expect(a!.status).toBe('failed')
    expect(a!.result).toBeNull()
    expect(a!.error).toBe(gone)
    expect(a!.tooLarge).toBe(false)
    q.retry(a!.id)
    await flush()
    expect(p.calls).toHaveLength(3)

    // Too large (Core deleted it): not tried again.
    q.fail(b!.id, new ApiError({ status: 422, code: FILE_TOO_LARGE, message: 'too large' }))
    expect(b!.tooLarge).toBe(true)
    q.retry(b!.id)
    await flush()
    expect(p.calls).toHaveLength(3)
    expect(failed).toEqual(['a', 'big'])
    // Only what is done can fail so.
    q.fail(a!.id, gone)
    expect(a!.status).toBe('uploading')
  })
})

describe('one version’s files', () => {
  const versionLimits = (maxFiles: number, maxVersionBytes: number) => async () => ({
    maxBytes: 1_000,
    maxFiles,
    maxConversationBytes: null,
    maxVersionBytes,
  })

  it('lets files in, in the order listed, while a version has room, and fails the rest before sending them', async () => {
    const p = played()
    const q = queue(p, { version: true, concurrency: 5, limit: versionLimits(3, 250) })
    q.add([file('a', 100), file('b', 200), file('c', 100), file('d', 10), file('e', 10)])
    await flush()
    // b would make 300 B of 250; a, c and d fill the three places; e is a fourth.
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'c', 'd'])
    expect(q.items.map((i) => [i.name, i.status, i.overLimit])).toEqual([
      ['a', 'uploading', null],
      ['b', 'failed', 'bytes'],
      ['c', 'uploading', null],
      ['d', 'uploading', null],
      ['e', 'failed', 'files'],
    ])
    expect(q.maxFiles.value).toBe(3)
    expect(q.maxVersionBytes.value).toBe(250)

    // Taken off, one makes room for another, tried again.
    q.remove(q.items[2]!.id)
    q.retry(q.items.find((i) => i.name === 'e')!.id)
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'c', 'd', 'e'])
    expect(q.items.find((i) => i.name === 'e')!.status).toBe('uploading')
  })

  it('does not hold files that are not one version’s', async () => {
    const p = played()
    const q = queue(p, { concurrency: 5, limit: versionLimits(1, 10) })
    q.add([file('a', 100), file('b', 100)])
    await flush()
    expect(p.calls.map((c) => c.file.name)).toEqual(['a', 'b'])
    expect(q.excess.value).toBeNull()
  })

  it('moves a file to another place in the list', async () => {
    const p = played()
    const q = queue(p, { version: true, limit: versionLimits(10, 10_000) })
    q.add([file('a'), file('b'), file('c')])
    q.move(q.items[2]!.id, 0)
    expect(q.items.map((i) => i.name)).toEqual(['c', 'a', 'b'])
    q.move(q.items[0]!.id, 99)
    expect(q.items.map((i) => i.name)).toEqual(['a', 'b', 'c'])
  })

  it('says what is too much once a refusal teaches a smaller limit', async () => {
    const p = played()
    const q = queue(p, { version: true, concurrency: 5, limit: versionLimits(10, 10_000) })
    q.add([file('a', 100), file('b', 100), file('c', 100)])
    await flush()
    for (const c of p.calls) p.finish(c)
    await flush()
    expect(q.excess.value).toBeNull()
    q.learn({ maxFiles: 2 })
    expect(q.excess.value).toEqual({ files: 1, bytes: 300 })
    q.learn({ maxFiles: 5, maxVersionBytes: 250 })
    expect(q.excess.value).toEqual({ files: 0, bytes: 300 })
    q.remove(q.items[0]!.id)
    expect(q.excess.value).toBeNull()
  })
})
