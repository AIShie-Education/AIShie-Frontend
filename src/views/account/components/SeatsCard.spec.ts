import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import type { Membership } from '@/api/types'
import SeatsCard from './SeatsCard.vue'

// The caller's seats on their Account page. A seat's member ID is for those
// who manage a course: a student's own seat shows none, a teacher's does.

enableAutoUnmount(afterEach)
afterEach(() => setLocale('en'))

function seat(member: string, role: string, code: string): Membership {
  return {
    member_id: member,
    course_id: `course-${code}`,
    code,
    section: 'A',
    title: `Course ${code}`,
    role,
    status: 'active',
    course_status: 'active',
    student_scope: 'all',
    assignment_scope: 'all',
    expires_at: null,
  } as unknown as Membership
}

function seats(list: Membership[]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/courses/:courseId', name: 'course-overview', component: { render: () => null } }],
  })
  return mount(SeatsCard, {
    props: { seats: list, loading: false, error: null },
    global: { plugins: [ElementPlus, i18n, router] },
  })
}
/** Each seat's tags, as words. */
const tags = (w: ReturnType<typeof seats>) =>
  w.findAll('.seat').map((s) =>
    s
      .find('.seat__tags')
      .findAll('.app-tag')
      .map((t) => t.text()),
  )

describe('SeatsCard', () => {
  it('says each seat’s role only where the reader’s roles differ among their seats', () => {
    const same = seats([
      seat('01a0d79f-0000-70da-a7cc-00000000aaaa', 'student', 'CS101'),
      seat('01a0d79f-0000-70da-a7cc-00000000bbbb', 'student', 'CS202'),
    ])
    expect(tags(same)).toEqual([[], []])
    const differ = seats([
      seat('01a0d79f-0000-70da-a7cc-00000000aaaa', 'student', 'CS101'),
      seat('01a0d79f-0000-70da-a7cc-00000000bbbb', 'instructor', 'CS202'),
    ])
    expect(tags(differ)).toEqual([['Student'], ['Instructor']])
  })

  it('says a seat’s state only where it is not active', () => {
    const paused = { ...seat('01a0d79f-0000-70da-a7cc-00000000bbbb', 'student', 'CS202'), status: 'paused' }
    const w = seats([seat('01a0d79f-0000-70da-a7cc-00000000aaaa', 'student', 'CS101'), paused as Membership])
    expect(tags(w)).toEqual([[], ['Paused']])
  })

  it('shows a member ID on a teaching seat, and none on a student’s', async () => {
    const w = seats([
      seat('01a0d79f-0000-70da-a7cc-00000000aaaa', 'student', 'CS101'),
      seat('01a0d79f-0000-70da-a7cc-00000000bbbb', 'instructor', 'CS202'),
    ])
    const [student, teaching] = w.findAll('.seat')
    expect(student!.text()).toContain('CS101')
    expect(student!.find('.seat__id').exists()).toBe(false)
    expect(student!.text()).not.toContain('aaaa')
    expect(teaching!.find('.seat__id').exists()).toBe(true)
    expect(teaching!.find('.seat__id').text()).toContain('bbbb')
  })
})
