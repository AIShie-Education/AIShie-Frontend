import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import type { ConversationView, MyConversation, Respondent } from '@/api/types'

let respondents: Respondent[] = []
/** The caller's conversations (me.conversations), and whether each is unread. */
let mine: MyConversation[] = []
const reads: { tool: string; args: Record<string, unknown> }[] = []
const writes: { tool: string; args: Record<string, unknown> }[] = []
/** Whether a read of what comes next that asks to wait waits (until it is aborted), as Core's does while nothing is written. */
let holdWaits = false
/** Those reads, with the signal each was given. */
const waitingReads: { args: Record<string, unknown>; signal: AbortSignal }[] = []

/** Conversation c1, as conversation.get and conversation.messages give it: the tutor has answered. */
const c1: ConversationView = {
  id: 'c1',
  status: 'open',
  state: 'answered',
  created_at: '2026-09-26T11:00:00Z',
  last_message_at: '2026-09-26T11:01:00Z',
  last_author_member_id: 'tutor',
  opener: { member_id: 'me-k1', display_name: 'Ada', kind: 'human' },
  respondent: {
    member_id: 'tutor',
    display_name: 'Course tutor',
    kind: 'agent',
    role: 'assistant',
    seat_status: 'active',
    is_delegate_of_opener: false,
    answer_level: 'autonomous',
  },
}

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>, opts?: { signal?: AbortSignal }) => {
      reads.push({ tool, args })
      if (tool === 'conversation.messages' && holdWaits && args.wait_s !== undefined) {
        const signal = opts!.signal!
        waitingReads.push({ args, signal })
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError'))),
        )
      }
      if (tool === 'conversation.respondents') return { respondents }
      if (tool === 'agent.list') return { agents: [] }
      if (tool === 'me.conversations') {
        return { conversations: mine.filter((c) => !args.course_id || c.course.course_id === args.course_id) }
      }
      if (tool === 'conversation.get') return { ...c1, unread: mine.some((c) => c.unread), visible_to: [] }
      if (tool === 'conversation.messages') {
        return {
          conversation: c1,
          more: false,
          messages: [
            { id: 'm1', seq: 1, author_member_id: 'me-k1', body: 'When is it due?', created_at: c1.created_at },
            { id: 'm2', seq: 2, author_member_id: 'tutor', body: 'On Friday.', created_at: c1.created_at },
          ],
        }
      }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (tool !== 'conversation.mark_read') throw new Error(`no answer for ${tool}`)
      mine = mine.map((c) => (c.conversation_id === args.conversation_id ? { ...c, unread: false } : c))
      return {
        status: 'executed',
        actionId: 'a1',
        reviewState: 'none',
        replayed: false,
        result: { read_up_to_seq: 2, unread: false },
      }
    }),
    // A conversation's files, uploaded at once; Core takes 5 000 bytes a file.
    uploadFile: vi.fn(async (_course: string, _kind: string, file: File) => ({
      uploadToken: `tok-${file.name}`,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    })),
    uploadLimits: vi.fn(async () => ({ maxBytes: 5_000, maxFiles: 10, maxConversationBytes: 50_000 })),
    uploadLimit: vi.fn(async () => 5_000),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useChatStore, UNREAD_PAGE } = await import('@/stores/chat')
const { UNREAD_POLL_MS } = await import('./panel')
const { default: ChatPanel } = await import('./ChatPanel.vue')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.()),
  })
const View = { render: () => null }

const tutor: Respondent = {
  member_id: 'tutor',
  display_name: 'Course tutor',
  kind: 'agent',
  role: 'assistant',
  is_my_delegate: false,
  answers_course: true,
  answer_level: 'autonomous',
  last_seen_at: null,
}

function membership(
  courseId: string,
  code: string,
  perms: Record<string, string> = { conversation_ask: 'autonomous' },
) {
  return {
    member_id: `me-${courseId}`,
    course_id: courseId,
    code,
    section: '',
    title: `${code} course`,
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms,
  } as never
}

/** A window this wide (and high), as media queries of max-width see it: a phone's is a sheet. */
function screen(width: number, height = 900) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: !!max && width <= Number(max[1]),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }
  }) as unknown as typeof window.matchMedia
}

async function setup(opts: { at?: string; phone?: boolean; width?: number; height?: number } = {}) {
  screen(opts.width ?? (opts.phone ? 390 : 1440), opts.height ?? (opts.phone ? 844 : 900))
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada' } as never
  session.memberships = [
    membership('k1', 'CS101'),
    membership('k2', 'CS202'),
    // No asking here: never offered.
    membership('k3', 'CS303', { conversation_ask: 'denied' }),
  ]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId', name: 'course-overview', component: View },
      { path: '/courses/:courseId/grades', name: 'course-grades', component: View },
    ],
  })
  await router.push(opts.at ?? '/')
  const w = mount(ChatPanel, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n, ElementPlus],
      components: icons,
      stubs: {
        ElTooltip: Passthrough('ElTooltip'),
        ElDropdown: Passthrough('ElDropdown'),
        RouterLink: Passthrough('RouterLink'),
      },
    },
  })
  await flushPromises()
  return { w, router, chat: useChatStore() }
}

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}
const frame = () => JSON.parse(localStorage.getItem('aishie.chatPanel') ?? 'null')
/** A pointer event as a mouse makes it (jsdom has no PointerEvent). */
async function pointer(el: { element: Element }, type: string, clientX: number, clientY = 0) {
  el.element.dispatchEvent(new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true, cancelable: true }))
  await flushPromises()
}
/** After the next frame, when a drag's window is shown. */
const nextFrame = () => new Promise((r) => setTimeout(r, 40)).then(() => flushPromises())
/** Where the window is shown, and how big, as its style says. */
function placed(w: { find: (s: string) => { attributes: (a: string) => string | undefined } }) {
  const style = w.find('#chat-panel').attributes('style') ?? ''
  const px = (k: string) => Number(new RegExp(`(?:^|;)\\s*${k}:\\s*(-?[\\d.]+)px`).exec(style)?.[1])
  return { width: px('width'), height: px('height'), right: px('right'), bottom: px('bottom') }
}
const kept = () => frame()?.box ?? null

/** One of Ada's conversations as me.conversations lists it. */
function myConversation(id: string, unread: boolean): MyConversation {
  return {
    conversation_id: id,
    member_id: 'me-k1',
    course: { course_id: 'k1', code: 'CS101', section: '', title: 'CS101 course' },
    respondent: { member_id: 'tutor', actor_id: 'tutor-actor', display_name: 'Course tutor', kind: 'agent' },
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    last_activity_at: '2026-09-26T11:01:00Z',
    unread,
    may_ask: true,
  }
}

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  reads.length = 0
  writes.length = 0
  holdWaits = false
  waitingReads.length = 0
  respondents = [tutor]
  mine = []
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('ChatPanel', () => {
  it('opens with Ctrl/⌘+J, is minimized with it or its title bar’s button, and remembers which', async () => {
    const { w, chat } = await setup()
    expect(w.find('#chat-panel').exists()).toBe(false)

    press('j', { ctrlKey: true })
    await flushPromises()
    expect(chat.open).toBe(true)
    expect(w.find('#chat-panel').exists()).toBe(true)
    expect(frame()).toMatchObject({ open: true })

    await w.get('.chat-panel__titlebar .chat-panel__minimize').trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    expect(frame()).toMatchObject({ open: false })

    press('j', { metaKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(true)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    // Other keys do nothing.
    press('j')
    press('k', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
  })

  it('opens again on what it showed once minimized, and on a new conversation once closed', async () => {
    const { w, chat } = await setup()
    chat.showConversation('k1', 'c1', { open: true })
    await flushPromises()
    expect(w.text()).toContain('On Friday.')
    const bar = w.get('.chat-panel__titlebar')
    expect(bar.findAll('button').map((b) => b.attributes('aria-label'))).toEqual([
      'Minimize the chat',
      'Close the chat',
    ])

    await bar.get('.chat-panel__minimize').trigger('click')
    await flushPromises()
    chat.setOpen(true)
    await flushPromises()
    expect(chat.screen).toBe('conversation')
    expect(w.text()).toContain('On Friday.')

    await w.get('.chat-panel__titlebar .chat-panel__close').trigger('click')
    await flushPromises()
    expect(chat.open).toBe(false)
    chat.setOpen(true)
    await flushPromises()
    expect(chat.screen).toBe('new')
    expect(chat.conversation).toBeNull()
    expect(w.find('button.resp-row').exists()).toBe(true)
  })

  it('gives focus back to the round button that opens it when it is minimized or closed', async () => {
    const { w } = await setup()
    // AppLayout's button, at the bottom right.
    const toggle = document.createElement('button')
    toggle.id = 'chat-panel-toggle'
    document.body.appendChild(toggle)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(w.find('#chat-panel').element.contains(document.activeElement)).toBe(true)
    await w.get('.chat-panel__minimize').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(toggle)
    press('j', { ctrlKey: true })
    await flushPromises()
    await w.get('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(toggle)
    // And after Ctrl/⌘+J.
    press('j', { ctrlKey: true })
    await flushPromises()
    press('j', { metaKey: true })
    await flushPromises()
    expect(document.activeElement).toBe(toggle)
  })

  it('is a dialog that leaves the page to use, named by its title bar', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w } = await setup()
    const panel = w.get('#chat-panel')
    expect(panel.element.tagName).toBe('SECTION')
    expect(panel.classes()).toContain('is-window')
    expect(panel.classes()).not.toContain('is-sheet')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('false')
    expect(panel.attributes('aria-labelledby')).toBe('chat-panel-title')
    const title = w.get('.chat-panel__titlebar #chat-panel-title')
    expect(title.text()).toBe('Chat')
    expect(title.classes()).not.toContain('is-hidden')
    // The bar under it holds what the chat shows, and neither closes nor minimizes it.
    expect(w.find('.chat-panel__bar .chat-panel__close').exists()).toBe(false)
    expect(w.find('.chat-panel__bar .chat-panel__minimize').exists()).toBe(false)
  })

  it('opens 400 × 600 px in the bottom right corner where nothing was kept, or only whether it was open', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true, width: 480 }))
    const { w } = await setup()
    expect(placed(w)).toEqual({ width: 400, height: 600, right: 16, bottom: 16 })
  })

  it('opens where this browser left it, and as big', async () => {
    const box = { width: 520, height: 640, right: 300, bottom: 120 }
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true, box }))
    const { w } = await setup()
    expect(placed(w)).toEqual(box)
    expect(w.get('.chat-panel__edge.is-left').attributes('aria-valuenow')).toBe('520')
    expect(w.get('.chat-panel__edge.is-top').attributes('aria-valuenow')).toBe('640')
  })

  it('is resized from its left edge and its top, with the keys or by dragging, within the viewport, and kept once let go', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup()
    const left = w.get('.chat-panel__edge.is-left')
    const top = w.get('.chat-panel__edge.is-top')
    expect(left.attributes('role')).toBe('separator')
    expect(left.attributes('aria-orientation')).toBe('vertical')
    expect(left.attributes('aria-label')).toBe('Width of the chat window')
    expect(left.attributes('aria-valuemin')).toBe('320')
    expect(left.attributes('aria-valuemax')).toBe('1424')
    expect(left.attributes('tabindex')).toBe('0')
    expect(top.attributes('aria-orientation')).toBe('horizontal')
    expect(top.attributes('aria-label')).toBe('Height of the chat window')
    expect(top.attributes('aria-valuemin')).toBe('360')
    expect(top.attributes('aria-valuemax')).toBe('884')

    await left.trigger('keydown', { key: 'ArrowLeft' })
    expect(left.attributes('aria-valuenow')).toBe('416')
    await left.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    expect(left.attributes('aria-valuenow')).toBe('352')
    await top.trigger('keydown', { key: 'ArrowUp' })
    expect(top.attributes('aria-valuenow')).toBe('616')
    await top.trigger('keydown', { key: 'Home' })
    expect(top.attributes('aria-valuenow')).toBe('360')
    expect(kept()).toEqual({ width: 352, height: 360, right: 16, bottom: 16 })

    // Dragged: it follows the pointer a frame at a time, selects nothing on the page meanwhile, and is kept once let go.
    await pointer(left, 'pointerdown', 1072, 500)
    expect(document.body.classList).toContain('is-dragging-chat')
    expect(document.body.classList).toContain('is-dragging-chat-left')
    await pointer(left, 'pointermove', 872, 300)
    await nextFrame()
    // The left edge moves the width alone; the right and bottom edges stay.
    expect(placed(w)).toEqual({ width: 552, height: 360, right: 16, bottom: 16 })
    expect(kept()).toEqual({ width: 352, height: 360, right: 16, bottom: 16 })
    // Far past the viewport's left: as wide as the viewport lets it be.
    await pointer(left, 'pointermove', -500, 300)
    await pointer(left, 'pointerup', -500, 300)
    expect(chat.box).toEqual({ width: 1424, height: 360, right: 16, bottom: 16 })
    expect(document.body.classList).not.toContain('is-dragging-chat')

    // By its top left corner, both at once; smaller than the smallest, the smallest.
    const corner = w.get('.chat-panel__corner')
    expect(corner.attributes('aria-hidden')).toBe('true')
    await pointer(corner, 'pointerdown', 0, 524)
    await pointer(corner, 'pointermove', 1300, 900)
    await pointer(corner, 'pointerup', 1300, 900)
    expect(chat.box).toEqual({ width: 320, height: 360, right: 16, bottom: 16 })
    await pointer(corner, 'pointerdown', 1104, 524)
    await pointer(corner, 'pointermove', 1004, 224)
    await pointer(corner, 'pointerup', 1004, 224)
    expect(chat.box).toEqual({ width: 420, height: 660, right: 16, bottom: 16 })

    // By its top alone, never past the viewport's top.
    await pointer(top, 'pointerdown', 1200, 224)
    await pointer(top, 'pointermove', 900, -400)
    await pointer(top, 'pointerup', 900, -400)
    expect(chat.box).toEqual({ width: 420, height: 884, right: 16, bottom: 16 })
    expect(frame()).toEqual({ open: true, box: { width: 420, height: 884, right: 16, bottom: 16 } })
  })

  it('is moved by its title bar, never off the viewport, and a double click on it puts it back in its corner', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup()
    const bar = w.get('.chat-panel__titlebar')
    await pointer(bar, 'pointerdown', 1200, 300)
    expect(document.body.classList).toContain('is-dragging-chat-move')
    await pointer(bar, 'pointermove', 700, 200)
    await nextFrame()
    expect(placed(w)).toEqual({ width: 400, height: 600, right: 516, bottom: 116 })
    await pointer(bar, 'pointerup', 700, 200)
    expect(chat.box).toEqual({ width: 400, height: 600, right: 516, bottom: 116 })

    // Past the top left of the viewport: against it.
    await pointer(bar, 'pointerdown', 700, 200)
    await pointer(bar, 'pointermove', -2000, -2000)
    await pointer(bar, 'pointerup', -2000, -2000)
    expect(chat.box).toEqual({ width: 400, height: 600, right: 1040, bottom: 300 })
    // Past the bottom right: against it.
    await pointer(bar, 'pointerdown', 10, 10)
    await pointer(bar, 'pointermove', 4000, 4000)
    await pointer(bar, 'pointerup', 4000, 4000)
    expect(chat.box).toEqual({ width: 400, height: 600, right: 0, bottom: 0 })

    // Its buttons are pressed, not dragged.
    await pointer(w.get('.chat-panel__minimize'), 'pointerdown', 1400, 310)
    expect(document.body.classList).not.toContain('is-dragging-chat')

    await bar.trigger('dblclick')
    expect(chat.box).toBeNull()
    expect(placed(w)).toEqual({ width: 400, height: 600, right: 16, bottom: 16 })
    expect(frame()).toEqual({ open: true, box: null })
  })

  it('lets a drag go, keeping nothing of it, when it is minimized while it is dragged', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup()
    await pointer(w.get('.chat-panel__titlebar'), 'pointerdown', 1200, 300)
    await pointer(w.get('.chat-panel__titlebar'), 'pointermove', 700, 200)
    await nextFrame()
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(chat.open).toBe(false)
    expect(document.body.classList).not.toContain('is-dragging-chat')
    expect(chat.box).toBeNull()
    chat.setOpen(true)
    await flushPromises()
    expect(placed(w)).toEqual({ width: 400, height: 600, right: 16, bottom: 16 })
  })

  it('takes files dropped anywhere on the window, its title bar too, for the conversation it shows, and never lets the page have them', async () => {
    const { w, chat } = await setup()
    const dt = (files: File[]) =>
      ({
        types: ['Files'],
        files,
        items: files.map((f) => ({
          kind: 'file',
          getAsFile: () => f,
          webkitGetAsEntry: () => ({ isDirectory: false }),
        })),
        dropEffect: 'none',
      }) as unknown as DataTransfer
    const drop = async (target: { element: Element }, files: File[]) => {
      const e = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(e, 'dataTransfer', { value: dt(files) })
      target.element.dispatchEvent(e)
      for (let i = 0; i < 6; i++) await flushPromises()
      return e
    }
    const pdf = (name: string) => new File([new Uint8Array(120)], name, { type: 'application/pdf' })
    // Choosing an agent: nothing to write in, so nothing is taken, and the page under it gets nothing either.
    chat.setOpen(true)
    await flushPromises()
    const none = await drop(w.get('.chat-panel__titlebar'), [pdf('early.pdf')])
    expect(none.defaultPrevented).toBe(true)
    expect(w.find('.chat-chip').exists()).toBe(false)

    chat.showConversation('k1', 'c1', { open: true })
    await flushPromises()
    expect(w.find('.chat-composer textarea').exists()).toBe(true)
    // On its title bar, as on the conversation itself: chips in the box.
    const onBar = await drop(w.get('.chat-panel__titlebar'), [pdf('notes.pdf')])
    expect(onBar.defaultPrevented).toBe(true)
    await drop(w.get('.chat-pane'), [pdf('plot.pdf')])
    expect(w.findAll('.chat-chip .chat-chip__name').map((c) => c.text())).toEqual(['notes.pdf', 'plot.pdf'])
  })

  it('goes back to its corner when the viewport no longer holds it', async () => {
    localStorage.setItem(
      'aishie.chatPanel',
      JSON.stringify({ open: true, box: { width: 600, height: 700, right: 700, bottom: 100 } }),
    )
    const { w, chat } = await setup({ width: 1440, height: 900 })
    expect(placed(w)).toEqual({ width: 600, height: 700, right: 700, bottom: 100 })
    // Still whole in a viewport 1300 px wide: where it was.
    screen(1300, 900)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(chat.box).toEqual({ width: 600, height: 700, right: 700, bottom: 100 })
    // Off its left edge in one 1200 px wide: back in its corner, at its size until resized.
    screen(1200, 900)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(chat.box).toBeNull()
    expect(placed(w)).toEqual({ width: 400, height: 600, right: 16, bottom: 16 })
    expect(frame()).toEqual({ open: true, box: null })
  })

  it('is a window from 900 px wide, and a sheet with no edge nor title bar on a phone', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const window900 = await setup({ width: 900, height: 640 })
    expect(window900.w.get('#chat-panel').classes()).toContain('is-window')
    // 640 high: clear of the header, 16 px below it.
    expect(placed(window900.w)).toEqual({ width: 400, height: 552, right: 16, bottom: 16 })
    window900.w.unmount()
    const phone = await setup({ width: 899 })
    expect(phone.w.get('#chat-panel').classes()).toEqual(expect.arrayContaining(['chat-panel', 'is-sheet']))
    expect(phone.w.get('#chat-panel').classes()).not.toContain('is-window')
    expect(phone.w.find('[role="separator"]').exists()).toBe(false)
    expect(phone.w.find('.chat-panel__titlebar').exists()).toBe(false)
    expect(phone.w.find('.chat-panel__corner').exists()).toBe(false)
  })

  it('is minimized by Escape from within it, but not from the page, nor while a list of its own is open', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const { w, chat } = await setup({ at: '/courses/k1' })
    // Focus on the page: Escape is the page's.
    outside.focus()
    press('Escape')
    await flushPromises()
    expect(chat.open).toBe(true)
    // Within it, a list of its own open over it: that closes first.
    ;(w.get('#chat-panel').element as HTMLElement).focus()
    const list = document.createElement('div')
    list.className = 'el-popper'
    document.body.appendChild(list)
    press('Escape')
    await flushPromises()
    expect(chat.open).toBe(true)
    list.remove()
    // Handled already by what has focus: left to it.
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    await flushPromises()
    expect(chat.open).toBe(true)
    press('Escape')
    await flushPromises()
    expect(chat.open).toBe(false)
  })

  it('asks in the course of the page it is on, and elsewhere in the course last used', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    // Kept in this browser for Ada, as it is: not what she has read, which Core keeps.
    localStorage.setItem('aishie.chatCourse.ada', 'k2')
    const home = await setup({ at: '/' })
    expect(home.chat.courseId).toBe('k2')
    expect(home.w.find('.chat-panel__course input').element.getAttribute('aria-label')).toBe('Course')
    // Only the courses where the caller may ask are offered.
    expect(home.chat.courses.map((m) => m.course_id)).toEqual(['k1', 'k2'])
    home.w.unmount()

    const onCourse = await setup({ at: '/courses/k1' })
    expect(onCourse.chat.courseId).toBe('k1')
    expect(onCourse.w.find('.chat-panel__hint').text()).toContain('CS101')
    expect(reads.filter((r) => r.tool === 'conversation.respondents').map((r) => r.args.course_id)).toContain('k1')
    await onCourse.router.push('/courses/k2/grades')
    await flushPromises()
    expect(onCourse.chat.courseId).toBe('k2')
    // Leaving the course pages keeps the course.
    await onCourse.router.push('/')
    await flushPromises()
    expect(onCourse.chat.courseId).toBe('k2')
  })

  it('offers the course’s agents, and writes to the one chosen', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup({ at: '/courses/k1' })
    const row = w.find('button.resp-row')
    expect(row.text()).toContain('Course tutor')
    await row.trigger('click')
    await flushPromises()
    expect(chat.draft).toMatchObject({ courseId: 'k1', agent: { member_id: 'tutor' } })
    expect(w.find('.chat-pane__name-row').text()).toMatch(/^CS101\s*·\s*Course tutor/)
    // No title to fill in: the first line of the first message is its title.
    expect(w.find('.chat-pane__foot input').exists()).toBe(false)
    expect(w.find('.chat-composer textarea').exists()).toBe(true)
    // New chat goes back to choosing an agent.
    await w.find('.chat-panel__new').trigger('click')
    expect(chat.draft).toBeNull()
    expect(w.find('button.resp-row').exists()).toBe(true)
  })

  it('shows the history and back, from its toggle', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup({ at: '/courses/k1' })
    const toggle = w.findAll('.chat-panel__icon').find((b) => b.attributes('aria-label') === 'History')!
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(chat.screen).toBe('history')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(w.find('.chat-history').exists()).toBe(true)
    // The course's history, from the caller's conversations in every course.
    expect(reads.filter((r) => r.tool === 'me.conversations' && r.args.course_id).map((r) => r.args)).toEqual([
      { course_id: 'k1', limit: 50 },
    ])
    await toggle.trigger('click')
    expect(chat.screen).toBe('new')
  })

  it('is a sheet over the whole screen on a phone, which closes with its button or Escape, keeping what it showed', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat, router } = await setup({ phone: true, width: 390 })
    const panel = w.find('#chat-panel')
    expect(panel.classes()).toContain('is-sheet')
    expect(panel.attributes('role')).toBe('dialog')
    expect(panel.attributes('aria-modal')).toBe('true')
    expect(panel.attributes('style')).toBeUndefined()
    expect(w.find('[role="separator"]').exists()).toBe(false)
    // Its name is for screen readers; its one button, in its bar, closes it.
    expect(w.get('.chat-panel__bar #chat-panel-title').classes()).toContain('is-hidden')
    expect(w.find('.chat-panel__minimize').exists()).toBe(false)
    press('Escape')
    await flushPromises()
    expect(chat.open).toBe(false)

    chat.showConversation('k1', 'c1', { open: true })
    await flushPromises()
    await w.get('.chat-panel__bar .chat-panel__close').trigger('click')
    expect(chat.open).toBe(false)
    expect(chat.screen).toBe('conversation')

    // A link followed from it leads to its page, which the sheet gives way to.
    chat.setOpen(true)
    await router.push('/courses/k1/grades')
    await flushPromises()
    expect(chat.open).toBe(false)
  })

  it('stays open, a window over the page, as the page changes', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { chat, router } = await setup()
    await router.push('/courses/k1/grades')
    await flushPromises()
    expect(chat.open).toBe(true)
  })

  it('counts what is unread from the newest of the caller’s conversations, read again every 30 seconds, open or not', async () => {
    vi.useFakeTimers()
    try {
      mine = [myConversation('c1', true), myConversation('c2', false)]
      const { chat } = await setup()
      expect(chat.open).toBe(false)
      expect(reads.filter((r) => r.tool === 'me.conversations').map((r) => r.args)).toEqual([{ limit: UNREAD_PAGE }])
      expect(chat.unreadCount).toBe(1)
      // Read elsewhere: counted no more once read again.
      mine = [myConversation('c1', false), myConversation('c2', true), myConversation('c3', true)]
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS - 1000)
      expect(chat.unreadCount).toBe(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(chat.unreadCount).toBe(2)
      expect(reads.filter((r) => r.tool === 'me.conversations')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks for nothing unread where the caller may ask in no course', async () => {
    vi.useFakeTimers()
    try {
      const { chat } = await setup()
      reads.length = 0
      useSessionStore().memberships = [membership('k3', 'CS303', { conversation_ask: 'denied' })]
      await flushPromises()
      expect(chat.courses).toEqual([])
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3)
      expect(reads.filter((r) => r.tool === 'me.conversations')).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('marks a conversation read once it is shown, and counts it no more', async () => {
    mine = [myConversation('c1', true)]
    const { w, chat } = await setup()
    expect(chat.unreadCount).toBe(1)
    chat.showConversation('k1', 'c1', { open: true })
    await flushPromises()
    expect(w.text()).toContain('On Friday.')
    expect(writes).toEqual([
      { tool: 'conversation.mark_read', args: { course_id: 'k1', conversation_id: 'c1', up_to_message_id: 'm2' } },
    ])
    // Not counted, with it shown or once the panel is closed.
    expect(chat.unreadCount).toBe(0)
    chat.setOpen(false)
    await flushPromises()
    expect(chat.unreadCount).toBe(0)
  })

  it('waits on the conversation shown, one read at a time, cut short when another is shown, the panel closes, or the caller signs out', async () => {
    holdWaits = true
    const { chat } = await setup()
    const live = () => waitingReads.filter((r) => !r.signal.aborted)
    chat.showConversation('k1', 'c1', { open: true })
    await vi.waitFor(() => expect(waitingReads).toHaveLength(1))
    expect(waitingReads[0]!.args).toMatchObject({
      conversation_id: 'c1',
      after_seq: 2,
      wait_s: 25,
      seen_state: 'answered',
    })

    // Another conversation: the first's wait is cut short, and the other's is waited on.
    chat.showConversation('k1', 'c2')
    await vi.waitFor(() => expect(waitingReads).toHaveLength(2))
    expect(waitingReads[0]!.signal.aborted).toBe(true)
    expect(waitingReads[1]!.args).toMatchObject({ conversation_id: 'c2' })
    expect(live()).toHaveLength(1)

    // The history instead: cut short.
    chat.showHistory()
    await flushPromises()
    expect(live()).toHaveLength(0)
    chat.showConversation('k1', 'c2')
    await vi.waitFor(() => expect(waitingReads).toHaveLength(3))

    // The panel closed: cut short; open again on it: waited on again.
    chat.setOpen(false)
    await flushPromises()
    expect(live()).toHaveLength(0)
    chat.setOpen(true)
    await vi.waitFor(() => expect(waitingReads).toHaveLength(4))
    expect(live()).toHaveLength(1)

    // The caller signs out: cut short, and nothing more is read.
    useSessionStore().clear()
    await flushPromises()
    expect(live()).toHaveLength(0)
    const n = reads.length
    await new Promise((r) => setTimeout(r, 50))
    expect(reads.slice(n).filter((r) => r.tool === 'conversation.messages')).toEqual([])
  })

  it('says so where the caller may ask in no course', async () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true }))
    const { w, chat } = await setup()
    useSessionStore().memberships = [membership('k3', 'CS303', { conversation_ask: 'denied' })]
    await flushPromises()
    expect(chat.courses).toEqual([])
    expect(w.text()).toContain('None of your courses lets you ask agents questions.')
    // Nor is the shortcut taken once it is closed.
    chat.setOpen(false)
    press('j', { ctrlKey: true })
    await flushPromises()
    expect(chat.open).toBe(false)
  })
})
