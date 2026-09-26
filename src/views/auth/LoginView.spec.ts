import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import LoginView from './LoginView.vue'

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/http')>()),
  health: vi.fn(async () => ({ status: 'ok', version: '1.0.0', commit: 'c', schema_version: 1, schema_latest: 1 })),
}))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

afterEach(() => {
  document.body.innerHTML = ''
  setLocale('en')
  vi.unstubAllGlobals()
})

async function mountAt(path: string, locale: 'en' | 'zh-Hant') {
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
    await w.find('input[name="email"]').setValue('someone@example.edu')
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
