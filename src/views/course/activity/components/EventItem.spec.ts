import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'
import { i18n, setLocale } from '@/i18n'
import EventItem from './EventItem.vue'
import type { CourseEvent } from './feed'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => Promise.reject(new Error('no reads here'))) }
})

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'

// The tooltip's words, where a test can read them.
const TooltipStub = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' } },
  setup:
    (p, { slots }) =>
    () =>
      h('span', { class: 'tip', 'data-tip': p.content }, slots.default?.()),
})

function event(type: string, kind: string | undefined): CourseEvent {
  return {
    seq: 1,
    type,
    occurred_at: '2026-09-01T00:00:00Z',
    subject_type: 'document',
    subject_id: 'doc-1',
    payload: kind ? { kind } : {},
  }
}

function mountItem(e: CourseEvent) {
  setActivePinia(createPinia())
  return mount(EventItem, {
    props: { event: e, courseId: COURSE },
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { ElTooltip: TooltipStub, RouterLink: true, MemberName: true, TimeText: true },
    },
  })
}

const tips = (w: ReturnType<typeof mountItem>) => w.findAll('.tip').map((x) => x.attributes('data-tip'))

beforeEach(() => setLocale('en'))

describe('EventItem, an event filed while no published assignment used the document', () => {
  it('does not promise students a rubric', async () => {
    const w = mountItem(event('document.rubric_published_unreleased', 'rubric'))
    await flushPromises()
    expect(w.text()).toContain('No published assignment used it then')
    expect(w.text()).not.toContain('students')
    expect(tips(w)).toEqual([i18n.global.t('activity.fact.unreleasedTip.rubric')])
    expect(tips(w)[0]).not.toContain('It may be visible to them now')
    w.unmount()
  })

  it('says what instructions become once an assignment using them is published', async () => {
    const w = mountItem(event('document.published_unreleased', 'instructions'))
    await flushPromises()
    expect(tips(w)).toEqual([i18n.global.t('activity.fact.unreleasedTip.instructions')])
    w.unmount()
  })

  it('says nothing of students for a document of no known kind', async () => {
    const w = mountItem(event('document.created_unreleased', undefined))
    await flushPromises()
    expect(tips(w)).toEqual([i18n.global.t('activity.fact.unreleasedTip.other')])
    expect(tips(w)[0]).not.toMatch(/student/i)
    w.unmount()
  })
})

describe('EventItem, invite links', () => {
  it('says that a member joined through an invite link', async () => {
    const w = mountItem({
      seq: 2,
      type: 'member.added',
      occurred_at: '2026-09-01T00:00:00Z',
      subject_type: 'course_member',
      subject_id: 'm-1',
      payload: { role: 'student', via: 'join_link', join_link_id: 'l-1' },
    })
    await flushPromises()
    expect(w.text()).toContain('Member added')
    expect(w.text()).toContain('Student')
    expect(w.text()).toContain('Joined by invite link')
    w.unmount()
  })

  it('says nothing of a link for a member added by hand', async () => {
    const w = mountItem({
      seq: 3,
      type: 'member.added',
      occurred_at: '2026-09-01T00:00:00Z',
      subject_type: 'course_member',
      subject_id: 'm-2',
      payload: { role: 'student' },
    })
    await flushPromises()
    expect(w.text()).not.toContain('invite link')
    w.unmount()
  })

  it('names a link made and a link revoked', async () => {
    for (const [type, words] of [
      ['course.join_link_created', 'Invite link created'],
      ['course.join_link_revoked', 'Invite link revoked'],
    ]) {
      const w = mountItem({
        seq: 4,
        type: type!,
        occurred_at: '2026-09-01T00:00:00Z',
        subject_type: 'course_join_link',
        subject_id: 'l-1',
        payload: {},
      })
      await flushPromises()
      expect(w.text()).toContain(words)
      w.unmount()
    }
  })
})

describe('EventItem, a decision by the owner of the agent that made it', () => {
  const byOwner = (type: string, payload: Record<string, unknown>): CourseEvent => ({
    seq: 2,
    type,
    occurred_at: '2026-09-28T10:00:00Z',
    subject_type: 'action',
    subject_id: 'p1',
    action_id: 'p1',
    payload: { action_type: 'submission.create', by_action_id: 'd1', ...payload },
  })

  it('says the owner decided it, reviewed it or took it back', async () => {
    let w = mountItem(byOwner('action.approved', { outcome: 'executed', by_owner: true }))
    await flushPromises()
    expect(w.text()).toContain('Decided by its agent’s owner')
    w.unmount()
    w = mountItem(byOwner('action.reviewed', { by_owner: true }))
    await flushPromises()
    expect(w.text()).toContain('Reviewed by its agent’s owner')
    w.unmount()
    w = mountItem(byOwner('action.cancelled', { reason: 'withdrawn', by_owner: true }))
    await flushPromises()
    expect(w.text()).toContain('Taken back by its agent’s owner')
    expect(w.text()).not.toContain('Taken back by the proposer')
    w.unmount()
  })

  it('says nothing of an owner when someone else decided', async () => {
    const w = mountItem(byOwner('action.approved', { outcome: 'executed' }))
    await flushPromises()
    expect(w.text()).not.toContain('owner')
    w.unmount()
  })
})
