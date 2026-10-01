import { describe, expect, it, vi } from 'vitest'
import { ApiError, type UploadedFile } from '@/api/http'
import { createUploadQueue } from '@/composables/useUploadQueue'
import { filesPayload, uploadedPayload, versionFilesOf, versionFilesRefused } from './documentFiles'

describe('versionFilesOf', () => {
  it('lists a version’s files in their order', () => {
    const files = [
      { id: 'b', position: 2, filename: 'b.docx', content_type: 'application/msword', byte_size: 2 },
      { id: 'a', position: 1, filename: 'a.pdf', content_type: 'application/pdf', byte_size: 1 },
    ]
    expect(versionFilesOf({ files, content_type: 'application/pdf' } as never).map((f) => f.id)).toEqual(['a', 'b'])
    // Text alone: none, whatever the deprecated fields might say.
    expect(versionFilesOf({ files: [] } as never)).toEqual([])
  })

  it('reads the deprecated first file’s fields only where files is absent, as one file named after the document', () => {
    const legacy = versionFilesOf(
      { content_type: 'application/pdf', byte_size: 10, download_url: 'http://x/v1/blobs/1', text: null } as never,
      'Week 1',
    )
    expect(legacy).toEqual([
      expect.objectContaining({ id: '', position: 1, filename: 'Week 1.pdf', byte_size: 10, download_url: 'http://x/v1/blobs/1' }),
    ])
  })

  it('has none for a purged version', () => {
    expect(versionFilesOf({ files: [], purged: { reason: 'x' }, content_type: 'application/pdf' } as never)).toEqual([])
    expect(versionFilesOf({ purged_at: '2026-09-30T00:00:00Z', has_file: true } as never)).toEqual([])
  })
})

describe('what a version’s files are sent as', () => {
  it('names each upload, in the order listed', () => {
    const up = (n: string): UploadedFile => ({ uploadToken: `tok-${n}`, fileName: n, contentType: 'x', size: 1 })
    expect(uploadedPayload([up('a.pdf'), up('b.py')])).toEqual([
      { upload_token: 'tok-a.pdf', filename: 'a.pdf' },
      { upload_token: 'tok-b.py', filename: 'b.py' },
    ])
  })
})

describe('versionFilesRefused', () => {
  const file = (name: string, size = 10) => new File([new Uint8Array(size)], name)
  async function uploaded(names: [string, number][]) {
    const upload = vi.fn(async (_c: string, _k: string, f: File) => ({
      uploadToken: `tok-${f.name}-${upload.mock.calls.length}`,
      fileName: f.name,
      contentType: '',
      size: f.size,
    }))
    const q = createUploadQueue({ courseId: 'c', kind: 'material', version: true, upload, limit: async () => null })
    q.add(names.map(([n, s]) => file(n, s)))
    await vi.waitFor(() => expect(q.done.value).toHaveLength(names.length))
    return { q, upload }
  }
  const refusal = (reason: string, details: Record<string, unknown> = {}) =>
    new ApiError({ status: 422, code: 'failed_precondition', message: reason, details: { reason, ...details } })

  it('fails the file too large, as it would have failed before it was sent', async () => {
    const { q } = await uploaded([
      ['a.pdf', 10],
      ['big.pdf', 90],
    ])
    expect(versionFilesRefused(q, refusal('file_too_large', { byte_size: 90, max_bytes: 50 }))).toEqual({ again: false })
    expect(q.items.map((i) => [i.name, i.status, i.tooLarge])).toEqual([
      ['a.pdf', 'done', false],
      ['big.pdf', 'failed', true],
    ])
    expect(q.maxBytes.value).toBe(50)
    expect(filesPayload(q)).toEqual([{ upload_token: 'tok-a.pdf-1', filename: 'a.pdf' }])
  })

  it('uploads again what can no longer be attached as it was', async () => {
    const { q, upload } = await uploaded([
      ['a.pdf', 10],
      ['b.pdf', 10],
    ])
    expect(versionFilesRefused(q, refusal('already_attached'))).toEqual({ again: true })
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(4))
    await vi.waitFor(() => expect(q.done.value).toHaveLength(2))
    expect(filesPayload(q).map((f) => f.upload_token)).toEqual(['tok-a.pdf-3', 'tok-b.pdf-4'])
  })

  it('learns the limit a refusal names, and leaves any other refusal alone', async () => {
    const { q } = await uploaded([
      ['a.pdf', 10],
      ['b.pdf', 10],
      ['c.pdf', 10],
    ])
    versionFilesRefused(q, refusal('too_many_files', { max_files: 2 }))
    expect(q.excess.value).toEqual({ files: 1, bytes: 30 })
    versionFilesRefused(q, refusal('version_too_large', { byte_size: 30, max_version_bytes: 25 }))
    expect(q.maxVersionBytes.value).toBe(25)
    expect(versionFilesRefused(q, refusal('document_archived'))).toBeNull()
    expect(versionFilesRefused(q, new Error('boom'))).toBeNull()
  })
})
