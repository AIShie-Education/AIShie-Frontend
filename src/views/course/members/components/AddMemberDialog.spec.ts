import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import { setSchoolTimeZone } from '@/utils/schoolTime'
import AddMemberDialog from './AddMemberDialog.vue'

vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: vi.fn(async () => {
    throw new Error('no read expected')
  }),
}))

const DUE = '2026-10-08T15:59:00Z'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setLocale('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setSchoolTimeZone(undefined)
  setLocale('en')
  document.body.innerHTML = ''
})

async function dialog() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useCourseStore().$patch({ permsSource: 'exact', seat: { expires_at: DUE } } as never)
  mount(AddMemberDialog, {
    props: { modelValue: true, courseId: 'c1', presets: [] },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n, ElementPlus],
      stubs: { AssignmentSelect: true, MemberSelect: true, PermEditor: true },
    },
  })
  await flushPromises()
  return document.body.querySelector('.add-member__stack .app-form-hint') as HTMLElement
}

describe('AddMemberDialog, the seat-expiry clock', () => {
  it('names the reader’s zone and zones the caller’s own seat end', async () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    const hint = await dialog()
    expect(hint.textContent).toContain('on your clock in Hong Kong Standard Time')
    expect(hint.querySelector('time')!.textContent).toBe('2026-10-08 23:59 (Hong Kong Standard Time)')
  })

  it('uses and names the school’s zone, with the different reader zone beside it', async () => {
    vi.stubEnv('TZ', 'Europe/London')
    setSchoolTimeZone('Asia/Hong_Kong')
    const hint = await dialog()
    expect(hint.textContent).toContain('on the school’s clock in Hong Kong Standard Time')
    expect(hint.querySelector('time')!.textContent).toBe(
      'School: 2026-10-08 23:59 (Hong Kong Standard Time); your time: 2026-10-08 16:59 (British Summer Time)',
    )
  })
})
