import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Router } from 'vue-router'
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
/** What moves through history, one after another. */
let queue: Promise<void> = Promise.resolve()
let queued = 0
/** The step through history this is waiting for, which the next popstate ends. */
let stepping: (() => void) | null = null
let listening = false

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

/** Goes back (or forward) by `delta` entries, and waits until it has. */
function go(delta: number): Promise<void> {
  if (!delta) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (stepping === done) stepping = null
      resolve()
    }
    const timer = setTimeout(done, STEP_TIMEOUT_MS)
    stepping = done
    history.go(delta)
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
  if (stray + closed) void enqueue(() => go(-(stray + closed)))
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
    if (!layer.open) return
    const state = { ...(history.state as object | null), [KEY]: { load: LOAD, depth: layers.length + 1 } }
    history.pushState(state, '')
    layers.push(layer)
  })
  return layer
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

/** Whether an overlay has an entry, or history is still moving. */
function busy(): boolean {
  return layers.length > 0 || queued > 0
}

/** Goes back over every overlay's entry, closing them; resolves once history is at the page's own. */
export function closeAllOverlays(): Promise<void> {
  return enqueue(async () => {
    const depth = depthHere()
    if (depth) await go(-depth)
    // Any left (history was not on their entries): closed as they are.
    while (layers.length) {
      const layer = layers.pop()!
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
 */
export function installBackCloses(router: Router) {
  if (typeof window === 'undefined') return
  listen()
  const left = strayHere()
  if (left) void enqueue(() => go(-left))
  const push = router.push.bind(router)
  router.push = (to) => (busy() ? closeAllOverlays().then(() => push(to)) : push(to))
}

/**
 * Whether a navigation is only history moving between a page's own entry and
 * an overlay's, at the same address: the page stays where it is scrolled.
 */
export function isSamePage(to: { fullPath: string }, from: { fullPath: string; matched: readonly unknown[] }) {
  return from.matched.length > 0 && to.fullPath === from.fullPath
}
