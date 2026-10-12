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
  it('offers the agents Core lists and nothing else, without saying how each runs: its page says so', async () => {
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const offered = w.findAll('button.resp-row')
    expect(offered.map((b) => b.find('.resp-row__name').text())).toEqual(['Course tutorAI'])
    expect(offered[0]!.find('.hosting-tag').exists()).toBe(false)
    expect(offered[0]!.text()).not.toContain('Hosted on AIshie')
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
    // The "AI" right after the name, held to its last letter, so that it never stands alone on a line.
    expect(rows.map((b) => b.find('.resp-row__name').text())).toEqual(['Course tutorAI', 'My helperAI'])
    expect(rows[0]!.find('.agent-name__end').text()).toBe('rAI')
    expect(rows[0]!.text()).toContain('Course agent')
    expect(rows[0]!.find('.ai-badge').text()).toBe('AI')
    expect(rows[0]!.find('.agent-avatar').exists()).toBe(true)
    // Not "online", as a person would be: whether it can be asked, by a dot before its name in no green,
    // named in words for a screen reader.
    const dot = (i: number) => rows[i]!.find('.resp-row__line .askable-dot')
    expect(dot(0).attributes('aria-label')).toBe('Paused')
    expect(dot(0).classes()).toContain('is-paused')
    expect(dot(1).attributes('aria-label')).toBe('Can be asked')
    expect(dot(1).classes()).toContain('is-on')
    // Two chips at most: whose it is and what it is to the caller.
    expect(rows[1]!.findAll('.resp-row__line .el-tag, .agent-badge__owner')).toHaveLength(2)
    expect(rows[0]!.text()).toContain('It answers other members too')
    expect(rows[1]!.text()).toContain('Personal agent')
    expect(rows[1]!.text()).toContain('Your agent')
    expect(rows[1]!.text()).not.toContain('It answers other members too')
  })

  it('calls a course agent of the caller’s own a course agent, as its page does, and says it answers others too', async () => {
    respondents = [{ ...tutor, member_id: 'own-tutor', display_name: 'CS101 tutor', is_my_delegate: true }]
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const row = w.find('button.resp-row')
    expect(row.text()).toContain('Your agent')
    expect(row.text()).toContain('Course agent')
    expect(row.text()).not.toContain('Personal agent')
    expect(row.text()).toContain('It answers other members too')
  })

  it('calls an agent the course seated itself, nobody’s delegate, a course agent, first, and says it answers others too', async () => {
    // Core says answers_course false of any agent that is nobody's delegate.
    respondents = [
      { ...tutor, member_id: 'mine', display_name: 'A helper', is_my_delegate: true, answers_course: false },
      { ...tutor, member_id: 'seated', display_name: 'Course Q&A bot', answers_course: false },
    ]
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const rows = w.findAll('button.resp-row')
    expect(rows.map((b) => b.find('.resp-row__name').text())).toEqual(['Course Q&A botAI', 'A helperAI'])
    expect(rows[0]!.text()).toContain('Course agent')
    expect(rows[0]!.text()).not.toContain('Personal agent')
    expect(rows[0]!.text()).toContain('It answers other members too')
    expect(rows[1]!.text()).toContain('Personal agent')
  })

  it('says nothing that every row would say: a student’s course agents, an instructor’s own agents', async () => {
    // A student offered two of the course's agents, both seated by its instructor: no row says "Course agent" nor
    // whose it is, and that they answer others too is said once, over the list.
    respondents = [
      { ...tutor, owner_name: 'Ms Chan' },
      { ...tutor, member_id: 'lab', display_name: 'Lab helper', owner_name: 'Ms Chan' },
    ]
    const student = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global, attachTo: document.body })
    await flushPromises()
    const rows = student.findAll('button.resp-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.text()).not.toContain('Course agent')
      expect(row.text()).not.toContain('Ms Chan')
      expect(row.text()).not.toContain('It answers other members too')
      expect(row.findAll('.resp-row__line .el-tag, .agent-badge__owner')).toHaveLength(0)
      // Nor does a screen reader hear whose it is: what its dot says alone.
      expect(row.attributes('aria-describedby')).toBe(`resp-${row.text().includes('Lab') ? 'lab' : 'tutor'}-ask`)
    }
    expect(student.get('.resp-shared').text()).toBe(
      'Course agents answer other members too, hold what each one writes, and may repeat it to them.',
    )
    student.unmount()

    // An instructor's own course agents and their personal agent: all theirs, so none says "Your agent"; what
    // each is differs, and is said; that the course's answer others too, once over the list.
    respondents = [
      { ...tutor, member_id: 'own-tutor', display_name: 'CS101 tutor', is_my_delegate: true },
      { ...tutor, member_id: 'own-lab', display_name: 'CS101 lab helper', is_my_delegate: true },
      { ...tutor, member_id: 'mine', display_name: 'My helper', is_my_delegate: true, answers_course: false },
    ]
    const instructor = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const [course, lab, personal] = instructor.findAll('button.resp-row')
    expect(instructor.get('.resp-shared').text()).toMatch(/^Course agents answer other members too/)
    for (const row of [course!, lab!, personal!]) {
      expect(row.text()).not.toContain('Your agent')
      expect(row.text()).not.toContain('It answers other members too')
    }
    expect(course!.text()).toContain('Course agent')
    expect(lab!.text()).toContain('Course agent')
    expect(personal!.text()).toContain('Personal agent')
    instructor.unmount()

    // One course agent beside the caller's own: the note under it, there being no other to say it of.
    respondents = [
      { ...tutor, member_id: 'own-tutor', display_name: 'CS101 tutor', is_my_delegate: true },
      { ...tutor, member_id: 'mine', display_name: 'My helper', is_my_delegate: true, answers_course: false },
    ]
    const mixed = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    const [tutorRow, mineRow] = mixed.findAll('button.resp-row')
    expect(mixed.find('.resp-shared').exists()).toBe(false)
    expect(tutorRow!.text()).toContain('It answers other members too')
    expect(mineRow!.text()).not.toContain('It answers other members too')
    mixed.unmount()

    // One agent alone: what it is is said, there being nothing to tell it from.
    respondents = [{ ...tutor, owner_name: 'Ms Chan' }]
    setLocale('zh-Hant')
    const one = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(one.get('button.resp-row').text()).toContain('課程代理')
    expect(one.get('button.resp-row').text()).toContain('它也會回答其他成員')
    expect(one.find('.resp-shared').exists()).toBe(false)
  })

  it('makes each row one control: nothing in it takes focus, and what the tooltips say describes it', async () => {
    respondents = [
      { ...tutor, last_seen_at: null },
      { ...tutor, member_id: 'mine', display_name: 'My helper', is_my_delegate: true, answers_course: false },
    ]
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global, attachTo: document.body })
    await flushPromises()
    for (const row of w.findAll('button.resp-row')) {
      // Neither whose agent it is nor whether it can be asked.
      const focusable = row.findAll('[tabindex]')
      expect(focusable.map((e) => e.html())).toEqual([])
      const ids = row.attributes('aria-describedby')!.split(' ')
      const said = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      expect(said).toMatch(/^(No token of this agent|Last connected|Something runs it now)/)
    }
    const mine = w.findAll('button.resp-row')[1]!
    const said = mine
      .attributes('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
    expect(said.join(' ')).toContain('Acts for you')
  })

  it('says nobody may be asked in Traditional Chinese', async () => {
    respondents = []
    setLocale('zh-Hant')
    const w = mount(AgentPicker, { props: { courseId: 'k1', enabled: true }, global })
    await flushPromises()
    expect(w.text()).toContain('這裡暫時沒有可以回答你問題的代理。')
  })
})

describe('AgentPicker’s notes', () => {
  // Its style as written: jsdom lays nothing out.
  const style = Object.values(
    import.meta.glob<string>('./AgentPicker.vue', { query: '?raw', import: 'default', eager: true }),
  )[0]!
    .replace(/^[\s\S]*<style scoped>/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  /** The size, the leading and the ink a selector is given, by every rule that names it alone or in a list. */
  function look(selector: string) {
    const out: Record<string, string> = {}
    for (const m of style.matchAll(/\n([^{}]+)\{([^}]*)\}/g)) {
      const selectors = m[1]!.split(',').map((x) => x.trim())
      if (!selectors.includes(selector)) continue
      for (const d of m[2]!.matchAll(/(font-size|line-height|color):\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim()
    }
    return out
  }

  it('are in one size, leading and ink, whether the course agents’ note is said once over the list or on its row', () => {
    const once = look('.resp-shared')
    expect(once).toEqual({ 'font-size': 'var(--app-text-sm)', 'line-height': 'var(--app-lh-text)', color: 'var(--app-ink-2)' })
    expect(look('.resp-row__note')).toEqual(once)
    // Not running keeps the wait colour, in the same size and leading.
    expect(look('.resp-row__warn')).toEqual({ ...once, color: 'var(--el-color-warning-dark-2)' })
  })
})
