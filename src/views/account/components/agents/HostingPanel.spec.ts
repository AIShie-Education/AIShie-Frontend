import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentFull } from '@/api/types'
import {
  ACTOR,
  CORE,
  INFO,
  RUNTIME,
  Servers,
  credential,
  executed,
  hostedAgent,
  json,
  otherToken,
  otherTokens,
} from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

// What the runtime said, and the assertion, are kept for the page's life in
// their modules: each test loads them afresh, as a new page would.
let HostingPanel: typeof import('./HostingPanel.vue').default
let AgentTokensCard: typeof import('./AgentTokensCard.vue').default
let i18n: typeof import('@/i18n').i18n
let s: Servers

const AGENT = {
  actor_id: ACTOR,
  display_name: 'Study helper',
  status: 'active',
  suspended_by_me: false,
  created_at: '2026-09-01T00:00:00Z',
  last_seen_at: null,
  seats: [],
  requests: [],
} as unknown as AgentFull

beforeEach(async () => {
  s = new Servers().install()
  vi.resetModules()
  ;({ default: HostingPanel } = await import('./HostingPanel.vue'))
  ;({ default: AgentTokensCard } = await import('./AgentTokensCard.vue'))
  ;({ i18n } = await import('@/i18n'))
  const { setLocale } = await import('@/i18n')
  setLocale('en')
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function panel(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const w = mount(HostingPanel, {
    props: {
      agent: AGENT,
      credentials: [],
      progress: { token: 'todo', connected: 'todo', course: 'todo' },
      standing: 'active',
      ...props,
    },
    global: { plugins: [pinia, i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.hosting-panel__checking').exists()).toBe(false))
  await flushPromises()
  return w
}

/** Another AI tool, or the AIShie runtime run oneself: no word of hosting, and no error. */
function expectSelfOnly(w: VueWrapper) {
  expect(w.text()).toContain('How this agent runs')
  expect(w.findAll('.connect-choice__title').map((c) => c.text())).toEqual([
    'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
    'Run the AIshie runtime yourself (advanced)',
  ])
  expect(w.text()).toContain('Authorization: Bearer <token>')
  expect(w.text()).not.toContain('Host it on AIshie')
  expect(w.text()).not.toContain('school’s runtime')
  expect(w.find('.el-alert--error').exists()).toBe(false)
  expect(w.find('.hosted-card').exists()).toBe(false)
}

describe('HostingPanel: no runtime here', () => {
  it.each([
    ['a gateway’s 502', () => new Response(null, { status: 502 })],
    ['the app’s own page', () => new Response('<!doctype html><div id="app"></div>', { status: 200, headers: { 'Content-Type': 'text/html' } })],
    ['a Core with no such route', () => json(404, { error: { code: 'not_found', message: 'no route' } })],
    ['something else answering JSON', () => json(200, { api: 'other', api_version: 1, audience: 'x' })],
    ['no answer', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('after %s, shows running it oneself alone, and asks nothing more', async (_, answer) => {
    s.on('GET', /^\/runtime\/api\/v1\/info$/, answer)
    const w = await panel()
    expectSelfOnly(w)
    expect(s.calls.map((c) => c.url)).toEqual(['/runtime/api/v1/info'])
    expect(w.emitted('hosted')![0]).toEqual([null])
  })

  it('shows neither hosting nor its absence until the runtime has answered', async () => {
    let release!: (r: Response) => void
    s.on('GET', /^\/runtime\/api\/v1\/info$/, () => new Promise<Response>((r) => (release = r)))
    const pinia = createPinia()
    const w = mount(HostingPanel, {
      props: { agent: AGENT, credentials: [], progress: { token: 'todo', connected: 'todo', course: 'todo' }, standing: 'active' },
      global: { plugins: [pinia, i18n, ElementPlus], components: icons },
    })
    await flushPromises()
    expect(w.find('.hosting-panel__checking').exists()).toBe(true)
    expect(w.text()).not.toContain('How this agent runs')
    expect(w.text()).not.toContain('Host it on AIshie')
    release(new Response(null, { status: 502 }))
    await flushPromises()
    await vi.waitFor(() => expectSelfOnly(w))
  })

  it('hides hosting, with no error, when Core makes no assertions for the runtime', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(404, { error: { code: 'not_found', message: 'none' } }))
    const w = await panel()
    await vi.waitFor(() => expectSelfOnly(w))
    expect(s.to('GET', RUNTIME.agents)).toHaveLength(0)
  })

  it('hides hosting, with a line for whoever looks, when Core does not list the runtime’s audience', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(400, { error: { code: 'invalid_argument', message: 'audience' } }))
    const w = await panel()
    await vi.waitFor(() => expectSelfOnly(w))
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('HostingPanel: the runtime is here', () => {
  it('offers hosting on AIShie first, before the other two, when the agent is not hosted', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ core_actor_id: 'someone-else' })] }))
    const w = await panel()
    expect(w.text()).toContain('How this agent runs')
    expect(w.findAll('.connect-choice__title').map((b) => b.text())).toEqual([
      'Host it on AIshie Recommended',
      'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
      'Run the AIshie runtime yourself (advanced)',
    ])
    expect(w.find('.hosting-offer__host').text()).toBe('Set up hosting')
    // Neither token, endpoint nor file while hosting is chosen.
    expect(w.find('.copy-block').exists()).toBe(false)
    expect(w.find('.hosting-offer__paste').text()).toBe('I have a token for this agent')
    expect(w.emitted('hosted')!.at(-1)).toEqual([null])
  })

  it('offers nothing to press for a suspended agent', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel({ standing: 'suspendedByMe' })
    expect(w.find('.hosting-offer__host').attributes('disabled')).toBeDefined()
    expect(w.find('.hosting-offer__paste').attributes('disabled')).toBeDefined()
  })

  it('shows the hosted card in its place when it is hosted, with running it oneself folded away', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    const w = await panel()
    expect(w.find('.hosted-card').exists()).toBe(true)
    expect(w.find('.el-radio-group').exists()).toBe(false)
    expect(w.find('.hosted-card__model').text()).toBe('OpenAI · gpt-4.1-mini')
    expect(w.find('.connect-card').exists()).toBe(false)
    const fold = w.find('details.hosted-card__self')
    expect(fold.attributes('open')).toBeUndefined()
    expect(fold.text()).toContain('These apply only after you stop hosting')
    expect(w.emitted('hosted')!.at(-1)).toEqual(['runtimetoken'])
  })

  it('says hosting is not for this account when Core will not vouch for it', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(403, { error: { code: 'forbidden', message: 'suspended' } }))
    const w = await panel()
    expect(w.text()).toContain('Hosting on the school’s runtime is not available for this account.')
    expect(w.find('.hosting-offer__host').exists()).toBe(false)
  })

  it('says the runtime is not available now, with a retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      s.on('GET', RUNTIME.agents, () => json(503, { error: { code: 'unavailable', message: 'db', details: { reason: 'store_unavailable' } } }))
      const w = await panel()
      await vi.waitFor(() => expect(w.text()).toContain('The school’s runtime is not available right now. Try again in a minute.'), { timeout: 5000 })
      s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
      await w.find('.hosting-offer__error button').trigger('click')
      await vi.waitFor(() => expect(w.find('.hosting-offer__host').exists()).toBe(true))
    } finally {
      vi.useRealTimers()
    }
  })

  it('hosts the agent: the wizard, then the model and key, with the card behind it', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    s.on('POST', RUNTIME.agents, () => json(201, hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })))
    s.on('GET', RUNTIME.agent, () => json(200, hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })))
    const w = await panel()
    await w.find('.hosting-offer__host').trigger('click')
    await flushPromises()
    await w.find('.host-dialog__submit').trigger('click')
    await vi.waitFor(() => expect(w.find('.hosted-card').exists()).toBe(true))
    await flushPromises()
    expect(w.find('.hosted-card__tag').text()).toBe('Choose a model')
    expect(w.find('.model-dialog__steps').exists()).toBe(true)
    expect(w.emitted('credsChanged')).toBeTruthy()
    // The token went to the runtime alone, and is on the page nowhere.
    const token = s.issued[0].token
    expect(document.body.innerHTML).not.toContain(token)
    expect(s.calls.filter((c) => JSON.stringify(c).includes(token)).map((c) => c.url)).toEqual(['/runtime/api/v1/agents'])
    expect(s.to('POST', CORE.issue)).toHaveLength(1)
  })
})

describe('HostingPanel: what the runtime offers', () => {
  const offering = (features: Record<string, boolean>) =>
    s.on('GET', /^\/runtime\/api\/v1\/info$/, () => json(200, { ...INFO, features: { ...INFO.features, ...features } }))

  it.each([
    ['connect_by_token', { connect_by_token: false }],
    ['own_key', { own_key: false }],
  ])('offers no hosting to an agent not hosted when %s is false, and no error', async (_, features) => {
    offering(features)
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel()
    expect(w.findAll('.connect-choice__title').map((c) => c.text())).toEqual([
      'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
      'Run the AIshie runtime yourself (advanced)',
    ])
    expect(w.find('.hosting-offer__host').exists()).toBe(false)
    expect(w.find('.hosting-offer__paste').exists()).toBe(false)
    expect(w.find('.el-alert--error').exists()).toBe(false)
  })

  it('shows an agent hosted already whatever the features say, without the actions they do not offer', async () => {
    offering({ connect_by_token: false, own_key: false })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ status: 'needs_token' })] }))
    const w = await panel()
    expect(w.find('.hosted-card').exists()).toBe(true)
    // Neither a new token nor a model can be given: nothing to press for either.
    expect(w.find('.hosted-card__primary').exists()).toBe(false)
    expect(w.text()).toContain('The school’s runtime does not take new tokens at the moment')
    expect(w.text()).toContain('The school’s runtime does not take a model and key of your own at the moment')
    const items = Array.from(document.body.querySelectorAll('.el-dropdown-menu__item'), (e) => e.textContent?.trim())
    expect(items).toEqual(['Delete from the school’s runtime'])
    // Pausing and deleting stay.
    expect(w.find('.hosted-card__pause').exists()).toBe(true)
  })

  it('offers hosting on the school’s plan where the runtime takes no key of the owner’s', async () => {
    offering({ connect_by_token: true, own_key: false, school_key: true })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel()
    expect(w.find('.hosting-offer__host').exists()).toBe(true)
    expect(w.find('.connect-choice--hosted .connect-choice__hint').text()).toBe(
      'AIshie runs it for you, on the school’s AI plan or on a model you choose with your own API key. Nothing to install, no token to handle.',
    )
    expect(w.find('.hosting-offer__intro').text()).toContain('then you choose the school’s plan, or a model with your own API key')
  })

  it('offers all of it when every feature is true', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    const w = await panel()
    expect(w.find('.hosted-card__primary').text()).toBe('Change model or key')
    expect(w.find('.hosted-card__off').exists()).toBe(false)
  })
})

describe('HostingPanel: after connecting, one brain at a time', () => {
  const busy = () =>
    otherTokens([
      otherToken({ prefix: 'laptoplaptop', label: 'my laptop', last_used_at: new Date(Date.now() - 180_000).toISOString(), recent: true }),
    ])
  const needsModel = () => hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })

  async function host(others: unknown) {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    s.on('POST', RUNTIME.agents, () => json(201, { ...needsModel(), other_tokens: others }))
    s.on('GET', RUNTIME.agent, () => json(200, needsModel()))
    const w = await panel()
    await w.find('.hosting-offer__host').trigger('click')
    await flushPromises()
    await w.find('.host-dialog__submit').trigger('click')
    await vi.waitFor(() => expect(w.find('.hosted-card').exists()).toBe(true))
    await flushPromises()
    return w
  }

  it('warns again, above the card and in the model step, when connect says another token is in use', async () => {
    const w = await host(busy())
    const above = w.find('.hosting-panel__others')
    expect(above.text()).toContain('This agent seems to be running somewhere else')
    expect(above.text()).toContain('ais_laptoplaptop…')
    // Before a model starts the agent answering.
    const step = document.body.querySelector('.model-dialog .hosting-panel__model-notice')
    expect(step?.textContent).toContain('Its token ais_laptoplaptop… was used 3 minutes ago.')
  })

  it('stops warning once that token is revoked, from either', async () => {
    s.on('GET', CORE.credentials, () => executed({ credentials: [credential({ id: 'cred_laptop', token_prefix: 'laptoplaptop' })] }))
    const w = await host(busy())
    await w.find('.hosting-panel__others .other-tokens__revoke').trigger('click')
    await vi.waitFor(() => expect(s.revoked).toEqual(['cred_laptop']))
    await flushPromises()
    expect(w.find('.hosting-panel__others').exists()).toBe(false)
    expect(document.body.querySelector('.hosting-panel__model-notice')).toBeNull()
  })

  it('can be put away', async () => {
    const w = await host(busy())
    await w.find('.hosting-panel__others .el-alert__close-btn').trigger('click')
    await flushPromises()
    expect(w.find('.hosting-panel__others').exists()).toBe(false)
  })

  it('says nothing more when there are no other tokens, or none could be listed', async () => {
    for (const others of [otherTokens([]), null]) {
      const w = await host(others)
      expect(w.find('.other-tokens').exists()).toBe(false)
      expect(w.find('.other-tokens__unknown').exists()).toBe(false)
      w.unmount()
      document.body.innerHTML = ''
    }
  })
})

describe('HostingPanel: a token the runtime could not revoke', () => {
  const ownCred = () => credential({ id: 'cred_runtime', token_prefix: 'runtimetoken', label: 'AIShie runtime' })

  it('after a deletion, says the token may still work above the three ways, and revokes it when asked', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    s.on('DELETE', RUNTIME.agent, () =>
      json(200, {
        deleted: { id: 'agt_1', core_actor_id: ACTOR },
        token: { hint: 'ais_runtimetoken…', prefix: 'runtimetoken', revocation: 'failed', problem: 'core_unavailable' },
      }),
    )
    s.on('GET', CORE.credentials, () => executed({ credentials: [ownCred()] }))
    const w = await panel({ credentials: [ownCred()] })
    ;(w.findComponent({ name: 'HostedAgentCard' }).vm as unknown as { onCommand: (c: string) => void }).onCommand('delete')
    await flushPromises()
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    ;(document.body.querySelector('.delete-hosting__submit') as HTMLElement).click()
    await vi.waitFor(() => expect(w.find('.hosting-panel__unrevoked').exists()).toBe(true))
    await flushPromises()
    expect(w.find('.hosted-card').exists()).toBe(false)
    expect(w.find('.connect-card').exists()).toBe(true)
    expect(w.find('.hosting-panel__unrevoked').text()).toContain(
      'The school’s runtime could not revoke the token ais_runtimetoken… in AIshie (it could not reach AIshie)',
    )
    // Offered, not done.
    expect(s.revoked).toEqual([])

    await w.find('.unrevoked__revoke').trigger('click')
    await vi.waitFor(() => expect(s.revoked).toEqual(['cred_runtime']))
    await flushPromises()
    expect(w.find('.hosting-panel__unrevoked').exists()).toBe(false)
    expect(w.emitted('credsChanged')).toBeTruthy()
  })

  it('after a replacement, says the old token may still work above the hosted card', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    s.on('PUT', RUNTIME.token, () =>
      json(200, {
        agent: hostedAgent({ status: 'starting', token: { hint: 'x', prefix: s.issued[0].prefix } }),
        previous_token: { hint: 'ais_runtimetoken…', prefix: 'runtimetoken', revocation: 'failed', problem: 'core_refused' },
      }),
    )
    const w = await panel()
    ;(w.findComponent({ name: 'HostedAgentCard' }).vm as unknown as { onCommand: (c: string) => void }).onCommand('replace')
    await flushPromises()
    ;(document.body.querySelector('.host-dialog__submit') as HTMLElement).click()
    await vi.waitFor(() => expect(w.find('.hosting-panel__unrevoked').exists()).toBe(true))
    expect(w.find('.hosting-panel__unrevoked').text()).toContain('(AIshie refused its request)')
    expect(w.find('.hosted-card').exists()).toBe(true)
    await w.find('.unrevoked__later').trigger('click')
    expect(w.find('.hosting-panel__unrevoked').exists()).toBe(false)
    expect(s.revoked).toEqual([])
  })
})

describe('AgentTokensCard', () => {
  it('marks the token the school’s runtime holds', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const creds = [
      credential({ id: 'a', label: 'AIShie runtime', token_prefix: 'runtimetoken' }),
      credential({ id: 'b', label: 'laptop' }),
    ]
    const w = mount(AgentTokensCard, {
      props: { actorId: ACTOR, name: 'Study helper', credentials: creds, loading: false, error: null, hostedPrefix: 'runtimetoken' },
      global: { plugins: [pinia, i18n, ElementPlus], components: icons },
    })
    const tags = w.findAll('.token__hosted')
    expect(tags).toHaveLength(1)
    expect(tags[0].text()).toBe('Used by the school’s runtime')
    expect(tags[0].element.closest('.token')!.textContent).toContain('AIShie runtime')
  })
})
