import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Whether a media query matches, kept up to date, e.g.
 * useMediaQuery('(pointer: coarse)') for a touch screen. It asks of the
 * window, which is right for what belongs to the window: the side bar's
 * drawer, the chat's sheet, a dialog or a drawer over the page. A page's own
 * layout follows its own width instead (useContainerNarrow,
 * docs/CONVENTIONS.md), since the side bar takes from it.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)
  if (typeof window === 'undefined' || !window.matchMedia) return matches
  const mql = window.matchMedia(query)
  matches.value = mql.matches
  const onChange = (e: MediaQueryListEvent) => (matches.value = e.matches)
  mql.addEventListener('change', onChange)
  onScopeDispose(() => mql.removeEventListener('change', onChange))
  return matches
}

/**
 * Whether the window is a phone's, 640 px or narrower: where a dialog or a
 * drawer laid over the page fills the screen. Never for a page's own layout,
 * which follows the page's width (useContainerNarrow).
 */
export function usePhoneScreen(): Ref<boolean> {
  return useMediaQuery('(max-width: 640px)')
}
