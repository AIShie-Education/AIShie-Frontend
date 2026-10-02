import { effectScope, ref } from 'vue'
import type { Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeAllOverlays, installBackCloses, isSamePage, useBackCloses } from './useBackCloses'

// Back closes the overlay on top, with jsdom's history: each test starts on a
// page's own entry, marked so that it is known again, and leaves history
// there. jsdom moves through history a task later and says so with
// popstate, as a browser does: what follows from it is waited for.

let page = 0
/** The page's own entry, which back from an overlay comes to. */
let pageState: { page: number }

beforeEach(() => {
  page++
  pageState = { page }
  history.pushState(pageState, '')
})

afterEach(async () => {
  await closeAllOverlays()
})

/** Whether history is at the page's own entry. */
function atPage() {
  return (history.state as { page?: number; aishieOverlay?: unknown } | null)?.page === page && !overlayHere()
}
function overlayHere() {
  return !!(history.state as { aishieOverlay?: unknown } | null)?.aishieOverlay
}
function depthHere(): number {
  return (history.state as { aishieOverlay?: { depth: number } } | null)?.aishieOverlay?.depth ?? 0
}

/** History has come to rest where `check` says, once every step it was sent on has landed. */
async function settles(check: () => void) {
  await vi.waitFor(check, { timeout: 5_000 })
  // A step that would follow it comes a task later.
  await new Promise((r) => setTimeout(r, 20))
  check()
}

/** An overlay: open or not, and closed by back through useBackCloses. */
function overlay(opts: { when?: () => boolean } = {}) {
  const open = ref(false)
  const close = vi.fn(() => (open.value = false))
  const scope = effectScope()
  scope.run(() => useBackCloses(open, close, opts))
  return { open, close, scope }
}

describe('useBackCloses', () => {
  it('adds an entry at the same address as it opens, and back closes it', async () => {
    const viewer = overlay()
    const length = history.length
    const href = location.href
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(1))
    expect(history.length).toBe(length + 1)
    expect(location.href).toBe(href)
    // The router's state is kept in the entry added.
    expect(history.state).toMatchObject(pageState)

    history.back()
    await settles(() => expect(viewer.open.value).toBe(false))
    expect(viewer.close).toHaveBeenCalledTimes(1)
    expect(atPage()).toBe(true)
  })

  it('closed by its own button, it goes back once: history is as it was', async () => {
    const viewer = overlay()
    const length = history.length
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(1))
    viewer.open.value = false
    await settles(() => expect(atPage()).toBe(true))
    expect(viewer.close).not.toHaveBeenCalled()
    // Opened again, its entry takes the place of the one before: none piles up.
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(1))
    expect(history.length).toBe(length + 1)
    viewer.open.value = false
    await settles(() => expect(atPage()).toBe(true))
  })

  it('opened and closed before its entry was added, it adds none', async () => {
    const viewer = overlay()
    viewer.open.value = true
    viewer.open.value = false
    await settles(() => expect(atPage()).toBe(true))
  })

  it('unwinds overlays opened over one another one at a time, the top one first', async () => {
    const chat = overlay()
    const viewer = overlay()
    chat.open.value = true
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(2))

    history.back()
    await settles(() => expect(viewer.open.value).toBe(false))
    expect(chat.open.value).toBe(true)
    expect(depthHere()).toBe(1)

    history.back()
    await settles(() => expect(chat.open.value).toBe(false))
    expect(atPage()).toBe(true)
    expect(chat.close).toHaveBeenCalledTimes(1)
    expect(viewer.close).toHaveBeenCalledTimes(1)
  })

  it('the top one closed by its button goes back over its entry alone', async () => {
    const chat = overlay()
    const viewer = overlay()
    chat.open.value = true
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(2))
    viewer.open.value = false
    await settles(() => expect(depthHere()).toBe(1))
    expect(chat.open.value).toBe(true)
    history.back()
    await settles(() => expect(chat.open.value).toBe(false))
    expect(atPage()).toBe(true)
  })

  it('one closed from under another keeps its entry until the top one goes, then both are gone back over', async () => {
    const chat = overlay()
    const viewer = overlay()
    chat.open.value = true
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(2))
    chat.open.value = false
    await settles(() => expect(depthHere()).toBe(2))
    viewer.open.value = false
    await settles(() => expect(atPage()).toBe(true))
    expect(chat.close).not.toHaveBeenCalled()
    expect(viewer.close).not.toHaveBeenCalled()
  })

  it('back to an entry kept for one already closed goes on to the page', async () => {
    const chat = overlay()
    const viewer = overlay()
    chat.open.value = true
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(2))
    chat.open.value = false
    history.back()
    await settles(() => expect(atPage()).toBe(true))
    expect(viewer.close).toHaveBeenCalledTimes(1)
    expect(chat.close).not.toHaveBeenCalled()
  })

  it('takes no entry while `when` is false, and gives its entry back when it turns false while open', async () => {
    const phone = ref(false)
    const chat = overlay({ when: () => phone.value })
    chat.open.value = true
    await settles(() => expect(atPage()).toBe(true))

    phone.value = true
    await settles(() => expect(depthHere()).toBe(1))
    // A window wider than a phone's: open as it was, and back is the page's again.
    phone.value = false
    await settles(() => expect(atPage()).toBe(true))
    expect(chat.open.value).toBe(true)
    expect(chat.close).not.toHaveBeenCalled()
  })

  it('unmounted while open, it goes back over its entry', async () => {
    const viewer = overlay()
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(1))
    viewer.scope.stop()
    await settles(() => expect(atPage()).toBe(true))
  })

  it('forward into the entry of one back closed goes back to the page', async () => {
    const viewer = overlay()
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(1))
    history.back()
    await settles(() => expect(viewer.open.value).toBe(false))
    history.forward()
    await settles(() => expect(atPage()).toBe(true))
    expect(viewer.open.value).toBe(false)
  })

  it('opened already, it adds its entry at once', async () => {
    const open = ref(true)
    const scope = effectScope()
    scope.run(() => useBackCloses(open, () => (open.value = false)))
    await settles(() => expect(depthHere()).toBe(1))
    history.back()
    await settles(() => expect(open.value).toBe(false))
    scope.stop()
  })
})

describe('installBackCloses', () => {
  function fakeRouter() {
    const pushed: unknown[] = []
    const router = {
      push: vi.fn(async (to: unknown) => {
        // A page's entry, as the router adds it, after whatever is shown.
        pushed.push({ to, overlayUnder: overlayHere() })
        history.pushState({ page: -1 }, '')
      }),
    }
    return { router: router as unknown as Router, pushed }
  }

  it('a link followed while overlays are open closes them first, and the page takes their entries', async () => {
    const { router, pushed } = fakeRouter()
    installBackCloses(router)
    const chat = overlay()
    const viewer = overlay()
    chat.open.value = true
    viewer.open.value = true
    await settles(() => expect(depthHere()).toBe(2))
    const length = history.length

    await router.push('/next')
    expect(pushed).toEqual([{ to: '/next', overlayUnder: false }])
    expect(chat.open.value).toBe(false)
    expect(viewer.open.value).toBe(false)
    // The page's own entry, then the next page's: the overlays' are gone.
    expect(history.length).toBe(length - 1)
    history.back()
    await settles(() => expect(atPage()).toBe(true))
  })

  it('with nothing open, a link is followed at once', async () => {
    const { router, pushed } = fakeRouter()
    installBackCloses(router)
    void router.push('/next')
    expect(pushed).toEqual([{ to: '/next', overlayUnder: false }])
    history.back()
    await settles(() => expect(atPage()).toBe(true))
  })

  it('goes back over the entries a page left before it was reloaded', async () => {
    history.pushState({ ...pageState, aishieOverlay: { load: 'before', depth: 1 } }, '')
    history.pushState({ ...pageState, aishieOverlay: { load: 'before', depth: 2 } }, '')
    installBackCloses(fakeRouter().router)
    await settles(() => expect(atPage()).toBe(true))
  })
})

describe('isSamePage', () => {
  it('is history moving at one address, not the first page shown', () => {
    expect(isSamePage({ fullPath: '/a' }, { fullPath: '/a', matched: [{}] })).toBe(true)
    expect(isSamePage({ fullPath: '/b' }, { fullPath: '/a', matched: [{}] })).toBe(false)
    expect(isSamePage({ fullPath: '/' }, { fullPath: '/', matched: [] })).toBe(false)
  })
})
