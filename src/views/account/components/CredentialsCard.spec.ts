import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale, type Locale } from '@/i18n'
import { write } from '@/api/http'
import type { Credential } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import CredentialsCard from './CredentialsCard.vue'

// A person's own ways in, on their Account page: a password, single sign-on,
// an invitation and the sessions they began. Only agents are given API
// tokens: none is made here, and one a person still holds says so and is
// revoked like the rest.

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    write: vi.fn(async () => ({
      status: 'executed',
      actionId: 'act1',
      reviewState: 'none',
      result: { ok: true },
      replayed: false,
    })),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: { ...real.ElMessageBox, confirm: vi.fn(async () => 'confirm') },
  }
})

const ME = '01a0d79f-0000-70da-a7cc-00000000000b'
const ADMIN = '01a0d79f-0000-70da-a7cc-00000000000a'
const NOW = Date.parse('2026-09-28T08:10:00Z')

const password: Credential = { id: 'cred-pw', kind: 'password', created_at: '2026-09-01T00:00:00Z' }
const session: Credential = {
  id: 'cred-session',
  kind: 'session',
  label: 'password login',
  created_at: '2026-09-28T08:00:00Z',
  last_used_at: '2026-09-28T08:09:00Z',
  expires_at: '2026-09-28T20:00:00Z',
}
const token: Credential = {
  id: 'cred-token',
  kind: 'api_token',
  label: 'grading script',
  token_prefix: 'k7v2m4qhx3ab',
  created_at: '2026-09-01T00:00:00Z',
  issued_by_actor_id: ADMIN,
  issued_by_name: 'Root',
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  vi.mocked(write).mockClear()
  vi.mocked(ElMessageBox.confirm).mockClear()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card(credentials: Credential[], locale: Locale = 'en') {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().me = { id: ME, kind: 'human', display_name: 'Chan Tai Man' } as never
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/login', name: 'login', component: blank },
    ],
  })
  const w = mount(CredentialsCard, {
    props: { credentials, listedAt: NOW, loading: false, error: null },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
  })
  await flushPromises()
  return w
}

describe('the ways into one’s own account', () => {
  it('are headed as sign-in methods and sessions, in each language, with nothing to make a token with', async () => {
    for (const [locale, title, words] of [
      ['en', 'Sign-in methods and sessions', ['API token', 'New API token']],
      ['zh-Hant', '登入方式與登入階段', ['API 權杖', '建立 API 權杖']],
      ['zh-Hans', '登录方式与登录会话', ['API 令牌', '新建 API 令牌']],
    ] as const) {
      const w = await card([password, session], locale)
      expect(w.find('.app-card__title').text()).toBe(title)
      for (const word of words) expect(w.text()).not.toContain(word)
      // A button for each credential, to revoke it, and none besides.
      expect(w.findAll('button')).toHaveLength(2)
      w.unmount()
    }
  })

  it('tell this browser’s session, and say what revoking it does', async () => {
    const w = await card([password, session])
    const mine = w.findAll('.creds-item').find((i) => i.text().includes('Signed in with a password'))!
    expect(mine.text()).toContain('This browser')
    expect(w.text()).not.toContain('This tab')
  })

  it('list an API token a person still holds, saying only agents have them, and revoke it', async () => {
    const w = await card([password, session, token])
    const item = w.findAll('.creds-item').find((i) => i.text().includes('grading script'))!
    expect(item.text()).toContain('ais_k7v2m4qhx3ab_…')
    expect(item.text()).toContain('Issued by')
    expect(item.text()).toContain('Root')
    expect(item.find('.creds-item__agents-only').text()).toBe('API tokens are for agents only: revoke this one.')
    // Nothing else is said to be one to revoke.
    expect(w.findAll('.creds-item__agents-only')).toHaveLength(1)

    await item.find('button').trigger('click')
    await flushPromises()
    const [message, title] = vi.mocked(ElMessageBox.confirm).mock.calls[0]
    expect(title).toBe('Revoke this credential?')
    expect(JSON.stringify(message)).toContain(
      'Anything using the token ais_k7v2m4qhx3ab_… is refused from its next call.',
    )
    expect(write).toHaveBeenCalledWith('credential.revoke', { credential_id: 'cred-token' }, expect.anything())
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('say it in Traditional and Simplified Chinese', async () => {
    const hant = await card([token], 'zh-Hant')
    expect(hant.find('.creds-item__agents-only').text()).toBe('API 權杖只供代理使用：請撤銷這個權杖。')
    hant.unmount()
    const hans = await card([token], 'zh-Hans')
    expect(hans.find('.creds-item__agents-only').text()).toBe('API 令牌仅供智能体使用：请撤销这个令牌。')
  })

  it('say nothing of a token that no longer works', async () => {
    const w = await card([session, { ...token, revoked_at: '2026-09-20T00:00:00Z' }])
    await w.find('.creds-card__toolbar .el-switch').trigger('click')
    await flushPromises()
    const item = w.findAll('.creds-item').find((i) => i.text().includes('grading script'))!
    expect(item.text()).toContain('Revoked')
    expect(item.find('.creds-item__agents-only').exists()).toBe(false)
    expect(item.find('button').exists()).toBe(false)
  })
})
