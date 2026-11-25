import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { SIDEBAR_GIVES_WAY_MAX_WIDTH } from '@/components/sidebar/frame'
import { useChatStore } from './chat'
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

/** A window this wide, as its media queries of width see it, telling them as it is resized. */
function windowOf(initial: number) {
  let width = initial
  const fits = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
  }
  const lists: { media: string; heard: Set<(e: { matches: boolean }) => void> }[] = []
  window.matchMedia = ((media: string) => {
    const list = { media, heard: new Set<(e: { matches: boolean }) => void>() }
    lists.push(list)
    return {
      media,
      get matches() {
        return fits(media)
      },
      addEventListener: (_: string, f: (e: { matches: boolean }) => void) => list.heard.add(f),
      removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => list.heard.delete(f),
    }
  }) as unknown as typeof window.matchMedia
  return {
    resize(to: number) {
      width = to
      for (const l of lists) for (const f of l.heard) f({ matches: fits(l.media) })
    },
  }
}

const matchMedia = window.matchMedia
beforeEach(() => localStorage.clear())
afterEach(() => {
  window.matchMedia = matchMedia
})

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

  it('gives way to the chat in a window too narrow for both beside the page, and the chat to it in turn', async () => {
    // 48 + 260 + 320 + 420: the activity bar, the side bar, the narrowest pane and the least left to the page.
    expect(SIDEBAR_GIVES_WAY_MAX_WIDTH).toBe(1047)
    const win = windowOf(1000)
    const { side } = page()
    const chat = useChatStore()
    expect([side.open, side.visible]).toEqual([true, true])
    // The chat opened: the side bar is not beside the page, and still open, as this browser keeps it.
    chat.setOpen(true)
    expect([side.open, side.givesWay, side.visible]).toEqual([true, true, false])
    await nextTick()
    expect(kept()).toBeNull()
    // Minimized: back.
    chat.setOpen(false)
    expect(side.visible).toBe(true)
    // A view's button pressed while it gives way, even the view it shows: shown, and the chat minimized.
    chat.setOpen(true)
    side.toggle('courses')
    expect([side.visible, side.shown, chat.open]).toEqual([true, 'courses', false])
    // And the chat opened again: the side bar gives way again.
    chat.setOpen(true)
    expect(side.visible).toBe(false)
    // The window widened to room for both: both, as they were.
    win.resize(SIDEBAR_GIVES_WAY_MAX_WIDTH + 1)
    expect([side.visible, chat.open]).toEqual([true, true])
    win.resize(SIDEBAR_GIVES_WAY_MAX_WIDTH)
    expect(side.visible).toBe(false)
    // A phone's, whose side bar is the menu's and whose chat is a sheet: nothing gives way.
    win.resize(899)
    expect([side.givesWay, side.visible]).toEqual([false, true])
    // Collapsed, it stays so as the chat comes and goes.
    win.resize(1000)
    chat.setOpen(false)
    side.toggle('courses')
    expect(side.open).toBe(false)
    chat.setOpen(true)
    chat.setOpen(false)
    expect([side.open, side.visible]).toEqual([false, false])
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
