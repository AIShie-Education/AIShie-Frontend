import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, REDUCED_MOTION_QUERY, scrollBehavior } from './motion'

const mainCss = Object.values(
  import.meta.glob<string>('../styles/main.css', { query: '?raw', import: 'default', eager: true }),
)[0]!
const sources = Object.entries(
  import.meta.glob<string>('../**/*.{vue,ts}', { query: '?raw', import: 'default', eager: true }),
).filter(([path]) => !path.endsWith('.spec.ts'))

afterEach(() => vi.unstubAllGlobals())

describe('reduced motion', () => {
  it.each([false, true])('reads the current media query when it is %s', (reduced) => {
    const matchMedia = vi.fn().mockReturnValue({ matches: reduced })
    vi.stubGlobal('matchMedia', matchMedia)
    expect(prefersReducedMotion()).toBe(reduced)
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
    expect(scrollBehavior()).toBe(reduced ? 'auto' : 'smooth')
    expect(scrollBehavior(false)).toBe('auto')
  })

  it('shortens every CSS transition and animation and stops smooth scrolling in the global rule', () => {
    const at = mainCss.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at).toBeGreaterThanOrEqual(0)
    const block = mainCss.slice(at)
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/)
    for (const declaration of [
      'animation-duration: 0.01ms !important',
      'animation-delay: 0ms !important',
      'animation-iteration-count: 1 !important',
      'transition-duration: 0.01ms !important',
      'transition-delay: 0ms !important',
      'scroll-behavior: auto !important',
    ])
      expect(block).toContain(declaration)
  })

  it('routes every script-requested smooth scroll through the media-query check', () => {
    const direct = sources.flatMap(([path, text]) => (/behavior:\s*['"]smooth['"]/.test(text) ? [path] : []))
    expect(direct).toEqual([])
  })
})
