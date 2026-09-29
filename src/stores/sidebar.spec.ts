import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from './session'
import { useSideBarStore } from './sidebar'

/** A fresh page, with the caller signed in as a person, an administrator or not, or as an agent. */
function page(who: { kind?: 'human' | 'agent'; admin?: 'platform' | 'department' } = {}) {
  setActivePinia(createPinia())
  const session = useSessionStore()
  session.me = {
    id: 'ada',
    kind: who.kind ?? 'human',
    display_name: 'Ada',
    status: 'active',
    platform_role: who.admin === 'platform' ? 'admin' : undefined,
    administers: who.admin === 'department' ? ['d1'] : [],
  } as never
  return { side: useSideBarStore(), session }
}

const kept = () => JSON.parse(localStorage.getItem('aishie.sideBar') ?? 'null')

beforeEach(() => localStorage.clear())

describe('the side bar’s store', () => {
  it('starts open, on the courses', () => {
    const { side } = page()
    expect(side.open).toBe(true)
    expect(side.shown).toBe('courses')
  })

  it('offers each caller their views', () => {
    expect(page().side.views).toEqual(['courses', 'agents'])
    expect(page({ admin: 'department' }).side.views).toEqual(['courses', 'agents', 'admin'])
    expect(page({ admin: 'platform' }).side.views).toEqual(['courses', 'agents', 'admin'])
    expect(page({ kind: 'agent' }).side.views).toEqual(['courses'])
  })

  it('shows another view when its button is pressed, and collapses when the shown one’s is', () => {
    const { side } = page({ admin: 'platform' })
    side.toggle('agents')
    expect([side.open, side.shown]).toEqual([true, 'agents'])
    side.toggle('admin')
    expect([side.open, side.shown]).toEqual([true, 'admin'])
    side.toggle('admin')
    expect(side.open).toBe(false)
    // Collapsed, it keeps its view: the same button opens it again on it.
    expect(side.shown).toBe('admin')
    side.toggle('admin')
    expect([side.open, side.shown]).toEqual([true, 'admin'])
    // Collapsed, another button opens it on that one's view.
    side.toggle('admin')
    side.toggle('courses')
    expect([side.open, side.shown]).toEqual([true, 'courses'])
  })

  it('follows the page to its view, and never opens a side bar that was collapsed', () => {
    const { side } = page({ admin: 'department' })
    side.follow('/admin/departments')
    expect([side.open, side.shown]).toEqual([true, 'admin'])
    side.follow('/courses/k1/materials')
    expect(side.shown).toBe('courses')
    side.follow('/account/agents/ag1')
    expect(side.shown).toBe('agents')
    // A page of no view leaves it where it was.
    side.follow('/')
    side.follow('/account')
    expect(side.shown).toBe('agents')

    side.toggle('agents')
    expect(side.open).toBe(false)
    side.follow('/admin/courses')
    expect(side.open).toBe(false)
    expect(side.shown).toBe('admin')
  })

  it('does not follow a page to a view the caller is not offered', () => {
    const { side } = page({ kind: 'agent' })
    side.follow('/account/agents')
    side.follow('/admin/courses')
    expect(side.view).toBe('courses')
    side.select('admin')
    expect(side.view).toBe('courses')
  })

  it('shows the courses where the view kept is one the caller is no longer offered', async () => {
    localStorage.setItem('aishie.sideBar', JSON.stringify({ open: true, view: 'admin', width: 300 }))
    const { side, session } = page({ admin: 'platform' })
    expect(side.shown).toBe('admin')
    session.me = { ...session.me!, platform_role: undefined } as never
    await nextTick()
    expect(side.views).toEqual(['courses', 'agents'])
    expect(side.shown).toBe('courses')
    // The courses are the view shown: their button collapses it, and opens it again on them.
    side.toggle('courses')
    expect(side.open).toBe(false)
    side.toggle('courses')
    expect([side.open, side.shown, side.view]).toEqual([true, 'courses', 'courses'])
  })

  it('is remembered in this browser: open or not, and the view, for the next page', async () => {
    const first = page({ admin: 'platform' }).side
    first.toggle('admin')
    await nextTick()
    expect(kept()).toEqual({ open: true, view: 'admin' })
    first.toggle('admin')
    await nextTick()
    expect(kept()).toEqual({ open: false, view: 'admin' })

    const next = page({ admin: 'platform' }).side
    expect([next.open, next.shown]).toEqual([false, 'admin'])
    expect('width' in next).toBe(false)
  })
})
