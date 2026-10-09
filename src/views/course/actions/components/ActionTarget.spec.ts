import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { read } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import ActionTarget from './ActionTarget.vue'
import FieldsView from './FieldsView.vue'
import type { ActionRow } from './actionText'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => Promise.reject(new Error('no reads here'))) }
})

const COURSE = 'c1'
const global = { plugins: [i18n, ElementPlus], components: icons, stubs: { RouterLink: true } }

/** A student: she may not read the member list, and reads the course's documents (and her conversations). */
function asStudent() {
  setActivePinia(createPinia())
  const session = useSessionStore()
  session.me = { id: 'a-cara', kind: 'human', display_name: 'Cara' } as never
  const course = useCourseStore()
  course.courseId = COURSE
  course.permsSource = 'exact'
  course.perms = { member_read: 'denied', action_decide: 'denied', document_read: 'autonomous' } as never
  course.membership = { member_id: 'm-cara' } as never
}

function row(over: Partial<ActionRow>): ActionRow {
  return {
    id: 'act-1',
    course_id: COURSE,
    actor_id: 'a-cara',
    member_id: 'm-cara',
    status: 'executed',
    created_at: '2026-10-01T10:00:00Z',
    payload: {},
    ...over,
  } as ActionRow
}

let conversationGet: () => Promise<unknown>
beforeEach(() => {
  setLocale('en')
  conversationGet = async () => ({
    id: 'cv-1',
    title: 'Loops',
    status: 'open',
    state: 'answered',
    created_at: '2026-10-01T10:00:00Z',
    opener: { member_id: 'm-cara', display_name: 'Cara', kind: 'human' },
    respondent: {
      member_id: 'm-tutor',
      display_name: 'CS101 tutor',
      kind: 'agent',
      role: 'assistant',
      seat_status: 'active',
      is_delegate_of_opener: false,
      answer_level: 'autonomous',
    },
  })
  vi.mocked(read).mockImplementation((async (name: string) => {
    if (name === 'conversation.get') return conversationGet()
    throw new Error('forbidden')
  }) as unknown as typeof read)
})

describe('ActionTarget, a conversation she started', () => {
  const opened = row({
    action_type: 'conversation.open',
    target_type: 'course',
    payload: { respondent_member_id: 'm-tutor', title: 'Loops', body: 'How do loops end?' },
    result: { conversation_id: 'cv-1' },
  })

  it('names the agent she asked, as the conversation names it, not as someone in the course', async () => {
    asStudent()
    for (const [locale, some] of [
      ['en', 'Someone in the course'],
      ['zh-Hant', '一位成員'],
    ] as const) {
      setLocale(locale)
      const w = mount(ActionTarget, { props: { action: opened, courseId: COURSE }, global })
      await flushPromises()
      expect(w.text()).toContain('Loops')
      expect(w.text()).toMatch(/→\s*CS101 tutor\s*AI/)
      expect(w.find('.agent-avatar').exists()).toBe(true)
      expect(w.text()).not.toContain(some)
      w.unmount()
    }
  })

  it('quotes her question in the language’s own quotation marks, upright', async () => {
    asStudent()
    for (const [locale, quoted] of [
      ['en', '“How do loops end?”'],
      ['zh-Hant', '「How do loops end?」'],
      ['zh-Hans', '“How do loops end?”'],
    ] as const) {
      setLocale(locale)
      const w = mount(ActionTarget, { props: { action: opened, courseId: COURSE }, global })
      await flushPromises()
      expect(w.find('.action-target__quote').text()).toBe(quoted)
      w.unmount()
    }
  })

  it('says someone in the course where the conversation cannot be read', async () => {
    asStudent()
    conversationGet = async () => Promise.reject(new Error('forbidden'))
    const w = mount(ActionTarget, {
      props: { action: { ...opened, result: { conversation_id: 'cv-2' } }, courseId: COURSE },
      global,
    })
    await flushPromises()
    expect(w.text()).toMatch(/→\s*Someone in the course/)
    w.unmount()
  })
})

describe('FieldsView, what came of bringing in her own agent', () => {
  const seat = row({
    action_type: 'member.add_delegate',
    target_type: 'course',
    payload: { actor_id: 'a-helper', agent_display_name: 'Cara helper', owner_display_name: 'Cara' },
    result: { member_id: 'm-helper' },
  })

  it('names the seat it made by the name its proposal gives the agent, as its target does', async () => {
    asStudent()
    for (const [locale, some] of [
      ['en', 'Someone in the course'],
      ['zh-Hant', '一位成員'],
    ] as const) {
      setLocale(locale)
      const w = mount(FieldsView, { props: { courseId: COURSE, value: seat.result, resultOf: seat }, global })
      await flushPromises()
      expect(w.find('.fields-view__value').text()).toBe('Cara helper')
      expect(w.text()).not.toContain(some)
      w.unmount()
    }
  })

  it('names nobody it cannot, where it is not told whose result it is', async () => {
    asStudent()
    const w = mount(FieldsView, { props: { courseId: COURSE, value: seat.result }, global })
    await flushPromises()
    expect(w.find('.fields-view__value').text()).toBe('Someone in the course')
    w.unmount()
  })
})

describe('ActionTarget, an assignment deleted for good', () => {
  const linked = { ...global, stubs: { RouterLink: RouterLinkStub } }

  it('names the deletion by the title its result gives, with no link to the page that is gone', async () => {
    asStudent()
    const w = mount(ActionTarget, {
      props: {
        action: row({
          action_type: 'assignment.delete',
          target_type: 'assignment',
          target_id: 'asg-gone',
          payload: { course_id: COURSE, assignment_id: 'asg-gone', confirm: {} },
          result: { deleted: true, assignment_id: 'asg-gone', title: 'Quiz 3', removed: {} },
        }),
        courseId: COURSE,
        link: true,
      },
      global: linked,
    })
    await flushPromises()
    expect(w.text()).toContain('Quiz 3')
    expect(w.findAllComponents(RouterLinkStub)).toEqual([])
    w.unmount()
  })

  it('says an action emptied by the deletion has nothing more to say', async () => {
    asStudent()
    const w = mount(ActionTarget, {
      props: {
        action: row({
          action_type: 'submission.submit',
          target_type: 'submission',
          target_id: 'sub-gone',
          payload: {},
          result: undefined,
          redacted: { by_action_id: 'act-del', at: '2026-10-04T00:00:00Z' },
        }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('Details removed')
    w.unmount()
  })
})

describe('ActionTarget, peer evaluation', () => {
  it('names the assignment counting peer evaluation is about, and how many grades it writes again', async () => {
    asStudent()
    const course = useCourseStore()
    course.assignments = new Map([['asg-1', { id: 'asg-1', title: 'Group project' }]]) as never
    course.assignmentsState = 'loaded'
    const w = mount(ActionTarget, {
      props: {
        action: row({
          action_type: 'grade.apply_peer',
          target_type: 'assignment',
          target_id: 'asg-1',
          status: 'proposed',
          payload: {
            course_id: COURSE,
            assignment_id: 'asg-1',
            form_version: 2,
            grades: [
              { grade_id: 'g1', student_member_id: 'm-a', factor: 1.2 },
              { grade_id: 'g2', student_member_id: 'm-b', factor: 0.8 },
            ],
          },
        }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('Group project')
    expect(w.text()).toContain('2 grades')
    expect(w.text()).not.toContain('asg-1')
    w.unmount()
  })
})
