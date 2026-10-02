import { describe, expect, it } from 'vitest'
import { COURSE_TABS, fitTabs, MAX_TAB_PLACES } from './courseNav'

describe('fitTabs', () => {
  const ten = Array.from({ length: 10 }, () => 100)

  it('shows every tab where they all fit within the seven places', () => {
    expect(fitTabs([100, 100, 100], 80, 400, 2)).toBe(3)
    // Exactly as wide as the strip: 3 × 100 + 2 × 2.
    expect(fitTabs([100, 100, 100], 80, 304, 2)).toBe(3)
    expect(
      fitTabs(
        Array.from({ length: 7 }, () => 10),
        80,
        1000,
        2,
      ),
    ).toBe(7)
  })

  it('leaves the seventh place to More where there are more than seven tabs, however wide the strip', () => {
    expect(MAX_TAB_PLACES).toBe(7)
    expect(fitTabs(ten, 80, 5000, 2)).toBe(6)
    expect(
      fitTabs(
        Array.from({ length: 8 }, () => 10),
        80,
        5000,
        2,
      ),
    ).toBe(6)
  })

  it('shows as many as fit beside More', () => {
    // Four tabs, their gaps, More and its gap: 400 + 6 + 2 + 80 = 488.
    expect(fitTabs(ten, 80, 488, 2)).toBe(4)
    expect(fitTabs(ten, 80, 487, 2)).toBe(3)
    // Tabs that would all fit, but for one: the last goes under More with what follows it.
    expect(fitTabs([100, 100, 100], 80, 303, 2)).toBe(2)
  })

  it('always shows one tab beside More', () => {
    expect(fitTabs(ten, 80, 50, 2)).toBe(1)
  })
})

describe('the course’s tabs', () => {
  it('are drawn with outlined icons, never filled ones', () => {
    const names = COURSE_TABS.map((tab) => tab.icon.name)
    expect(names).toEqual([
      'House',
      'Reading',
      'EditPen',
      'Files',
      'Notebook',
      'DocumentChecked',
      'User',
      'Cpu',
      'Bell',
      'Clock',
    ])
    for (const name of names) expect(name).not.toMatch(/Filled$/)
  })
})
