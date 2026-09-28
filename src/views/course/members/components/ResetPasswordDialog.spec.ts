import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { Member } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import ResetPasswordDialog from './ResetPasswordDialog.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  write: (...a: unknown[]) => write(...a),
}))

const mei = {
  id: 'm-mei',
  actor_id: 'a-mei',
  kind: 'human',
  display_name: 'Mei Lin',
  role: 'student',
  status: 'active',
  login_id: '2024001',
} as unknown as Member
const executed = (result: Record<string, unknown>, replayed = false) => ({
  status: 'executed',
  actionId: 'act-1',
  reviewState: 'none',
  replayed,
  result,
})
const writeText = vi.fn(async () => undefined)

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  write.mockReset()
  writeText.mockClear()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountDialog(locale: 'en' | 'zh-Hant' = 'en') {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.course = { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never
  course.perms = { member_manage: 'autonomous' }
  course.permsSource = 'exact'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/actions/:actionId', name: 'course-action', component: { render: () => null } },
    ],
  })
  const w = mount(ResetPasswordDialog, {
    props: {
      modelValue: true,
      courseId: COURSE,
      member: mei,
      'onUpdate:modelValue': (v: boolean) => w.setProps({ modelValue: v }),
    },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  mounted.push(w)
  await flushPromises()
  return w
}
const text = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement

describe('ResetPasswordDialog', () => {
  it('says what a reset does before it is done', async () => {
    await mountDialog()
    expect(text()).toContain('Reset the password of Mei Lin?')
    expect(text()).toContain('Every session Mei Lin has is signed out now.')
    expect(text()).toContain('they must choose a password of their own before anything else')
    expect(text()).toContain('shown to you once')
    expect(write).not.toHaveBeenCalled()
  })

  it('shows the temporary password once, with what they sign in with, to copy', async () => {
    const w = await mountDialog()
    write.mockResolvedValue(
      executed({ member_id: 'm-mei', login_id: '2024001', temporary_password: 'Tmp-abcd-efgh', sessions_ended: 2 }),
    )
    button('Reset password').click()
    await flushPromises()
    expect(write).toHaveBeenCalledWith(
      'member.reset_password',
      { course_id: COURSE, member_id: 'm-mei' },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    expect(text()).toContain('Temporary password for Mei Lin')
    expect(document.body.querySelector('[data-test="temporary-password"]')!.textContent).toBe('Tmp-abcd-efgh')
    expect(document.body.querySelector('.reset-dialog__login')!.textContent).toBe('2024001')
    expect(text()).toContain('cannot be shown again')
    expect(text()).toContain('never in a class group or any public channel')
    expect(text()).toContain('Their 2 sessions were signed out.')
    expect(w.emitted('done')).toHaveLength(1)

    button('Copy').click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('Tmp-abcd-efgh')

    // Closed, it is gone, and opening the dialog again asks afresh.
    button('Done').click()
    await flushPromises()
    await w.setProps({ modelValue: true })
    await flushPromises()
    expect(text()).not.toContain('Tmp-abcd-efgh')
    expect(text()).toContain('Reset the password of Mei Lin?')
  })

  it('says “their email” for someone with no student number', async () => {
    await mountDialog()
    write.mockResolvedValue(executed({ member_id: 'm-mei', temporary_password: 'Tmp-x', sessions_ended: 0 }))
    button('Reset password').click()
    await flushPromises()
    expect(document.body.querySelector('.reset-dialog__facts')!.textContent).toContain('Their email')
    // Nobody was signed in: no count of nothing.
    expect(text()).toContain('They had no session open.')
  })

  it('says that a repeated answer does not show the password again', async () => {
    await mountDialog()
    write.mockResolvedValue(executed({ member_id: 'm-mei', login_id: '2024001', sessions_ended: 0 }, true))
    button('Reset password').click()
    await flushPromises()
    expect(document.body.querySelector('[data-test="temporary-password"]')).toBeNull()
    expect(text()).toContain('does not show it again')
  })

  it('says Core’s refusal in words, in the dialog', async () => {
    await mountDialog('zh-Hant')
    write.mockRejectedValue(
      new ApiError({
        status: 403,
        code: 'forbidden',
        message: 'not permitted',
        details: { reason: 'sso_linked' },
        actionId: 'act-2',
        actionStatus: 'denied',
      }),
    )
    button(i18n.global.t('members.reset.submit')).click()
    await flushPromises()
    expect(text()).toContain(i18n.global.t('members.refusal.reason.sso_linked'))
    expect(document.body.querySelector('[data-test="temporary-password"]')).toBeNull()
  })

  it('has words for every reason Core gives for refusing a reset, in each language', () => {
    const reasons = [
      'people_only',
      'not_autonomous',
      'not_by_proposal',
      'own_seat',
      'not_a_person',
      'not_a_student',
      'seat_not_active',
      'seated_other_than_student',
      'platform_role',
      'administers',
      'sso_linked',
      'no_sign_in_name',
      'beyond_your_seat',
    ]
    for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
      setLocale(locale)
      for (const r of reasons) {
        expect((i18n.global as unknown as { te: (k: string) => boolean }).te(`members.refusal.reason.${r}`), r).toBe(
          true,
        )
      }
    }
  })
})
