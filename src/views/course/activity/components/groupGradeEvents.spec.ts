import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import EventItem from './EventItem.vue'
import type { CourseEvent } from './feed'

// The feed's words for what group grading writes: a member's grade from
// their group's, one set apart from it alone, and whose work it is corrected.
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => Promise.reject(new Error('no reads here'))) }
})

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'

function mountItem(type: string, subject: string, payload: Record<string, unknown>) {
  setActivePinia(createPinia())
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { grade_submit: 'autonomous', grade_post: 'autonomous' } as never
  const e: CourseEvent = {
    seq: 1,
    type,
    occurred_at: '2026-10-05T10:00:00Z',
    subject_type: subject,
    subject_id: 'x-1',
    payload,
  }
  return mount(EventItem, {
    props: { event: e, courseId: COURSE },
    global: { plugins: [i18n, ElementPlus], stubs: { RouterLink: true, MemberName: true, TimeText: true } },
  })
}

beforeEach(() => setLocale('en'))

describe('the feed, on group grading', () => {
  it('says a grade came from a group’s, and was set apart for its member', async () => {
    const w = mountItem('grade.regraded', 'grade', { replaces: 'g-old', group_grade_id: 'gg', adjusted: true })
    await flushPromises()
    expect(w.text()).toContain('From a group’s grade')
    expect(w.text()).toContain('Adjusted for this member')
  })

  it('says nothing of an adjustment the event does not carry', async () => {
    const w = mountItem('grade.created', 'grade', { group_grade_id: 'gg' })
    await flushPromises()
    expect(w.text()).toContain('From a group’s grade')
    expect(w.text()).not.toContain('Adjusted')
  })

  it('names a correction of whose work it is, and which way', async () => {
    const w = mountItem('submission.members_changed', 'submission', { change: 'added', group_id: 'gA' })
    await flushPromises()
    expect(w.text()).toContain('Whose work it is corrected')
    expect(w.text()).toContain('Added to a group’s work')
  })

  it('names it in Chinese too', async () => {
    setLocale('zh-Hant')
    const w = mountItem('submission.members_changed', 'submission', { change: 'removed', group_id: 'gA' })
    await flushPromises()
    expect(w.text()).toContain('更正作業成員')
    expect(w.text()).toContain('移出小組作業')
  })
})
