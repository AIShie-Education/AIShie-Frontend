import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import ActionTarget from '@/views/course/actions/components/ActionTarget.vue'
import FieldsView from '@/views/course/actions/components/FieldsView.vue'
import { reasonText, storedError, type ActionRow } from '@/views/course/actions/components/actionText'

// An action about groups wherever it is listed or read (My actions, the approvals
// queue, an action's page): the set and its groups by name, never by id; who
// goes where; what a split made; and its refusals in the words of the pages
// that do it.

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const SET = '18ed7430-0000-7000-8000-000000000001'
const G1 = '7d4ed0f3-0000-7000-8000-000000000001'
const G3 = '7d4ed0f3-0000-7000-8000-000000000003'
const T0 = '2026-10-05T09:00:00Z'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

beforeEach(() => {
  setLocale('en')
  read.mockReset().mockImplementation(async (tool: string) => {
    if (tool === 'group_set.list')
      return {
        sets: [
          {
            id: SET,
            name: 'Project groups',
            signup: { open: true, joinable: true },
            created_at: T0,
            updated_at: T0,
            assignments: [],
            groups: [
              { id: G1, name: 'Group 1', size: 1, full: false, created_at: T0 },
              { id: G3, name: 'Group 3', size: 2, full: false, created_at: T0 },
            ],
          },
        ],
      }
    if (tool === 'assignment.list') return { assignments: [{ id: 'a1', title: 'Report' }] }
    throw new Error(`no ${tool} here`)
  })
  setActivePinia(createPinia())
  const course = useCourseStore()
  course.$patch({
    courseId: COURSE,
    permsSource: 'exact',
    perms: { member_read: 'autonomous', document_read: 'autonomous', action_decide: 'autonomous' },
    membership: { member_id: 'm-teacher', role: 'instructor' },
    membersState: 'loaded',
    members: new Map([
      ['m-ana', { id: 'm-ana', display_name: 'Ana Lee', role: 'student', kind: 'human', status: 'active' }],
      ['m-ben', { id: 'm-ben', display_name: 'Ben Ho', role: 'student', kind: 'human', status: 'active' }],
    ]),
  } as never)
})

const global = {
  plugins: [i18n, ElementPlus],
  components: icons,
  stubs: { RouterLink: RouterLinkStub, TimeText: true },
}

function row(over: Partial<ActionRow>): ActionRow {
  return {
    id: 'act-1',
    course_id: COURSE,
    actor_id: 'a-tam',
    member_id: 'm-tam',
    status: 'proposed',
    created_at: T0,
    target_type: 'group_set',
    target_id: SET,
    payload: {},
    ...over,
  } as ActionRow
}

describe('what an action about groups is about', () => {
  it('is its set by name, a link to its page, never “Group set” and an id', async () => {
    for (const type of ['group.split', 'group.set_members', 'group.create', 'group.sign_up', 'group_set.update']) {
      const w = mount(ActionTarget, {
        props: { action: row({ action_type: type, payload: { set_id: SET } }), courseId: COURSE, link: true },
        global,
      })
      await flushPromises()
      expect(w.text(), type).toContain('Project groups')
      expect(w.text(), type).not.toContain('18ed7430')
      expect(w.findComponent(RouterLinkStub).props('to')).toEqual({
        name: 'course-group-set',
        params: { courseId: COURSE, setId: SET },
      })
      w.unmount()
    }
  })

  it('is the group a change is to, of its set, and the group a sign-up joins', async () => {
    const update = mount(ActionTarget, {
      props: {
        action: row({ action_type: 'group.update', target_type: 'group', target_id: G1, payload: { name: 'Team A' } }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(update.text()).toBe('Group 1, Project groups')
    const signUp = mount(ActionTarget, {
      props: {
        action: row({ action_type: 'group.sign_up', payload: { set_id: SET, group_id: G3 } }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(signUp.text()).toBe('Project groups→ Group 3')
  })

  it('is a set being made by the name it is given, and one it cannot name is called a group set', async () => {
    const made = mount(ActionTarget, {
      props: {
        action: row({ action_type: 'group_set.create', target_id: null, payload: { name: 'Lab groups' } }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(made.text()).toBe('Lab groups')
    const unknown = mount(ActionTarget, {
      props: {
        action: row({ action_type: 'group.split', target_id: '99999999-0000-7000-8000-000000000009' }),
        courseId: COURSE,
      },
      global,
    })
    await flushPromises()
    expect(unknown.text()).toBe('Group set')
  })
})

describe('the fields of an action about groups', () => {
  it('say what was asked in words: the set, how it splits, whom it deals, the groups it adds, who goes where', async () => {
    const split = row({
      action_type: 'group.split',
      payload: { course_id: COURSE, set_id: SET, by: 'count', n: 3, from: 'unassigned', seed: 'QK3M' },
    })
    const w = mount(FieldsView, { props: { courseId: COURSE, value: split.payload, action: split }, global })
    await flushPromises()
    const lines = w.findAll('.fields-view__row').map((r) => r.text())
    expect(lines).toEqual([
      'Group setProject groups',
      'Split byA number of groups',
      'How many3',
      'Dealt fromOnly the students in no group: groups keep their members',
      'SeedQK3M',
    ])

    const add = row({
      action_type: 'group.create',
      payload: { set_id: SET, groups: [{ name: 'Tam A', capacity: 4 }, { name: 'Tam B' }] },
    })
    const a = mount(FieldsView, { props: { courseId: COURSE, value: add.payload, action: add }, global })
    await flushPromises()
    expect(a.text()).toContain('New groupsTam A (capacity 4)Tam B')
    expect(a.text()).not.toContain('{')

    const place = row({
      action_type: 'group.set_members',
      payload: {
        set_id: SET,
        placements: [{ student_member_id: 'm-ana', group_id: G3 }, { student_member_id: 'm-ben' }],
      },
    })
    const p = mount(FieldsView, { props: { courseId: COURSE, value: place.payload, action: place }, global })
    await flushPromises()
    expect(p.findAll('li').map((li) => li.text())).toEqual(['Ana Lee to Group 3', 'Ben Ho out of their group'])

    const change = row({ action_type: 'group.update', target_type: 'group', target_id: G1, payload: { group_id: G1 } })
    const c = mount(FieldsView, { props: { courseId: COURSE, value: change.payload, action: change }, global })
    await flushPromises()
    expect(c.text()).toBe('GroupGroup 1')
  })

  it('say what came of a split in words: the groups it made, whom it placed where, the groups it left alone', async () => {
    const split = row({
      action_type: 'group.split',
      status: 'executed',
      result: {
        seed: 'QK3M',
        created: [{ group_id: G3, name: 'Group 3' }],
        placed: [{ student_member_id: 'm-ana', group_id: G3 }],
        kept: [{ group_id: G1, reason: 'has_work' }],
        emptied: 0,
      },
    })
    const w = mount(FieldsView, { props: { courseId: COURSE, value: split.result, resultOf: split }, global })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('New groupsGroup 3')
    expect(text).toContain('PlacedAna Lee to Group 3')
    expect(text).toContain('Left aloneGroup 1: it has work for an assignment of this set')
    expect(text).not.toContain('{')
    expect(text).not.toContain('has_work')
    expect(text).not.toContain('7d4ed0f3')
  })

  it('name the work a refusal names, by group and assignment', async () => {
    const w = mount(FieldsView, {
      props: {
        courseId: COURSE,
        value: { work: [{ group_id: G1, assignment_id: 'a1', state: 'draft' }] },
        actionType: 'group.update',
      },
      global,
    })
    await flushPromises()
    expect(w.text()).toContain('Work of the group')
    expect(w.text()).toContain('Group 1: Report')
    expect(w.text()).toContain('Draft')
  })
})

describe('why an action about groups was refused', () => {
  const failed = (type: string, reason: string) =>
    ({
      action_type: type,
      status: 'failed',
      result: { error: { code: 'failed_precondition', message: 'Core’s words', details: { reason } } },
    }) as unknown as ActionRow

  it('is said in the words of the pages that do it, never as the bare reason', () => {
    expect(reasonText(storedError(failed('group.sign_up', 'group_full')), 'group.sign_up')).toBe('That group is full.')
    setLocale('zh-Hant')
    expect(reasonText(storedError(failed('group.sign_up', 'group_full')), 'group.sign_up')).toBe('該小組已額滿。')
    setLocale('en')
    // A reason two of them give for different things is said as the one refused means it.
    expect(reasonText(storedError(failed('group.sign_up', 'group_has_work')), 'group.sign_up')).toMatch(
      /^That group has handed work in/,
    )
    expect(reasonText(storedError(failed('group.update', 'group_has_work')), 'group.update')).toBe(
      'That group has work for an assignment of this set, if only a draft: a group with work stays, and is not archived.',
    )
    expect(reasonText(storedError(failed('group.set_members', 'group_has_work')), 'group.set_members')).toMatch(
      /did not say what becomes of it/,
    )
  })
})
