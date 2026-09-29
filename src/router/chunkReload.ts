// Recovering from a deploy that happened while a tab was open.
//
// The server keeps one build at a time: when a deploy switches it, the old
// build's hashed /assets/* files are gone (404). A tab that loaded the old
// index.html then fails the first time it navigates to a view it has not
// loaded yet, because that view's chunk no longer exists. Loading the page
// again at the route being navigated to picks up the new build.
//
// Once only: if the reload fails the same way within a short while, the error
// is left to surface instead of reloading for ever. The marker lives in
// sessionStorage, keyed by the target less its fragment (which may hold a
// secret), so a later deploy can still reload the tab again.
import type { Router } from 'vue-router'

const MARKER_KEY = 'aishie.chunkReload'
/** How long a reload to one target counts as the one attempt. */
export const RELOAD_WINDOW_MS = 10_000

/**
 * A failed dynamic import of a chunk, in the words each browser and Vite's
 * preload helper use for it.
 */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  )
}

type MarkerStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Whether a reload to `target` may happen now, recording it if so. It may not
 * when the same target was reloaded to within the window — that reload did not
 * help — or when there is nowhere to record it, since then nothing would stop
 * a loop.
 */
export function claimReload(target: string, now: number = Date.now(), storage?: MarkerStorage): boolean {
  let store: MarkerStorage
  let raw: string | null
  try {
    store = storage ?? window.sessionStorage
    raw = store.getItem(MARKER_KEY)
  } catch {
    return false
  }
  let last: { target?: unknown; at?: unknown } | null = null
  try {
    last = raw ? JSON.parse(raw) : null
  } catch {
    // A marker that does not parse is no marker; it is written over below.
  }
  if (
    last &&
    last.target === target &&
    typeof last.at === 'number' &&
    now - last.at >= 0 &&
    now - last.at < RELOAD_WINDOW_MS
  ) {
    return false
  }
  try {
    store.setItem(MARKER_KEY, JSON.stringify({ target, at: now }))
    return true
  } catch {
    return false
  }
}

/**
 * An address without its fragment. A reload is keyed by it, and only it is
 * written down: a fragment can carry a secret (an invitation's token, on the
 * welcome page), which is never kept in storage.
 */
export function withoutFragment(href: string): string {
  const i = href.indexOf('#')
  return i === -1 ? href : href.slice(0, i)
}

export interface ChunkReloadOptions {
  /** Loads another URL; window.location.assign by default. */
  assign?: (href: string) => void
  /** Loads this page again; window.location.reload by default. */
  reload?: () => void
  storage?: MarkerStorage
  now?: () => number
}

/**
 * Reloads the page, once, when a view's chunk cannot be loaded.
 *
 * During a navigation the failure reaches router.onError, which knows the
 * target; Vite's 'vite:preloadError' fires first for the same failure and is
 * left alone then, since preventing it would resolve the import to nothing.
 * Outside a navigation only that event sees it, and the page is reloaded
 * where it is.
 */
export function installChunkReload(router: Router, opts: ChunkReloadOptions = {}): () => void {
  const assign = opts.assign ?? ((href: string) => window.location.assign(href))
  // Not assign(): assigning the URL the page is at does not load it again
  // when the URL has a fragment.
  const reload = opts.reload ?? (() => window.location.reload())
  const now = opts.now ?? Date.now
  let navigating = false
  const here = () =>
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search + window.location.hash

  const removers = [
    router.beforeEach(() => {
      navigating = true
    }),
    router.afterEach(() => {
      navigating = false
    }),
    router.onError((err, to) => {
      navigating = false
      if (!isChunkLoadError(err)) return
      const href = router.resolve(to).href
      const target = withoutFragment(href)
      if (!claimReload(target, now(), opts.storage)) return
      // Assigning the page's own address with a fragment only moves to the
      // fragment: the page is loaded again instead, and keeps its fragment.
      if (target === withoutFragment(here())) reload()
      else assign(href)
    }),
  ]

  const onPreloadError = (event: VitePreloadErrorEvent) => {
    if (navigating) return
    if (claimReload(withoutFragment(here()), now(), opts.storage)) {
      event.preventDefault()
      reload()
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('vite:preloadError', onPreloadError)

  return () => {
    removers.forEach((remove) => remove())
    if (typeof window !== 'undefined') window.removeEventListener('vite:preloadError', onPreloadError)
  }
}
