import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ACTOR, CORE, RUNTIME, Servers, credential, executed, hostedAgent, json } from './components/agents/hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

// What the runtime said is kept for the page's life in its module: each test loads it afresh.
let AgentView: typeof import('./AgentView.vue').default
let i18n: typeof import('@/i18n').i18n
let s: Servers
let router: Router

const AGENT = /^\/v1\/me\/agents\/[^/]+$/

function agent(hosting: 'runtime' | 'mcp', over: Record<string, unknown> = {}) {
  return {
    actor_id: ACTOR,
    display_name: 'Study helper',
    hosting,
    status: 'active',
    suspended_by_me: false,
    created_at: '2026-09-01T00:00:00Z',
    last_seen_at: null,
    site_chat: false,
    seats: [],
    requests: [],
    ...over,
  }
}

beforeEach(async () => {
  s = new Servers().install()
  vi.resetModules()
  ;({ default: AgentView } = await import('./AgentView.vue'))
  ;({ i18n } = await import('@/i18n'))
  const { setLocale } = await import('@/i18n')
  setLocale('en')
  const Blank = { template: '<div />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/account', name: 'account', component: Blank },
      { path: '/account/agents', name: 'account-agents', component: Blank },
      { path: '/account/agents/:actorId', name: 'account-agent', component: Blank },
    ],
  })
  await router.push(`/account/agents/${ACTOR}`)
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function page() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const w = mount(AgentView, {
    props: { actorId: ACTOR },
    global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.agent-view__grid').exists()).toBe(true))
  await flushPromises()
  return w
}

describe('AgentView: an agent hosted on AIshie', () => {
  it('shows its hosting, whether it can be asked, and no token anywhere: none listed, issued or offered', async () => {
    s.on('GET', AGENT, () => executed(agent('runtime', { site_chat: true })))
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent()] }))
    const w = await page()
    expect(w.find('.page-header').text()).toContain('Hosted on AIshie')
    expect(w.find('.hosted-card').exists()).toBe(true)
    expect(w.find('.site-chat .el-tag').text()).toBe('Can be asked on the site')
    expect(w.find('.tokens-card').exists()).toBe(false)
    expect(w.find('.mcp-card').exists()).toBe(false)
    expect(w.text()).not.toContain('New token')
    expect(w.text()).not.toContain('Authorization')
    expect(s.to('GET', CORE.credentials)).toHaveLength(0)
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
  })

  it('says the agent is not running when the runtime does not run it', async () => {
    s.on('GET', AGENT, () => executed(agent('runtime')))
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await page()
    expect(w.find('.hosting-offer__host').text()).toBe('Set up hosting')
    expect(w.find('.site-chat .el-tag').text()).toBe('Not running')
    expect(w.find('.tokens-card').exists()).toBe(false)
  })
})

describe('AgentView: an agent with MCP access', () => {
  it('shows how to connect one’s tool, Claude Desktop included, its tokens, and that nobody asks it on the site', async () => {
    s.on('GET', AGENT, () => executed(agent('mcp')))
    s.on('GET', CORE.credentials, () => executed({ credentials: [credential({ label: 'Claude Desktop' })] }))
    const w = await page()
    expect(w.find('.page-header').text()).toContain('MCP access')
    const card = w.find('.mcp-card')
    expect(card.text()).toContain('People cannot ask this agent on the site')
    expect(card.text()).toContain('Authorization: Bearer <token>')
    expect(card.find('.tool-steps__claude summary').text()).toBe('Example: Claude Desktop')
    expect(card.find('.tool-steps__claude-config').text()).toContain('mcp-remote')
    expect(w.find('.tokens-card').text()).toContain('Claude Desktop')
    expect(w.find('.site-chat .el-tag').text()).toBe('MCP access')
    // Never hosted on AIshie: nothing of the runtime is asked or offered.
    expect(w.find('.hosting-offer').exists()).toBe(false)
    expect(w.find('.hosted-card').exists()).toBe(false)
    expect(s.to('GET', RUNTIME.agents)).toHaveLength(0)
    expect(s.to('GET', CORE.credentials)).toHaveLength(1)
  })

  it('offers to issue a token from its card', async () => {
    s.on('GET', AGENT, () => executed(agent('mcp')))
    const w = await page()
    expect(w.find('.mcp-card__issue').text()).toBe('New token')
    await w.find('.mcp-card__issue').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.el-dialog__title')?.textContent).toBe('New token for Study helper')
  })
})
