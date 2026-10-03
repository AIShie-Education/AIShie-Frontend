import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { read } from '@/api/http'
import EventItem from './EventItem.vue'
import { useCourseStore } from '@/stores/course'
import { ensureEventWho, forgetActionWho } from './actors'
import { whoReachOf, type CourseEvent } from './feed'

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

function mountItem(
  e: CourseEvent,
  perms: Record<string, string> = {},
  opts: { compact?: boolean; links?: boolean } = {},
) {
  setActivePinia(createPinia())
  if (Object.keys(perms).length) {
    const course = useCourseStore()
    course.permsSource = 'exact'
    course.perms = perms as never
  }
  return mount(EventItem, {
    props: { event: e, courseId: COURSE, compact: opts.compact },
    global: {
      plugins: [i18n, ElementPlus],
      // With links, a link is an <a> with its words, where it leads in its props.
      stubs: {
        ElTooltip: TooltipStub,
        RouterLink: opts.links ? RouterLinkStub : true,
        MemberName: true,
        TimeText: true,
      },
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

describe('EventItem, a proposal sent back for changes, and its revision', () => {
  const ev = (type: string, payload: Record<string, unknown>): CourseEvent => ({
    seq: 4,
    type,
    occurred_at: '2026-10-02T10:00:00Z',
    subject_type: 'action',
    subject_id: 'p2',
    action_id: 'p2',
    payload: { action_type: 'grade.submit', ...payload },
  })

  it('names the event, and the owner where they sent it back', async () => {
    const w = mountItem(ev('action.changes_requested', { by_action_id: 'd1', by_owner: true }))
    await flushPromises()
    expect(w.find('.event-item__title').text()).toBe('Proposal sent back for changes')
    expect(w.text()).toContain('Decided by its agent’s owner')
    w.unmount()
  })

  it('says a proposal revises an earlier one', async () => {
    const w = mountItem(
      ev('action.proposed', { target_type: 'submission', revises_action_id: 'p1' }),
      {},
      { links: true },
    )
    await flushPromises()
    expect(w.text()).toContain('Revises an earlier proposal')
    // Someone who does not read the action log is not offered that one to open.
    expect(w.find('.event-item__fact-link').exists()).toBe(false)
    w.unmount()
  })

  it('links a decider to the proposal it revises, with its id', async () => {
    const w = mountItem(
      ev('action.proposed', { target_type: 'submission', revises_action_id: 'p1' }),
      { action_decide: 'autonomous' },
      { links: true },
    )
    await flushPromises()
    const fact = w.find('.event-item__fact-link')
    expect(fact.exists()).toBe(true)
    const link = fact.findComponent(RouterLinkStub)
    expect(link.text()).toBe('Revises an earlier proposal')
    expect(link.props('to')).toEqual({ name: 'course-action', params: { courseId: COURSE, actionId: 'p1' } })
    expect(fact.find('.id-text').exists()).toBe(true)
    w.unmount()
  })

  it('says it without a link in the overview’s short list, even to a decider', async () => {
    const w = mountItem(
      ev('action.proposed', { target_type: 'submission', revises_action_id: 'p1' }),
      { action_decide: 'autonomous' },
      { links: true, compact: true },
    )
    await flushPromises()
    expect(w.text()).toContain('Revises an earlier proposal')
    expect(w.find('.event-item__fact-link').exists()).toBe(false)
    w.unmount()
  })

  it('says nothing of revising where a proposal revises none', async () => {
    const w = mountItem(ev('action.proposed', { target_type: 'submission' }))
    await flushPromises()
    expect(w.text()).not.toContain('Revises')
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
    expect(tips(w)).toEqual(['notes.pdf and plot.png'])
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

describe('EventItem, who acted', () => {
  const DECIDES = { action_decide: 'autonomous' }
  const action = (type: string, payload: Record<string, unknown> = {}): CourseEvent => ({
    seq: 30,
    type,
    occurred_at: '2026-09-01T00:00:00Z',
    subject_type: 'action',
    subject_id: 'act-1',
    action_id: 'act-1',
    payload: { action_type: 'grade.submit', ...payload },
  })
  // Any other event, filed under the action it was done under.
  const done = (type: string, actionId: string | undefined): CourseEvent => ({
    seq: 31,
    type,
    occurred_at: '2026-09-01T00:00:00Z',
    subject_type: 'grade',
    subject_id: 'g-1',
    ...(actionId ? { action_id: actionId } : {}),
    payload: {},
  })
  let asked: string[] = []
  let decided: string | null = 'm-teacher'
  beforeEach(() => {
    forgetActionWho()
    asked = []
    decided = 'm-teacher'
    vi.mocked(read).mockImplementation((async (name: string, args: Record<string, unknown>) => {
      asked.push(`${name} ${args.action_id}`)
      if (name !== 'action.get') throw new Error(`unexpected ${name}`)
      return { id: args.action_id, member_id: 'm-agent', decided_by_member_id: decided, reviewed_by_member_id: null }
    }) as unknown as typeof read)
  })
  const names = (w: ReturnType<typeof mountItem>) =>
    w.findAll('.event-item__who member-name-stub').map((x) => x.attributes('id'))

  it('names who proposed it, then who decided it, read once from the action, on the row’s first line', async () => {
    const w = mountItem(action('action.approved', { outcome: 'executed' }), DECIDES)
    await flushPromises()
    expect(asked).toEqual(['action.get act-1'])
    expect(names(w)).toEqual(['m-agent', 'm-teacher'])
    expect(w.find('.event-item__who').text()).toMatch(/proposed\s*→\s*approved/)
    // First, before what happened.
    expect(w.find('.event-item__body').element.firstElementChild?.classList).toContain('event-item__who')
    w.unmount()
    // Its proposal, after: read already.
    const p = mountItem(action('action.proposed'), DECIDES)
    await flushPromises()
    expect(asked).toEqual(['action.get act-1'])
    expect(names(p)).toEqual(['m-agent'])
    expect(p.find('.event-item__who').text()).toBe('proposed')
    p.unmount()
  })

  it('reads in Chinese with no spaces of its own', async () => {
    setLocale('zh-Hant')
    const w = mountItem(action('action.rejected'), DECIDES)
    await flushPromises()
    expect(w.find('.event-item__who').text()).toMatch(/^提出\s*→\s*駁回$/)
    w.unmount()
  })

  it.each([
    ['en', /^proposed\s*→\s*requested changes$/],
    ['zh-Hant', /^提出\s*→\s*要求修改$/],
  ] as const)('names who proposed it and who sent it back for changes (%s)', async (locale, text) => {
    setLocale(locale)
    const w = mountItem(action('action.changes_requested', { by_action_id: 'd1' }), DECIDES)
    await flushPromises()
    expect(names(w)).toEqual(['m-agent', 'm-teacher'])
    expect(w.find('.event-item__who').text()).toMatch(text)
    w.unmount()
  })

  it('names who did any other event, from the action it was done under', async () => {
    decided = null
    const w = mountItem(done('grade.created', 'act-9'), DECIDES)
    await flushPromises()
    expect(asked).toEqual(['action.get act-9'])
    expect(names(w)).toEqual(['m-agent'])
    expect(w.find('.event-item__who').text()).toBe('did it')
    w.unmount()
  })

  it('names who proposed it and who approved it, for an event of an approved proposal', async () => {
    const w = mountItem(done('grade.created', 'act-8'), DECIDES)
    await flushPromises()
    expect(names(w)).toEqual(['m-agent', 'm-teacher'])
    expect(w.find('.event-item__who').text()).toMatch(/proposed\s*→\s*approved/)
    w.unmount()
  })

  it('asks nothing for a seat it does not know, nor for an event of no action', async () => {
    const w = mountItem(action('action.proposed'))
    await flushPromises()
    const g = mountItem(done('grade.created', 'act-7'), { action_decide: 'denied' })
    await flushPromises()
    const n = mountItem(done('grade.created', undefined), DECIDES)
    await flushPromises()
    expect(asked).toEqual([])
    for (const x of [w, g, n]) {
      expect(x.find('.event-item__who').exists()).toBe(false)
      x.unmount()
    }
  })

  it('names nobody where the action cannot be read, and in a short list', async () => {
    vi.mocked(read).mockImplementation((async () => Promise.reject(new Error('forbidden'))) as unknown as typeof read)
    const w = mountItem(action('action.proposed'), DECIDES)
    await flushPromises()
    expect(w.find('.event-item__who').exists()).toBe(false)
    w.unmount()
    forgetActionWho()
    setActivePinia(createPinia())
    const course = useCourseStore()
    course.permsSource = 'exact'
    course.perms = DECIDES as never
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

describe('EventItem, who acted, to a seat that does not decide actions', () => {
  const STUDENT = { action_decide: 'denied', document_read: 'autonomous' }
  const done = (actionId: string, student: string | null = 'm-yuki'): CourseEvent => ({
    seq: 40,
    type: 'submission.submitted',
    occurred_at: '2026-09-01T00:00:00Z',
    subject_type: 'submission',
    subject_id: 's-1',
    action_id: actionId,
    ...(student ? { student_member_id: student } : {}),
    payload: {},
  })
  let asked: string[] = []
  beforeEach(() => {
    forgetActionWho()
    asked = []
    vi.mocked(read).mockImplementation((async (name: string, args: Record<string, unknown>) => {
      if (name === 'action.list_mine') {
        asked.push(`${name} ${args.after ?? ''} ${String(args.exclude_types)}`)
        // Her own: one she did, and one she proposed that her teacher approved.
        return {
          actions: [
            { id: 'act-1', actor_id: 'a-yuki', member_id: 'm-yuki' },
            { id: 'act-2', actor_id: 'a-yuki', member_id: 'm-yuki', decided_by_member_id: 'm-teacher' },
          ],
        }
      }
      asked.push(`${name} ${args.action_id ?? ''}`)
      if (name === 'agent.list') return { agents: [{ actor_id: 'a-helper', display_name: 'Yuki’s revision helper' }] }
      // Core lets her read her own agent's action, and no one else's.
      if (name === 'action.get' && args.action_id === 'act-agent')
        return { id: 'act-agent', actor_id: 'a-helper', member_id: 'm-helper', decided_by_member_id: 'm-teacher' }
      throw new Error('forbidden')
    }) as unknown as typeof read)
  })
  function mountAs(e: CourseEvent, ownsAgent: boolean) {
    setActivePinia(createPinia())
    const course = useCourseStore()
    course.permsSource = 'exact'
    course.perms = STUDENT as never
    course.membership = { member_id: 'm-yuki' } as never
    course.ownsAgentHere = ownsAgent
    return mount(EventItem, {
      props: { event: e, courseId: COURSE },
      global: {
        plugins: [i18n, ElementPlus],
        stubs: { ElTooltip: TooltipStub, RouterLink: true, MemberName: true, TimeText: true },
      },
    })
  }
  const parts = (w: ReturnType<typeof mountAs>) =>
    w.findAll('.event-item__who member-name-stub').map((x) => [x.attributes('id'), x.attributes('agent') ?? ''])

  it('names who acted in her own actions, from her own list of them, leaving out her chats', async () => {
    const w = mountAs(done('act-1'), false)
    const p = mountAs(done('act-2'), false)
    await flushPromises()
    // Read from the start, then on from where it ended for whatever was asked while it was read.
    expect(asked).toEqual([
      'action.list_mine  conversation.ask,conversation.answer',
      'action.list_mine act-2 conversation.ask,conversation.answer',
    ])
    expect(parts(w)).toEqual([['m-yuki', '']])
    expect(w.find('.event-item__who').text()).toBe('did it')
    expect(parts(p)).toEqual([
      ['m-yuki', ''],
      ['m-teacher', ''],
    ])
    expect(p.find('.event-item__who').text()).toMatch(/proposed\s*→\s*approved/)
    w.unmount()
    p.unmount()
  })

  it('names her own agent, by its name, where it acted on her work, and asks nothing of anyone else’s', async () => {
    const w = mountAs(done('act-agent'), true)
    await flushPromises()
    expect(asked).toEqual([
      'action.list_mine  conversation.ask,conversation.answer',
      'action.get act-agent',
      'agent.list ',
    ])
    expect(parts(w)).toEqual([
      ['m-helper', '[object Object]'],
      ['m-teacher', ''],
    ])
    w.unmount()
    // Another's action about her work: asked of, refused, and named nobody; about no work of hers, never asked.
    const o = mountAs(done('act-other'), true)
    const c = mountAs(done('act-course', null), true)
    await flushPromises()
    expect(asked.slice(3).filter((a) => a.startsWith('action.get'))).toEqual(['action.get act-other'])
    for (const x of [o, c]) {
      expect(x.find('.event-item__who').exists()).toBe(false)
      x.unmount()
    }
  })

  it('names her own agent where she is found to own one while her own list is still being read', async () => {
    // Her list comes back late: the course learns meanwhile that she owns an agent here
    // (course.ownsAgentHere, asked when the course opens), and the feed asks again (ActivityView).
    let release!: () => void
    const late = new Promise<void>((r) => (release = r))
    const plain = vi.mocked(read).getMockImplementation()!
    vi.mocked(read).mockImplementation((async (name: string, args: Record<string, unknown>) => {
      if (name === 'action.list_mine') await late
      return plain(name as never, args as never)
    }) as unknown as typeof read)
    const e = done('act-agent')
    const w = mountAs(e, false)
    await flushPromises()
    const course = useCourseStore()
    course.ownsAgentHere = true
    ensureEventWho(COURSE, e, whoReachOf(course))
    release()
    await flushPromises()
    expect(asked.filter((a) => a.startsWith('action.get'))).toEqual(['action.get act-agent'])
    expect(parts(w)).toEqual([
      ['m-helper', '[object Object]'],
      ['m-teacher', ''],
    ])
    w.unmount()
  })

  it('names nobody, and asks nothing but her own list, where she owns no agent here', async () => {
    const w = mountAs(done('act-agent'), false)
    await flushPromises()
    expect(asked).toEqual(['action.list_mine  conversation.ask,conversation.answer'])
    expect(w.find('.event-item__who').exists()).toBe(false)
    w.unmount()
  })
})

describe('EventItem, an agent seated as someone’s delegate', () => {
  it('is shown as the kind of agent it is, not in the role “Assistant”', async () => {
    const e: CourseEvent = {
      seq: 40,
      type: 'member.added',
      occurred_at: '2026-09-01T00:00:00Z',
      subject_type: 'member',
      subject_id: 'm-tutor',
      payload: { role: 'assistant' },
    }
    setActivePinia(createPinia())
    const course = useCourseStore()
    course.members = new Map([
      [
        'm-tutor',
        { id: 'm-tutor', kind: 'agent', role: 'assistant', principal_member_id: 'm-yuki', answers_course: false },
      ],
    ]) as never
    course.membersState = 'loaded'
    const w = mount(EventItem, {
      props: { event: e, courseId: COURSE },
      global: {
        plugins: [i18n, ElementPlus],
        stubs: { ElTooltip: TooltipStub, RouterLink: true, MemberName: true, TimeText: true },
      },
    })
    await flushPromises()
    expect(w.find('.event-item__facts').text()).toBe('Personal agent')
    expect(w.text()).not.toContain('Assistant')
    w.unmount()
  })

  it.each([
    [true, 'Course agent'],
    [false, 'Personal agent'],
  ])(
    'is shown as the kind the event says, to a seat that cannot read the member list (answers the course: %s)',
    async (answers, kind) => {
      const e: CourseEvent = {
        seq: 41,
        type: 'member.added',
        occurred_at: '2026-09-01T00:00:00Z',
        subject_type: 'course_member',
        subject_id: 'm-hidden',
        payload: { role: 'assistant', delegate: true, principal_member_id: 'm-yuki', answers_course: answers },
      }
      const w = mountItem(e)
      await flushPromises()
      expect(w.find('.event-item__facts').text()).toBe(kind)
      expect(w.text()).not.toContain('Assistant')
      w.unmount()
    },
  )

  it('keeps the role “Assistant” for a seat that is nobody’s delegate, as far as anyone can tell', async () => {
    const e: CourseEvent = {
      seq: 42,
      type: 'member.added',
      occurred_at: '2026-09-01T00:00:00Z',
      subject_type: 'course_member',
      subject_id: 'm-ta',
      payload: { role: 'assistant' },
    }
    const w = mountItem(e)
    await flushPromises()
    expect(w.find('.event-item__facts').text()).toBe('Assistant')
    w.unmount()
  })
})
