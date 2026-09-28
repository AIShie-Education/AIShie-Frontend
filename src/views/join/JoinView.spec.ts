import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError, type JoinPreview } from '@/api/http'
import type { Me } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import JoinView from './JoinView.vue'

let preview: () => Promise<JoinPreview>
const joinCourse = vi.fn()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    joinPreview: vi.fn(() => preview()),
    joinCourse: vi.fn((...a: unknown[]) => joinCourse(...a)),
    read: vi.fn(async () => ({ memberships: [] })),
  }
})

const TOKEN = 'aisjoin_abcdefghijkl_secret'
const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const open: JoinPreview = {
  course: { code: 'CS101', section: 'A', title: 'Programming' },
  joinable: true,
  registration: true,
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  preview = async () => open
  joinCourse.mockReset()
})

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) {
    try {
      w.unmount()
    } catch {
      /* unmounted by the test already */
    }
  }
  document.body.innerHTML = ''
  setLocale('en')
  vi.unstubAllGlobals()
})

async function mountJoin(opts: { me?: Partial<Me> | null; locale?: 'en' | 'zh-Hant'; query?: string } = {}) {
  setLocale(opts.locale ?? 'en')
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  if (opts.me) {
    session.me = { id: 'a-1', kind: 'human', display_name: 'Yuki', status: 'active', ...opts.me } as Me
    session.status = 'signedIn'
  } else {
    session.status = 'signedOut'
  }
  const empty = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/join/:token', name: 'join', component: JoinView, props: true },
      { path: '/login', name: 'login', component: empty },
      { path: '/', name: 'home', component: empty },
      { path: '/courses/:courseId', name: 'course-overview', component: empty },
    ],
  })
  await router.push(`/join/${TOKEN}${opts.query ?? ''}`)
  const w = mount(JoinView, {
    props: { token: TOKEN },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  mounted.push(w)
  await flushPromises()
  return { w, router, session }
}

describe('the join page', () => {
  it('says a link Core does not know is not valid', async () => {
    preview = async () => {
      throw new ApiError({ status: 404, code: 'not_found', message: 'no such join link' })
    }
    const { w } = await mountJoin()
    expect(w.text()).toContain('This link isn’t valid')
    w.unmount()
  })

  it('says why a link cannot be joined through, and offers nothing to join', async () => {
    preview = async () => ({ ...open, joinable: false, reason: 'revoked', registration: false })
    const { w } = await mountJoin()
    expect(w.text()).toContain('CS101 · A')
    expect(w.text()).toContain('Programming')
    expect(w.text()).toContain('This invite link has been revoked')
    expect(w.text()).not.toContain('Create an account')
    expect(w.text()).not.toContain('Join course')
    w.unmount()
  })

  it('offers someone signed out to sign in and come back, or to create an account', async () => {
    preview = async () => ({ ...open, allowed_email_domains: ['hainanu.edu.cn'] })
    const { w } = await mountJoin()
    expect(w.text()).toContain('You will join as a student')
    expect(w.text()).toContain('Only people with an email at @hainanu.edu.cn can join')
    const signIn = w.findAll('a').find((a) => a.text().includes('Sign in to join'))!
    // Signing in comes back here to join.
    expect(signIn.attributes('href')).toBe(`/login?next=/join/${TOKEN}?then=join`)
    const create = w.findAll('button').find((b) => b.text() === 'Create an account')!
    await create.trigger('click')
    await flushPromises()
    expect(w.find('input[name="email"]').exists()).toBe(true)
    expect(w.text()).toContain('Use your email at @hainanu.edu.cn')
    w.unmount()
  })

  it('offers only signing in when Core takes no registrations through links', async () => {
    preview = async () => ({ ...open, registration: false })
    const { w } = await mountJoin()
    expect(w.text()).toContain('To join, sign in.')
    expect(w.findAll('a').some((a) => a.text().includes('Sign in to join'))).toBe(true)
    expect(w.findAll('button').some((b) => b.text() === 'Create an account')).toBe(false)
    w.unmount()
  })

  it('registers someone new and takes them into the course', async () => {
    const { w, router, session } = await mountJoin({ locale: 'zh-Hant' })
    const register = vi
      .spyOn(session, 'registerThroughJoinLink')
      .mockResolvedValue({ course_id: COURSE, member_id: 'm-1' })
    await w.findAll('button').find((b) => b.text() === '建立帳戶')!.trigger('click')
    await flushPromises()
    await w.find('input[name="name"]').setValue(' Mei Lin ')
    await w.find('input[name="email"]').setValue('mei@example.edu')
    await w.find('input[name="password"]').setValue('a long enough password')
    await w.find('input[name="repeat"]').setValue('a long enough password')
    await w.find('form.join-register').trigger('submit')
    await flushPromises()
    expect(register).toHaveBeenCalledWith(TOKEN, {
      display_name: 'Mei Lin',
      email: 'mei@example.edu',
      password: 'a long enough password',
    })
    expect(router.currentRoute.value.fullPath).toBe(`/courses/${COURSE}`)
    w.unmount()
  })

  it('gives the registration form the link’s domains, which its email is held to (see join.spec.ts)', async () => {
    preview = async () => ({ ...open, allowed_email_domains: ['hainanu.edu.cn'] })
    const { w } = await mountJoin()
    await w.findAll('button').find((b) => b.text() === 'Create an account')!.trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'JoinRegisterForm' }).props('domains')).toEqual(['hainanu.edu.cn'])
    expect(w.text()).toContain('Use your email at @hainanu.edu.cn.')
    w.unmount()
  })

  it('tells someone whose email is taken to sign in instead', async () => {
    const { w, session } = await mountJoin()
    vi.spyOn(session, 'registerThroughJoinLink').mockRejectedValue(
      new ApiError({ status: 409, code: 'conflict', message: 'taken', details: { reason: 'email_taken' } }),
    )
    await w.findAll('button').find((b) => b.text() === 'Create an account')!.trigger('click')
    await flushPromises()
    await w.find('input[name="name"]').setValue('Ken')
    await w.find('input[name="email"]').setValue('ken@example.edu')
    await w.find('input[name="password"]').setValue('a long enough password')
    await w.find('input[name="repeat"]').setValue('a long enough password')
    await w.find('form.join-register').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('An account with this email already exists')
    expect(w.findAll('a').some((a) => a.text().includes('Sign in instead'))).toBe(true)
    w.unmount()
  })

  it('joins someone signed in, at a click, and takes them to the course', async () => {
    joinCourse.mockResolvedValue({ course_id: COURSE, member_id: 'm-2', status: 'active' })
    const { w, router } = await mountJoin({ me: { email: 'yuki@example.edu' } })
    expect(w.text()).toContain('Signed in as Yuki')
    await w.findAll('button').find((b) => b.text() === 'Join course')!.trigger('click')
    await flushPromises()
    expect(joinCourse).toHaveBeenCalledWith(TOKEN, expect.any(String))
    expect(router.currentRoute.value.fullPath).toBe(`/courses/${COURSE}`)
    w.unmount()
  })

  it('tells someone signed in with an email at another domain that the link is not for them', async () => {
    preview = async () => ({ ...open, allowed_email_domains: ['hainanu.edu.cn'] })
    const { w } = await mountJoin({ me: { email: 'yuki@gmail.com' } })
    expect(w.text()).toContain('You are signed in with yuki@gmail.com, but this link is only for emails at @hainanu.edu.cn')
    expect(w.findAll('button').some((b) => b.text() === 'Join course')).toBe(false)
    expect(w.text()).toContain('Sign in as someone else')
    w.unmount()
  })

  it('says Core’s refusal of a join in words of its own', async () => {
    joinCourse.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'the join link has been used as many times as it may be',
        details: { reason: 'used_up' },
        actionId: 'act-1',
        actionStatus: 'failed',
      }),
    )
    const { w } = await mountJoin({ me: { email: 'yuki@example.edu' } })
    await w.findAll('button').find((b) => b.text() === 'Join course')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('As many people as this link allows have already joined through it')
    w.unmount()
  })

  it('joins at once, back from signing in to join, and leaves nothing in the address to join again', async () => {
    joinCourse.mockResolvedValue({ course_id: COURSE, member_id: 'm-3', status: 'active' })
    const { w, router } = await mountJoin({ me: { email: 'ken@example.edu' }, query: '?then=join' })
    await flushPromises()
    expect(joinCourse).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe(`/courses/${COURSE}`)
    w.unmount()
  })

  it('does not join on arrival through a link that lets nobody in', async () => {
    preview = async () => ({ ...open, joinable: false, reason: 'expired', registration: false })
    const { w, router } = await mountJoin({ me: { email: 'ken@example.edu' }, query: '?then=join' })
    await flushPromises()
    expect(joinCourse).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe(`/join/${TOKEN}`)
    expect(w.text()).toContain('Invite links work for only a few minutes')
    w.unmount()
  })

  it('does not join on arrival someone signed out', async () => {
    const { w } = await mountJoin({ query: '?then=join' })
    await flushPromises()
    expect(joinCourse).not.toHaveBeenCalled()
    expect(w.text()).toContain('Sign in to join')
    w.unmount()
  })
})

describe('the join page’s countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('counts down what is left of the link, and says it has expired when the time is up', async () => {
    const calls: number[] = []
    preview = async () => {
      calls.push(Date.now())
      return Date.now() < Date.parse('2026-09-28T10:01:05Z')
        ? { ...open, expires_at: '2026-09-28T10:01:05Z' }
        : { ...open, joinable: false, reason: 'expired', registration: false }
    }
    const { w } = await mountJoin({ me: { email: 'yuki@example.edu' } })
    expect(w.text()).toContain('This link works for another 01:05.')
    expect(w.findAll('button').some((b) => b.text() === 'Join course')).toBe(true)

    vi.advanceTimersByTime(5_000)
    await flushPromises()
    expect(w.text()).toContain('This link works for another 01:00.')

    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(w.text()).toContain('You can no longer join through this link')
    expect(w.text()).toContain('This invite link has expired. Invite links work for only a few minutes')
    expect(w.findAll('button').some((b) => b.text() === 'Join course')).toBe(false)
    // Core is asked again, and says the same.
    expect(calls).toHaveLength(2)
    w.unmount()
  })

  it('says the expired link in Traditional Chinese too', async () => {
    preview = async () => ({ ...open, joinable: false, reason: 'expired', registration: false })
    const { w } = await mountJoin({ locale: 'zh-Hant' })
    expect(w.text()).toContain('已無法透過此連結加入')
    expect(w.text()).toContain('此邀請連結已過期')
    w.unmount()
  })
})
