import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import EventItem from '@/views/course/activity/components/EventItem.vue'
import { categoryOf, subjectKind, subjectRoute, type CourseEvent } from '@/views/course/activity/components/feed'
import GroupProposal from './GroupProposal.vue'
import { isGroupAction } from './groupEvents'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))
const T0 = '2026-10-05T09:00:00Z'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  setLocale('en')
  read.mockReset().mockImplementation(async (tool: string) => {
    if (tool === 'group_set.list')
      return {
        sets: [
          {
            id: 'set-1',
            name: 'Project groups',
            signup: { open: false, joinable: false },
            created_at: T0,
            updated_at: T0,
            assignments: [],
            groups: [
              { id: 'g1', name: 'Group 1', size: 1, full: false, created_at: T0 },
              { id: 'g2', name: 'Group 2', size: 1, full: false, created_at: T0 },
            ],
          },
        ],
      }
    throw new Error(`no ${tool} here`)
  })
})

afterEach(() => vi.unstubAllGlobals())

function ev(type: string, subject_type: string, subject_id: string, payload: Record<string, unknown>): CourseEvent {
  return { seq: 1, type, occurred_at: T0, subject_type, subject_id, student_member_id: 'm-ana', payload } as CourseEvent
}

function mountItem(e: CourseEvent) {
  setActivePinia(createPinia())
  return mount(EventItem, {
    props: { event: e, courseId: COURSE },
    global: { plugins: [i18n, ElementPlus], stubs: { RouterLink: RouterLinkStub, MemberName: true, TimeText: true } },
  })
}

describe('the course’s feed, of groups', () => {
  it('files a group’s news with the members’, and opens the set it is of', () => {
    const e = ev('group.member_added', 'group', 'g2', { set_id: 'set-1', group_id: 'g2', how: 'signup' })
    expect(categoryOf(e.type)).toBe('members')
    expect(categoryOf('group_set.updated')).toBe('members')
    expect(subjectKind(e)).toBe('group')
    expect(subjectRoute(e, COURSE, { readsMembers: false, decides: false })).toEqual({
      name: 'course-group-set',
      params: { courseId: COURSE, setId: 'set-1' },
    })
    const set = ev('group_set.created', 'group_set', 'set-1', {})
    expect(subjectRoute(set, COURSE, { readsMembers: false, decides: false })).toEqual({
      name: 'course-group-set',
      params: { courseId: COURSE, setId: 'set-1' },
    })
  })

  it('says who was put in which group, how and from which, by the names of the set and its groups', async () => {
    const w = mountItem(
      ev('group.member_added', 'group', 'g2', { set_id: 'set-1', group_id: 'g2', how: 'signup', from_group_id: 'g1' }),
    )
    await flushPromises()
    expect(read).toHaveBeenCalledWith('group_set.list', { course_id: COURSE, include_archived: true })
    expect(w.find('.event-item__title').text()).toBe('Put in a group')
    expect(w.find('.event-item__subject').text()).toBe('Group 2, Project groups')
    expect(w.text()).toContain('Signed up')
    expect(w.text()).toContain('from Group 1')
    w.unmount()
  })

  it('says what changed of a set: sign-up closed, a deadline', async () => {
    const w = mountItem(
      ev('group_set.updated', 'group_set', 'set-1', {
        changed: ['signup_open', 'signup_closes_at'],
        signup_open: false,
        archived: false,
      }),
    )
    await flushPromises()
    expect(w.find('.event-item__title').text()).toBe('Group set changed')
    expect(w.find('.event-item__subject').text()).toBe('Project groups')
    expect(w.text()).toContain('Sign-up closed')
    expect(w.text()).toContain('Sign-up deadline changed')
    w.unmount()
  })
})

describe('an action about groups, where it is decided', () => {
  const action = (action_type: string, payload: Record<string, unknown>, target_id = 'set-1') =>
    ({ id: 'act-1', action_type, target_type: 'group_set', target_id, payload, status: 'proposed' }) as never

  function mountProposal(a: never, compact = false) {
    setActivePinia(createPinia())
    return mount(GroupProposal, {
      props: { action: a, courseId: COURSE, compact },
      global: {
        plugins: [i18n, ElementPlus],
        stubs: {
          RouterLink: RouterLinkStub,
          MemberName: { props: ['id'], template: '<span>{{ id }}</span>' },
          TimeText: true,
        },
      },
    })
  }

  it('is any of forming or joining groups', () => {
    for (const t of ['group.split', 'group.set_members', 'group.sign_up', 'group_set.create', 'group.update'])
      expect(isGroupAction(t), t).toBe(true)
    expect(isGroupAction('grade.submit')).toBe(false)
  })

  it('says a split’s size, from whom and the seed it is pinned to', async () => {
    const w = mountProposal(
      action('group.split', { set_id: 'set-1', by: 'size', n: 4, from: 'all', seed: 'QK3M7ZP2VX9D' }),
    )
    await flushPromises()
    expect(w.text()).toContain('Project groups')
    expect(w.text()).toContain('Groups of up to 4 students')
    expect(w.text()).toContain('Everyone: empty the groups and deal them all again')
    expect(w.find('.group-proposal__seed').text()).toBe('QK3M7ZP2VX9D')
    expect(w.text()).toContain('Named like Group 1')
    const card = mountProposal(action('group.split', { set_id: 'set-1', by: 'count', n: 6, from: 'unassigned' }), true)
    await flushPromises()
    expect(card.text()).toBe('Project groups6 groups in the set')
  })

  it('lists who goes where, and says when it moves students of a group with work', async () => {
    const w = mountProposal(
      action('group.set_members', {
        set_id: 'set-1',
        affects_work: true,
        placements: [{ student_member_id: 'm-ana', group_id: 'g2' }, { student_member_id: 'm-ben' }],
      }),
    )
    await flushPromises()
    const lines = w.findAll('.group-proposal__list li').map((li) => li.text())
    expect(lines).toEqual(['m-ana to Group 2', 'm-ben out of their group'])
    expect(w.text()).toContain('a draft follows the group')
  })

  it('says what a student’s agent asks for them in sign-up', async () => {
    const w = mountProposal(action('group.sign_up', { set_id: 'set-1', group_id: 'g1', student_member_id: 'm-ana' }))
    await flushPromises()
    expect(w.text()).toContain('m-ana joins Group 1')
  })
})
