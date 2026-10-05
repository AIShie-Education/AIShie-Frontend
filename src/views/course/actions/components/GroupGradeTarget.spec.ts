import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { read } from '@/api/http'
import type { MemberSummary } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import ActionTarget from './ActionTarget.vue'
import FieldsView from './FieldsView.vue'
import type { ActionRow } from './actionText'

// The group grading tools, as the action pages and the queues say them.
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn() }
})

const COURSE = 'c1'
const global = { plugins: [i18n, ElementPlus], components: icons, stubs: { RouterLink: true } }
const NAMES: Record<string, string> = { ana: 'Ana Chan', cai: 'Cai Lam', fay: 'Fay Yip', t: 'Teacher Wong' }

function asTeacher() {
  setActivePinia(createPinia())
  const course = useCourseStore()
  course.courseId = COURSE
  course.permsSource = 'exact'
  course.perms = {
    member_read: 'autonomous',
    submission_read: 'autonomous',
    grade_read: 'autonomous',
    action_decide: 'autonomous',
  } as never
  course.membership = { member_id: 't' } as never
  course.members = new Map(
    Object.entries(NAMES).map(([id, display_name]) => [
      id,
      { id, display_name, kind: 'human', role: 'student', status: 'active' } as MemberSummary,
    ]),
  )
  course.membersState = 'loaded'
  course.assignmentsState = 'loaded'
  course.assignments = new Map([['a1', { id: 'a1', title: 'Group project', points_possible: 100 } as never]])
}

function row(over: Partial<ActionRow>): ActionRow {
  return {
    id: 'act-1',
    course_id: COURSE,
    actor_id: 'a-t',
    member_id: 't',
    status: 'proposed',
    created_at: '2026-10-01T10:00:00Z',
    payload: {},
    ...over,
  } as ActionRow
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  setLocale('en')
  vi.mocked(read).mockImplementation((async (name: string) => {
    if (name === 'submission.get')
      return {
        id: 's1',
        assignment_id: 'a1',
        group_id: 'gA',
        group_name: 'Team A',
        state: 'submitted',
        attempt: 1,
        revision: 1,
      }
    if (name === 'grade.get')
      return {
        id: 'g1',
        student_member_id: 'cai',
        assignment_id: 'a1',
        submission_id: 's1',
        group: { group_grade_id: 'gg', group_name: 'Team A', score: 80 },
      }
    throw new Error(`no answer for ${name}`)
  }) as unknown as typeof read)
})

describe('a group grading action', () => {
  it('a group’s grade: its score, the group, and how many members it sets apart', async () => {
    asTeacher()
    const w = mount(ActionTarget, {
      props: {
        courseId: COURSE,
        action: row({
          action_type: 'grade.submit',
          target_type: 'submission',
          target_id: 's1',
          payload: {
            submission_id: 's1',
            score: 80,
            out_of: 100,
            adjustments: [
              { student_member_id: 'ana', kind: 'none' },
              { student_member_id: 'cai', kind: 'delta', points: -10, reason: 'Missed two meetings' },
            ],
          },
        }),
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('80 / 100')
    expect(w.text()).toContain('Team A')
    expect(w.text()).toContain('one member adjusted')
  })

  it('one member’s adjustment: whose, and what it sets', async () => {
    asTeacher()
    const w = mount(ActionTarget, {
      props: {
        courseId: COURSE,
        action: row({
          action_type: 'grade.adjust',
          target_type: 'grade',
          target_id: 'g1',
          payload: { grade_id: 'g1', kind: 'replace', points: 90, reason: 'Wrote most of it' },
        }),
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('Cai Lam')
    expect(w.text()).toContain('Group project')
    expect(w.text()).toContain('A score of their own: 90')
  })

  it('correcting whose work it is: whom it adds and takes off, by name', async () => {
    asTeacher()
    const w = mount(ActionTarget, {
      props: {
        courseId: COURSE,
        action: row({
          action_type: 'submission.set_members',
          target_type: 'submission',
          target_id: 's1',
          payload: { submission_id: 's1', add: ['fay'], remove: ['ana'] },
        }),
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('Team A')
    expect(w.text()).toContain('Adds Fay Yip')
    expect(w.text()).toContain('Takes Ana Chan off')
  })

  it('its payload in full: each member’s line, and grade.adjust’s as one', async () => {
    asTeacher()
    const submit = row({
      action_type: 'grade.submit',
      payload: {
        score: 80,
        members: ['ana', 'cai'],
        adjustments: [
          { student_member_id: 'ana', kind: 'none' },
          { student_member_id: 'cai', kind: 'delta', points: -10, reason: 'Missed two meetings' },
        ],
      },
    })
    const w = mount(FieldsView, { props: { courseId: COURSE, value: submit.payload, action: submit }, global })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Each member’s score')
    expect(text).toContain('Cai LamThe group’s score minus 10')
    expect(text).toContain('Reason: Missed two meetings')
    expect(text).toContain('Whose work it is')
    expect(text).not.toContain('student_member_id')

    const adjust = row({
      action_type: 'grade.adjust',
      payload: { grade_id: 'g1', kind: 'delta', points: 5, reason: 'Built it' },
    })
    const a = mount(FieldsView, { props: { courseId: COURSE, value: adjust.payload, action: adjust }, global })
    await flushPromises()
    expect(a.text()).toContain('The group’s score plus 5')
    expect(a.text()).toContain('Reason: Built it')
    // Its points and reason are not said again on lines of their own.
    expect(a.findAll('.fields-view__row').map((r) => r.find('dt').text())).toEqual([
      'How the member’s score is given',
      'Grade',
    ])
  })
})
