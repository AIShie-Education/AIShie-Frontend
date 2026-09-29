import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { CHECK_MS, MIN_GAP_MS } from '@/composables/useNewVersion'

const { i18n, setLocale } = await import('@/i18n')
const { default: NewVersionNotice } = await import('./NewVersionNotice.vue')

/** What index.html names as its entry now, as the server would answer. */
let live = '/assets/index-OLD.js'
const fetch = vi.fn(async () => new Response(`<script type="module" crossorigin src="${live}"></script>`))

let visibility: DocumentVisibilityState = 'visible'
function show(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

function mountNotice(opts: { enabled?: boolean; loaded?: string | null } = {}) {
  return mount(NewVersionNotice, {
    props: {
      options: {
        enabled: opts.enabled ?? true,
        loaded: opts.loaded === undefined ? '/assets/index-OLD.js' : opts.loaded,
        fetch: fetch as unknown as typeof globalThis.fetch,
      },
    },
    global: { plugins: [i18n, ElementPlus], components: icons },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  setLocale('zh-Hant')
  live = '/assets/index-OLD.js'
  fetch.mockClear()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})
afterEach(() => vi.useRealTimers())
enableAutoUnmount(afterEach)

describe('NewVersionNotice', () => {
  it('reads index.html every five minutes while the page is shown, and says nothing while it is the same build', async () => {
    const w = mountNotice()
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/', expect.objectContaining({ cache: 'no-store' }))
    expect(w.find('.new-version').exists()).toBe(false)
    // Hidden: no reads.
    show('hidden')
    await vi.advanceTimersByTimeAsync(CHECK_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('says a new version is out when index.html names another build, and never reloads by itself', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
    const w = mountNotice()
    live = '/assets/index-NEW.js'
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    await flushPromises()
    const notice = w.get('.new-version')
    expect(notice.attributes('role')).toBe('status')
    expect(notice.text()).toContain('已有新版本')
    expect(w.get('.new-version__reload').text()).toBe('重新載入')
    expect(w.get('.new-version__later').text()).toBe('稍後')
    await vi.advanceTimersByTimeAsync(CHECK_MS * 3)
    expect(reload).not.toHaveBeenCalled()
    await w.get('.new-version__reload').trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('checks when the page is shown again, not more than twice a minute', async () => {
    const w = mountNotice()
    live = '/assets/index-NEW.js'
    show('hidden')
    await vi.advanceTimersByTimeAsync(MIN_GAP_MS)
    show('visible')
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(w.find('.new-version').exists()).toBe(true)
    show('hidden')
    show('visible')
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('puts it away with Later, for that build; a later build is news again', async () => {
    const w = mountNotice()
    live = '/assets/index-NEW.js'
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    await w.get('.new-version__later').trigger('click')
    await flushPromises()
    expect(w.find('.new-version').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    expect(w.find('.new-version').exists()).toBe(false)
    live = '/assets/index-NEWER.js'
    await vi.advanceTimersByTimeAsync(CHECK_MS)
    await flushPromises()
    expect(w.find('.new-version').exists()).toBe(true)
  })

  it('does nothing in development, nor where the page’s own build cannot be told', async () => {
    mountNotice({ enabled: false })
    mountNotice({ loaded: null })
    live = '/assets/index-NEW.js'
    await vi.advanceTimersByTimeAsync(CHECK_MS * 2)
    show('visible')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops when it is gone', async () => {
    const w = mountNotice()
    w.unmount()
    await vi.advanceTimersByTimeAsync(CHECK_MS * 2)
    expect(fetch).not.toHaveBeenCalled()
  })
})
