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

  it('offers no API token to sign in with, in any language: people sign in with a password or single sign-on', async () => {
    vi.mocked(authMethods).mockResolvedValue({
      password: true,
      sso: { label: 'School NetID', start: '/v1/auth/sso/start' },
    })
    for (const [locale, words] of [
      ['en', ['API token', 'token']],
      ['zh-Hant', ['API 權杖', '權杖']],
      ['zh-Hans', ['API 令牌', '令牌']],
    ] as const) {
      const w = await mountAt('/login', locale)
      const text = w.text()
      for (const word of words) expect(text).not.toContain(word)
      expect(w.find('.login__token').exists()).toBe(false)
      // What there is to fill in: the account's name and its password, and nothing else.
      expect(w.findAll('.login__card input').map((i) => i.attributes('name'))).toEqual(['login', 'password'])
      expect(w.find('input[placeholder^="ais_"]').exists()).toBe(false)
      expect(w.findAll('.login__card form')).toHaveLength(1)
      expect(w.find('button.login__sso').exists()).toBe(true)
      expect('signInWithToken' in useSessionStore()).toBe(false)
      w.unmount()
    }
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
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: { label: 'School NetID', start: START } })
    // The address the browser is sent to: only the fragment changes, which a test page can follow.
    vi.mocked(ssoStartUrl).mockReturnValueOnce('#sso-started')
    const w = await mountAt('/login?next=/courses/c1', 'en')
    const button = ssoButton(w)
    expect(button?.text()).toBe('Sign in with School NetID')
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
    // Which version the server runs is not the sign-in page's business: it is in the account menu's About.
    expect(w.text()).not.toContain('1.0.0')
    expect(ssoButton(w)).toBeUndefined()
    answer({ password: true, sso: { label: 'School NetID', start: START } })
    await flushPromises()
    expect(ssoButton(w)?.text()).toBe('Sign in with School NetID')
    w.unmount()
  })
})

describe('single sign-on first', () => {
  const START = '/v1/auth/sso/start'

  it('offers a student number and password behind a link, where Core takes one', async () => {
    vi.mocked(authMethods).mockResolvedValue({
      password: true,
      passwordAccepts: ['login_id', 'email'],
      sso: { label: 'School NetID', start: START },
    })
    const w = await mountAt('/login', 'zh-Hant')
    expect(w.find('button.login__sso').classes()).toContain('el-button--primary')
    expect(w.find('button.login__use-password').text()).toBe('改用學號／密碼登入')
    expect(w.find('form.el-form').isVisible()).toBe(false)
    w.unmount()
  })

  it('keeps a form already typed in when Core names a provider late', async () => {
    vi.useFakeTimers()
    try {
      let answer!: (m: AuthMethods) => void
      vi.mocked(authMethods).mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const w = await mountAt('/login', 'en')
      await vi.advanceTimersByTimeAsync(400)
      const form = w.find('form.el-form')
      expect(form.isVisible()).toBe(true)
      await w.find('input[name="login"]').setValue('someone@example.edu')
      answer({ password: true, sso: { label: 'School NetID', start: START } })
      await flushPromises()
      expect(form.isVisible()).toBe(true)
      expect(w.find('button.login__use-sso').text()).toBe('Sign in another way')
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('single sign-on first, from the keyboard', () => {
  const START = '/v1/auth/sso/start'

  it('keeps the form a person has moved into, before typing, when Core names a provider late', async () => {
    vi.useFakeTimers()
    try {
      let answer!: (m: AuthMethods) => void
      vi.mocked(authMethods).mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const w = await mountAt('/login', 'en')
      await vi.advanceTimersByTimeAsync(400)
      const input = w.find<HTMLInputElement>('input[name="login"]')
      input.element.focus()
      answer({ password: true, sso: { label: 'School NetID', start: START } })
      await flushPromises()
      expect(w.find('form.el-form').isVisible()).toBe(true)
      expect(document.activeElement).toBe(input.element)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves focus into the form and back to the first provider', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: { label: 'School NetID', start: START } })
    const w = await mountAt('/login', 'en')
    await w.find('button.login__use-password').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(w.find('input[name="login"]').element)
    await w.find('button.login__use-sso').trigger('click')
    await flushPromises()
    expect(w.find('form.el-form').isVisible()).toBe(false)
    expect(document.activeElement).toBe(w.find('button.login__sso').element)
    w.unmount()
  })
})

describe('several identity providers on the sign-in page', () => {
  const PROVIDERS = [
    { id: 'school-adfs', label: 'School NetID', start: '/v1/auth/sso/start/school-adfs' },
    { id: 'university-sso', label: '大學統一認證', start: '/v1/auth/sso/start/university-sso' },
    { id: 'lib', label: null, start: '/v1/auth/sso/start/lib' },
  ]
  const buttons = (w: Awaited<ReturnType<typeof mountAt>>) => w.findAll('button.login__sso')

  it('shows a button for each, in Core’s order, named as Core names it or in the page’s own words', async () => {
    vi.mocked(authMethods).mockResolvedValue({
      password: true,
      sso: { label: 'School NetID', start: PROVIDERS[0].start },
      ssoProviders: PROVIDERS,
    })
    const w = await mountAt('/login', 'en')
    expect(buttons(w).map((b) => b.text())).toEqual([
      'Sign in with School NetID',
      'Sign in with 大學統一認證',
      'Sign in with single sign-on',
    ])
    // Single sign-on first, the first provider the page's one primary; the password behind a link.
    expect(buttons(w).map((b) => b.classes().includes('el-button--primary'))).toEqual([true, false, false])
    const form = w.find('form.el-form')
    expect(form.isVisible()).toBe(false)
    await w.find('button.login__use-password').trigger('click')
    expect(w.find('button.login__use-password').exists()).toBe(false)
    expect(form.isVisible()).toBe(true)
    expect(w.findAll('.login__card input').map((i) => i.attributes('name'))).toEqual(['login', 'password'])
    expect(w.find('button[type="submit"]').text()).toBe('Sign in')
    // And back to the providers.
    await w.find('button.login__use-sso').trigger('click')
    expect(form.isVisible()).toBe(false)
    expect(buttons(w)).toHaveLength(3)
    w.unmount()
  })

  it('starts at the provider chosen, coming back to where it was going', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: null, ssoProviders: PROVIDERS })
    vi.mocked(ssoStartUrl).mockReturnValueOnce('#university-started')
    const w = await mountAt('/login?next=/courses/c1', 'en')
    await buttons(w)[1].trigger('click')
    expect(ssoStartUrl).toHaveBeenCalledWith('/courses/c1', '/v1/auth/sso/start/university-sso')
    expect(window.location.hash).toBe('#university-started')
    w.unmount()
  })

  it('shows none when Core offers none now, whatever an older field says', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: null, ssoProviders: [] })
    const w = await mountAt('/login', 'en')
    expect(buttons(w)).toHaveLength(0)
    expect(w.find('.el-divider').exists()).toBe(false)
    w.unmount()
  })

  it('keeps the one button of a Core from before several providers', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: { label: 'School NetID', start: '/v1/auth/sso/start' } })
    vi.mocked(ssoStartUrl).mockReturnValueOnce('#one-started')
    const w = await mountAt('/login', 'en')
    expect(buttons(w).map((b) => b.text())).toEqual(['Sign in with School NetID'])
    await buttons(w)[0].trigger('click')
    expect(ssoStartUrl).toHaveBeenCalledWith('/', '/v1/auth/sso/start')
    w.unmount()
  })

  it('names them in Chinese too', async () => {
    vi.mocked(authMethods).mockResolvedValue({ password: true, sso: null, ssoProviders: PROVIDERS })
    const zh = await mountAt('/login', 'zh-Hant')
    expect(buttons(zh).map((b) => b.text())).toEqual(['以 School NetID 登入', '以 大學統一認證 登入', '以 單一登入 登入'])
    zh.unmount()
    const hans = await mountAt('/login', 'zh-Hans')
    expect(buttons(hans).at(-1)!.text()).toBe('以 单点登录 登录')
    hans.unmount()
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
