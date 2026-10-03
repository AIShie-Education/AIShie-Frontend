import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// The server's version, as /healthz says it.
const server = vi.hoisted(() => ({ version: '2ba8ac7' as string | null }))
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    health: vi.fn(async () => {
      if (!server.version) throw new Error('no answer')
      return { status: 'ok', version: server.version, commit: server.version, schema_version: 27, schema_latest: 27 }
    }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: AboutDialog } = await import('./AboutDialog.vue')

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  server.version = '2ba8ac7'
  setLocale('en')
})

async function opened(locale: 'en' | 'zh-Hant' = 'en') {
  setLocale(locale)
  const w = mount(AboutDialog, {
    props: { modelValue: false },
    global: { plugins: [ElementPlus, i18n] },
    attachTo: document.body,
  })
  await w.setProps({ modelValue: true })
  await flushPromises()
  return w
}
const text = () => document.querySelector('.about-dialog')?.textContent ?? ''

describe('About AIshie', () => {
  it('says which web app and which server are running, read as it opens', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ version: 'v0.4.0', commit: '3d02414' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)
    await opened()
    expect(fetch).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store' }))
    expect(text()).toContain('The LMS for the agent era')
    expect(text()).toContain('Web appv0.4.0 (3d02414)')
    expect(text()).toContain('Server2ba8ac7')
  })

  it('says a version it cannot read is not known, in the reader’s language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html>', { status: 404 })),
    )
    server.version = null
    await opened('zh-Hant')
    expect(text()).toContain('網頁應用程式未知')
    expect(text()).toContain('伺服器未知')
  })
})
