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
async function mountAs(ask: string, opts: { phone?: boolean; email?: string; role?: string } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: !!opts.phone && query.includes('max-width'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = {
    id: 'ada',
    kind: 'human',
    display_name: 'Ada',
    status: 'active',
    email: opts.email ?? null,
    platform_role: opts.role ?? null,
  } as never
  session.status = 'signedIn'
  session.memberships = [membership('k1', ask)]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/courses/:courseId', name: 'course-overview', component: View },
      { path: '/account', name: 'account', component: View },
      { path: '/account/agents', name: 'account-agents', component: View },
      { path: '/login', name: 'login', component: View },
    ],
  })
  await router.push('/')
  const w = mount(AppLayout, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return { w, chat: useChatStore(), router }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
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

describe('the frame', () => {
  it('has no rail along the right edge: the page, and the header above it, run to the window’s edge', async () => {
    const { w } = await mountAs('autonomous')
    expect(w.find('.app-rail').exists()).toBe(false)
    expect(w.find('[role="toolbar"][aria-label="Side panels"]').exists()).toBe(false)
    // The page alone in its row; under the header, nothing but it: no button floats over it on a desktop.
    expect(w.get('.app-body').element.children).toHaveLength(1)
    expect([...w.get('.app-main-wrap').element.children].map((el) => el.classList[0])).toEqual([
      'el-header',
      'app-body',
    ])
    expect(w.find('.app-chat-fab').exists()).toBe(false)
    // The activity bar has only its views: the chat is not one of them.
    expect(w.get('.activity-bar').find('[aria-controls="chat-panel"]').exists()).toBe(false)
  })
})

describe('the chat’s button', () => {
  it('is at the header’s right end, and opens the chat in a window over the page, and minimizes it again', async () => {
    const { w, chat } = await mountAs('autonomous')
    const button = w.get('.app-header .app-header__chat #chat-panel-toggle')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('aria-label')).toBe('Chat with agents')
    expect(button.attributes('aria-haspopup')).toBe('dialog')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe('chat-panel')
    expect(button.attributes('aria-keyshortcuts')).toBe('Control+J Meta+J')
    // After the page's title, at the header's end.
    expect(w.get('.app-header').element.lastElementChild?.contains(button.element)).toBe(true)
    expect(w.get('.app-main').find('#chat-panel-toggle').exists()).toBe(false)

    await button.trigger('click')
    await flushPromises()
    expect(chat.open).toBe(true)
    const panel = w.get('#chat-panel')
    expect(panel.classes()).toContain('is-window')
    expect(panel.attributes('aria-modal')).toBe('false')
    expect(panel.element.contains(document.activeElement)).toBe(true)
    // It stays, saying the chat is open.
    expect(w.get('#chat-panel-toggle').attributes('aria-expanded')).toBe('true')
    // Over the page, not in its row: the page is as it was.
    expect(w.get('.app-body').element.children).toHaveLength(1)

    await w.get('.chat-panel__minimize').trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(w.get('.app-header #chat-panel-toggle').element)

    // Pressed with the chat open, it minimizes it.
    await w.get('#chat-panel-toggle').trigger('click')
    await flushPromises()
    expect(chat.open).toBe(true)
    await w.get('#chat-panel-toggle').trigger('click')
    await flushPromises()
    expect(chat.open).toBe(false)
    expect(w.find('#chat-panel').exists()).toBe(false)
  })

  it('says its shortcut in its tooltip, and leaves Enter and Space to the button, which the tooltip would otherwise take', async () => {
    const { w } = await mountAs('autonomous')
    const tip = w.findAllComponents({ name: 'ElTooltip' }).find((c) => /^Chat with agents/.test(c.props('content')))
    expect(tip?.props('content')).toMatch(/^Chat with agents \((Ctrl\+J|⌘J)\)$/)
    expect(tip?.props('triggerKeys')).toEqual([])
    expect(tip?.props('disabled')).toBe(false)
    for (const [key, code] of [
      ['Enter', 'Enter'],
      [' ', 'Space'],
    ]) {
      const e = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
      w.get('#chat-panel-toggle').element.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(false)
    }
  })

  it('is where focus comes back to when the chat is closed', async () => {
    const { w } = await mountAs('autonomous')
    await w.get('#chat-panel-toggle').trigger('click')
    await flushPromises()
    await w.get('.chat-panel__close').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(w.get('.app-header #chat-panel-toggle').element)
  })

  it('counts the answers not read yet, as Core says, in the indigo', async () => {
    const { w, chat } = await mountAs('autonomous')
    expect(w.find('.app-header__chat .el-badge__content').exists()).toBe(false)
    unread = 1
    await chat.pollUnread()
    await flushPromises()
    const badge = w.get('.app-header__chat .el-badge__content')
    expect(badge.text()).toBe('1')
    expect(badge.classes()).toContain('el-badge__content--primary')
    expect(w.get('#chat-panel-toggle').attributes('aria-label')).toBe('Chat with agents: 1 unread')
  })

  it('takes no room from the page, which nothing floats over', async () => {
    const { w } = await mountAs('autonomous')
    expect(w.get('.app-main').classes()).not.toContain('has-chat-fab')
  })

  it('is not offered where the caller may ask in no course', async () => {
    const { w } = await mountAs('denied')
    expect(w.find('.app-chat-entry').exists()).toBe(false)
    expect(w.find('#chat-panel-toggle').exists()).toBe(false)
    expect(w.get('.app-main').classes()).not.toContain('has-chat-fab')
  })
})

describe('the header', () => {
  it('holds the page’s title and the chat’s button alone: no menus, which are the account’s', async () => {
    const { w } = await mountAs('autonomous')
    const header = w.get('.app-header')
    expect(header.findAll('button').map((b) => b.attributes('aria-controls'))).toEqual(['chat-panel'])
    expect(header.find('.el-dropdown').exists()).toBe(false)
  })
})

describe('on a phone', () => {
  it('opens the menu from three lines at the header’s left, with the wordmark at the menu’s top', async () => {
    const { w } = await mountAs('autonomous', { phone: true })
    const menu = w.get('.app-header .app-header__menu')
    expect(menu.attributes('aria-label')).toBe('Menu')
    expect(menu.attributes('aria-expanded')).toBe('false')
    // The three lines are drawn, not read: the button's name says what it is.
    expect(menu.get('.el-icon').attributes('aria-hidden')).toBe('true')
    expect(menu.find('svg.app-mark').exists()).toBe(false)
    expect(w.get('.app-header__left').element.firstElementChild).toBe(menu.element)
    await menu.trigger('click')
    await flushPromises()
    const drawer = document.body.querySelector<HTMLElement>('.app-nav-drawer')!
    const top = drawer.querySelector('.app-nav-drawer__body')!.firstElementChild!
    expect(top.querySelector('svg.app-wordmark')?.getAttribute('aria-label')).toBe('aishie')
  })

  it('has a floating button instead, with no tooltip, which opens the sheet and is gone while it is open', async () => {
    const { w, chat } = await mountAs('autonomous', { phone: true })
    expect(w.find('.app-rail').exists()).toBe(false)
    expect(w.get('.app-header').find('[aria-controls="chat-panel"]').exists()).toBe(false)
    const fab = w.get('.app-chat-fab #chat-panel-toggle')
    expect(fab.attributes('aria-label')).toBe('Chat with agents')
    expect(fab.attributes('aria-haspopup')).toBe('dialog')
    const tip = w.findAllComponents({ name: 'ElTooltip' }).find((c) => /^Chat with agents/.test(c.props('content')))
    expect(tip).toBeUndefined()
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

  it('tucks the floating button away while the page is scrolled down, and brings it back as it is scrolled up', async () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const { w } = await mountAs('autonomous', { phone: true })
    const scrollTo = async (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
      window.dispatchEvent(new Event('scroll'))
      await flushPromises()
    }
    await scrollTo(400)
    expect(w.get('.app-chat-fab').classes()).toContain('is-tucked')
    await scrollTo(360)
    expect(w.get('.app-chat-fab').classes()).not.toContain('is-tucked')
    await scrollTo(800)
    expect(w.get('.app-chat-fab').classes()).toContain('is-tucked')
    // Reached from the keyboard, it comes back.
    await w.get('#chat-panel-toggle').trigger('focus')
    expect(w.get('.app-chat-fab').classes()).not.toContain('is-tucked')
    await scrollTo(0)
    frames.mockRestore()
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

/** The menu the account's button opens, wherever it was put (beside the activity bar, it is in the body). */
const menuOf = () => document.body.querySelector<HTMLElement>('#account-menu')
const itemNames = (root: HTMLElement | null) =>
  [
    ...(root?.querySelectorAll<HTMLElement>(':scope > [role="menuitem"], :scope > [role="none"] > [role="menuitem"]') ??
      []),
  ].map((el) => el.querySelector('.account-menu__label')?.textContent?.trim())
function key(el: Element, k: string) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  el.dispatchEvent(e)
  return e
}

describe('the account menu', () => {
  it('is a menu button at the bottom of the activity bar, with the initial of the caller’s name', async () => {
    const { w } = await mountAs('autonomous')
    const button = w.get('.activity-bar .activity-bar__foot #account-button')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.text()).toBe('A')
    expect(button.attributes('aria-label')).toBe('Account: Ada')
    expect(button.attributes('aria-haspopup')).toBe('menu')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe('account-menu')
    // Its tooltip, the caller's name, takes no keys from it.
    const tip = w.findAllComponents({ name: 'ElTooltip' }).find((c) => c.props('content') === 'Ada')
    expect(tip?.props('triggerKeys')).toEqual([])
    // Last in the bar: after the views.
    expect(w.get('.activity-bar').element.lastElementChild?.classList.contains('activity-bar__foot')).toBe(true)
  })

  it('opens on its first item, and says who is signed in, their platform role, the settings, language, theme and signing out', async () => {
    const { w } = await mountAs('autonomous', { email: 'ada@example.edu', role: 'root' })
    const button = w.get('#account-button')
    await button.trigger('click')
    await flushPromises()
    const menu = menuOf()!
    expect(menu.getAttribute('role')).toBe('menu')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(menu.querySelector('.account-menu__name')?.textContent).toBe('Ada')
    expect(menu.querySelector('.account-menu__email')?.textContent).toBe('ada@example.edu')
    expect(menu.querySelector('.account-menu__role')?.textContent?.trim()).toBe('Root')
    expect(menu.getAttribute('aria-labelledby')).toBe('account-menu-name')
    expect(itemNames(menu)).toEqual(['Account settings', 'Language', 'Theme', 'About AIshie', 'Sign out'])
    // No agents here: they are the side bar's.
    expect(menu.textContent).not.toContain('My agents')
    expect(document.activeElement?.textContent).toContain('Account settings')
    // The language and the theme in use are said beside them.
    expect(menu.querySelector('[data-opens="language"] .account-menu__value')?.textContent).toBe('English')
  })

  it('moves among its items with the arrow keys, Home and End, and closes with Escape, back on its button', async () => {
    const { w } = await mountAs('autonomous')
    const button = w.get<HTMLButtonElement>('#account-button')
    button.element.focus()
    // ArrowUp on the button opens it on its last item.
    expect(key(button.element, 'ArrowUp').defaultPrevented).toBe(true)
    await flushPromises()
    const menu = menuOf()!
    expect(document.activeElement?.textContent).toContain('Sign out')
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('Account settings')
    key(document.activeElement!, 'End')
    expect(document.activeElement?.textContent).toContain('Sign out')
    key(document.activeElement!, 'Home')
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.getAttribute('data-opens')).toBe('language')
    key(document.activeElement!, 'Escape')
    await flushPromises()
    expect(menu.isConnected).toBe(false)
    expect(document.activeElement).toBe(button.element)
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('opens the language’s submenu with ArrowRight on the language in use, checked, and ArrowLeft goes back', async () => {
    const { w } = await mountAs('autonomous')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    const lang = menuOf()!.querySelector<HTMLElement>('[data-opens="language"]')!
    lang.focus()
    expect(lang.getAttribute('aria-haspopup')).toBe('menu')
    expect(lang.getAttribute('aria-expanded')).toBe('false')
    key(lang, 'ArrowRight')
    await flushPromises()
    expect(lang.getAttribute('aria-expanded')).toBe('true')
    const sub = document.getElementById(lang.getAttribute('aria-controls')!)!
    expect(sub.getAttribute('role')).toBe('menu')
    const radios = [...sub.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['繁體中文', '简体中文', 'English'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(radios[2]!.querySelector('svg')).not.toBeNull()
    expect(document.activeElement).toBe(radios[2])
    // Within the submenu, the arrow keys go round its choices alone.
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(radios[0])
    key(document.activeElement!, 'ArrowLeft')
    await flushPromises()
    expect(document.activeElement).toBe(lang)
    expect(lang.getAttribute('aria-expanded')).toBe('false')
    // Escape in a submenu closes it alone.
    key(lang, 'ArrowRight')
    await flushPromises()
    key(document.activeElement!, 'Escape')
    await flushPromises()
    expect(menuOf()).not.toBeNull()
    expect(document.activeElement).toBe(lang)
  })

  it('sets the language chosen, and closes', async () => {
    const { w } = await mountAs('autonomous')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    menuOf()!.querySelector<HTMLElement>('[data-opens="language"]')!.click()
    await flushPromises()
    ;[...menuOf()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
      .find((r) => r.textContent?.includes('繁體中文'))!
      .click()
    await flushPromises()
    expect(menuOf()).toBeNull()
    expect(w.get('#account-button').attributes('aria-label')).toBe('帳戶：Ada')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    expect(itemNames(menuOf())).toEqual(['帳戶設定', '語言', '主題', '關於 AIshie', '登出'])
  })

  it('sets the theme chosen: light, dark, or the system’s', async () => {
    const { w } = await mountAs('autonomous')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    menuOf()!.querySelector<HTMLElement>('[data-opens="theme"]')!.click()
    await flushPromises()
    const radios = () => [...menuOf()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(radios().map((r) => r.textContent?.trim())).toEqual(['Light', 'Dark', 'System'])
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    radios()[1]!.click()
    await flushPromises()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('aishie.theme')).toBe('dark')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    menuOf()!.querySelector<HTMLElement>('[data-opens="theme"]')!.click()
    await flushPromises()
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    radios()[2]!.click()
    await flushPromises()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('goes to the account’s page, and closes when anything else is pressed', async () => {
    const { w, router } = await mountAs('autonomous')
    await w.get('#account-button').trigger('click')
    await flushPromises()
    ;[...menuOf()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!.click()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account')
    expect(menuOf()).toBeNull()
    await w.get('#account-button').trigger('click')
    await flushPromises()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(menuOf()).toBeNull()
  })

  it('signs out', async () => {
    const { w, router } = await mountAs('autonomous')
    const session = useSessionStore()
    const out = vi.spyOn(session, 'signOut').mockResolvedValue()
    await w.get('#account-button').trigger('click')
    await flushPromises()
    ;[...menuOf()!.querySelectorAll<HTMLElement>('[role="menuitem"]')].at(-1)!.click()
    await flushPromises()
    expect(out).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('is at the bottom of the side menu on a phone, its submenus opening beneath their items', async () => {
    const { w } = await mountAs('autonomous', { phone: true, email: 'ada@example.edu' })
    expect(w.find('#account-button').exists()).toBe(false)
    await w.get('.app-header button[aria-label="Menu"]').trigger('click')
    await flushPromises()
    const drawer = document.body.querySelector<HTMLElement>('.app-nav-drawer')!
    const row = drawer.querySelector<HTMLElement>('#account-button-drawer')!
    expect(row.parentElement?.parentElement?.lastElementChild).toBe(row.parentElement)
    expect(row.textContent).toContain('Ada')
    expect(row.textContent).toContain('ada@example.edu')
    expect(row.getAttribute('aria-haspopup')).toBe('menu')
    row.click()
    await flushPromises()
    const menu = drawer.querySelector<HTMLElement>('#account-menu-drawer')!
    expect(menu.classList).toContain('is-drawer')
    expect(itemNames(menu)).toEqual(['Account settings', 'Language', 'Theme', 'About AIshie', 'Sign out'])
    const theme = menu.querySelector<HTMLElement>('[data-opens="theme"]')!
    theme.click()
    await flushPromises()
    // Beneath its item, in the menu itself.
    expect(theme.nextElementSibling?.getAttribute('role')).toBe('menu')
  })
})
