import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { i18n, setLocale } from '@/i18n'
import type { Actor, Membership, MemberSummary } from '@/api/types'
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
  document.body.innerHTML = ''
})

async function mountCard(memberships: Membership[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = me as never
  session.memberships = memberships
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/courses/:courseId/members', name: 'course-members', component: blank },
      { path: '/admin/actors', name: 'admin-actors', component: blank },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: blank },
    ],
  })
  const wrapper = mount(SeatInstructorCard, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n, ElementPlus, router],
      stubs: { ElSelect: SelectStub, ElOption: OptionStub, Cpu: true, User: true, UserFilled: true, Plus: true },
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
