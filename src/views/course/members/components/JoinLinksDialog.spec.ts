import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import JoinLinksDialog from './JoinLinksDialog.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
  write: (...a: unknown[]) => write(...a),
}))
const confirm = vi.fn(async () => 'confirm')
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessageBox: { ...real.ElMessageBox, confirm: (...a: unknown[]) => confirm(...(a as [])) } }
})

const TOKEN = 'aisjoin_abcdefghijkl_secret'
const made = (over: Record<string, unknown> = {}) => ({
  status: 'executed',
  actionId: 'act-1',
  reviewState: 'none',
  replayed: false,
  result: { link_id: 'l-1', token: TOKEN, expires_at: '2026-09-28T10:10:00Z', ...over },
})
const listed = (over: Record<string, unknown> = {}) => ({
  id: 'l-1',
  status: 'live',
  joinable: true,
  role: 'student',
  preset_id: 'p',
  created_by_member_id: 'm',
  created_by_name: 'Ada',
  created_at: '2026-09-28T10:00:00Z',
  expires_at: '2026-09-28T10:10:00Z',
  uses: 0,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
  read.mockReset().mockResolvedValue({ links: [] })
  write.mockReset()
  confirm.mockClear()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountDialog(level: 'autonomous' | 'confirm_required' = 'autonomous', status = 'active') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.course = { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status } as never
  course.perms = { member_invite: level }
  course.permsSource = 'exact'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/join/:token', name: 'join', component: { render: () => null } },
      { path: '/courses/:courseId/members', name: 'course-members', component: { render: () => null } },
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: { render: () => null } },
    ],
  })
  const w = mount(JoinLinksDialog, {
    props: { modelValue: true, courseId: COURSE },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  mounted.push(w)
  await flushPromises()
  return w
}
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

describe('JoinLinksDialog', () => {
  it('creates a link with a limit and domains, and shows it with the ten minutes Core gave it', async () => {
    const w = await mountDialog()
    expect(read).toHaveBeenCalledWith('course.join_link_list', { course_id: COURSE, limit: 100, after: undefined })
    expect(document.body.textContent).toContain('No invite links yet.')
    write.mockResolvedValue(made({ max_uses: 30, allowed_email_domains: ['campus.example.edu'] }))
    read.mockResolvedValue({ links: [listed({ max_uses: 30, allowed_email_domains: ['campus.example.edu'] })] })
    const form = w.findComponent({ name: 'JoinLinkForm' })
    form.vm.$emit('update:modelValue', { maxUses: 30, domains: ['campus.example.edu'] })
    await flushPromises()
    form.vm.$emit('submit')
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'course.join_link_create',
      { course_id: COURSE, max_uses: 30, allowed_email_domains: ['campus.example.edu'] },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    const url = document.body.querySelector<HTMLInputElement>('.join-reveal__url input')!
    expect(url.value).toBe(`${window.location.origin}/join/${TOKEN}`)
    expect(document.body.querySelector('.join-reveal__clock')!.textContent).toBe('10:00')
    expect(document.body.querySelector('.join-link')!.textContent).toContain('Shown above')
  })

  it('makes a new link with the same settings once the one shown has expired', async () => {
    const w = await mountDialog()
    write.mockResolvedValueOnce(made({ max_uses: 5 }))
    w.findComponent({ name: 'JoinLinkForm' }).vm.$emit('update:modelValue', { maxUses: 5, domains: [] })
    await flushPromises()
    w.findComponent({ name: 'JoinLinkForm' }).vm.$emit('submit')
    await flushPromises()
    vi.advanceTimersByTime(600_000)
    await flushPromises()
    expect(document.body.textContent).toContain('This link has expired')
    write.mockResolvedValueOnce(
      made({ link_id: 'l-2', token: 'aisjoin_zzzzzzzzzzzz_other', expires_at: '2026-09-28T10:20:00Z', max_uses: 5 }),
    )
    button('Create a new link').click()
    await flushPromises()
    expect(write.mock.calls[1]![1]).toEqual({ course_id: COURSE, max_uses: 5 })
    expect(document.body.querySelector<HTMLInputElement>('.join-reveal__url input')!.value).toContain(
      'aisjoin_zzzzzzzzzzzz_other',
    )
    expect(document.body.querySelector('.join-reveal__clock')!.textContent).toBe('10:00')
  })

  it('offers someone who needs approval no link to create, and says why', async () => {
    await mountDialog('confirm_required')
    expect(button('Create link').disabled).toBe(true)
    expect(document.body.textContent).not.toContain('This link has expired')
  })

  it('says Core’s refusal of a link in words of the app’s', async () => {
    const w = await mountDialog()
    write.mockRejectedValue(
      new ApiError({ status: 422, code: 'failed_precondition', message: 'x', details: { reason: 'not_by_proposal' } }),
    )
    w.findComponent({ name: 'JoinLinkForm' }).vm.$emit('submit')
    await flushPromises()
    expect(document.body.querySelector('.join-reveal')).toBeNull()
    expect(document.body.textContent).toContain('An invite link is never created by a request for approval')
  })

  it('offers nothing to create in an archived course', async () => {
    await mountDialog('autonomous', 'archived')
    expect(button('Create link').disabled).toBe(true)
  })

  it('revokes a link once confirmed, and takes the one shown away when it is that one', async () => {
    const w = await mountDialog()
    write.mockResolvedValueOnce(made())
    read.mockResolvedValue({ links: [listed({ uses: 2 })] })
    w.findComponent({ name: 'JoinLinkForm' }).vm.$emit('submit')
    await flushPromises()
    write.mockResolvedValueOnce({ status: 'executed', actionId: 'act-2', reviewState: 'none', replayed: false, result: { ok: true } })
    read.mockResolvedValue({ links: [listed({ uses: 2, status: 'revoked', revoked_at: '2026-09-28T10:01:00Z' })] })
    button('Revoke').click()
    await flushPromises()
    expect(confirm.mock.calls[0]).toEqual([
      'Nobody can join through it any more. The 2 people who joined through it stay in the course.',
      'Revoke this invite link?',
      expect.any(Object),
    ])
    expect(write).toHaveBeenLastCalledWith(
      'course.join_link_revoke',
      { course_id: COURSE, link_id: 'l-1' },
      expect.any(Object),
    )
    expect(document.body.querySelector('.join-reveal')).toBeNull()
    expect(button('Create link')).toBeTruthy()
  })

  it('shows the link again when opened again before it ends, and the form after', async () => {
    const w = await mountDialog()
    write.mockResolvedValueOnce(made())
    w.findComponent({ name: 'JoinLinkForm' }).vm.$emit('submit')
    await flushPromises()
    await w.setProps({ modelValue: false })
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(document.body.querySelector<HTMLInputElement>('.join-reveal__url input')!.value).toContain(TOKEN)
    await w.setProps({ modelValue: false })
    vi.advanceTimersByTime(600_000)
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(document.body.querySelector('.join-reveal')).toBeNull()
    expect(button('Create link')).toBeTruthy()
  })
})
