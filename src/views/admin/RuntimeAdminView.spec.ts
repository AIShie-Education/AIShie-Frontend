import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { computed, ref, shallowRef } from 'vue'
import { setLocale } from '@/i18n'
import { RuntimeError } from '@/api/runtime'
import type { RuntimeInfo } from '@/api/runtime-types'
import { ADMIN, INFO_FOR_TESTS, Servers, adminState, noRoute, withAdmin, type AdminState } from './runtime/adminFakes'
import { mountGlobal } from './runtime/testSetup'

// Whether the runtime is there is useRuntime's to say (tested on its own):
// here each test says what it found.
const found = vi.hoisted(() => ({
  info: null as unknown,
  error: null as unknown,
  checked: false,
  refresh: null as unknown,
}))
vi.mock('@/composables/useRuntime', () => {
  const info = shallowRef<RuntimeInfo | null>(null)
  const error = shallowRef<unknown>(null)
  const checked = ref(false)
  const refresh = vi.fn(async () => {
    info.value = found.info as RuntimeInfo | null
    error.value = found.error
    checked.value = found.checked
    return !!info.value
  })
  found.refresh = refresh
  return {
    useRuntime: () => {
      info.value = found.info as RuntimeInfo | null
      error.value = found.error
      checked.value = found.checked
      return {
        available: computed(() => info.value !== null),
        info: computed(() => info.value),
        error: computed(() => error.value),
        checked: computed(() => checked.value),
        refresh,
      }
    },
  }
})

const { default: RuntimeAdminView } = await import('./RuntimeAdminView.vue')

let s: Servers
let state: AdminState

beforeEach(() => {
  setLocale('en')
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  Object.assign(found, { info: INFO_FOR_TESTS, error: null, checked: true })
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function page(path = '/admin/runtime') {
  const { global, router } = await mountGlobal(path)
  const w = mount(RuntimeAdminView, { global, attachTo: document.body })
  await flushPromises()
  return { w, router }
}
const tabs = (w: Awaited<ReturnType<typeof page>>['w']) => w.findAll('.el-tabs__item').map((x) => x.text())

describe('RuntimeAdminView', () => {
  it('asks the runtime whether the caller administers it, then shows the plan’s tab alone', async () => {
    const { w } = await page()
    expect(w.find('.page-header__title').text()).toBe('AI and documents')
    expect(s.to('GET', ADMIN.me)).toHaveLength(1)
    expect(tabs(w)).toEqual(['School AI plan', 'Pricing', 'Usage today', 'Documents', 'Agent hosting'])
    expect(w.find('.offers-card').exists()).toBe(true)
    // The other tabs are read only once shown.
    expect(s.to('GET', ADMIN.usage)).toHaveLength(0)
    expect(s.to('GET', ADMIN.settings)).toHaveLength(0)
  })

  it('opens the tab the address names', async () => {
    const { w } = await page('/admin/runtime?tab=documents')
    expect(w.find('.ocr-card').exists()).toBe(true)
    expect(w.find('.transcription-card').exists()).toBe(true)
    expect(w.find('.offers-card').exists()).toBe(false)
    expect(s.to('GET', ADMIN.usage)).toHaveLength(0)
  })

  it('names the tab chosen in the address, and the first by none', async () => {
    const { w, router } = await page('/admin/runtime?tab=usage')
    expect(w.find('.usage-card').exists()).toBe(true)
    await w.findAll('.el-tabs__item')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    expect(w.find('.offers-card').exists()).toBe(true)
    await w.findAll('.el-tabs__item')[2].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('usage')
  })

  it('shows nothing, and no absence, until the runtime has answered', async () => {
    found.checked = false
    found.info = null
    const { w } = await page()
    expect(w.find('.runtime-admin__checking').exists()).toBe(true)
    expect(w.find('.runtime-admin__none').exists()).toBe(false)
    expect(s.to('GET', ADMIN.me)).toHaveLength(0)
  })

  it('says there is no runtime on this server, and asks it nothing, where none answers', async () => {
    found.info = null
    found.error = new RuntimeError({ status: 404, code: 'not_found', message: 'no route', reason: 'not_found' })
    const { w } = await page()
    expect(w.find('.runtime-admin__none .el-result__title').text()).toBe('This server has no agent service')
    expect(w.find('.runtime-admin__retry').exists()).toBe(false)
    expect(w.find('.el-tabs').exists()).toBe(false)
    expect(s.calls.filter((c) => c.url.startsWith('/runtime/'))).toHaveLength(0)
  })

  it('says the runtime cannot be reached, and asks again when told to', async () => {
    found.info = null
    found.error = new RuntimeError({
      status: 502,
      code: 'internal',
      message: 'HTTP 502',
      reason: 'runtime_unavailable',
    })
    const { w } = await page()
    expect(w.find('.runtime-admin__none .el-result__title').text()).toBe('The agent service cannot be reached')
    Object.assign(found, { info: INFO_FOR_TESTS, error: null })
    await w.find('.runtime-admin__retry').trigger('click')
    await flushPromises()
    expect(found.refresh).toHaveBeenCalled()
    expect(w.find('.offers-card').exists()).toBe(true)
  })

  it('tells an administrator of AIshie the runtime does not count among its own', async () => {
    state.isAdmin = false
    const { w } = await page()
    expect(w.find('.runtime-admin__not-admin .el-result__title').text()).toBe(
      'You are not one of this agent service’s administrators',
    )
    expect(w.find('.el-tabs').exists()).toBe(false)
    expect(s.to('GET', ADMIN.plan)).toHaveLength(0)
  })

  // One tab a test, so that each renders the page once.
  describe('on a runtime from before the plan’s routes', () => {
    beforeEach(() => {
      s.on('GET', ADMIN.plan, () => noRoute())
      s.on('GET', ADMIN.settings, () => noRoute())
    })

    it('says so in the plan’s tab', async () => {
      const { w } = await page()
      expect(w.find('.runtime-async__not-offered').exists()).toBe(true)
      expect(w.find('.el-alert--error').exists()).toBe(false)
    })

    it('shows today’s use', async () => {
      const { w } = await page('/admin/runtime?tab=usage')
      expect(w.find('.usage-card__table').exists()).toBe(true)
    })

    it('says so in the documents’ tab', async () => {
      const { w } = await page('/admin/runtime?tab=documents')
      expect(w.find('.runtime-async__not-offered').exists()).toBe(true)
      expect(w.find('.el-alert--error').exists()).toBe(false)
    })
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const { w } = await page()
    expect(w.find('.page-header__title').text()).toBe('AI 與文件')
    expect(tabs(w)).toEqual(['學校 AI 方案', '計價與額度', '今日用量', '文件', '代理託管'])
  })
})
