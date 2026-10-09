import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import MemberGroupsCard from './MemberGroupsCard.vue'
import { scopeReaches } from './groupModel'

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
  read.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

/** The course's one set as a reader is shown it: Ada in G1 where their scope reaches her, nobody named otherwise. */
function listAs(reachesAda: boolean) {
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
          {
            id: 'g1',
            name: 'G1',
            size: 2,
            full: false,
            created_at: T0,
            members: reachesAda ? [{ member_id: 'm-ada', display_name: 'Ada Lee' }] : [],
          },
        ],
      },
    ],
  }
}

async function mountCard(
  memberId: string,
  seat: { student_scope: string; listed_students?: string[] | null; principal_member_id?: string },
  reachesAda: boolean,
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useCourseStore().$patch({
    courseId: COURSE,
    membership: {
      member_id: 'm-ta',
      role: 'ta',
      student_scope: seat.student_scope,
      principal_member_id: seat.principal_member_id,
    } as never,
    seat: { id: 'm-ta', student_scope: seat.student_scope, listed_students: seat.listed_students ?? null } as never,
    perms: { member_read: 'autonomous', document_read: 'autonomous' },
    permsSource: 'exact',
    membersState: 'loaded',
  } as never)
  read.mockImplementation(async (tool: string) => {
    if (tool === 'group_set.list') return listAs(reachesAda)
    if (tool === 'group_set.get') return { ...listAs(reachesAda).sets[0], history: [] }
    throw new Error(`no ${tool} here`)
  })
  const w = mount(MemberGroupsCard, {
    props: { courseId: COURSE, memberId },
    global: {
      plugins: [pinia, i18n, ElementPlus],
      stubs: { RouterLink: RouterLinkStub, MemberName: true, TimeText: true },
    },
  })
  await flushPromises()
  return w
}

describe('a student’s groups on their member page', () => {
  it('names the group they are in, set by set', async () => {
    const w = await mountCard('m-ada', { student_scope: 'all' }, true)
    expect(w.find('.member-groups__group').text()).toBe('G1')
  })

  it('says a student the reader’s scope reaches is in no group, and never was, where that is so', async () => {
    const w = await mountCard('m-ben', { student_scope: 'all' }, true)
    expect(w.find('.member-groups__none').text()).toBe('In no group')
    await w.find('.member-groups__toggle').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Never in a group of this set.')
  })

  it('says, to a reader whose scope does not reach the student, that their groups are not shown, never that they are in none', async () => {
    // A teaching assistant listed for Ada opens Ben's page: the server shows them nothing of Ben's groups.
    const w = await mountCard('m-ben', { student_scope: 'listed', listed_students: ['m-ada'] }, true)
    expect(w.find('.member-groups__out').text()).toBe(
      'This student is not among the students your seat reaches, so their groups are not shown to you.',
    )
    expect(w.text()).not.toContain('In no group')
    expect(w.find('.member-groups__toggle').exists()).toBe(false)
    // Ada, whom the seat lists, is named in her group.
    const ada = await mountCard('m-ada', { student_scope: 'listed', listed_students: ['m-ada'] }, true)
    expect(ada.find('.member-groups__group').text()).toBe('G1')
  })

  it('says no group is shown, not that there is none, where the page cannot tell whom the reader reaches', async () => {
    // A delegate reaches no student its principal does not, which is not read here.
    const w = await mountCard('m-ben', { student_scope: 'all', principal_member_id: 'm-teacher' }, false)
    expect(w.find('.member-groups__none').text()).toBe('In no group shown to you')
    await w.find('.member-groups__toggle').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('None of their time in this set’s groups is shown to you.')
  })
})

describe('whom a reader’s seat reaches', () => {
  it('is every student for a seat of all, those listed for a listed one, and not known for a delegate or an unread list', () => {
    expect(scopeReaches({ student_scope: 'all' }, 'm-1')).toBe(true)
    expect(scopeReaches({ student_scope: 'listed', listed_students: ['m-1'] }, 'm-1')).toBe(true)
    expect(scopeReaches({ student_scope: 'listed', listed_students: ['m-1'] }, 'm-2')).toBe(false)
    expect(scopeReaches({ student_scope: 'listed', listed_students: null }, 'm-2')).toBeNull()
    expect(scopeReaches({ student_scope: 'all', delegate: true }, 'm-2')).toBeNull()
    expect(scopeReaches({ student_scope: 'listed', listed_students: [], delegate: true }, 'm-2')).toBe(false)
    expect(scopeReaches(null, 'm-2')).toBeNull()
  })
})
