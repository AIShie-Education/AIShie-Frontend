import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import HostOnRuntimeDialog from './HostOnRuntimeDialog.vue'
import { ACTOR, AGENT_ID, CORE, RUNTIME, Servers, executed, hostedAgent, inspected, json, refusal } from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const pinia = createPinia()
setActivePinia(pinia)
const global = {
  plugins: [pinia, i18n, ElementPlus],
  components: icons,
  stubs: { RouterLink: { template: '<a class="router-link"><slot /></a>' } },
}

let s: Servers

beforeEach(() => {
  setLocale('en')
  s = new Servers().install()
  vi.mocked(ElMessage).mockClear()
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function open(props: Record<string, unknown> = { actorId: ACTOR, name: 'Study helper' }) {
  const w = mount(HostOnRuntimeDialog, { props: { modelValue: true, ...props }, global, attachTo: document.body })
  await flushPromises()
  return w
}

async function host(w: VueWrapper) {
  await w.find('.host-dialog__submit').trigger('click')
  await flushPromises()
}

function summary(over: Record<string, unknown>) {
  return {
    actor_id: 'x',
    display_name: 'x',
    hosting: 'runtime',
    status: 'active',
    suspended_by_me: false,
    created_at: '2026-09-01T00:00:00Z',
    site_chat: false,
    live_seats: 0,
    pending_requests: 0,
    ...over,
  }
}

describe('HostOnRuntimeDialog: an agent of its page', () => {
  it('asks the runtime about the agent by its id alone, and says what will happen', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected()))
    const w = await open()
    expect(w.text()).toContain('Host Study helper on AIshie')
    expect(w.findAll('.el-step').map((x) => x.text())).toEqual(['Agent', 'Model and key'])
    expect(w.text()).toContain('The runtime is issued the agent’s token itself: you never see one.')
    expect(w.find('.host-dialog__seats').text()).toBe('It is in 2 courses.')
    const [asked] = s.to('POST', RUNTIME.inspect)
    expect(JSON.parse(asked.body!)).toEqual({ agent_id: ACTOR })
    // Nothing is issued in Core, and nothing is hosted yet.
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
    expect(s.to('POST', RUNTIME.agents)).toHaveLength(0)
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeUndefined()
  })

  it('hosts it by its id, and hands the page its row; no token goes anywhere', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected()))
    s.on('POST', RUNTIME.agents, () => json(201, hostedAgent({ status: 'needs_model' }), { ETag: '"1"' }))
    const w = await open()
    await host(w)
    const [sent] = s.to('POST', RUNTIME.agents)
    expect(JSON.parse(sent.body!)).toEqual({ agent_id: ACTOR })
    expect(w.emitted('hosted')).toEqual([[expect.objectContaining({ id: AGENT_ID, status: 'needs_model' }), ACTOR]])
    expect(w.emitted('update:modelValue')).toEqual([[false]])
    expect(vi.mocked(ElMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Study helper is hosted on AIshie' }),
    )
    // No request but the assertion carries anything like a token; none is issued or pasted.
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
    for (const c of s.calls.filter((c) => c.body)) expect(c.body).not.toMatch(/"token"|ais_/)
  })

  it.each([
    ['mcp_agent', 'This agent has MCP access: it is used from your own tools, and is never hosted here.'],
    ['agent_suspended', 'This agent is suspended in AIshie. Reactivate it first.'],
    ['owner_suspended', 'Its owner is suspended in AIshie, so it cannot be hosted. Ask an administrator.'],
    ['operator_agent', 'The school’s operator already runs this agent.'],
  ])('says why the runtime will not host it (%s), and offers nothing', async (reason, words) => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected({ hostable: false, reason: reason as never })))
    const w = await open()
    expect(w.find('.host-dialog__refusal').text()).toBe(words)
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeDefined()
  })

  it('says one hosted already is hosted, and offers nothing more', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected({ hosted: { id: AGENT_ID, by_you: true } })))
    const w = await open()
    expect(w.find('.host-dialog__already').text()).toContain('It is hosted on AIshie already.')
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeDefined()
  })

  it('says an earlier hosting of someone else’s is replaced', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected({ hosted: { id: null, by_you: false } })))
    const w = await open()
    expect(w.find('.host-dialog__takes-over').text()).toContain('is replaced')
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeUndefined()
  })

  it('says AIshie does not count it as the caller’s, when the runtime finds no such agent of theirs', async () => {
    s.on('POST', RUNTIME.inspect, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await open()
    expect(w.text()).toContain('AIshie does not count this as one of your agents.')
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeDefined()
  })

  it('says why hosting was refused, and asks about the agent again', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected()))
    s.once('POST', RUNTIME.agents, () => refusal(422, 'failed_precondition', 'agent_suspended'))
    const w = await open()
    await host(w)
    expect(w.text()).toContain('This agent is suspended in AIshie. Reactivate it first.')
    expect(w.emitted('hosted')).toBeUndefined()
    expect(s.to('POST', RUNTIME.inspect)).toHaveLength(2)
  })

  it('says the runtime is not set up to host agents', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    s.on('POST', RUNTIME.inspect, () => refusal(503, 'unavailable', 'runtime_misconfigured'))
    const w = await open()
    // A 503 is asked again twice, half a second and then a second apart,
    // before it is the answer.
    expect(s.to('POST', RUNTIME.inspect)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(s.to('POST', RUNTIME.inspect)).toHaveLength(2)
    expect(w.text()).not.toContain('not set up to host agents')
    await vi.advanceTimersByTimeAsync(1_000)
    await flushPromises()
    expect(s.to('POST', RUNTIME.inspect)).toHaveLength(3)
    expect(w.text()).toContain('The school’s runtime is not set up to host agents. Tell your administrator.')
  })

  it('says so in Traditional and Simplified Chinese', async () => {
    s.on('POST', RUNTIME.inspect, () => json(200, inspected({ live_seats: 1 })))
    setLocale('zh-Hant')
    let w = await open()
    expect(w.text()).toContain('把Study helper交給 AIshie 託管')
    expect(w.find('.host-dialog__seats').text()).toBe('它在1個課程中。')
    w.unmount()
    setLocale('zh-Hans')
    w = await open()
    expect(w.text()).toContain('把Study helper交给 AIshie 托管')
    expect(w.find('.host-dialog__seats').text()).toBe('它在1门课程中。')
  })
})

describe('HostOnRuntimeDialog: picking one of one’s agents', () => {
  it('offers only one’s active agents hosted on AIshie that are not hosted yet, never one with MCP access', async () => {
    s.on('GET', CORE.agents, () =>
      executed({
        agents: [
          summary({ actor_id: 'a-1', display_name: 'Lab tutor' }),
          summary({ actor_id: 'a-2', display_name: 'Desk notes', hosting: 'mcp' }),
          summary({ actor_id: 'a-3', display_name: 'Old helper', status: 'suspended' }),
          summary({ actor_id: ACTOR, display_name: 'Study helper' }),
        ],
        limit: 5,
        self_service: true,
      }),
    )
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ core_actor_id: ACTOR })] }))
    s.on('POST', RUNTIME.inspect, () => json(200, inspected({ core_actor_id: 'a-1', display_name: 'Lab tutor' })))
    const w = await open({})
    expect(w.text()).toContain('Host an agent on AIshie')
    // The one left to host is chosen, and asked about.
    const sent = s.to('POST', RUNTIME.inspect)
    expect(sent.map((c) => JSON.parse(c.body!))).toEqual([{ agent_id: 'a-1' }])
    await w.find('.host-dialog__select .el-select__wrapper').trigger('click')
    await flushPromises()
    const offered = [...document.querySelectorAll('.el-select-dropdown__item')].map((x) => x.textContent?.trim())
    expect(offered).toEqual(['Lab tutor'])
  })

  it('says when none is waiting to be hosted, and that one with MCP access never is', async () => {
    s.on('GET', CORE.agents, () =>
      executed({ agents: [summary({ actor_id: 'a-2', hosting: 'mcp' })], limit: 5, self_service: true }),
    )
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    const w = await open({})
    expect(w.find('.host-dialog__none').text()).toContain('None of your agents is waiting to be hosted.')
    expect(w.find('.host-dialog__none').text()).toContain('one with MCP access is used from your own tools')
    expect(s.to('POST', RUNTIME.inspect)).toHaveLength(0)
    expect(w.find('.host-dialog__submit').attributes('disabled')).toBeDefined()
  })
})
