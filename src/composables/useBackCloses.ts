import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { RouteLocationNormalized, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { ElMessageBox } from 'element-plus'

// Back closes what is laid over the page (the file viewer, the chat's sheet,
// the phone's menu, a drawer or a dialog that fills a phone's screen), as a
// phone's back gesture or button is expected to, instead of leaving the page
// under it.
//
// Each such overlay, as it opens, adds an entry to the browser's history at
// the page's own address (history.pushState, its state marked with how deep
// it is), so that back comes to the entry under it, and this closes every
// overlay above the entry back came to: the top one only, one at a time, for
// overlays opened over one another; a message box (ElMessageBox) asked over
// them is on top of them all, and goes first. Closed by its own means (its button,
// Escape, a click beside it), an overlay goes back over its own entry once,
// so that history is as it was before it opened. One closed from under
// another still open keeps its entry until that one is gone back over too.
//
// The router never sees these entries as pages: going back to the page's own
// entry is a navigation to where it already is (the router's scrollBehavior
// leaves the page where it is then), and following a link while an overlay is
// open first goes back over every overlay's entry, closing them, so that the
// page the link leads to takes the place of their entries rather than coming
// after them (installBackCloses). Moving through history goes one step at a
// time, each waiting for the one before to land.
//
// An entry nothing is open for any more (forward into an overlay back closed,
// or left by a page before it was reloaded) is gone back over as it is come
// to, so that back is never pressed for nothing.
//
// The page may write its own address while an overlay is open (a search box's
// text, 300 ms after typing stops, with router.replace): the router writes it
// to the overlay's entry, the one shown. Back from there, or the overlay
// closed, comes to an entry under it at the address from before, and the
// router writes the address shown to that entry as well instead of going
// there (installBackCloses), so that the page keeps what it wrote.
//
// An overlay opened while a page is on its way (a link followed, still
// loading) adds its entry at once, as any other does, so that back closes it
// then too, rather than leaving the page shown; the page on its way is
// dropped, as back drops one still loading. Should that page land instead,
// the overlay's entry first makes way for the page's, and comes back after it
// if the overlay is still open (installBackCloses), rather than staying under
// it, where back would take two steps for one and forward could never reach
// the page.

/** Where the depth is kept in an entry's state, beside the router's own. */
const KEY = 'aishieOverlay'
/** This page load's, telling its entries from those a load before left (a reload's). */
const LOAD = Math.random().toString(36).slice(2)
/** How long a step through history is waited for, should the browser not take it. */
export const STEP_TIMEOUT_MS = 2000

interface Marker {
  load: string
  depth: number
}

/** An overlay with an entry, or one on its way: whether it is still open, and how back closes it. */
interface Layer {
  open: boolean
  close: () => void
}

/** The overlays with an entry, from the bottom: the one at i has the entry of depth i + 1. */
const layers: Layer[] = []
/** Overlays whose entries made way for a page landing, to come back after its own. */
const aside: Layer[] = []
/** What moves through history, one after another. */
let queue: Promise<void> = Promise.resolve()
let queued = 0
/** The step through history this is waiting for, which the next popstate ends. */
let stepping: (() => void) | null = null
let listening = false
/** How deep the entry history is at, as last seen here: the one back or forward leaves, when it comes. */
let at = 0
/** The address of a page a link leads to, while it is on its way. */
let landing: { to: string } | null = null
/** The router's history.go, with the router not listening (installBackCloses). */
let quietGo: ((delta: number) => void) | null = null

function markerOf(state: unknown): Marker | null {
  const m = (state as Record<string, unknown> | null)?.[KEY] as Partial<Marker> | undefined
  return m && typeof m.depth === 'number' && typeof m.load === 'string' ? (m as Marker) : null
}

/** How deep the entry shown is: 0 for the page's own, else that of the overlay it was added for. */
function depthHere(): number {
  const m = markerOf(history.state)
  return m && m.load === LOAD ? m.depth : 0
}

/** How many entries back is the page's own, from one nothing is open for (one a load before left, or one above every overlay open). */
function strayHere(): number {
  const m = markerOf(history.state)
  if (!m) return 0
  return m.load === LOAD ? Math.max(0, m.depth - layers.length) : m.depth
}

function enqueue(step: () => void | Promise<void>): Promise<void> {
  queued++
  queue = queue
    .then(step)
    .catch(() => {})
    .finally(() => queued--)
  return queue
}

/**
 * Goes back (or forward) by `delta` entries, and waits until it has. While
 * a page a link leads to is on its way, the router does not hear of it: these
 * steps are between a page's own entry and its overlays', all at the
 * page's address then, and the router would take one for a page to go to,
 * dropping the one on its way.
 */
function go(delta: number): Promise<void> {
  if (!delta) return Promise.resolve()
  const quietly = landing ? quietGo : null
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (stepping === done) stepping = null
      // Not seen by the router's listener (installBackCloses), which keeps it otherwise.
      if (quietly) at = depthHere()
      resolve()
    }
    const timer = setTimeout(done, STEP_TIMEOUT_MS)
    stepping = done
    if (quietly) quietly(delta)
    else history.go(delta)
  })
}

/** The overlays closed and gone from the top: how many entries they had, which are to be gone back over. */
function dropClosed(): number {
  let n = 0
  while (layers.length && !layers[layers.length - 1]!.open) {
    layers.pop()
    n++
  }
  return n
}

/**
 * Dismisses the Element Plus message box open over everything (ElMessageBox:
 * a prompt or a confirmation asked from within an overlay, say), as its own
 * close button does, so that whoever asked is told it was cancelled. Says
 * whether there was one.
 */
function dismissMessageBox(): boolean {
  const box = [...document.querySelectorAll<HTMLElement>('.el-overlay.is-message-box')].find(
    // One on its way out (its fade) or gone (v-show) is not what back closes.
    (el) => el.style.display !== 'none' && !el.className.includes('-leave-'),
  )
  if (!box) return false
  const button = box.querySelector<HTMLElement>('.el-message-box__headerbtn')
  if (button) button.click()
  else ElMessageBox.close()
  return true
}

function onPopState() {
  const depth = depthHere()
  // A message box over the overlays is what is on top: back dismisses it
  // alone, and the overlays' entries it went back over are put back.
  if (!stepping && depth < layers.length && dismissMessageBox()) {
    for (let d = depth + 1; d <= layers.length; d++) {
      history.pushState({ ...(history.state as object | null), [KEY]: { load: LOAD, depth: d } }, '')
    }
    at = layers.length
    return
  }
  // Back past them: each overlay above the entry come to closes, the top one first.
  while (layers.length > depth) {
    const layer = layers.pop()!
    if (layer.open) {
      layer.open = false
      layer.close()
    }
  }
  if (stepping) {
    stepping()
    return
  }
  // Come to an entry nothing is open for, or to one an overlay closed from under another kept: on, to one that is.
  const stray = strayHere()
  const closed = dropClosed()
  if (stray + closed) {
    void enqueue(() => {
      // Left from an entry nothing is open for: its address, which may be an old one, is not the page's.
      if (stray) at = 0
      return go(-(stray + closed))
    })
  }
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', onPopState)
}

/** An overlay opened: its entry is added, once whatever moves through history before it has. */
function opened(close: () => void): Layer {
  listen()
  const layer: Layer = { open: true, close }
  void enqueue(() => {
    if (layer.open) add(layer)
  })
  return layer
}

/** Adds an overlay's entry, above those of the overlays under it. */
function add(layer: Layer) {
  const depth = layers.length + 1
  history.pushState({ ...(history.state as object | null), [KEY]: { load: LOAD, depth } }, '')
  layers.push(layer)
  at = depth
}

/**
 * A page a link leads to is landing, while overlays opened as it was on its
 * way have their entries above the one of the page it leaves: back over
 * them, so that the page's entry comes next. The overlays stay as they are,
 * set aside.
 */
function makeWay(): Promise<void> {
  return enqueue(async () => {
    const depth = depthHere()
    if (!depth || !layers.length) return
    aside.push(...layers.splice(0))
    await go(-depth)
  })
}

/** The page landed (or went nowhere): the overlays set aside for it and still open add their entries again, after its own. */
function comeBack() {
  if (!aside.length) return
  void enqueue(() => {
    for (const layer of aside.splice(0)) if (layer.open) add(layer)
  })
}

/** An overlay closed by its own means: back over its entry, if it is the top one, and over any closed under it. */
function closed(layer: Layer) {
  if (!layer.open) return
  layer.open = false
  void enqueue(async () => {
    // Never added (closed before its turn), or already gone back over.
    if (!layers.includes(layer)) return
    // Under another still open: gone back over with it.
    if (layers[layers.length - 1] !== layer) return
    const here = depthHere()
    const n = dropClosed()
    // Only from their own entries: history somewhere else is not moved.
    if (here === n + layers.length) await go(-n)
  })
}

/** Whether an overlay has an entry or is set aside to add it again, or history is still moving. */
function busy(): boolean {
  return layers.length > 0 || aside.length > 0 || queued > 0
}

/** Goes back over every overlay's entry, closing them; resolves once history is at the page's own. */
export function closeAllOverlays(): Promise<void> {
  return enqueue(async () => {
    const depth = depthHere()
    if (depth) await go(-depth)
    // Any left (history was not on their entries), and any set aside: closed as they are.
    for (const layer of [...aside.splice(0), ...layers.splice(0)].reverse()) {
      if (layer.open) {
        layer.open = false
        layer.close()
      }
    }
  })
}

/**
 * Has back close an overlay while `open` is true (and `when`, if given: an
 * overlay that covers the page only on a phone, say), by calling `close`,
 * which is to make `open` false. Closed otherwise, or unmounted while open,
 * it goes back over its own entry. The overlay's own state stays where it
 * is; this only follows it.
 */
export function useBackCloses(
  open: MaybeRefOrGetter<boolean>,
  close: () => void,
  opts: { when?: MaybeRefOrGetter<boolean> } = {},
) {
  let layer: Layer | null = null
  const release = () => {
    if (layer) closed(layer)
    layer = null
  }
  watch(
    () => !!toValue(open) && (opts.when === undefined || !!toValue(opts.when)),
    (on) => {
      if (on) layer = opened(close)
      else release()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(release)
}

/**
 * Has the router go back over the overlays' entries before it adds a page's
 * (a link followed from the menu, the chat, or anywhere while an overlay is
 * open), so that the page takes their place in history; and goes back over
 * the entries a load before this one left (a page reloaded with an overlay
 * open), so that back from here is never pressed for nothing.
 *
 * Back from an overlay's entry to one under it keeps the address shown,
 * which the page may have written while the overlay was open: the router
 * writes it to the entry come to, rather than going to the address that
 * entry had. And a page a link leads to, landing while an overlay opened as
 * it was on its way is still open, has its entry come before the overlay's.
 */
export function installBackCloses(router: Router) {
  if (typeof window === 'undefined') return
  listen()
  const left = strayHere()
  if (left) void enqueue(() => go(-left))

  quietGo = (delta) => router.options.history.go(delta, false)
  const push = router.push.bind(router)
  const follow: Router['push'] = (to) => {
    let mine: { to: string } | null = null
    try {
      mine = { to: router.resolve(to).fullPath }
    } catch {
      // Nowhere to go: push says so.
    }
    landing = mine
    const nav = push(to)
    const settled = () => {
      if (landing === mine) landing = null
      comeBack()
    }
    void nav.then(settled, settled)
    return nav
  }
  router.push = (to) => (busy() ? closeAllOverlays().then(() => follow(to)) : follow(to))
  /** Whether a navigation is to the page a link leads to (or where it was sent on from there). */
  const toLanding = (to: RouteLocationNormalized) =>
    !!landing && (to.fullPath === landing.to || to.redirectedFrom?.fullPath === landing.to)
  // That page about to land (its guards passed, its code loaded): the
  // entries of overlays opened meanwhile make way for its own.
  router.beforeResolve((to) => (toLanding(to) ? makeWay() : undefined))

  // Every step through history, as the router sees it before it moves: the
  // route shown, if back came down from an overlay's entry to one under it at
  // the same place (the router's position in history, which an overlay's
  // entry has from the page's), to be kept there. The router goes there
  // instead of any page on its way, which is dropped.
  let kept: RouteLocationNormalizedLoaded | null = null
  router.options.history.listen((_to, _from, info) => {
    const from = at
    at = depthHere()
    kept = info.delta === 0 && from > at ? router.currentRoute.value : null
    landing = null
  })
  router.beforeEach((to, from) => {
    // Another page on its way instead: the one a link led to is dropped.
    if (!toLanding(to)) landing = null
    const shown = kept
    kept = null
    if (shown !== from || !from.matched.length || to.fullPath === from.fullPath) return
    // The entry come to takes the address shown, as router.replace writes it.
    return { path: from.path, query: from.query, hash: from.hash, replace: true }
  })
}

/**
 * Whether a navigation is only history moving between a page's own entry and
 * an overlay's, at the same address: the page stays where it is scrolled.
 */
export function isSamePage(to: { fullPath: string }, from: { fullPath: string; matched: readonly unknown[] }) {
  return from.matched.length > 0 && to.fullPath === from.fullPath
}
