import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { Actor, ActorLookup, Membership, MemberSummary } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { shortId } from '@/utils/format'
import SeatInstructorCard from './SeatInstructorCard.vue'

// What Core answers each read with (a function per tool), and what was asked.
let answers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
let asked: { tool: string; args: Record<string, unknown> }[] = []
const seatWrite = vi.fn()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, args })
      const a = answers[tool]
      return a ? a(args) : Promise.reject(new Error(`no answer for ${tool}`))
    }),
    write: vi.fn((tool: string, args: Record<string, unknown>) => seatWrite(tool, args)),
  }
})

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const ME = '01a0d79f-13c6-70da-a7cc-f009b1efe423'

const me = {
  id: ME,
  kind: 'human',
  display_name: 'Root Admin',
  email: 'root@example.edu',
  status: 'active',
  platform_role: 'root',
  created_at: '2026-09-01T00:00:00Z',
  has_password: true,
  has_sso: false,
} as Actor

function seat(over: Partial<Membership> = {}): Membership {
  return {
    course_id: COURSE,
    member_id: 'm-me',
    role: 'instructor',
    status: 'active',
    code: 'CS101',
    section: '',
    title: 'Programming',
    course_status: 'draft',
    student_scope: 'all',
    assignment_scope: 'all',
    perms: {},
    answers_course: false,
    perm_ceilings: {},
    ...over,
  }
}

function instructor(name: string, over: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id: `m-${name}`,
    actor_id: `a-${name}`,
    display_name: name,
    kind: 'human',
    role: 'instructor',
    status: 'active',
    ...over,
  } as MemberSummary
}

/** A promise the test settles. */
function later<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

// The dropdown itself is Element Plus's business: here it just shows its options.
const SelectStub = defineComponent({
  name: 'ElSelect',
  emits: ['change', 'visible-change'],
  setup:
    (_, { slots }) =>
    () =>
      h('div', { class: 'select-stub' }, [slots.default?.(), slots.empty?.()]),
})
const OptionStub = defineComponent({
  name: 'ElOption',
  setup:
    (_, { slots }) =>
    () =>
      h('div', { class: 'option-stub' }, slots.default?.()),
})

beforeEach(() => {
  setLocale('en')
  asked = []
  seatWrite.mockReset()
  answers = {
    // The directory is there (the card probes for it on mounting).
    'actor.list': async () => ({ actors: [] }),
    'actor.get': async () => me,
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function mountCard(memberships: Membership[], who: object = me, transitions = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = who as never
  session.memberships = memberships
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/courses/:courseId/members', name: 'course-members', component: blank },
      { path: '/admin/actors', name: 'admin-actors', component: blank },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: blank },
      { path: '/welcome', name: 'welcome', component: blank },
    ],
  })
  const wrapper = mount(SeatInstructorCard, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n, ElementPlus, router],
      stubs: {
        ElSelect: SelectStub,
        ElOption: OptionStub,
        Cpu: true,
        User: true,
        UserFilled: true,
        Plus: true,
        ...(transitions ? { transition: false } : {}),
      },
    },
  })
  await flushPromises()
  return { wrapper, session }
}

const button = (w: Awaited<ReturnType<typeof mountCard>>['wrapper'], text: string) =>
  w.findAll('button').find((b) => b.text() === text)
const memberListCalls = () => asked.filter((a) => a.tool === 'member.list').length

describe('SeatInstructorCard', () => {
  it('after seating oneself, says one is seated rather than that one has no seat', async () => {
    const { wrapper } = await mountCard([])
    seatWrite.mockResolvedValue({
      status: 'executed',
      actionId: 'act-1',
      reviewState: 'none',
      result: { member_id: 'm-me' },
      replayed: false,
    })
    await button(wrapper, 'Me')!.trigger('click')
    await flushPromises()
    await button(wrapper, 'Seat as instructor')!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('seated')).toEqual([['m-me', ME]])

    // me.memberships has not answered again (or failed to): the card knows all the same.
    const text = wrapper.text()
    expect(text).toContain('Root Admin')
    expect(text).toContain('(You)')
    expect(text).not.toContain('You have no seat in this course')
    expect(text).not.toContain('Seat yourself to work in it')
    const links = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(links).toContain(`/courses/${COURSE}/members`)

    // Nor is "Me" offered again.
    await button(wrapper, 'Seat another instructor')!.trigger('click')
    expect(button(wrapper, 'Me')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the list when me.memberships is read again with the same seat', async () => {
    answers['member.list'] = async () => ({ members: [instructor('Root Admin', { actor_id: ME })] })
    const { wrapper, session } = await mountCard([seat()])
    expect(memberListCalls()).toBe(1)
    expect(wrapper.text()).toContain('Root Admin')

    // Activating the course reads the memberships again: new objects, the same seat.
    session.memberships = [seat({ course_status: 'active' })]
    await nextTick()
    expect(wrapper.text()).not.toContain('Loading…')
    await flushPromises()
    expect(memberListCalls()).toBe(1)
    wrapper.unmount()
  })

  it('shows the list of the latest load when two overlap', async () => {
    const first = later<{ members: MemberSummary[] }>()
    const second = later<{ members: MemberSummary[] }>()
    const loads = [first, second]
    answers['member.list'] = () => loads.shift()!.promise
    const { wrapper, session } = await mountCard([seat({ member_id: 'm-old' })])
    session.memberships = [seat({ member_id: 'm-new' })]
    await flushPromises()
    expect(memberListCalls()).toBe(2)

    second.resolve({ members: [instructor('Newer Answer')] })
    await flushPromises()
    first.resolve({ members: [instructor('Older Answer')] })
    await flushPromises()
    expect(wrapper.text()).toContain('Newer Answer')
    expect(wrapper.text()).not.toContain('Older Answer')
    expect(wrapper.text()).not.toContain('Loading…')
    wrapper.unmount()
  })

  it('with members but no instructor, asks for one, not "another", and does not offer Me', async () => {
    answers['member.list'] = async () => ({ members: [instructor('Gone', { status: 'removed' })] })
    const { wrapper } = await mountCard([seat({ role: 'ta' })])
    const text = wrapper.text()
    expect(text).toContain('This course has members, but no instructor at the moment.')
    expect(text).not.toContain('Its instructors add everyone else')
    expect(text).not.toContain('Seat another instructor')

    await button(wrapper, 'Seat the instructor')!.trigger('click')
    expect(wrapper.find('#seat-actor').exists()).toBe(true)
    expect(button(wrapper, 'Me')).toBeUndefined()
    wrapper.unmount()
  })

  it('tells same-named agents apart in the list by the end of their ID', async () => {
    const claude = (id: string) =>
      ({ ...me, id, kind: 'agent', display_name: 'Claude', email: null, platform_role: null }) as Actor
    const a = claude('01a0d79f-13c6-70da-a7cc-0000000000a1')
    const b = claude('01a0d79f-13c6-70da-a7cc-0000000000b2')
    answers['actor.list'] = async () => ({ actors: [a, b] })
    const { wrapper } = await mountCard([])
    wrapper.findComponent(SelectStub).vm.$emit('visible-change', true)
    await flushPromises()
    const options = wrapper.findAll('.option-stub').map((o) => o.text())
    expect(options).toHaveLength(2)
    expect(options[0]).toContain(shortId(a.id))
    expect(options[1]).toContain(shortId(b.id))
    expect(options[0]).not.toEqual(options[1])
    wrapper.unmount()
  })
})

// A department's administrator has no directory: they find people by their
// whole email, invite new ones, and seat them.
describe('SeatInstructorCard, for a department administrator', () => {
  const ada = {
    id: 'ada',
    kind: 'human',
    display_name: 'Ada Lovelace',
    email: 'ada@example.edu',
    status: 'active',
    platform_role: null,
    administers: [{ dept_id: 'F', name: 'Engineering', appointment_id: 'ap', appointed_at: '2026-09-01T00:00:00Z' }],
  }
  const chan: ActorLookup = {
    actor_id: 'chan',
    display_name: 'Chan Siu Ming',
    kind: 'human',
    status: 'active',
    can_sign_in: true,
    invitable: false,
  }
  const executed = (result: unknown) => ({ status: 'executed', actionId: 'a', reviewState: 'none', result, replayed: false })
  const bodyButton = (text: string) =>
    [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    // The directory would refuse them; the card must never ask it.
    answers = {}
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
  })

  async function find(wrapper: Awaited<ReturnType<typeof mountCard>>['wrapper'], email: string) {
    await wrapper.find('input[name=lookup-email]').setValue(email)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }
  const directoryCalls = () => asked.filter((a) => a.tool === 'actor.list' || a.tool === 'actor.get')

  it('finds the instructor by their whole email, and seats them, without the directory', async () => {
    answers['actor.lookup_by_email'] = async () => chan
    const { wrapper } = await mountCard([], ada)
    await find(wrapper, ' chan@example.edu ')
    expect(asked.find((a) => a.tool === 'actor.lookup_by_email')?.args).toEqual({ email: 'chan@example.edu' })
    expect(wrapper.text()).toContain('Chan Siu Ming')
    // They have signed in: nothing to invite them to.
    expect(button(wrapper, 'Invite again')).toBeUndefined()

    seatWrite.mockResolvedValue(executed({ member_id: 'm-chan' }))
    await button(wrapper, 'Seat as instructor')!.trigger('click')
    await flushPromises()
    expect(seatWrite).toHaveBeenCalledWith('course.seat_instructor', { course_id: COURSE, actor_id: 'chan' })
    expect(wrapper.emitted('seated')).toEqual([['m-chan', 'chan']])
    // Names are not links into the directory, which is not theirs.
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).not.toContain('/admin/actors/chan')
    expect(directoryCalls()).toEqual([])
    wrapper.unmount()
  })

  it('finds the instructor by their whole staff number too, and offers no invitation to a number nobody has', async () => {
    answers['actor.lookup_by_email'] = async () => chan
    const { wrapper } = await mountCard([], ada)
    await find(wrapper, ' T0042 ')
    expect(asked.find((a) => a.tool === 'actor.lookup_by_email')?.args).toEqual({ login_id: 'T0042' })
    expect(wrapper.text()).toContain('Chan Siu Ming')
    expect(button(wrapper, 'Seat as instructor')).toBeDefined()

    answers['actor.lookup_by_email'] = async () => {
      throw new ApiError({ status: 404, code: 'not_found', message: 'nobody' })
    }
    await find(wrapper, 'T0043')
    expect(wrapper.text()).toContain('Nobody is registered with that student or staff number.')
    // An invitation goes to an email, which a number is not.
    expect(button(wrapper, 'Invite someone new')).toBeUndefined()

    const before = asked.length
    await find(wrapper, 'T 0043')
    expect(wrapper.text()).toContain('Give a whole email address')
    expect(asked.length).toBe(before)
    wrapper.unmount()
  })

  it('offers "Me" from what the session knows', async () => {
    const { wrapper } = await mountCard([], ada)
    await button(wrapper, 'Me')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')
    seatWrite.mockResolvedValue(executed({ member_id: 'm-ada' }))
    await button(wrapper, 'Seat as instructor')!.trigger('click')
    await flushPromises()
    expect(seatWrite).toHaveBeenCalledWith('course.seat_instructor', { course_id: COURSE, actor_id: 'ada' })
    expect(directoryCalls()).toEqual([])
    wrapper.unmount()
  })

  it('invites someone new, shows the link once, then seats them', async () => {
    answers['actor.lookup_by_email'] = async () => {
      throw new ApiError({ status: 404, code: 'not_found', message: 'nobody is registered with that email' })
    }
    const { wrapper } = await mountCard([], ada, true)
    await find(wrapper, 'pat@example.edu')
    expect(wrapper.text()).toContain('Nobody is registered with that email. You can invite them.')

    await button(wrapper, 'Invite someone new')!.trigger('click')
    await flushPromises()
    const email = document.body.querySelector<HTMLInputElement>('input[name=invite-email]')!
    expect(email.value).toBe('pat@example.edu')
    const name = document.body.querySelector<HTMLInputElement>('input[name=invite-name]')!
    name.value = 'Pat Lee'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    seatWrite.mockResolvedValue(
      executed({ actor_id: 'pat', token: 'aisinv_secret', email: 'pat@example.edu', expires_at: '2026-10-05T00:00:00Z' }),
    )
    bodyButton('Register and invite')!.click()
    await flushPromises()
    expect(seatWrite).toHaveBeenCalledWith('actor.invite_new', { display_name: 'Pat Lee', email: 'pat@example.edu', expires_in_days: 7 })

    // The link, the once.
    const link = document.body.querySelector<HTMLTextAreaElement>('#reveal-invite-link')!
    expect(link.value).toContain('#token=aisinv_secret')
    bodyButton('Copy')!.click()
    await flushPromises()
    bodyButton('Done')!.click()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 100))
    await flushPromises()
    // Once the dialog has gone, the link is nowhere in the page.
    const shown = [...document.body.querySelectorAll('textarea')].map((t) => t.value)
    expect(shown.join(' ')).not.toContain('aisinv_secret')

    // Then they are offered to be seated.
    seatWrite.mockResolvedValue(executed({ member_id: 'm-pat' }))
    await button(wrapper, 'Seat Pat Lee as instructor')!.trigger('click')
    await flushPromises()
    expect(seatWrite).toHaveBeenLastCalledWith('course.seat_instructor', { course_id: COURSE, actor_id: 'pat' })
    expect(directoryCalls()).toEqual([])
    wrapper.unmount()
  })

  it('an email already registered finds that person instead', async () => {
    let calls = 0
    answers['actor.lookup_by_email'] = async () => {
      if (calls++ === 0) throw new ApiError({ status: 404, code: 'not_found', message: 'nobody' })
      return chan
    }
    const { wrapper } = await mountCard([], ada)
    await find(wrapper, 'chan@example.edu')
    await button(wrapper, 'Invite someone new')!.trigger('click')
    await flushPromises()
    const name = document.body.querySelector<HTMLInputElement>('input[name=invite-name]')!
    name.value = 'Chan'
    name.dispatchEvent(new Event('input'))
    seatWrite.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'conflict',
        message: 'that email is already registered',
        details: { reason: 'email_taken', actor_id: 'chan' },
        actionId: 'a1',
        actionStatus: 'failed',
      }),
    )
    bodyButton('Register and invite')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('That email is already registered. Seat that person instead.')
    expect(wrapper.text()).toContain('Chan Siu Ming')
    expect(button(wrapper, 'Seat as instructor')).toBeDefined()
    wrapper.unmount()
  })

  it('offers to invite again only someone they may invite who has not signed in', async () => {
    const pending = { ...chan, actor_id: 'kim', display_name: 'Kim', can_sign_in: false, invite_expires_at: '2026-10-05T00:00:00Z' }
    answers['actor.lookup_by_email'] = async () => ({ ...pending, invitable: false })
    const { wrapper } = await mountCard([], ada)
    await find(wrapper, 'kim@example.edu')
    expect(wrapper.text()).toContain('Has not signed in yet.')
    expect(button(wrapper, 'Invite again')).toBeUndefined()

    answers['actor.lookup_by_email'] = async () => ({ ...pending, invitable: true })
    await find(wrapper, 'kim@example.edu')
    seatWrite.mockResolvedValue(executed({ token: 'aisinv_again', email: 'kim@example.edu', expires_at: '2026-10-05T00:00:00Z' }))
    await button(wrapper, 'Invite again')!.trigger('click')
    await flushPromises()
    expect(seatWrite).toHaveBeenCalledWith('actor.invite', { actor_id: 'kim' })
    expect(document.body.querySelector<HTMLTextAreaElement>('#reveal-invite-link')!.value).toContain('aisinv_again')
    wrapper.unmount()
  })
})
