import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { useSessionStore } from '@/stores/session'
import TermsView from './TermsView.vue'

vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: vi.fn(async (tool: string) => {
    if (tool === 'term.list')
      return { terms: [{ id: 'term-1', name: 'Fall 2026', starts_on: '2026-09-01', ends_on: '2026-12-20' }] }
    throw new Error(`no answer for ${tool}`)
  }),
  write: vi.fn(),
}))

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('TermsView, by its card’s width', () => {
  it('puts a term’s dates under its name, and leaves its ID out, where the toolbar is 779 px or less', async () => {
    // The window is wide (matchMedia says nothing matches): the card decides, measured by its toolbar. Every
    // column wants 780 px.
    const sizes = fakeContainerWidths({ '.app-toolbar': 780 })
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().$patch({
      me: { id: 'root', kind: 'human', display_name: 'root', platform_role: 'admin' },
    } as never)
    const w = mount(TermsView, {
      attachTo: document.body,
      global: { plugins: [pinia, i18n, ElementPlus], components: icons },
    })
    await flushPromises()
    const heads = () => w.findAll('thead th').map((th) => th.text().trim())
    expect(heads()).toEqual(['Name', 'Status', 'Starts', 'Ends', 'Length', 'ID'])
    expect(w.find('.term-meta').exists()).toBe(false)

    await sizes.resize('.app-toolbar', 779)
    await flushPromises()
    expect(heads()).toEqual(['Name', 'Status'])
    expect(w.find('.term-meta').text()).toContain('2026-09-01 – 2026-12-20')
  })
})
