import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { read } from '@/api/http'
import EventItem from './EventItem.vue'
import { forgetActionWho } from './actors'
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

describe('EventItem, the flexible records', () => {
  const ev = (type: string, subject_type: string, payload: Record<string, unknown>, over: Partial<CourseEvent> = {}) =>
    ({
      seq: 3,
      type,
      occurred_at: '2026-09-28T10:00:00Z',
      subject_type,
      subject_id: 'x1',
      payload,
      ...over,
    }) as CourseEvent

  it('says a roster role changed, from and to', async () => {
    const w = mountItem(ev('member.role_changed', 'course_member', { from: 'student', to: 'ta' }))
    await flushPromises()
    expect(w.text()).toContain('Roster role changed')
    expect(w.text()).toContain('Student → Teaching assistant')
    w.unmount()
  })

  it('says what of the course changed', async () => {
    const w = mountItem(ev('course.updated', 'course', { fields: ['title', 'description'] }))
    await flushPromises()
    expect(w.text()).toContain('Title changed')
    expect(w.text()).toContain('Description changed')
    w.unmount()
  })

  it('says a change of points after grading rescaled them, and how many', async () => {
    const w = mountItem(
      ev('assignment.updated', 'assignment', { points_changed: true, existing_grades: 'rescale', rescaled: 3 }),
    )
    await flushPromises()
    expect(w.text()).toContain('Points changed')
    expect(w.text()).toContain('Grades rescaled: 3')
    w.unmount()
  })

  it('says a document was renamed, brought back or purged', async () => {
    let w = mountItem(ev('document.updated', 'document', { kind: 'material', title_changed: true }))
    await flushPromises()
    expect(w.text()).toContain('Renamed')
    w.unmount()
    w = mountItem(ev('document.purged', 'document', { kind: 'material', versions: 2 }))
    await flushPromises()
    expect(w.text()).toContain('Document purged')
    expect(w.text()).toContain('The whole document purged (2 versions)')
    w.unmount()
    w = mountItem(ev('document.purged', 'document', { kind: 'material', versions: 1, version_id: 'v1' }))
    await flushPromises()
    expect(w.text()).toContain('One version purged')
    w.unmount()
  })

  it('names what became of a total, and final grades undone, in Chinese too', async () => {
    const e = ev('grade.total_overridden', 'grade', { component_id: 'c1' }, { student_member_id: 's1' })
    let w = mountItem(e)
    await flushPromises()
    expect(w.text()).toContain('Total overridden')
    w.unmount()
    setLocale('zh-Hant')
    w = mountItem(ev('grade.total_override_cleared', 'grade', { component_id: 'c1' }, { student_member_id: 's1' }))
    await flushPromises()
    expect(w.text()).toContain('取消總分覆寫')
    w.unmount()
    w = mountItem(ev('grade.ungraded_as_zero_undone', 'gradebook', {}, { subject_id: 's1', student_member_id: 's1' }))
    await flushPromises()
    expect(w.text()).toContain('撤回最終成績')
    w.unmount()
  })
})

describe('EventItem, a student’s password reset', () => {
  it('says so, and how many of their sessions were signed out', async () => {
    const w = mountItem({
      seq: 4,
      type: 'member.password_reset',
      occurred_at: '2026-09-28T10:00:00Z',
      subject_type: 'course_member',
      subject_id: 's1',
      student_member_id: 's1',
      payload: { reset_by_member_id: 'm1', sessions_ended: 2 },
    } as CourseEvent)
    await flushPromises()
    expect(w.text()).toContain('Student’s password reset')
    expect(w.text()).toContain('2 sessions signed out')
    w.unmount()
  })
})

describe('EventItem, a message posted in a conversation', () => {
  const posted = (payload: Record<string, unknown>): CourseEvent => ({
    seq: 9,
    type: 'conversation.message_posted',
    occurred_at: '2026-09-30T10:00:00Z',
    subject_type: 'conversation',
    subject_id: 'c1',
    payload: { conversation_id: 'c1', message_id: 'm1', author_member_id: 's1', ...payload },
  })

  it('says how many files it carries, and names them on hover', async () => {
    const w = mountItem(
      posted({
        attachments: [
          { id: 'f1', filename: 'notes.pdf', content_type: 'application/pdf', byte_size: 100 },
          { id: 'f2', filename: 'plot.png', content_type: 'image/png', byte_size: 200 },
        ],
      }),
    )
    await flushPromises()
    expect(w.text()).toContain('With 2 files')
    expect(tips(w)).toEqual(['notes.pdf, plot.png'])
    w.unmount()
  })

  it('says nothing of files when it carries none', async () => {
    const w = mountItem(posted({}))
    await flushPromises()
    expect(w.text()).not.toContain('file')
    w.unmount()
  })
})

describe('EventItem, a new version of a document', () => {
  const added = (payload: Record<string, unknown>): CourseEvent => ({
    seq: 11,
    type: 'document.version_added',
    occurred_at: '2026-09-30T10:00:00Z',
    subject_type: 'document',
    subject_id: 'doc-1',
    payload: { kind: 'material', seq: 2, ...payload },
  })

  it('says how many files the version holds', async () => {
    const w = mountItem(added({ files: 3 }))
    await flushPromises()
    expect(w.text()).toContain('Version 2')
    expect(w.text()).toContain('3 files')
    w.unmount()
    const one = mountItem(added({ files: 1 }))
    await flushPromises()
    expect(one.text()).toContain('One file')
    one.unmount()
  })

  it('says a version of no file is text alone, and nothing where Core said nothing', async () => {
    const w = mountItem(added({ files: 0 }))
    await flushPromises()
    expect(w.text()).toContain('Text only')
    w.unmount()
    const old = mountItem(added({}))
    await flushPromises()
    expect(old.text()).not.toContain('file')
    expect(old.text()).not.toContain('Text only')
    old.unmount()
  })
})

describe('EventItem, who acted on an action', () => {
  const action = (type: string, payload: Record<string, unknown> = {}): CourseEvent => ({
    seq: 30,
    type,
    occurred_at: '2026-09-01T00:00:00Z',
    subject_type: 'action',
    subject_id: 'act-1',
    action_id: 'act-1',
    payload: { action_type: 'grade.submit', ...payload },
  })
  let asked: string[] = []
  beforeEach(() => {
    forgetActionWho()
    asked = []
    vi.mocked(read).mockImplementation((async (name: string, args: Record<string, unknown>) => {
      asked.push(`${name} ${args.action_id}`)
      if (name !== 'action.get') throw new Error(`unexpected ${name}`)
      return { id: 'act-1', member_id: 'm-agent', decided_by_member_id: 'm-teacher', reviewed_by_member_id: null }
    }) as unknown as typeof read)
  })
  const names = (w: ReturnType<typeof mountItem>) =>
    w.findAll('.event-item__who member-name-stub').map((x) => x.attributes('id'))

  it('names who proposed it, then who decided it, read once from the action', async () => {
    const w = mountItem(action('action.approved', { outcome: 'executed' }))
    await flushPromises()
    expect(asked).toEqual(['action.get act-1'])
    expect(names(w)).toEqual(['m-agent', 'm-teacher'])
    expect(w.find('.event-item__who').text()).toMatch(/proposed\s*→\s*approved/)
    w.unmount()
    // Its proposal, after: read already.
    const p = mountItem(action('action.proposed'))
    await flushPromises()
    expect(asked).toEqual(['action.get act-1'])
    expect(names(p)).toEqual(['m-agent'])
    expect(p.find('.event-item__who').text()).toBe('proposed')
    p.unmount()
  })

  it('reads in Chinese with no spaces of its own', async () => {
    setLocale('zh-Hant')
    const w = mountItem(action('action.rejected'))
    await flushPromises()
    expect(w.find('.event-item__who').text()).toMatch(/^提出\s*→\s*駁回$/)
    w.unmount()
  })

  it('names nobody where the action cannot be read, and in a short list', async () => {
    vi.mocked(read).mockImplementation((async () => Promise.reject(new Error('forbidden'))) as unknown as typeof read)
    const w = mountItem(action('action.proposed'))
    await flushPromises()
    expect(w.find('.event-item__who').exists()).toBe(false)
    w.unmount()
    forgetActionWho()
    setActivePinia(createPinia())
    const c = mount(EventItem, {
      props: { event: action('action.proposed'), courseId: COURSE, compact: true },
      global: {
        plugins: [i18n, ElementPlus],
        stubs: { ElTooltip: TooltipStub, RouterLink: true, MemberName: true, TimeText: true },
      },
    })
    await flushPromises()
    expect(c.find('.event-item__who').exists()).toBe(false)
    c.unmount()
  })
})
