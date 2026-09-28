import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { InspectAnswer } from '@/api/runtime-types'
import PasteTokenDialog from './PasteTokenDialog.vue'
import { ACTOR, CORE, RUNTIME, Servers, credential, hostedAgent, json, newToken, refusal, seat } from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const pinia = createPinia()
setActivePinia(pinia)
const global = { plugins: [pinia, i18n, ElementPlus], components: icons }

let s: Servers
let logged: unknown[][]

beforeEach(() => {
  setLocale('en')
  s = new Servers().install()
  logged = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args))
  }
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function inspection(prefix: string, over: Partial<InspectAnswer> = {}): InspectAnswer {
  return {
    core_actor_id: ACTOR,
    display_name: 'Study helper',
    owner_actor_id: 'me',
    token: { hint: `ais_${prefix}…`, prefix },
    seats: [seat({ seen_at: new Date().toISOString() })],
    hosted: null,
    ...over,
  }
}

async function open(props: Record<string, unknown> = {}) {
  const w = mount(PasteTokenDialog, {
    props: { modelValue: true, actorId: ACTOR, name: 'Study helper', credentials: [], ...props },
    global,
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

async function type(w: VueWrapper, value: string) {
  await w.find('.paste-dialog__token input').setValue(value)
  await flushPromises()
}

async function press(w: VueWrapper, cls: string) {
  await w.find(cls).trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.el-button.is-loading').exists()).toBe(false))
  await flushPromises()
}

describe('PasteTokenDialog', () => {
  it('takes the token in a password field the browser does not fill', async () => {
    const w = await open()
    const input = w.find('.paste-dialog__token input')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('off')
  })

  it('refuses what is not an agent token without sending it anywhere', async () => {
    const w = await open()
    await type(w, 'sk-not-an-agent-token')
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(w.text()).toContain('That is not an AIShie agent token (it should begin with ais_).')
    expect(s.calls).toHaveLength(0)
  })

  it('checks the token, then shows the agent, its seats and what connecting does', async () => {
    const { token, prefix } = newToken()
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix)))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(JSON.parse(s.to('POST', RUNTIME.inspect)[0].body!)).toEqual({ token, core_actor_id: ACTOR })
    expect(w.text()).toContain('Study helper')
    expect(w.text()).toContain(`ais_${prefix}…`)
    expect(w.text()).toContain('Your delegate in CS101 · A: reads the course material and students’ work; answers only you.')
    expect(w.find('.paste-dialog__submit').exists()).toBe(true)
  })

  it.each([
    [{ agent_id: 'agt_1', by_you: true, same_token: true }, 'Already connected.'],
    [{ agent_id: null, by_you: false, same_token: false }, 'Connecting replaces the copy an earlier owner left.'],
  ])('says whether it is hosted already (%o)', async (hosted, words) => {
    const { token, prefix } = newToken()
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix, { hosted })))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(w.text()).toContain(words)
  })

  it.each([
    [422, 'failed_precondition', 'token_refused', 'AIShie refused this token: it was revoked or has expired.'],
    [422, 'failed_precondition', 'token_not_agent', 'This token is a person’s, not an agent’s. The runtime only takes an agent’s own token.'],
    [422, 'failed_precondition', 'token_other_agent', 'This token belongs to another agent.'],
    [403, 'forbidden', 'agent_unowned', 'Nobody owns this agent in AIShie, so it cannot be connected here. Ask an administrator.'],
    [403, 'forbidden', 'not_owner', 'This agent belongs to someone else. Only its owner can connect it.'],
    [422, 'failed_precondition', 'agent_suspended', 'This agent is suspended in AIShie. Reactivate it first.'],
    [422, 'failed_precondition', 'core_too_old', 'This AIShie server is too old for hosting. Tell your administrator.'],
    [400, 'invalid_argument', 'token_malformed', 'That is not an AIShie agent token (it should begin with ais_).'],
  ] as const)('says why the runtime refused the token: %s', async (status, code, reason, words) => {
    const { token } = newToken()
    s.on('POST', RUNTIME.inspect, () => refusal(status, code, reason))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(w.text()).toContain(words)
    expect(w.html()).not.toContain(token)
  })

  it('says when the runtime could not reach AIShie, after trying again', async () => {
    const { token } = newToken()
    s.on('POST', RUNTIME.inspect, () => refusal(503, 'unavailable', 'core_unavailable'))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const w = await open()
      await type(w, token)
      await w.find('.el-dialog__footer .el-button--primary').trigger('click')
      await vi.waitFor(() => expect(w.text()).toContain('The runtime could not reach AIShie. Try again in a minute.'), {
        timeout: 5000,
      })
      expect(s.to('POST', RUNTIME.inspect)).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('connects, then empties the field, and never revokes a pasted token', async () => {
    const { token, prefix } = newToken()
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix)))
    s.on('POST', RUNTIME.agents, () => json(201, hostedAgent({ status: 'needs_model', token: { hint: 'h', prefix } })))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    await press(w, '.paste-dialog__submit')
    expect(JSON.parse(s.to('POST', RUNTIME.agents)[0].body!)).toEqual({ token, core_actor_id: ACTOR })
    expect(w.emitted('connected')![0][0]).toMatchObject({ status: 'needs_model' })
    expect((w.vm as unknown as { token: string }).token).toBe('')
    expect(s.to('POST', CORE.revoke)).toHaveLength(0)
    expect(w.html()).not.toContain(token)
    expect(JSON.stringify(logged)).not.toContain(token)
    expect(JSON.stringify(w.emitted())).not.toContain(token)
    // The token went to the runtime's inspect and connect, and nowhere else.
    const carrying = s.calls.filter((c) => JSON.stringify(c).includes(token)).map((c) => c.url)
    expect(carrying).toEqual(['/runtime/api/v1/agents/inspect', '/runtime/api/v1/agents'])
  })

  it('does not revoke a pasted token the runtime refuses to connect either', async () => {
    const { token, prefix } = newToken()
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix)))
    s.on('POST', RUNTIME.agents, () => refusal(409, 'conflict', 'already_hosted', { agent_id: 'agt_1' }))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    await press(w, '.paste-dialog__submit')
    expect(w.text()).toContain('This agent is already on the school’s runtime.')
    expect(w.emitted('refresh')).toBeTruthy()
    expect(s.to('POST', CORE.revoke)).toHaveLength(0)
  })

  it('warns when another token is in use, and revokes those (never the pasted one) when asked', async () => {
    const { token, prefix } = newToken()
    const creds = [
      credential({ id: 'cred_laptop', label: 'laptop', last_used_at: new Date().toISOString() }),
      credential({ id: 'cred_pasted', token_prefix: prefix, last_used_at: new Date().toISOString() }),
    ]
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix)))
    s.on('POST', RUNTIME.agents, () => json(201, hostedAgent()))
    const w = await open({ credentials: creds })
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(w.find('.one-brain').text()).toContain('laptop')
    // This very token was used lately: what runs on it would answer too.
    expect(w.find('.one-brain-same').text()).toContain('If a runtime of your own uses this token, stop it first')
    await press(w, '.one-brain__revoke')
    expect(s.revoked).toEqual(['cred_laptop'])
    expect(w.emitted('connected')).toBeTruthy()
  })

  it('forgets the answer when the token changes, and the token when it closes', async () => {
    const { token, prefix } = newToken()
    s.on('POST', RUNTIME.inspect, () => json(200, inspection(prefix)))
    const w = await open()
    await type(w, token)
    await press(w, '.el-dialog__footer .el-button--primary')
    expect(w.find('.paste-dialog__submit').exists()).toBe(true)
    await type(w, newToken().token)
    expect(w.find('.paste-dialog__submit').exists()).toBe(false)
    await w.setProps({ modelValue: false })
    expect((w.vm as unknown as { token: string }).token).toBe('')
  })
})
