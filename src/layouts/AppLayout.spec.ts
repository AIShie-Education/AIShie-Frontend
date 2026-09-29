import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'

/** The caller's conversations with an answer they have not read, as me.conversations says. */
let unread = 0

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'conversation.respondents') return { respondents: [] }
      if (tool === 'agent.list') return { agents: [] }
      if (tool === 'me.conversations') return { conversations: Array.from({ length: unread }, (_, i) => answered(i)) }
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { useChatStore } = await import('@/stores/chat')
const { default: AppLayout } = await import('./AppLayout.vue')

const View = { render: () => null }

function membership(courseId: string, ask: string) {
  return {
    member_id: `me-${courseId}`,
    course_id: courseId,
    code: 'CS101',
    section: '',
    title: 'Programming',
    role: 'student',
    status: 'active',
    course_status: 'active',
    perms: { conversation_ask: ask },
  } as never
}

/** Signed in as someone who may ask agents in one course (or not), on a wide screen or a phone's. */
async function mountAs(ask: string, opts: { phone?: boolean } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: !!opts.phone && query.includes('max-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada', status: 'active' } as never
  session.status = 'signedIn'
  session.memberships = [membership('k1', ask)]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId', name: 'course-overview', component: View },
      { path: '/account', name: 'account', component: View },
      { path: '/account/agents', name: 'account-agents', component: View },
    ],
  })
  await router.push('/')
  const w = mount(AppLayout, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return { w, chat: useChatStore() }
}

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  unread = 0
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

/** An answer from the course's agent the caller has not read, as me.conversations lists it. */
function answered(i: number) {
  return {
    conversation_id: `c${i}`,
    member_id: 'me-k1',
    course: { course_id: 'k1', code: 'CS101', section: '', title: 'Programming' },
    respondent: { member_id: 'tutor', actor_id: 'tutor-actor', display_name: 'Course tutor', kind: 'agent' },
    status: 'open',
    state: 'answered',
    created_at: '2026-09-26T11:00:00Z',
    last_activity_at: '2026-09-26T11:01:00Z',
    unread: true,
    may_ask: true,
  }
}

describe('AppLayout’s rail', () => {
  it('runs along the right edge, a toolbar of the side panels', async () => {
    const { w } = await mountAs('autonomous')
    const rail = w.get('.app-body > .app-rail')
    expect(rail.attributes('role')).toBe('toolbar')
    expect(rail.attributes('aria-label')).toBe('Side panels')
    expect(rail.attributes('aria-orientation')).toBe('vertical')
    // The page first, then the rail: nothing after it.
    expect(w.find('.app-body > .app-main + .app-rail').exists()).toBe(true)
    expect(rail.element.nextElementSibling).toBeNull()
  })

  it('holds the chat’s button, which opens and closes the panel between the page and the rail, and says its shortcut', async () => {
    const { w, chat } = await mountAs('autonomous')
    const button = w.get('.app-rail #chat-panel-toggle')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('aria-label')).toBe('Chat with agents')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe('chat-panel')
    expect(button.attributes('aria-keyshortcuts')).toBe('Control+J Meta+J')
    expect(button.classes()).not.toContain('is-active')
    const tips = w.findAllComponents({ name: 'ElTooltip' }).map((c) => c.props('content') as string | undefined)
    expect(tips).toContainEqual(expect.stringMatching(/^Chat with agents \((Ctrl\+J|⌘J)\)$/))

    await button.trigger('click')
    await flushPromises()
    expect(chat.open).toBe(true)
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.classes()).toContain('is-active')
    // Docked between the page and the rail, in the same row; the rail stays.
    expect(w.find('.app-body > .app-main + #chat-panel + .app-rail').exists()).toBe(true)

    await button.trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    expect(w.find('.app-body > .app-main + .app-rail').exists()).toBe(true)
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('leaves Enter and Space to the chat’s button, which its tooltip would otherwise take', async () => {
    const { w } = await mountAs('autonomous')
    for (const [key, code] of [
      ['Enter', 'Enter'],
      [' ', 'Space'],
    ]) {
      const e = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
      w.get('#chat-panel-toggle').element.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(false)
    }
  })

  it('moves between its buttons with the arrow keys, Home and End', async () => {
    const { w } = await mountAs('autonomous')
    const button = w.get<HTMLButtonElement>('#chat-panel-toggle')
    button.element.focus()
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      button.element.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(true)
      // One button, for now: it keeps focus.
      expect(document.activeElement).toBe(button.element)
    }
    const other = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    button.element.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
  })

  it('is where focus comes back to when the panel closes', async () => {
    const { w } = await mountAs('autonomous')
    await w.get('#chat-panel-toggle').trigger('click')
    await flushPromises()
    await w.get('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(w.get('.app-rail #chat-panel-toggle').element)
  })

  it('counts the answers not read yet on the chat’s button, as Core says', async () => {
    const { w, chat } = await mountAs('autonomous')
    expect(w.find('.app-rail__badge .el-badge__content').exists()).toBe(false)
    unread = 1
    await chat.pollUnread()
    await flushPromises()
    expect(w.get('.app-rail__badge .el-badge__content').text()).toBe('1')
    expect(w.get('#chat-panel-toggle').attributes('aria-label')).toBe('Chat with agents: 1 unread')
  })

  it('stays, without the chat’s button, where the caller may ask in no course', async () => {
    const { w } = await mountAs('denied')
    expect(w.find('.app-rail').exists()).toBe(true)
    expect(w.find('#chat-panel-toggle').exists()).toBe(false)
  })
})

describe('the header', () => {
  it('has no chat button: the chat is the rail’s', async () => {
    const { w } = await mountAs('autonomous')
    const header = w.get('.app-header')
    expect(header.find('[aria-controls="chat-panel"]').exists()).toBe(false)
    const names = header.findAll('button').map((b) => b.attributes('aria-label') ?? b.text())
    expect(names).toEqual(['Language', 'Theme', expect.stringContaining('Ada')])
  })
})

describe('on a phone', () => {
  it('has no rail, and a floating chat button, which opens the sheet and is gone while it is open', async () => {
    const { w, chat } = await mountAs('autonomous', { phone: true })
    expect(w.find('.app-rail').exists()).toBe(false)
    expect(w.get('.app-header').find('[aria-controls="chat-panel"]').exists()).toBe(false)
    const fab = w.get('.app-chat-fab #chat-panel-toggle')
    expect(fab.attributes('aria-label')).toBe('Chat with agents')
    expect(fab.attributes('aria-haspopup')).toBe('dialog')
    // The page leaves room below its last item for it.
    expect(w.get('.app-main').classes()).toContain('has-chat-fab')

    await fab.trigger('click')
    await flushPromises()
    expect(chat.open).toBe(true)
    expect(w.get('#chat-panel').classes()).toContain('is-sheet')
    expect(w.find('.app-chat-fab').exists()).toBe(false)

    await w.get('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(w.get('.app-chat-fab #chat-panel-toggle').element)
  })

  it('counts the answers not read yet on the floating button', async () => {
    unread = 1
    const { w } = await mountAs('autonomous', { phone: true })
    await flushPromises()
    expect(w.get('.app-chat-fab .el-badge__content').text()).toBe('1')
    expect(w.get('#chat-panel-toggle').attributes('aria-label')).toBe('Chat with agents: 1 unread')
  })

  it('offers no floating button, nor room for one, where the caller may ask in no course', async () => {
    const { w } = await mountAs('denied', { phone: true })
    expect(w.find('.app-chat-fab').exists()).toBe(false)
    expect(w.get('.app-main').classes()).not.toContain('has-chat-fab')
  })
})

describe('the language button', () => {
  it('shows the language in use as a mark, not a speech bubble, which would read as the chat’s', async () => {
    const { w } = await mountAs('autonomous')
    const lang = w.get('button[aria-label="Language"]')
    expect(lang.text()).toBe('EN')
    expect(lang.find('svg').exists()).toBe(false)
    await lang.trigger('click')
    await flushPromises()
    const item = [...document.body.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find((i) => i.textContent?.includes('繁體中文'))
    item?.click()
    await flushPromises()
    expect(w.get('button[aria-label="語言"]').text()).toBe('繁')
  })
})
