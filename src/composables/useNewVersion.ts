// Tells an open tab that a newer build has been deployed (utils/newVersion):
// while the page is shown, every CHECK_MS and whenever it is shown again
// (at most every MIN_GAP_MS), index.html is read again and the entry script
// it names compared with the one this page loaded. A different one is news:
// available says so, until dismissed (for that build; a later one is news
// again). It never reloads by itself: someone may be writing.
//
// Off in development, where the page has no hashed entry and the dev server
// reloads by itself; and wherever this page's own entry cannot be told. The
// preview the end-to-end tests run serves one build for the whole run, whose
// entry is the one every page loaded: it is never news there.
import { onScopeDispose, ref } from 'vue'
import { liveEntry, loadedEntry } from '@/utils/newVersion'

/** How often a shown page checks. */
export const CHECK_MS = 5 * 60_000
/** A page shown again checks at once, but not more often than this. */
export const MIN_GAP_MS = 30_000

export interface NewVersionOptions {
  /** Off in development by default. */
  enabled?: boolean
  /** The entry this page loaded (its document's, by default). */
  loaded?: string | null
  fetch?: typeof fetch
  now?: () => number
}

export function useNewVersion(opts: NewVersionOptions = {}) {
  const available = ref(false)
  const enabled = opts.enabled ?? !import.meta.env.DEV
  const loaded = opts.loaded !== undefined ? opts.loaded : loadedEntry()
  const now = opts.now ?? Date.now
  let latest: string | null = null
  let dismissed: string | null = null
  let lastCheck = -Infinity
  let checking = false
  let timer: ReturnType<typeof setInterval> | undefined

  const shown = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

  async function check() {
    if (checking || !loaded) return
    checking = true
    lastCheck = now()
    try {
      const live = await liveEntry(opts.fetch ?? fetch)
      if (!live) return
      latest = live
      available.value = live !== loaded && live !== dismissed
    } finally {
      checking = false
    }
  }

  function onVisibility() {
    if (shown() && now() - lastCheck >= MIN_GAP_MS) void check()
  }

  if (enabled && loaded && typeof window !== 'undefined') {
    // The first check is a while after load: the page has just read index.html.
    lastCheck = now()
    timer = setInterval(() => {
      if (shown()) void check()
    }, CHECK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    onScopeDispose(() => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  /** Later: not for this build again. */
  function dismiss() {
    dismissed = latest
    available.value = false
  }
  function reload() {
    window.location.reload()
  }

  return { available, check, dismiss, reload }
}
