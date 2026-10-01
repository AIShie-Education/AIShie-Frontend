import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectUrls } from './objectUrls'

let made = 0
const revoked: string[] = []
beforeEach(() => {
  made = 0
  revoked.length = 0
  URL.createObjectURL = vi.fn(() => `blob:local/${++made}`)
  URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u))
})
afterEach(() => vi.restoreAllMocks())

describe('ObjectUrls', () => {
  it('makes an object URL of a blob, and revokes it once', () => {
    const urls = new ObjectUrls()
    const a = urls.make(new Blob(['a']))
    expect(a).toBe('blob:local/1')
    expect(urls.size).toBe(1)
    urls.revoke(a)
    urls.revoke(a)
    expect(revoked).toEqual(['blob:local/1'])
    expect(urls.size).toBe(0)
  })

  it('revokes every one it made together, and none it did not make', () => {
    const urls = new ObjectUrls()
    urls.make(new Blob(['a']))
    urls.make(new Blob(['b']))
    urls.revoke('blob:someone-else')
    urls.revoke(null)
    urls.revokeAll()
    expect(revoked).toEqual(['blob:local/1', 'blob:local/2'])
    expect(urls.size).toBe(0)
    urls.revokeAll()
    expect(revoked).toHaveLength(2)
  })
})
