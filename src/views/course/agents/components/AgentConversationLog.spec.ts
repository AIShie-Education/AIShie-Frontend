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

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
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
  it('lists the agent’s conversations that its reader oversees, newest first, and shows one read-only', async () => {
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
    // Core is asked for this agent's conversations alone.
    expect(reads[0]).toEqual({
      tool: 'conversation.list',
      args: { course_id: 'k1', as: 'overseer', limit: 100, respondent_member_id: 'tutor' },
    })
    const drawer = document.body.querySelector('.agent-log')!
    expect(drawer.textContent).toContain('Conversation log: Course tutor')
    const rows = [...drawer.querySelectorAll<HTMLButtonElement>('.log-row')]
    expect(rows.map((r) => r.querySelector('.log-row__name')!.textContent)).toEqual(['Ken', 'Yuki'])
    expect(drawer.textContent).not.toContain('Other agent')

    rows[1]!.click()
    await flushPromises()
    expect(drawer.querySelector('.chat-pane__name')!.textContent!.trim()).toBe('Yuki → Course tutor')
    expect(drawer.querySelector('.chat-pane textarea')).toBeNull()
    expect(drawer.textContent).toContain('You are reading this as course staff.')
    // Someone who decides actions may withdraw a message.
    expect([...drawer.querySelectorAll('.chat-msg__retract')].map((b) => b.textContent!.trim())).toEqual([
      'Withdraw',
      'Withdraw',
    ])
    expect(w.emitted('update:modelValue')).toBeUndefined()
    // Staff reading it mark nothing read.
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
    const conversation = () => drawer.querySelector('.chat-pane__name')
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
    expect(reads.map((r) => r.args.respondent_member_id)).toEqual(['other'])
    const drawer = document.body.querySelector('.agent-log')!
    expect([...drawer.querySelectorAll('.log-row__name')].map((r) => r.textContent)).toEqual(['Ken'])
    expect(drawer.textContent).toContain('Conversation log: Other agent')
  })
})
