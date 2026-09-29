import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale, type Locale } from '@/i18n'
import { write } from '@/api/http'
import type { Actor } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import ActorView from './ActorView.vue'

// Only agents are given API tokens: an actor's page offers to issue one on an
// agent's page alone. A person's page lists how they sign in, and an API
// token they still hold (made before) only to be revoked.

let credentials: Record<string, unknown>[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      if (tool === 'actor.get') {
        const a = actors[args.actor_id as string]
        return a
          ? Promise.resolve(a)
          : Promise.reject(new real.ApiError({ status: 404, code: 'not_found', message: 'no' }))
      }
      if (tool === 'actor.list') return Promise.resolve({ actors: [], next: null })
      if (tool === 'actor.list_credentials') return Promise.resolve({ credentials })
      return Promise.reject(new Error(`no answer for ${tool}`))
    }),
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

const ROOT = '01a0d79f-0000-70da-a7cc-00000000000a'
const PERSON = '01a0d79f-0000-70da-a7cc-00000000000b'
const AGENT = '01a0d79f-0000-70da-a7cc-00000000000c'
const base = {
  status: 'active',
  created_at: '2026-09-01T00:00:00Z',
  created_by_actor_id: ROOT,
  has_password: true,
  has_sso: false,
}
const actors: Record<string, Actor> = {
  [ROOT]: {
    ...base,
    id: ROOT,
    kind: 'human',
    display_name: 'Root',
    email: 'root@example.edu',
    platform_role: 'root',
    created_by_actor_id: null,
  } as unknown as Actor,
  [PERSON]: {
    ...base,
    id: PERSON,
    kind: 'human',
    display_name: 'Chan Tai Man',
    email: 'chan@example.edu',
  } as unknown as Actor,
  [AGENT]: {
    ...base,
    id: AGENT,
    kind: 'agent',
    display_name: 'grader-v2',
    email: null,
    has_password: false,
  } as unknown as Actor,
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'cred-session',
    kind: 'session',
    label: 'password login',
    created_at: '2026-09-28T08:00:00Z',
    last_used_at: '2026-09-28T08:05:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    ...over,
  }
}
function apiToken(over: Record<string, unknown> = {}) {
  return {
    id: 'cred-token',
    kind: 'api_token',
    label: 'my laptop script',
    token_prefix: 'k7v2m4qhx3ab',
    created_at: '2026-09-01T00:00:00Z',
    issued_by_actor_id: ROOT,
    issued_by_name: 'Root',
    ...over,
  }
}

beforeEach(() => {
  setLocale('en')
  credentials = []
  vi.mocked(write).mockClear()
  // A narrow screen: a card per token, not a table.
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function open(actorId: string, locale: Locale = 'en') {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().me = { ...actors[ROOT] } as never
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/account', name: 'account', component: blank },
      { path: '/admin/actors', name: 'admin-actors', component: blank },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: blank },
      { path: '/admin/courses', name: 'admin-courses', component: blank },
    ],
  })
  await router.push(`/admin/actors/${actorId}`)
  const w = mount(ActorView, {
    props: { actorId },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
  })
  await flushPromises()
  return w
}

const headings = (w: Awaited<ReturnType<typeof open>>) => w.findAll('h2, h3').map((h) => h.text())
const buttons = (w: Awaited<ReturnType<typeof open>>) => w.findAll('button').map((b) => b.text())

describe('an actor’s page', () => {
  it('offers an agent an API token', async () => {
    const w = await open(AGENT)
    expect(headings(w)).toContain('API token')
    expect(buttons(w)).toContain('Issue token')
    expect(headings(w)).toContain('Tokens and sign-ins')
  })

  it('offers a person none, in any language, and still lists how they sign in', async () => {
    credentials = [session()]
    for (const [locale, card, issue, list] of [
      ['en', 'API token', 'Issue token', 'Tokens and sign-ins'],
      ['zh-Hant', 'API 權杖', '發出權杖', '權杖與登入方式'],
    ] as const) {
      const w = await open(PERSON, locale)
      expect(w.find('.page-header').text()).toContain('Chan Tai Man')
      expect(headings(w)).not.toContain(card)
      expect(buttons(w)).not.toContain(issue)
      // The list of their ways in stays: a session, and no heading over tokens they do not have.
      expect(headings(w)).toContain(list)
      expect(w.find('.creds-other').exists()).toBe(true)
      expect(w.find('.creds-token').exists()).toBe(false)
      expect(w.find('.creds__agents-only').exists()).toBe(false)
      w.unmount()
    }
  })

  it('offers none on one’s own page either', async () => {
    const w = await open(ROOT)
    expect(headings(w)).not.toContain('API token')
    expect(buttons(w)).not.toContain('Issue token')
  })

  it('lists a token a person still holds, says only agents have them, and revokes it', async () => {
    credentials = [session(), apiToken()]
    const w = await open(PERSON)
    expect(headings(w)).toContain('API tokens')
    expect(w.find('.creds__agents-only').text()).toBe('API tokens are for agents only: revoke these.')
    const row = w.find('.creds-token')
    expect(row.text()).toContain('my laptop script')
    expect(row.text()).toContain('ais_k7v2m4qhx3ab_…')
    expect(buttons(w)).not.toContain('Issue token')

    await row.find('button').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith(
      'actor.revoke_credential',
      { actor_id: PERSON, credential_id: 'cred-token' },
      expect.anything(),
    )
  })

  it('shows a person’s token that no longer works only on asking, with nothing said of revoking it', async () => {
    credentials = [session(), apiToken({ revoked_at: '2026-09-20T00:00:00Z' })]
    const w = await open(PERSON)
    expect(headings(w)).not.toContain('API tokens')
    await w.find('.creds__toggle').trigger('click')
    await flushPromises()
    expect(headings(w)).toContain('API tokens')
    expect(w.find('.creds-token').text()).toContain('Revoked')
    expect(w.find('.creds__agents-only').exists()).toBe(false)
  })
})
