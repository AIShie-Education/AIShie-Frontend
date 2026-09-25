import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Whether a media query matches, kept up to date, e.g.
 * useMediaQuery('(max-width: 640px)') to switch a table to cards on a phone.
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

/** Phone width: where tables become cards and dialogs fill the screen. */
export function useNarrow(maxWidth = 640): Ref<boolean> {
  return useMediaQuery(`(max-width: ${maxWidth}px)`)
}
