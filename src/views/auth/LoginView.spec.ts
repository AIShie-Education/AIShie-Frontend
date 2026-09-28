import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale, type Locale } from '@/i18n'
import { ApiError, authMethods, ssoStartUrl, type AuthMethods } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import LoginView from './LoginView.vue'

vi.mock('@/api/http', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/api/http')>()
  return {
    ...real,
    health: vi.fn(async () => ({ status: 'ok', version: '1.0.0', commit: 'c', schema_version: 1, schema_latest: 1 })),
    authMethods: vi.fn(async (): Promise<AuthMethods> => ({ password: true, sso: null })),
    ssoStartUrl: vi.fn(real.ssoStartUrl),
  }
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  vi.mocked(authMethods).mockReset().mockResolvedValue({ password: true, sso: null })
  vi.mocked(ssoStartUrl).mockClear()
  document.body.innerHTML = ''
  setLocale('en')
  vi.unstubAllGlobals()
})

async function mountAt(path: string, locale: Locale) {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/', name: 'home', component: { render: () => null } },
    ],
  })
  await router.push(path)
  const wrapper = mount(LoginView, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router], stubs: { Key: true } },
  })
  await flushPromises()
  return wrapper
}

const alertText = (w: Awaited<ReturnType<typeof mountAt>>) => w.find('.el-alert--error').text()

describe('the sign-in page', () => {
  it('puts a message already shown into the language chosen afterwards', async () => {
    const w = await mountAt('/login?expired=1', 'zh-Hant')
    expect(alertText(w)).toContain('登入已過期')
    useUiStore().locale = 'en'
    await flushPromises()
    expect(alertText(w)).toContain('Your session has ended.')

    useUiStore().locale = 'zh-Hant'
    await flushPromises()
    vi.spyOn(useSessionStore(), 'signInWithPassword').mockRejectedValue(
      new ApiError({ status: 401, code: 'unauthenticated', message: 'no' }),
    )
    await w.find('input[name="login"]').setValue('someone@example.edu')
    await w.find('input[name="password"]').setValue('not the password')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    expect(alertText(w)).toContain('電子郵件或密碼不正確。')
    useUiStore().locale = 'en'
    await flushPromises()
    expect(alertText(w)).toContain('Email or password is not correct.')
    w.unmount()
  })

  it('says a missing token beside the field, read out, and moves to the field', async () => {
    const w = await mountAt('/login', 'en')
    const signIn = vi.spyOn(useSessionStore(), 'signInWithToken')
    const input = w.find<HTMLInputElement>('.login__token-form input')
    expect(input.attributes('aria-label')).toBe('API token')
    expect(input.attributes('aria-invalid')).toBeUndefined()

    await w.find('.login__token-form').trigger('submit')
    await flushPromises()
    const missing = w.find('#login-token-missing')
    expect(missing.attributes('role')).toBe('alert')
    expect(missing.text()).toBe('Paste a token first.')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')?.split(' ')).toContain('login-token-missing')
    expect(document.activeElement).toBe(input.element)
    expect(signIn).not.toHaveBeenCalled()

    await input.setValue('ais_x')
    expect(w.find('#login-token-missing').exists()).toBe(false)
    expect(input.attributes('aria-invalid')).toBeUndefined()
    w.unmount()
  })
})

describe('single sign-on on the sign-in page', () => {
  const START = '/v1/auth/sso/start'
  const ssoButton = (w: Awaited<ReturnType<typeof mountAt>>) => {
    const b = w.find('button.login__sso')
    return b.exists() ? b : undefined
  }

  it('offers none when Core has none', async () => {
    const w = await mountAt('/login', 'en')
    expect(authMethods).toHaveBeenCalledTimes(1)
    expect(ssoButton(w)).toBeUndefined()
    expect(w.find('.el-divider').exists()).toBe(false)
    w.unmount()
  })

  it('names the provider as Core does, and starts where Core says, coming back to where it was going', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: { label: 'PolyU NetID', start: START } })
    // The address the browser is sent to: only the fragment changes, which a test page can follow.
    vi.mocked(ssoStartUrl).mockReturnValueOnce('#sso-started')
    const w = await mountAt('/login?next=/courses/c1', 'en')
    const button = ssoButton(w)
    expect(button?.text()).toBe('Sign in with PolyU NetID')
    await button!.trigger('click')
    expect(ssoStartUrl).toHaveBeenCalledWith('/courses/c1', START)
    expect(window.location.hash).toBe('#sso-started')
    w.unmount()
  })

  it('is put in Simplified Chinese when that is chosen, the message already shown too', async () => {
    const w = await mountAt('/login?expired=1', 'en')
    useUiStore().locale = 'zh-Hans'
    await flushPromises()
    expect(alertText(w)).toContain('登录已过期，请重新登录。')
    expect(w.find('button[type="submit"]').text()).toBe('登录')
    expect(document.documentElement.lang).toBe('zh-Hans')
    useUiStore().locale = 'en'
    await flushPromises()
    w.unmount()
  })

  it("says single sign-on in the page's own words when Core gives no name", async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: { label: null, start: START } })
    const en = await mountAt('/login', 'en')
    expect(ssoButton(en)?.text()).toBe('Sign in with single sign-on')
    en.unmount()
    const zh = await mountAt('/login', 'zh-Hant')
    expect(ssoButton(zh)?.text()).toBe('以 單一登入 登入')
    zh.unmount()
  })

  it('shows the rest of the page at once, and the button only once Core has said', async () => {
    let answer!: (m: AuthMethods) => void
    vi.mocked(authMethods).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const w = await mountAt('/login', 'en')
    expect(w.find('input[name="login"]').exists()).toBe(true)
    expect(w.find('.login__version').text()).toBe('Server 1.0.0')
    expect(ssoButton(w)).toBeUndefined()
    answer({ password: true, sso: { label: 'PolyU NetID', start: START } })
    await flushPromises()
    expect(ssoButton(w)?.text()).toBe('Sign in with PolyU NetID')
    w.unmount()
  })
})

describe('the sign-in name, as Core takes it', () => {
  const label = (w: Awaited<ReturnType<typeof mountAt>>) => w.find('.el-form-item__label').text()

  it('says a student or staff number or an email where Core takes a login ID, and sends it as login', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, passwordAccepts: ['login_id', 'email'], sso: null })
    const w = await mountAt('/login', 'en')
    expect(label(w)).toBe('Student/staff number or email')
    expect(w.find('input[name="login"]').attributes('type')).toBe('text')
    const signIn = vi
      .spyOn(useSessionStore(), 'signInWithPassword')
      .mockRejectedValue(new ApiError({ status: 401, code: 'unauthenticated', message: 'no' }))
    await w.find('input[name="login"]').setValue(' S2023001 ')
    await w.find('input[name="password"]').setValue('not the password')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    expect(signIn).toHaveBeenCalledWith('S2023001', 'not the password', { asLogin: true })
    expect(alertText(w)).toBe('The student/staff number or email, or the password, is not correct.')
    w.unmount()
  })

  it('says it in Traditional and Simplified Chinese', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, passwordAccepts: ['login_id', 'email'], sso: null })
    const hant = await mountAt('/login', 'zh-Hant')
    expect(label(hant)).toBe('學號／工號或電子郵件')
    hant.unmount()
    const hans = await mountAt('/login', 'zh-Hans')
    expect(label(hans)).toBe('学号／工号或邮箱')
    hans.unmount()
  })

  it('keeps asking for an email, sent as email, where Core does not say', async () => {
    const w = await mountAt('/login', 'en')
    expect(label(w)).toBe('Email')
    expect(w.find('input[name="login"]').attributes('type')).toBe('email')
    const signIn = vi
      .spyOn(useSessionStore(), 'signInWithPassword')
      .mockResolvedValue({ passwordChangeRequired: false })
    await w.find('input[name="login"]').setValue('someone@example.edu')
    await w.find('input[name="password"]').setValue('a long enough password')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    expect(signIn).toHaveBeenCalledWith('someone@example.edu', 'a long enough password', { asLogin: false })
    w.unmount()
  })

  it('goes to set a password of one’s own first when the sign-in says so, keeping where it was going', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, passwordAccepts: ['login_id', 'email'], sso: null })
    const w = await mountAt('/login?next=/courses/c1', 'en')
    const router = (w.vm as unknown as { $router: import('vue-router').Router }).$router
    router.addRoute({ path: '/change-password', name: 'change-password', component: { render: () => null } })
    vi.spyOn(useSessionStore(), 'signInWithPassword').mockResolvedValue({ passwordChangeRequired: true })
    await w.find('input[name="login"]').setValue('S2023001')
    await w.find('input[name="password"]').setValue('the temporary one')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('change-password')
    expect(router.currentRoute.value.query.next).toBe('/courses/c1')
    w.unmount()
  })
})
