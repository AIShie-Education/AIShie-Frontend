import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import AppResult from '@/components/AppResult.vue'
import WelcomeView from './WelcomeView.vue'

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

async function mountWelcome(hash = '#token=aisinv_x', locale: 'zh-Hant' | 'en' = 'zh-Hant') {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  const empty = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/welcome', name: 'welcome', component: WelcomeView },
      { path: '/login', name: 'login', component: empty },
      { path: '/', name: 'home', component: empty },
    ],
  })
  await router.push(`/welcome${hash}`)
  const wrapper = mount(WelcomeView, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  await flushPromises()
  return wrapper
}

describe('the welcome page', () => {
  // One message a test, so that each test does less: a render, a submit,
  // and the languages after it.
  async function failedSubmit(err: ApiError) {
    const w = await mountWelcome()
    const signIn = vi.spyOn(useSessionStore(), 'signInWithInvite').mockRejectedValueOnce(err)
    await w.find('input[name="password"]').setValue('a long enough password')
    await w.find('input[name="repeat"]').setValue('a long enough password')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    expect(signIn).toHaveBeenCalledTimes(1)
    return w
  }

  it('puts a message already shown into the language chosen afterwards', async () => {
    const w = await failedSubmit(
      new ApiError({ status: 429, code: 'rate_limited', message: 'slow', details: { retry_after_seconds: 30 } }),
    )
    expect(w.find('.el-alert--error').text()).toContain('請等候30秒')
    useUiStore().locale = 'en'
    await flushPromises()
    expect(w.find('.el-alert--error').text()).toContain('Wait 30 seconds')
    w.unmount()
  })

  it('puts a failure to reach the server into the language chosen afterwards, back again too', async () => {
    const w = await failedSubmit(new ApiError({ status: 0, code: 'network', message: '' }))
    expect(w.find('.el-alert--error').text()).toContain('無法連線到伺服器')
    useUiStore().locale = 'en'
    await flushPromises()
    expect(w.find('.el-alert--error').text()).toContain('Cannot reach the server')
    useUiStore().locale = 'zh-Hant'
    await flushPromises()
    expect(w.find('.el-alert--error').text()).toContain('無法連線到伺服器')
    w.unmount()
  })

  it('is a page with a banner and a main landmark, its column the main, as signing in is', async () => {
    const w = await mountWelcome()
    expect(document.body.querySelectorAll('main')).toHaveLength(1)
    expect(document.body.querySelector('main')!.classList).toContain('app-auth-page__card')
    expect(document.body.querySelector('main h1')).not.toBeNull()
    expect(document.body.querySelector('header main, main header')).toBeNull()
    w.unmount()
  })

  it('says a link without its token is incomplete as every result is: a glyph on its title’s line, at the left', async () => {
    const w = await mountWelcome('', 'en')
    const result = w.getComponent(AppResult)
    expect(result.props('kind')).toBe('missing')
    expect(result.find('.app-result__title').text()).toBe('This link is incomplete')
    expect(document.body.querySelector('main .el-result')).not.toBeNull()
    w.unmount()
  })

  it('says the password is set with a tick, in the done colour', async () => {
    const w = await mountWelcome('#token=aisinv_x', 'en')
    vi.spyOn(useSessionStore(), 'signInWithInvite').mockResolvedValueOnce({ email: 'mei@example.edu', loginId: null } as never)
    await w.find('input[name="password"]').setValue('a long enough password')
    await w.find('input[name="repeat"]').setValue('a long enough password')
    await w.find('form.el-form').trigger('submit')
    await flushPromises()
    const result = w.getComponent(AppResult)
    expect(result.props('kind')).toBe('done')
    expect(result.find('.app-result__title').text()).toBe('Your password is set')
    w.unmount()
  })
})
