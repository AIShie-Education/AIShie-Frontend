import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import { setSchoolTimeZone } from '@/utils/schoolTime'
import RescopeDialog from './RescopeDialog.vue'

const MEMBER = {
  id: 'm1',
  display_name: 'Student One',
  role: 'student',
  student_scope: 'all',
  assignment_scope: 'all',
  listed_students: [],
  listed_assignments: [],
  expires_at: '2026-10-08T12:30:00Z',
  perms: {},
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setActivePinia(createPinia())
  setLocale('en')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setSchoolTimeZone(undefined)
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountDialog() {
  const w = mount(RescopeDialog, {
    props: { modelValue: true, courseId: 'c1', member: MEMBER as never },
    attachTo: document.body,
    global: {
      plugins: [i18n, ElementPlus],
      stubs: { AssignmentSelect: true, MemberSelect: true, RefusalAlert: true },
    },
  })
  await flushPromises()
  return w
}

describe('RescopeDialog, school-day expiry validation', () => {
  it('uses the school’s day for disabledDate and compares the real instant with now', async () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setSchoolTimeZone('America/New_York')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-08T04:00:00Z'))
    const w = await mountDialog()
    const vm = w.vm as unknown as {
      form: { expiry: string; expiresAt: string }
      expiryInvalid: boolean
      disabledDate: (date: Date) => boolean
    }
    vm.form.expiry = 'set'
    await flushPromises()
    expect(vm.disabledDate(new Date(2026, 2, 7, 12))).toBe(false)
    expect(vm.disabledDate(new Date(2026, 2, 6, 12))).toBe(true)
    vi.setSystemTime(new Date('2026-10-08T01:00:00Z'))
    vm.form.expiresAt = '2026-10-08T08:30'
    await flushPromises()
    expect(vm.expiryInvalid).toBe(false)
    vm.form.expiresAt = '2026-10-07T20:30'
    await flushPromises()
    expect(vm.expiryInvalid).toBe(true)
  })

  it('shows a DST-gap error instead of accepting a normalised instant', async () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    setSchoolTimeZone('America/New_York')
    const w = await mountDialog()
    const vm = w.vm as unknown as { form: { expiry: string; expiresAt: string } }
    vm.form.expiry = 'set'
    vm.form.expiresAt = '2026-03-08T02:30'
    await flushPromises()
    expect(document.body.querySelector('.rescope__error')!.textContent).toContain('does not exist')
  })
})
