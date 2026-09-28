import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import ChangePasswordView from './ChangePasswordView.vue'
import { weakPasswordRefusal } from './changePassword'

const write = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  write: (...a: unknown[]) => write(...a),
}))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  write.mockReset()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  document.body.innerHTML = ''
  setLocale('en')
  vi.unstubAllGlobals()
})

async function mountPage(opts: { next?: string; locale?: 'en' | 'zh-Hant' } = {}) {
  setLocale(opts.locale ?? 'en')
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.status = 'mustChangePassword'
  const passwordChanged = vi.spyOn(session, 'passwordChanged').mockImplementation(async () => {
    session.status = 'signedIn'
  })
  const signOut = vi.spyOn(session, 'signOut').mockImplementation(async () => {
    session.status = 'signedOut'
  })
  const empty = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/change-password', name: 'change-password', component: ChangePasswordView },
      { path: '/login', name: 'login', component: empty },
      { path: '/', name: 'home', component: empty },
      { path: '/courses/:courseId', name: 'course-overview', component: empty },
    ],
  })
  await router.push(opts.next ? `/change-password?next=${encodeURIComponent(opts.next)}` : '/change-password')
  const w = mount(ChangePasswordView, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  mounted.push(w)
  await flushPromises()
  return { w, router, session, passwordChanged, signOut }
}

async function fill(w: Awaited<ReturnType<typeof mountPage>>['w'], password: string, repeat = password) {
  await w.find('input[name="new-password"]').setValue(password)
  await w.find('input[name="repeat"]').setValue(repeat)
  await w.find('form.el-form').trigger('submit')
  await flushPromises()
}

describe('the page that sets a password of one’s own', () => {
  it('offers setting one’s own password, or signing out, and nothing else', async () => {
    const { w } = await mountPage()
    expect(w.find('h1').text()).toBe('Choose your own password')
    expect(w.findAll('input[type="password"]')).toHaveLength(2)
    expect(w.findAll('a')).toHaveLength(0)
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Set my password and continue', 'Sign out'])
  })

  it('sets it, once, and goes on where the person was going', async () => {
    write.mockResolvedValue({ status: 'executed', actionId: 'a-1', reviewState: 'none', replayed: false, result: {} })
    const { w, router, passwordChanged } = await mountPage({ next: '/courses/c-1' })
    await fill(w, 'a password of my own')
    expect(write).toHaveBeenCalledWith(
      'credential.set_password',
      { password: 'a password of my own' },
      { idempotencyKey: expect.any(String) },
    )
    expect(passwordChanged).toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/courses/c-1')
  })

  it('goes home rather than off the site', async () => {
    write.mockResolvedValue({ status: 'executed', actionId: 'a-1', reviewState: 'none', replayed: false, result: {} })
    const { w, router } = await mountPage({ next: '//elsewhere.example/x' })
    await fill(w, 'a password of my own')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('says in words that the temporary password cannot be kept, and asks again under a new key', async () => {
    write.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'the new password must differ',
        details: { reason: 'password_unchanged' },
      }),
    )
    const { w, router } = await mountPage({ locale: 'zh-Hant' })
    await fill(w, 'the temporary one')
    expect(w.text()).toContain(i18n.global.t('auth.change.unchanged'))
    expect(w.text()).not.toContain('must differ')
    expect(router.currentRoute.value.name).toBe('change-password')
    const first = write.mock.calls[0][2].idempotencyKey
    write.mockResolvedValue({ status: 'executed', actionId: 'a-1', reviewState: 'none', replayed: false, result: {} })
    await fill(w, 'the temporary one')
    expect(write.mock.calls[1][2].idempotencyKey).not.toBe(first)
  })

  it('says in words that a password is outside the rules', async () => {
    write.mockRejectedValueOnce(
      new ApiError({ status: 400, code: 'invalid_argument', message: 'a password must be 10 to 1024 characters' }),
    )
    const { w } = await mountPage()
    await fill(w, 'ten bytes!')
    expect(w.text()).toContain(i18n.global.t('auth.change.weak'))
  })

  it('tries the same password again under the same key when Core did not answer', async () => {
    write.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network', message: 'offline' }))
    const { w } = await mountPage()
    await fill(w, 'a password of my own')
    write.mockResolvedValue({ status: 'executed', actionId: 'a-1', reviewState: 'none', replayed: false, result: {} })
    await fill(w, 'a password of my own')
    expect(write.mock.calls[1][2].idempotencyKey).toBe(write.mock.calls[0][2].idempotencyKey)
  })

  it('signs out, to the sign-in page', async () => {
    const { w, router, signOut } = await mountPage()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Sign out')!
      .trigger('click')
    await flushPromises()
    expect(signOut).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('login')
  })
})

describe('weakPasswordRefusal', () => {
  it('is Core’s refusal of a password outside the rules, and nothing else', () => {
    expect(
      weakPasswordRefusal(
        new ApiError({ status: 400, code: 'invalid_argument', message: 'a password must be 10 to 1024 characters' }),
      ),
    ).toBe(true)
    expect(
      weakPasswordRefusal(
        new ApiError({
          status: 422,
          code: 'failed_precondition',
          message: 'x',
          details: { reason: 'password_unchanged' },
        }),
      ),
    ).toBe(false)
    expect(weakPasswordRefusal(new ApiError({ status: 400, code: 'invalid_argument', message: 'bad email' }))).toBe(
      false,
    )
    expect(weakPasswordRefusal(new Error('a password must be'))).toBe(false)
  })
})
