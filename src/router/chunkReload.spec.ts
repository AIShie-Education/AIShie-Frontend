import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { RELOAD_WINDOW_MS, claimReload, installChunkReload, isChunkLoadError } from './chunkReload'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    map: m,
  }
}

const chromeError = () => new TypeError('Failed to fetch dynamically imported module: http://x/assets/AView-Ab12.js')

describe('isChunkLoadError', () => {
  it('knows each browser’s words for a chunk that did not load, and Vite’s', () => {
    expect(isChunkLoadError(chromeError())).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: http://x/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/AView-Cd34.css'))).toBe(true)
  })
  it('leaves every other error alone', () => {
    expect(isChunkLoadError(new Error('forbidden: not permitted'))).toBe(false)
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })).toBe(false)
  })
})

describe('claimReload', () => {
  it('allows one reload to a target, and not another within the window', () => {
    const s = memoryStorage()
    expect(claimReload('/courses/c1/grades', 1_000, s)).toBe(true)
    expect(claimReload('/courses/c1/grades', 1_000 + RELOAD_WINDOW_MS - 1, s)).toBe(false)
  })
  it('allows it again once the window has passed', () => {
    const s = memoryStorage()
    expect(claimReload('/a', 1_000, s)).toBe(true)
    expect(claimReload('/a', 1_000 + RELOAD_WINDOW_MS, s)).toBe(true)
  })
  it('does not hold one target’s reload against another', () => {
    const s = memoryStorage()
    expect(claimReload('/a', 1_000, s)).toBe(true)
    expect(claimReload('/b', 1_001, s)).toBe(true)
    // …and the marker is now /b's, so /a may reload again.
    expect(claimReload('/a', 1_002, s)).toBe(true)
  })
  it('does not trust a marker from the future (a clock set back)', () => {
    const s = memoryStorage()
    expect(claimReload('/a', 50_000, s)).toBe(true)
    expect(claimReload('/a', 10_000, s)).toBe(true)
  })
  it('treats a marker that does not parse as none', () => {
    const s = memoryStorage()
    s.map.set('aishiteru.chunkReload', '{not json')
    expect(claimReload('/a', 1_000, s)).toBe(true)
    expect(claimReload('/a', 1_001, s)).toBe(false)
  })
  it('refuses when there is nowhere to record the attempt, since nothing would stop a loop', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(claimReload('/a', 1_000, broken)).toBe(false)
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(claimReload('/a', 1_000, full)).toBe(false)
  })
})

describe('installChunkReload', () => {
  let uninstall: (() => void) | undefined
  afterEach(() => {
    uninstall?.()
    uninstall = undefined
  })

  function setup(loadB: () => Promise<unknown>) {
    const router: Router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => null } },
        { path: '/b/:id', component: loadB },
      ],
    })
    const assign = vi.fn()
    const reload = vi.fn()
    let t = 1_000
    const storage = memoryStorage()
    uninstall = installChunkReload(router, { assign, reload, storage, now: () => t })
    return { router, assign, reload, storage, advance: (ms: number) => (t += ms) }
  }

  it('reloads at the route being navigated to when its chunk is gone, once', async () => {
    const { router, assign } = setup(() => Promise.reject(chromeError()))
    await router.push('/')
    await router.push('/b/1?tab=x#top').catch(() => {})
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/b/1?tab=x#top')
    // The reload came back to the same failure: no second reload.
    await router.push('/').catch(() => {})
    await router.push('/b/1?tab=x#top').catch(() => {})
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('never writes a fragment down, and loads the page it is at again rather than moving to its fragment', async () => {
    // The welcome page opened from an invitation link, its chunk gone.
    window.history.replaceState(null, '', '/b/7#token=aisinv_secret')
    try {
      const { router, assign, reload, storage } = setup(() => Promise.reject(chromeError()))
      await router.push('/b/7#token=aisinv_secret').catch(() => {})
      expect(assign).not.toHaveBeenCalled()
      expect(reload).toHaveBeenCalledTimes(1)
      expect(JSON.parse(storage.map.get('aishiteru.chunkReload')!).target).toBe('/b/7')
      expect([...storage.map.values()].join()).not.toContain('aisinv_secret')
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('keeps the fragment of another page it goes to in the address, not in storage', async () => {
    const { router, assign, reload, storage } = setup(() => Promise.reject(chromeError()))
    await router.push('/')
    await router.push('/b/8?x=1#token=aisinv_secret').catch(() => {})
    expect(reload).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/b/8?x=1#token=aisinv_secret')
    expect(JSON.parse(storage.map.get('aishiteru.chunkReload')!).target).toBe('/b/8?x=1')
  })

  it('does nothing for a navigation that fails for another reason', async () => {
    const { router, assign, reload } = setup(() => Promise.reject(new Error('boom')))
    await router.push('/')
    await router.push('/b/1').catch(() => {})
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('leaves Vite’s preload error to the router during a navigation, so the import is not swallowed', async () => {
    let event: Event | undefined
    const { router, assign, reload } = setup(() => {
      event = new Event('vite:preloadError', { cancelable: true })
      window.dispatchEvent(event)
      return Promise.reject(chromeError())
    })
    await router.push('/')
    await router.push('/b/2').catch(() => {})
    expect(event?.defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith('/b/2')
  })

  it('reloads where the page is for a preload error outside a navigation', async () => {
    const { router, reload, storage } = setup(() => Promise.resolve({ render: () => null }))
    await router.push('/')
    window.history.replaceState(null, '', '/?q=1#token=aisinv_secret')
    try {
      const event = new Event('vite:preloadError', { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(reload).toHaveBeenCalledTimes(1)
      // Where it was, without the fragment.
      expect(JSON.parse(storage.map.get('aishiteru.chunkReload')!).target).toBe('/?q=1')
      // Straight after that reload, the same failure is left to surface.
      const again = new Event('vite:preloadError', { cancelable: true })
      window.dispatchEvent(again)
      expect(again.defaultPrevented).toBe(false)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })
})
