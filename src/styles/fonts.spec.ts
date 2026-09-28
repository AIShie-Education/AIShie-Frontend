import { afterEach, describe, expect, it, vi } from 'vitest'

// Each script's typefaces, as the chunks setLocale fetches: which were loaded.
const loaded = vi.hoisted(() => [] as string[])
vi.mock('./fonts-zh-hant', () => {
  loaded.push('Noto TC')
  return {}
})
vi.mock('./fonts-zh-hans', () => {
  loaded.push('Noto SC')
  return {}
})

const { setLocale } = await import('@/i18n')

/** Lets a dynamic import that has begun finish. */
const settle = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => localStorage.clear())

describe('the typefaces', () => {
  it('are loaded for a page in Chinese only, each script its own: Simplified Chinese gets SC, not TC', async () => {
    setLocale('en')
    await settle()
    expect(loaded).toEqual([])

    setLocale('zh-Hans')
    await settle()
    expect(loaded).toEqual(['Noto SC'])

    // Back and forth loads nothing again.
    setLocale('en')
    setLocale('zh-Hans')
    await settle()
    expect(loaded).toEqual(['Noto SC'])

    setLocale('zh-Hant')
    await settle()
    expect(loaded).toEqual(['Noto SC', 'Noto TC'])
    setLocale('en')
  })
})
