import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool === 'conversation.respondents') return { respondents: [] }
      if (tool === 'agent.list') return { agents: [] }
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

async function mountAs(ask: string) {
  window.matchMedia = ((query: string) => ({
    matches: false,
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
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('AppLayout’s chat button', () => {
  it('opens and closes the panel beside the page, and says its shortcut', async () => {
    const { w, chat } = await mountAs('autonomous')
    const button = w.find('#chat-panel-toggle')
    expect(button.attributes('aria-label')).toBe('Chat with agents')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBe('chat-panel')
    const tips = w.findAllComponents({ name: 'ElTooltip' }).map((c) => c.props('content') as string | undefined)
    expect(tips).toContainEqual(expect.stringMatching(/^Chat with agents \((Ctrl\+J|⌘J)\)$/))

    await button.trigger('click')
    await flushPromises()
    expect(chat.open).toBe(true)
    expect(button.attributes('aria-expanded')).toBe('true')
    // Docked beside the page, in the same row.
    expect(w.find('.app-body > .app-main + #chat-panel').exists()).toBe(true)

    await button.trigger('click')
    await flushPromises()
    expect(w.find('#chat-panel').exists()).toBe(false)
  })

  it('counts the answers not read yet', async () => {
    localStorage.setItem(
      'aishiteru.chat.ada',
      JSON.stringify({ since: '2026-01-01T00:00:00Z', seen: {}, pending: {}, course: null }),
    )
    const { w, chat } = await mountAs('autonomous')
    chat.note([
      {
        courseId: 'k1',
        view: {
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
        },
      },
    ])
    await flushPromises()
    expect(w.find('.app-chat-badge .el-badge__content').text()).toBe('1')
    expect(w.find('#chat-panel-toggle').attributes('aria-label')).toBe('Chat with agents: 1 unread')
  })

  it('is not offered where the caller may ask in no course', async () => {
    const { w } = await mountAs('denied')
    expect(w.find('#chat-panel-toggle').exists()).toBe(false)
  })
})

describe('the language button', () => {
  it('shows the language in use as a mark, not the speech bubble the chat button has', async () => {
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
