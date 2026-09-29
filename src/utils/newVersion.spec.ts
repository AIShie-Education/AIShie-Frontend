import { describe, expect, it, vi } from 'vitest'
import { entryScriptOf, liveEntry, loadedEntry, normalEntry } from './newVersion'

const page = (entry: string) =>
  `<!doctype html><html><head><script>/* theme */</script>` +
  `<script type="module" crossorigin src="${entry}"></script>` +
  `<link rel="modulepreload" crossorigin href="/assets/vendor-x.js"></head><body></body></html>`

describe('the entry script', () => {
  it('is found in a page by its hashed name under assets/', () => {
    expect(entryScriptOf(page('/assets/index-BC0PvEJ_.js'))).toBe('/assets/index-BC0PvEJ_.js')
    expect(entryScriptOf(page('https://app.example/assets/index-abc.js'))).toBe('/assets/index-abc.js')
    // In development there is none: the page loads its sources.
    expect(entryScriptOf(page('/src/main.ts'))).toBeNull()
    expect(entryScriptOf('<p>not the app</p>')).toBeNull()
    expect(normalEntry('/assets/vendor-x.js')).toBeNull()
  })

  it('is read from the document this page loaded', () => {
    const s = document.createElement('script')
    s.type = 'module'
    s.setAttribute('src', '/assets/index-OLD.js')
    document.head.appendChild(s)
    expect(loadedEntry()).toBe('/assets/index-OLD.js')
    s.remove()
    expect(loadedEntry()).toBeNull()
  })

  it('is read live from index.html, with nothing cached, and a failure is no news', async () => {
    const fetch = vi.fn(async () => new Response(page('/assets/index-NEW.js'), { status: 200 }))
    expect(await liveEntry(fetch as unknown as typeof globalThis.fetch)).toBe('/assets/index-NEW.js')
    expect(fetch).toHaveBeenCalledWith('/', expect.objectContaining({ cache: 'no-store' }))
    const failed = vi.fn(async () => new Response('down', { status: 502 }))
    expect(await liveEntry(failed as unknown as typeof globalThis.fetch)).toBeNull()
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await liveEntry(offline as unknown as typeof globalThis.fetch)).toBeNull()
  })
})
