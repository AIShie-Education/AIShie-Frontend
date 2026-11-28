import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h } from 'vue'
import type { ConversationView } from '@/api/types'

const reads: { tool: string; args: Record<string, unknown> }[] = []
const writes: string[] = []

function conv(id: string, respondent: string, opener: string, at: string): ConversationView {
  return {
    id,
    status: 'open',
    state: 'answered',
    title: `About ${id}`,
    created_at: '2026-09-01T00:00:00Z',
    last_message_at: at,
    opener: { member_id: `${opener}-seat`, display_name: opener, kind: 'human' },
    respondent: {
      actor_id: `${respondent}-actor`,
      member_id: respondent,
      display_name: respondent === 'tutor' ? 'Course tutor' : 'Other agent',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
  }
}
const list = [
  conv('c1', 'tutor', 'Yuki', '2026-09-20T00:00:00Z'),
  conv('c2', 'other', 'Ken', '2026-09-21T00:00:00Z'),
  conv('c3', 'tutor', 'Ken', '2026-09-22T00:00:00Z'),
]

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push({ tool, args })
      // One agent's, when asked for them, as Core lists them.
      if (tool === 'conversation.list') {
        const only = args.respondent_member_id as string | undefined
        return { conversations: list.filter((c) => !only || c.respondent.member_id === only) }
      }
      if (tool === 'conversation.messages') {
        const c = list.find((x) => x.id === args.conversation_id)!
        return {
          conversation: c,
          more: false,
          messages: [
            {
              id: 'm1',
              seq: 1,
              author_member_id: c.opener.member_id,
              body: 'When is it due?',
              created_at: c.created_at,
            },
            { id: 'm2', seq: 2, author_member_id: 'tutor', body: 'On Friday.', created_at: c.created_at },
          ],
        }
      }
      if (tool === 'conversation.get') return { ...list[0], unread: true, visible_to: ['participants'] }
      throw new Error(`no answer for ${tool}`)
    }),
    write: vi.fn(async (tool: string) => {
      writes.push(tool)
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

vi.mock('@/api/runtimeChat', async (orig) => {
  const real = await orig<typeof import('@/api/runtimeChat')>()
  const asAr = (c: ConversationView) => ({
    id: c.id,
    course_id: 'k1',
    agent_id: c.respondent.member_id,
    title: c.title ?? '',
    state: 'answered' as const,
    revision: 1,
    created_at: c.created_at,
    updated_at: c.last_message_at ?? c.created_at,
    last_activity_at: c.last_message_at ?? c.created_at,
  })
  return {
    ...real,
    runtimeChat: {
      agents: vi.fn(async () => ({
        agents: [
          { agent_id: 'tutor', display_name: 'Course tutor', answers_course: true, answer_level: 'autonomous' },
          { agent_id: 'other', display_name: 'Other agent', answers_course: true, answer_level: 'autonomous' },
        ],
      })),
      list: vi.fn(async (_course: string, _opts: { after?: string } = {}) => ({
        conversations: list.map(asAr),
        next: null,
      })),
      messages: vi.fn(async (_course: string, id: string) => {
        const c = list.find((x) => x.id === id)!
        return {
          conversation: asAr(c),
          more: false,
          draft: null,
          messages: [
            { id: 'm1', conversation_id: id, seq: 1, role: 'user' as const, status: 'posted' as const, body: 'When is it due?', created_at: c.created_at },
            { id: 'm2', conversation_id: id, seq: 2, role: 'assistant' as const, status: 'posted' as const, body: 'On Friday.', created_at: c.created_at },
          ],
        }
      }),
      stream: vi.fn(() => new Promise<void>(() => undefined)),
    },
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { runtimeChat } = await import('@/api/runtimeChat')
const { default: AgentConversationLog } = await import('./AgentConversationLog.vue')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.() ?? slots.reference?.()),
  })

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setLocale('en')
  reads.length = 0
  writes.length = 0
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().memberships = [
    {
      member_id: 'instructor',
      course_id: 'k1',
      code: 'CS101',
      section: '',
      title: 'Programming',
      role: 'instructor',
      status: 'active',
      course_status: 'active',
      perms: { action_decide: 'autonomous', document_read: 'autonomous', conversation_ask: 'autonomous' },
    } as never,
  ]
})
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('AgentConversationLog', () => {
  it('uses Core overseer rows rather than AR own conversations, and shows one read-only', async () => {
    const w = mount(AgentConversationLog, {
      props: { modelValue: true, courseId: 'k1', agent: { id: 'tutor', display_name: 'Course tutor' } },
      attachTo: document.body,
      global: {
        plugins: [i18n, ElementPlus],
        components: icons,
        stubs: {
          ElTooltip: Passthrough('ElTooltip'),
          ElPopover: Passthrough('ElPopover'),
          ElDropdown: Passthrough('ElDropdown'),
          RouterLink: true,
        },
      },
    })
    await flushPromises()
    expect(reads).toEqual([
      {
        tool: 'conversation.list',
        args: {
          course_id: 'k1',
          as: 'overseer',
          respondent_member_id: 'tutor',
          after: undefined,
          limit: 50,
        },
      },
    ])
    expect(runtimeChat.list).not.toHaveBeenCalled()
    const drawer = document.body.querySelector('.agent-log')!
    expect(drawer.textContent).toContain('Conversation log: Course tutor')
    const rows = [...drawer.querySelectorAll<HTMLButtonElement>('.log-row')]
    expect(rows.map((r) => r.querySelector('.log-row__name')!.textContent)).toEqual(['Ken', 'Yuki'])
    expect(rows.map((r) => !!r.querySelector('.log-row__go'))).toEqual([true, true])
    expect(drawer.textContent).not.toContain('Other agent')

    rows[1]!.click()
    await flushPromises()
    expect(drawer.querySelector('.legacy-chat__detail-head h2')!.textContent).toBe('About c1')
    expect(drawer.textContent).toContain('When is it due?')
    expect(drawer.textContent).toContain('On Friday.')
    expect(drawer.querySelector('textarea')).toBeNull()
    expect(drawer.textContent).toContain('Read-only archive')
    expect(reads.at(-1)).toMatchObject({ tool: 'conversation.messages', args: { course_id: 'k1', conversation_id: 'c1' } })
    expect(runtimeChat.messages).not.toHaveBeenCalled()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(writes).toEqual([])
  })

  it('goes back from a conversation to the list with back, and closes with back from there; opened again on one, the same', async () => {
    const depth = () => (history.state as { aishieOverlay?: { depth: number } } | null)?.aishieOverlay?.depth ?? 0
    const settled = async (check: () => void) => {
      await vi.waitFor(check, { timeout: 5_000 })
      await new Promise((r) => setTimeout(r, 20))
      check()
    }
    // The ⋯ menu, which the conversation's pane closes as the log does.
    const Dropdown = defineComponent({
      name: 'ElDropdown',
      setup(_, { slots, expose }) {
        expose({ handleClose: () => {} })
        return () => h('span', slots.default?.())
      },
    })
    const w = mount(AgentConversationLog, {
      props: {
        modelValue: true,
        'onUpdate:modelValue': (v: boolean) => w.setProps({ modelValue: v }),
        courseId: 'k1',
        agent: { id: 'tutor', display_name: 'Course tutor' },
      },
      attachTo: document.body,
      global: {
        plugins: [i18n, ElementPlus],
        components: icons,
        stubs: {
          ElTooltip: Passthrough('ElTooltip'),
          ElPopover: Passthrough('ElPopover'),
          ElDropdown: Dropdown,
          RouterLink: true,
        },
      },
    })
    await flushPromises()
    const drawer = document.body.querySelector('.agent-log')!
    const conversation = () => drawer.querySelector('.legacy-chat__detail')
    const rows = () => [...drawer.querySelectorAll<HTMLButtonElement>('.log-row')]
    await settled(() => expect(depth()).toBe(1))

    rows()[1]!.click()
    await flushPromises()
    expect(conversation()).not.toBeNull()
    await settled(() => expect(depth()).toBe(2))
    // Back: the list again, in the log still open.
    history.back()
    await settled(() => expect(rows()).toHaveLength(2))
    expect(conversation()).toBeNull()
    expect(depth()).toBe(1)
    expect(w.props('modelValue')).toBe(true)
    // Back again: the log closes.
    history.back()
    await settled(() => expect(w.props('modelValue')).toBe(false))
    expect(depth()).toBe(0)

    // Opened, on a conversation, closed by its own button: both entries are gone back over.
    await w.setProps({ modelValue: true })
    await settled(() => expect(depth()).toBe(1))
    rows()[0]!.click()
    await flushPromises()
    await settled(() => expect(depth()).toBe(2))
    await w.setProps({ modelValue: false })
    await settled(() => expect(depth()).toBe(0))

    // Opened again, it shows that conversation, whose entry is the top one: back goes to the list first.
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(conversation()).not.toBeNull()
    await settled(() => expect(depth()).toBe(2))
    history.back()
    await settled(() => expect(rows()).toHaveLength(2))
    expect(w.props('modelValue')).toBe(true)
    history.back()
    await settled(() => expect(w.props('modelValue')).toBe(false))
    expect(depth()).toBe(0)
  })

  it('reads another agent’s conversations afresh when it shows that agent', async () => {
    const w = mount(AgentConversationLog, {
      props: { modelValue: true, courseId: 'k1', agent: { id: 'tutor', display_name: 'Course tutor' } },
      attachTo: document.body,
      global: {
        plugins: [i18n, ElementPlus],
        components: icons,
        stubs: {
          ElTooltip: Passthrough('ElTooltip'),
          ElPopover: Passthrough('ElPopover'),
          ElDropdown: Passthrough('ElDropdown'),
          RouterLink: true,
        },
      },
    })
    await flushPromises()
    reads.length = 0
    await w.setProps({ agent: { id: 'other', display_name: 'Other agent' } })
    await flushPromises()
    expect(reads).toEqual([
      {
        tool: 'conversation.list',
        args: {
          course_id: 'k1',
          as: 'overseer',
          respondent_member_id: 'other',
          after: undefined,
          limit: 50,
        },
      },
    ])
    expect(runtimeChat.list).not.toHaveBeenCalled()
    const drawer = document.body.querySelector('.agent-log')!
    expect([...drawer.querySelectorAll('.log-row__name')].map((r) => r.textContent)).toEqual(['Ken'])
    expect(drawer.textContent).toContain('Conversation log: Other agent')
  })
})
