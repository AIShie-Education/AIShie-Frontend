import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { AgentFull } from '@/api/types'
import { ACTOR, CORE, INFO, RUNTIME, Servers, hostedAgent, inspected, json } from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

// What the runtime said, and the assertion, are kept for the page's life in
// their modules: each test loads them afresh, as a new page would.
let HostingPanel: typeof import('./HostingPanel.vue').default
let i18n: typeof import('@/i18n').i18n
let s: Servers
let router: Router

const AGENT = {
  actor_id: ACTOR,
  display_name: 'Study helper',
  hosting: 'runtime',
  status: 'active',
  suspended_by_me: false,
  created_at: '2026-09-01T00:00:00Z',
  last_seen_at: null,
  site_chat: false,
  seats: [],
  requests: [],
} as unknown as AgentFull

beforeEach(async () => {
  s = new Servers().install()
  vi.resetModules()
  ;({ default: HostingPanel } = await import('./HostingPanel.vue'))
  ;({ i18n } = await import('@/i18n'))
  const { setLocale } = await import('@/i18n')
  setLocale('en')
  const Blank = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/account/agents/:actorId', name: 'account-agent', component: Blank },
    ],
  })
  await router.push(`/account/agents/${ACTOR}`)
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function mountPanel(props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(HostingPanel, {
    props: { agent: AGENT, standing: 'active', ...props },
    global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
    attachTo: document.body,
  })
}

async function panel(props: Record<string, unknown> = {}) {
  const w = mountPanel(props)
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.hosting-panel__checking').exists()).toBe(false))
  await flushPromises()
  return w
}

/** No runtime to run it: the card says so, and offers nothing else: no token, no other way to run it. */
function expectAbsent(w: VueWrapper) {
  expect(w.find('.hosting-offer__title').text()).toContain('Hosted on AIshie')
  expect(w.find('.hosting-offer__title').text()).toContain('Not hosted yet')
  expect(w.text()).toContain('AIshie’s agent runtime is not available on this server')
  expect(w.find('.hosting-offer__host').exists()).toBe(false)
  expect(w.find('.copy-block').exists()).toBe(false)
  expect(w.text()).not.toContain('Authorization')
  expect(w.find('.hosted-card').exists()).toBe(false)
}

describe('HostingPanel: no runtime here', () => {
  it.each([
    ['a gateway’s 502', () => new Response(null, { status: 502 })],
    [
      'the app’s own page',
      () => new Response('<!doctype html><div id="app"></div>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ],
    ['a Core with no such route', () => json(404, { error: { code: 'not_found', message: 'no route' } })],
    ['no answer', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('after %s, says the agent cannot run here yet, and asks nothing more', async (_, answer) => {
    s.on('GET', /^\/runtime\/api\/v1\/info$/, answer)
    const w = await panel()
    expectAbsent(w)
    expect(s.calls.map((c) => c.url)).toEqual(['/runtime/api/v1/info'])
  })

  it('shows neither hosting nor its absence until the runtime has answered', async () => {
    let release!: (r: Response) => void
    s.on('GET', /^\/runtime\/api\/v1\/info$/, () => new Promise<Response>((r) => (release = r)))
    const pinia = createPinia()
    const w = mount(HostingPanel, {
      props: { agent: AGENT, standing: 'active' },
      global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
    })
    await flushPromises()
    expect(w.find('.hosting-panel__checking').exists()).toBe(true)
    expect(w.find('.hosting-offer').exists()).toBe(false)
    release(new Response(null, { status: 502 }))
    await flushPromises()
    await vi.waitFor(() => expectAbsent(w))
  })

  it('says so, with no error, when Core makes no assertions for the runtime', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(404, { error: { code: 'not_found', message: 'none' } }))
    const w = await panel()
    await vi.waitFor(() => expectAbsent(w))
    expect(s.to('GET', RUNTIME.agents)).toHaveLength(0)
  })
})

describe('HostingPanel: the runtime is here', () => {
  it('offers to host the agent, saying what it takes, with no token anywhere', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ core_actor_id: 'someone-else' })] }))
    const w = await panel()
    expect(w.find('.hosting-offer__intro').text()).toBe(
      'AIshie’s runtime runs this agent once you choose the model it answers with; then people in its courses can ask it on the site. You never handle a token.',
    )
    expect(w.find('.hosting-offer__host').text()).toBe('Set up hosting')
    expect(w.find('.copy-block').exists()).toBe(false)
    expect(w.find('.hosting-offer__course').text()).toContain('Bring into a course')
    expect(s.to('GET', CORE.credentials)).toHaveLength(0)
  })

  it('offers nothing to press for a suspended agent', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel({ standing: 'suspendedByMe' })
    expect(w.find('.hosting-offer__host').attributes('disabled')).toBeDefined()
  })

  it('shows the hosted card in its place when it is hosted', async () => {
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    const w = await panel()
    expect(w.find('.hosted-card').exists()).toBe(true)
    expect(w.find('.hosted-card__model').text()).toBe('OpenAI · gpt-4.1-mini')
    expect(w.find('.hosting-offer').exists()).toBe(false)
  })

  it('says hosting is not for this account when Core will not vouch for it', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(403, { error: { code: 'forbidden', message: 'suspended' } }))
    const w = await panel()
    expect(w.text()).toContain('Hosting on the school’s runtime is not available for this account.')
    expect(w.find('.hosting-offer__host').exists()).toBe(false)
  })

  it('says the runtime is not available now, with a retry', async () => {
    // The clock is moved past the waits before the read is sent again (half
    // a second, then a second), not waited for.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    s.on('GET', RUNTIME.agents, () =>
      json(503, { error: { code: 'unavailable', message: 'db', details: { reason: 'store_unavailable' } } }),
    )
    const w = mountPanel()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500 + 1_000)
    await flushPromises()
    expect(s.to('GET', RUNTIME.agents)).toHaveLength(3)
    expect(w.text()).toContain('The school’s runtime is not available right now. Try again in a minute.')
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    await w.find('.hosting-offer__error button').trigger('click')
    await flushPromises()
    expect(w.find('.hosting-offer__host').exists()).toBe(true)
  })

  it('hosts the agent by its id: the first step, then the model and key, with the card behind it', async () => {
    const needsModel = hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    s.on('POST', RUNTIME.inspect, () => json(200, inspected()))
    s.on('POST', RUNTIME.agents, () => json(201, needsModel))
    s.on('GET', RUNTIME.agent, () => json(200, needsModel))
    const w = await panel()
    await w.find('.hosting-offer__host').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.host-dialog__submit') as HTMLElement).click()
    await vi.waitFor(() => expect(w.find('.hosted-card').exists()).toBe(true))
    await flushPromises()
    expect(w.find('.hosted-card__tag').text()).toBe('Choose a model')
    expect(document.body.querySelector('.model-dialog__steps')?.textContent).toContain('Model and key')
    expect(w.emitted('changed')).toBeTruthy()
    expect(JSON.parse(s.to('POST', RUNTIME.agents)[0].body!)).toEqual({ agent_id: ACTOR })
    // Nothing is issued in Core, and no token goes anywhere.
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
    expect(s.issued).toEqual([])
  })

  it('has Core read again once the model is saved: the runtime runs the agent, and people may ask it', async () => {
    const needsModel = hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [needsModel] }))
    const w = await panel()
    expect(w.find('.hosted-card__tag').text()).toBe('Choose a model')
    w.findComponent({ name: 'ModelKeyDialog' }).vm.$emit('saved', hostedAgent())
    await flushPromises()
    expect(w.find('.hosted-card__tag').text()).toBe('Running')
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('opens on the model step after hosting from My agents, once', async () => {
    const needsModel = hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [needsModel] }))
    await router.push(`/account/agents/${ACTOR}?host=model`)
    await panel()
    await vi.waitFor(() => expect(document.body.querySelector('.model-dialog__steps')).not.toBeNull())
    expect(router.currentRoute.value.query.host).toBeUndefined()
  })
})

describe('HostingPanel: what the runtime offers', () => {
  const offering = (features: Record<string, boolean>) =>
    s.on('GET', /^\/runtime\/api\/v1\/info$/, () => json(200, { ...INFO, features: { ...INFO.features, ...features } }))

  it('says the runtime cannot host agents now where it hosts none by id (an older one, or one without its credential)', async () => {
    offering({ host_by_id: false })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel()
    expect(w.find('.hosting-offer__host').exists()).toBe(false)
    expect(w.text()).toContain('The school’s runtime cannot host agents at the moment: it is not set up to.')
  })

  it('says the runtime offers no model where it takes neither a key nor the school’s plan', async () => {
    offering({ own_key: false, school_key: false })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel()
    expect(w.find('.hosting-offer__host').exists()).toBe(false)
    expect(w.text()).toContain('The school’s runtime offers no model to choose at the moment')
  })

  it('shows an agent hosted already whatever the features say, without the actions they do not offer', async () => {
    offering({ host_by_id: false, own_key: false })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ status: 'needs_token' })] }))
    const w = await panel()
    expect(w.find('.hosted-card').exists()).toBe(true)
    expect(w.find('.hosted-card__primary').exists()).toBe(false)
    expect(w.text()).toContain('The school’s runtime cannot host agents by their id at the moment')
    expect(w.text()).toContain('The school’s runtime does not take a model and key of your own at the moment')
    expect(w.find('.hosted-card__pause').exists()).toBe(true)
  })

  it('offers hosting on the school’s plan where the runtime takes no key of the owner’s', async () => {
    offering({ own_key: false, school_key: true })
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await panel()
    expect(w.find('.hosting-offer__host').exists()).toBe(true)
    expect(w.find('.hosting-offer__intro').text()).toContain('once you choose the school’s plan, or a model with your own API key')
  })
})
