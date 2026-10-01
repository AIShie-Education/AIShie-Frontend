import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale, type Locale } from '@/i18n'
import { write } from '@/api/http'
import type { Actor } from '@/api/types'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
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
const HOSTED = '01a0d79f-0000-70da-a7cc-00000000000d'
const SERVICE = '01a0d79f-0000-70da-a7cc-00000000000e'
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
    hosting: 'mcp',
  } as unknown as Actor,
  [HOSTED]: {
    ...base,
    id: HOSTED,
    kind: 'agent',
    display_name: 'lab-tutor',
    email: null,
    has_password: false,
    hosting: 'runtime',
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
  // A wide window (for whatever still asks it)…
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  // …and a page the side bar leaves narrow: the facts in one column, and a card per token, not a table.
  sizes = fakeContainerWidths({ '.creds__title': 600, '.app-card__title': 500 })
})
let sizes: ReturnType<typeof fakeContainerWidths>
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
  it('offers an agent with MCP access an API token, and says how it runs', async () => {
    const w = await open(AGENT)
    expect(headings(w)).toContain('API token')
    expect(buttons(w)).toContain('Issue token')
    expect(headings(w)).toContain('Tokens and sign-ins')
    expect(w.find('.page-header .hosting-tag').text()).toBe('MCP access')
    expect(w.text()).toContain('its tokens are issued here, for whatever reaches it over MCP')
  })

  it('offers an agent hosted on AIshie no token, and lists the runtime’s as issued to it', async () => {
    credentials = [apiToken({ issued_to: 'agent_runtime', issued_by_actor_id: SERVICE, issued_by_name: 'agent runtime', label: 'agent runtime' })]
    const w = await open(HOSTED)
    expect(w.find('.page-header .hosting-tag').text()).toBe('Hosted on AIshie')
    expect(buttons(w)).not.toContain('Issue token')
    expect(w.find('.token__runtime').text()).toContain('the site’s agent runtime alone is issued its one token')
    const token = w.find('.creds-token')
    expect(token.text()).toContain('The site’s agent runtime')
    // It can still be revoked here, which stops people asking the agent until the runtime is issued another.
    expect(token.find('button').text()).toBe('Revoke')
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

  it('lays itself out by its own cards’ widths, not the window’s', async () => {
    credentials = [apiToken()]
    const w = await open(AGENT)
    // 500 px of card: the facts in one column, the ID short; 600 px for the tokens: a card each.
    const cellsInRow = () => w.findAll('.actor__desc tbody tr')[0]!.findAll('th, td').length
    expect(cellsInRow()).toBe(2)
    expect(w.find('.actor__desc .id-text').text()).not.toContain(AGENT)
    expect(w.find('.creds-token').exists()).toBe(true)
    expect(w.find('.creds__table').exists()).toBe(false)

    // Room for two columns of facts, an email and the whole ID beside their labels: from 760 px.
    await sizes.resize('.app-card__title', 760)
    await flushPromises()
    expect(cellsInRow()).toBe(4)
    expect(w.find('.actor__desc').text()).toContain(AGENT)
    await sizes.resize('.app-card__title', 759)
    await flushPromises()
    expect(cellsInRow()).toBe(2)

    // A table of tokens where its columns fit, 1000 px; a card each again below.
    await sizes.resize('.creds__title', 1000)
    await flushPromises()
    expect(w.find('.creds__table').exists()).toBe(true)
    expect(w.find('.creds-token').exists()).toBe(false)
    await sizes.resize('.creds__title', 999)
    await flushPromises()
    expect(w.find('.creds-token').exists()).toBe(true)
  })
})
