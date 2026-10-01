import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
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

async function mountWelcome() {
  setLocale('zh-Hant')
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
  await router.push('/welcome#token=aisinv_x')
  const wrapper = mount(WelcomeView, {
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router] },
  })
  await flushPromises()
  return wrapper
}

describe('the welcome page', () => {
  // One message a test, so that each renders the page once.
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
    expect(w.find('.el-alert--error').text()).toContain('請等候 30 秒')
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
})
