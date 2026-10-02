import { describe, expect, it } from 'vitest'
import { COURSE_TABS, fitTabs } from './courseNav'

describe('fitTabs', () => {
  const ten = Array.from({ length: 10 }, () => 100)

  it('shows every tab where they all fit, however many there are', () => {
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

  it('hides no tab that fits behind More', () => {
    // Ten tabs of 100 px and their nine gaps: 1018.
    expect(fitTabs(ten, 80, 1018, 2)).toBe(10)
    expect(fitTabs(ten, 80, 5000, 2)).toBe(10)
    // One pixel short: the last goes under More, which is narrower, in its place.
    expect(fitTabs(ten, 80, 1017, 2)).toBe(9)
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
    // Element Plus's icons by their names; the app's own (the agents' seat) by its file's.
    const names = COURSE_TABS.map((tab) => {
      const icon = tab.icon as { name?: string; __name?: string }
      return icon.name ?? icon.__name
    })
    expect(names).toEqual([
      'House',
      'Reading',
      'EditPen',
      'Files',
      'Notebook',
      'DocumentChecked',
      'User',
      'AgentSeatIcon',
      'Bell',
      'Clock',
    ])
    for (const name of names) expect(name).not.toMatch(/Filled$/)
  })
})
