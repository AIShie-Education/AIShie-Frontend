import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h } from 'vue'
import type { AgentFull, AgentSummary, Respondent } from '@/api/types'

let respondents: Respondent[] = []
let agents: AgentSummary[] = []
let agentsById: Record<string, AgentFull> = {}
const reads: string[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      reads.push(tool)
      if (tool === 'conversation.respondents') return { respondents }
      if (tool === 'agent.list') return { agents, limit: 5, self_service: true }
      if (tool === 'agent.get') return agentsById[args.actor_id as string]
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useCourseStore } = await import('@/stores/course')
const { useSessionStore } = await import('@/stores/session')
const { default: RespondentList } = await import('./RespondentList.vue')

const Passthrough = (name: string) =>
  defineComponent({
    name,
    setup:
      (_, { slots }) =>
      () =>
        h('span', slots.default?.()),
  })
const global = {
  plugins: [i18n, ElementPlus],
  components: icons,
  stubs: { ElTooltip: Passthrough('ElTooltip'), RouterLink: Passthrough('RouterLink') },
}

const tutor: Respondent = {
  member_id: 'tutor',
  display_name: 'Course tutor',
  kind: 'agent',
  role: 'assistant',
  is_my_delegate: false,
  answers_course: true,
  answer_level: 'autonomous',
  last_seen_at: '2026-09-26T11:59:30Z',
}

function helper(siteChat: boolean): { summary: AgentSummary; full: AgentFull } {
  const base = {
    actor_id: 'helper',
    display_name: 'My helper',
    created_at: '2026-09-01T00:00:00Z',
    site_chat: siteChat,
    status: 'active',
    suspended_by_me: false,
  }
  return {
    summary: { ...base, live_seats: 1, pending_requests: 0 },
    full: {
      ...base,
      requests: [],
      seats: [
        {
          answers_course: false,
          assignment_scope: 'all',
          code: 'CS101',
          course_id: 'k1',
          course_status: 'active',
          member_id: 'helper-seat',
          perms: {},
          principal_member_id: 'student',
          section: '',
          status: 'active',
          student_scope: 'listed',
          title: 'Programming',
        },
      ],
    },
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  const course = useCourseStore()
  course.courseId = 'k1'
  course.membership = { member_id: 'student', course_id: 'k1', role: 'student' } as never
  useSessionStore().me = { id: 'me', kind: 'human', display_name: 'Chan Tai Man' } as never
  reads.length = 0
  respondents = [tutor]
  const h = helper(false)
  agents = [h.summary]
  agentsById = { helper: h.full }
})
enableAutoUnmount(afterEach)

describe('RespondentList', () => {
  it('offers whom Core lists, and lists the caller’s own agent operated from outside with no way to ask it', async () => {
    const w = mount(RespondentList, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const offered = w.findAll('button.resp-row')
    expect(offered.map((b) => b.find('.resp-row__name').text())).toEqual(['Course tutor'])
    const elsewhere = w.findAll('.resp-row.is-elsewhere')
    expect(elsewhere).toHaveLength(1)
    const row = elsewhere[0]!
    expect(row.element.tagName).toBe('DIV')
    expect(row.find('.resp-row__name').text()).toBe('My helper')
    expect(row.text()).toContain('Your agent')
    expect(row.text()).toContain('Operated from outside')
    expect(row.text()).toContain(
      'This agent is operated from an external tool (such as Claude through MCP); it does not take conversations on the site.',
    )
    expect(row.text()).toContain('When AIshie’s runtime hosts it, it takes conversations on the site by itself.')
    await offered[0]!.trigger('click')
    expect(w.emitted('start')?.[0]?.[0]).toMatchObject({ member_id: 'tutor' })
  })

  it('lists no agent as operated from outside once it takes conversations in the site', async () => {
    const h = helper(true)
    agents = [h.summary]
    agentsById = { helper: h.full }
    respondents = [tutor, { ...tutor, member_id: 'helper-seat', display_name: 'My helper', is_my_delegate: true }]
    const w = mount(RespondentList, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(w.findAll('button.resp-row')).toHaveLength(2)
    expect(w.find('.resp-row.is-elsewhere').exists()).toBe(false)
    // agent.list said so: none of its agents was read one by one.
    expect(reads).not.toContain('agent.get')
  })

  it('says nobody may be asked, and still why its own agent is not among them', async () => {
    respondents = []
    setLocale('zh-Hant')
    const w = mount(RespondentList, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(w.find('.resp-list__none').text()).toBe('這裡暫時沒有你可以提問的對象。')
    expect(w.find('.resp-row.is-elsewhere').text()).toContain(
      '這個代理是從外部工具操作的（例如 Claude 透過 MCP），不在站內對話。',
    )
    expect(w.find('.resp-row.is-elsewhere').text()).toContain('外部操作')
  })

  it('asks nothing of agents for an agent signed in', async () => {
    useSessionStore().me = { id: 'bot', kind: 'agent', display_name: 'Bot' } as never
    const w = mount(RespondentList, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(reads).toEqual(['conversation.respondents'])
    expect(w.find('.resp-row.is-elsewhere').exists()).toBe(false)
  })
})
