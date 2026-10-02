import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h } from 'vue'
import type { Respondent } from '@/api/types'

let respondents: Respondent[] = []
const reads: string[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      reads.push(tool)
      if (tool === 'conversation.respondents') return { respondents }
      throw new Error(`no answer for ${tool}`)
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { useSessionStore } = await import('@/stores/session')
const { default: AgentPicker } = await import('./AgentPicker.vue')

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
  hosting: 'runtime',
  answer_level: 'autonomous',
  last_seen_at: '2026-09-26T11:59:30Z',
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  const session = useSessionStore()
  session.me = { id: 'me', kind: 'human', display_name: 'Chan Tai Man' } as never
  session.memberships = [
    {
      member_id: 'student',
      course_id: 'k1',
      code: 'CS101',
      section: '',
      title: 'Programming',
      role: 'student',
      status: 'active',
      course_status: 'active',
      perms: { conversation_ask: 'autonomous' },
    } as never,
  ]
  reads.length = 0
  respondents = [tutor]
})
enableAutoUnmount(afterEach)

describe('AgentPicker', () => {
  it('offers the agents Core lists, each saying it is hosted on AIshie, and nothing else', async () => {
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const offered = w.findAll('button.resp-row')
    expect(offered.map((b) => b.find('.resp-row__name').text())).toEqual(['Course tutor'])
    expect(offered[0]!.find('.hosting-tag').text()).toBe('Hosted on AIshie')
    // The caller's own agents Core does not offer (MCP access, or not running) are not looked for.
    expect(w.find('.resp-row.is-elsewhere').exists()).toBe(false)
    expect(reads).toEqual(['conversation.respondents'])
    await offered[0]!.trigger('click')
    expect(w.emitted('pick')?.[0]?.[0]).toMatchObject({ member_id: 'tutor' })
  })

  it('says so when Core lists no agent to ask', async () => {
    respondents = []
    const none = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(none.findAll('button.resp-row')).toHaveLength(0)
    expect(none.text()).toContain('No agent here answers your questions yet.')
  })

  it('says what each agent is to the caller, that it is one, and whether it can be asked now', async () => {
    respondents = [
      { ...tutor, last_seen_at: null },
      {
        ...tutor,
        member_id: 'mine',
        display_name: 'My helper',
        is_my_delegate: true,
        answers_course: false,
        last_seen_at: new Date().toISOString(),
      },
    ]
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const rows = w.findAll('button.resp-row')
    expect(rows.map((b) => b.find('.resp-row__name').text())).toEqual(['Course tutor', 'My helper'])
    expect(rows[0]!.text()).toContain('Course agent')
    expect(rows[0]!.find('.ai-badge').text()).toBe('AI')
    expect(rows[0]!.find('.agent-avatar').exists()).toBe(true)
    // Not "online", as a person would be: whether it can be asked, in plain words.
    expect(rows[0]!.find('.askable').text()).toBe('Paused')
    expect(rows[1]!.find('.askable').text()).toBe('Can be asked')
    expect(rows[0]!.text()).toContain('It answers other members too')
    expect(rows[1]!.text()).toContain('Personal assistant')
    expect(rows[1]!.text()).toContain('Your agent')
    expect(rows[1]!.text()).not.toContain('It answers other members too')
  })

  it('says nobody may be asked in Traditional Chinese', async () => {
    respondents = []
    setLocale('zh-Hant')
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(w.text()).toContain('這裡暫時沒有可以回答你問題的代理。')
  })
})
