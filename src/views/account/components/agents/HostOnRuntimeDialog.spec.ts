import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { AgentCredential, AgentSeat } from '@/api/types'
import HostOnRuntimeDialog from './HostOnRuntimeDialog.vue'
import {
  ACTOR,
  AGENT_ID,
  CORE,
  RUNTIME,
  Servers,
  credential,
  executed,
  hostedAgent,
  json,
  otherToken,
  otherTokens,
  refusal,
} from './hostingFakes'

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
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
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

const SEATS = [
  { course_id: 'c-1', code: 'CS101', section: 'A', title: 'Programming', answers_course: false },
  { course_id: 'c-2', code: 'MA201', section: '', title: 'Calculus', answers_course: true },
] as unknown as AgentSeat[]

async function open(props: Record<string, unknown> = {}) {
  const w = mount(HostOnRuntimeDialog, {
    props: { modelValue: true, actorId: ACTOR, name: 'Study helper', mode: 'connect', seats: SEATS, credentials: [], ...props },
    global,
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

async function press(w: VueWrapper, cls: string) {
  await w.find(cls).trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.el-button.is-loading').exists()).toBe(false))
  await flushPromises()
}

/** Every string reachable from the component's state, to look for a secret in. */
function stateText(w: VueWrapper): string {
  const seen = new WeakSet<object>()
  const out: string[] = []
  const walk = (v: unknown, depth: number) => {
    if (typeof v === 'string') out.push(v)
    if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return
    seen.add(v)
    for (const k of Object.keys(v)) {
      try {
        walk((v as Record<string, unknown>)[k], depth + 1)
      } catch {
        /* a getter that throws: nothing held there */
      }
    }
  }
  walk((w.vm as unknown as { $: { setupState: unknown } }).$.setupState, 0)
  return out.join('\n')
}

const connected = () => s.on('POST', RUNTIME.agents, () => json(201, hostedAgent({ status: 'needs_model' })))

describe('HostOnRuntimeDialog: confirm', () => {
  it('shows the agent, its seats and what will happen, and calls nothing yet', async () => {
    const w = await open()
    expect(w.text()).toContain('Host Study helper on the school’s runtime')
    expect(w.text()).toContain(
      'The school’s runtime will run this agent as it is seated in AIShie. It keeps the agent’s token encrypted; you will not see it. Next you choose a model and give your API key.',
    )
    expect(w.text()).toContain('CS101 · A')
    expect(w.text()).toContain('Answers only you')
    expect(w.text()).toContain('MA201')
    expect(w.text()).toContain('Answers every student')
    expect(w.findAll('.el-step').map((x) => x.text())).toEqual(['Confirm', 'Model and key'])
    expect(s.calls).toHaveLength(0)
  })

  it('says so in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await open()
    expect(w.text()).toContain('在學校的執行環境託管 Study helper')
    expect(w.text()).toContain('只回答你')
    setLocale('en')
  })
})

describe('HostOnRuntimeDialog: connecting', () => {
  it('issues a token labelled “AIShie runtime” under a key, hands it to the runtime, and never shows it', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    s.on('POST', RUNTIME.agents, async () => {
      await gate
      return json(201, hostedAgent({ status: 'needs_model' }))
    })
    const w = await open()
    await w.find('.host-dialog__submit').trigger('click')
    await vi.waitFor(() => expect(s.to('POST', RUNTIME.agents)).toHaveLength(1))

    // While the runtime has it in hand: nowhere in the page or the component's state.
    const { token, prefix } = s.issued[0]
    expect(w.html()).not.toContain(token)
    expect(document.body.innerHTML).not.toContain(token)
    expect(stateText(w)).not.toContain(token)
    release()
    await flushPromises()
    await vi.waitFor(() => expect(w.emitted('connected')).toBeTruthy())

    const assertion = s.calls.findIndex((c) => c.url === '/v1/auth/assertion')
    const issue = s.calls.findIndex((c) => CORE.issue.test(c.url))
    expect(assertion).toBeGreaterThanOrEqual(0)
    // The runtime can be called before any token exists.
    expect(assertion).toBeLessThan(issue)
    const issueCall = s.calls[issue]
    expect(JSON.parse(issueCall.body!)).toEqual({ label: 'AIShie runtime' })
    expect(issueCall.headers['Idempotency-Key']).toMatch(/\S{8,}/)
    expect(JSON.parse(s.to('POST', RUNTIME.agents)[0].body!)).toEqual({ token, core_actor_id: ACTOR })
    expect(s.revoked).toEqual([])
    expect(w.emitted('connected')![0][0]).toMatchObject({ id: AGENT_ID, status: 'needs_model' })
    expect(w.emitted('credsChanged')).toBeTruthy()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([false])

    // The token went to the runtime's connect, once, and nowhere else.
    const carrying = s.calls.filter((c) => JSON.stringify(c).includes(token))
    expect(carrying.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /runtime/api/v1/agents'])
    expect(prefix).toHaveLength(12)
    expect(w.html()).not.toContain(token)
    expect(stateText(w)).not.toContain(token)
    expect(JSON.stringify(w.emitted())).not.toContain(token)
    expect(JSON.stringify(logged)).not.toContain(token)
  })

  it.each([
    [422, 'failed_precondition', 'token_refused', 'AIShie refused this token: it was revoked or has expired.'],
    [422, 'failed_precondition', 'agent_suspended', 'This agent is suspended in AIShie. Reactivate it first.'],
    [422, 'failed_precondition', 'core_too_old', 'This AIShie server is too old for hosting. Tell your administrator.'],
    [409, 'conflict', 'operator_agent', 'The school’s operator already runs this agent.'],
    [409, 'conflict', 'already_hosted', 'This agent is already on the school’s runtime.'],
    [403, 'forbidden', 'not_owner', 'This agent belongs to someone else. Only its owner can connect it.'],
  ] as const)('revokes the issued token when the runtime refuses it (%i %s)', async (status, code, reason, words) => {
    s.on('POST', RUNTIME.agents, () => refusal(status, code, reason))
    const w = await open()
    await press(w, '.host-dialog__submit')
    expect(s.revoked).toEqual([s.issued[0].credentialId])
    expect(w.text()).toContain(words)
    expect(w.emitted('connected')).toBeUndefined()
    // The list is read again when the agent turned out to be hosted already.
    expect(!!w.emitted('refresh')).toBe(reason === 'already_hosted')
    expect(w.html()).not.toContain(s.issued[0].token)
  })

  it('does not revoke when no answer came but the runtime lists the agent: the first request went through', async () => {
    s.on('POST', RUNTIME.agents, () => Promise.reject(new TypeError('Failed to fetch')))
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [hostedAgent({ status: 'needs_model' })] }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const w = await open()
      await w.find('.host-dialog__submit').trigger('click')
      await vi.waitFor(() => expect(w.emitted('connected')).toBeTruthy(), { timeout: 5000 })
      expect(s.to('POST', RUNTIME.agents)).toHaveLength(3)
      expect(s.to('GET', RUNTIME.agents)).toHaveLength(1)
      expect(s.revoked).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('revokes when the runtime failed and does not list the agent, and says so', async () => {
    s.on('POST', RUNTIME.agents, () => refusal(503, 'unavailable', 'core_unavailable'))
    s.on('GET', RUNTIME.agents, () => json(200, { agents: [] }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const w = await open()
      await w.find('.host-dialog__submit').trigger('click')
      await vi.waitFor(() => expect(s.revoked).toHaveLength(1), { timeout: 5000 })
      await flushPromises()
      expect(w.text()).toContain('The runtime could not reach AIShie. Try again in a minute.')
      expect(w.emitted('connected')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('revokes nothing when it cannot tell whether the runtime has the token', async () => {
    s.on('POST', RUNTIME.agents, () => Promise.reject(new TypeError('Failed to fetch')))
    s.on('GET', RUNTIME.agents, () => Promise.reject(new TypeError('Failed to fetch')))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const w = await open()
      await w.find('.host-dialog__submit').trigger('click')
      await vi.waitFor(() => expect(s.to('GET', RUNTIME.agents)).toHaveLength(3), { timeout: 8000 })
      await vi.waitFor(() => expect(w.text()).toContain('The school’s runtime could not be reached.'))
      expect(s.revoked).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('revokes a replayed issue that came back without its token, and issues once more under a new key', async () => {
    s.once('POST', CORE.issue, () => executed({ credential_id: 'cred_replayed', token_prefix: 'replayedxxxx' }, { 'Idempotency-Replayed': 'true' }))
    connected()
    const w = await open()
    await press(w, '.host-dialog__submit')
    const issues = s.to('POST', CORE.issue)
    expect(issues).toHaveLength(2)
    expect(issues[1].headers['Idempotency-Key']).not.toBe(issues[0].headers['Idempotency-Key'])
    expect(s.revoked).toEqual(['cred_replayed'])
    expect(JSON.parse(s.to('POST', RUNTIME.agents)[0].body!).token).toBe(s.issued[0].token)
    expect(w.emitted('connected')).toBeTruthy()
  })

  it('issues nothing when Core will not vouch for this account', async () => {
    s.on('POST', /^\/v1\/auth\/assertion$/, () => json(403, { error: { code: 'forbidden', message: 'suspended' } }))
    // A fresh assertion is needed: the one held from an earlier test is dropped.
    const { forgetRuntimeAssertion } = await import('@/api/runtime')
    forgetRuntimeAssertion()
    const w = await open()
    await press(w, '.host-dialog__submit')
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
    expect(w.text()).toContain('Hosting on the school’s runtime is not available for this account.')
  })

  it('leaves Core’s refusal to issue to the app’s own notice', async () => {
    s.on('POST', CORE.issue, () => json(403, { status: 'denied', action_id: 'act_1', error: { code: 'forbidden', message: 'suspended agent' } }))
    const w = await open()
    await press(w, '.host-dialog__submit')
    expect(s.to('POST', RUNTIME.agents)).toHaveLength(0)
    expect(ElNotification).toHaveBeenCalled()
  })
})

describe('HostOnRuntimeDialog: one brain at a time', () => {
  const NOW = Date.now()
  const busy = (): AgentCredential[] => [
    credential({ id: 'cred_laptop', token_prefix: 'laptoplaptop', label: 'my laptop', last_used_at: new Date(NOW - 3 * 60_000).toISOString() }),
    credential({ id: 'cred_old', token_prefix: 'oldoldoldold', label: 'old', last_used_at: new Date(NOW - 3 * 3600_000).toISOString() }),
  ]
  const listed = () => s.on('GET', CORE.credentials, () => executed({ credentials: busy() }))

  it('says the agent seems to run somewhere else, from Core’s list, and offers to revoke each of its other tokens', async () => {
    connected()
    listed()
    const w = await open({ credentials: busy() })
    const notice = w.find('.other-tokens')
    expect(notice.text()).toContain('This agent seems to be running somewhere else')
    expect(notice.text()).toContain('Its token ais_laptoplaptop… was used 3 minutes ago.')
    expect(w.findAll('.other-tokens__token').map((r) => r.find('.other-tokens__label').text())).toEqual(['my laptop', 'old'])
    expect(w.find('.host-dialog__submit').text()).toBe('Connect anyway')

    await press(w, '.other-tokens__revoke')
    expect(s.revoked).toEqual(['cred_laptop'])
    expect(w.emitted('credsChanged')).toBeTruthy()
    // The one left is not in use: a quieter note, and connecting as usual.
    expect(w.find('.other-tokens').classes()).toContain('is-unused')
    expect(w.find('.host-dialog__submit').text()).toBe('Connect')
    expect(s.to('POST', CORE.issue)).toHaveLength(0)

    await press(w, '.host-dialog__submit')
    const revokeAt = s.calls.findIndex((c) => CORE.revoke.test(c.url))
    const issueAt = s.calls.findIndex((c) => CORE.issue.test(c.url))
    expect(revokeAt).toBeLessThan(issueAt)
    expect(w.emitted('connected')).toBeTruthy()
  })

  it('connects anyway, revoking nothing, when the owner says so', async () => {
    connected()
    const w = await open({ credentials: busy() })
    await press(w, '.host-dialog__submit')
    expect(s.revoked).toEqual([])
    expect(w.emitted('connected')).toBeTruthy()
  })

  it('says so on the token’s row when it could not be revoked, and issues nothing', async () => {
    listed()
    s.on('POST', CORE.revoke, () => json(403, { status: 'denied', action_id: 'a', error: { code: 'forbidden', message: 'no' } }))
    const w = await open({ credentials: busy() })
    await press(w, '.other-tokens__revoke')
    expect(w.find('.other-tokens__token').text()).toContain('It could not be revoked.')
    expect(w.find('.host-dialog__submit').text()).toBe('Connect anyway')
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
  })

  it('passes on the other tokens connect names, to warn again after', async () => {
    const others = otherTokens([otherToken({ prefix: 'laptoplaptop', recent: true, last_used_at: new Date().toISOString() })])
    s.on('POST', RUNTIME.agents, () => json(201, { ...hostedAgent({ status: 'needs_model' }), other_tokens: others }))
    const w = await open()
    await press(w, '.host-dialog__submit')
    const [agent, passed] = w.emitted('connected')![0] as [Record<string, unknown>, unknown]
    expect(agent).toMatchObject({ id: AGENT_ID, status: 'needs_model' })
    expect(agent).not.toHaveProperty('other_tokens')
    expect(passed).toEqual(others)
  })

  it('says it could not check for other copies without Core’s list of tokens', async () => {
    const w = await open({ credentials: null })
    expect(w.find('.other-tokens__unknown').text()).toBe('Could not check for other copies of this agent.')
    expect(w.find('.host-dialog__submit').text()).toBe('Connect')
  })

  it('does not count the runtime’s own token when replacing it', async () => {
    const hosted = hostedAgent()
    const creds = [credential({ token_prefix: hosted.token.prefix, last_used_at: new Date().toISOString() })]
    const w = await open({ mode: 'replace', hosted, credentials: creds })
    expect(w.find('.other-tokens').exists()).toBe(false)
    expect(w.find('.host-dialog__submit').text()).toBe('Replace token')
  })

  it('goes on anyway when replacing while another token is in use', async () => {
    const hosted = hostedAgent()
    const w = await open({ mode: 'replace', hosted, credentials: busy() })
    expect(w.find('.host-dialog__submit').text()).toBe('Go on anyway')
  })
})

describe('HostOnRuntimeDialog: a new token for a hosted agent', () => {
  it('replaces the token, and the runtime revokes the one it had', async () => {
    const hosted = hostedAgent()
    s.on('PUT', RUNTIME.token, () =>
      json(200, {
        agent: hostedAgent({ status: 'starting', token: { hint: 'x', prefix: s.issued[0].prefix } }),
        previous_token: { ...hosted.token, revocation: 'revoked', problem: null },
      }),
    )
    const w = await open({ mode: 'replace', hosted })
    expect(w.text()).toContain('New token for Study helper on the school’s runtime')
    await press(w, '.host-dialog__submit')
    expect(JSON.parse(s.to('PUT', RUNTIME.token)[0].body!)).toEqual({ token: s.issued[0].token })
    expect(s.to('GET', CORE.credentials)).toHaveLength(0)
    expect(w.emitted('replaced')![0][0]).toMatchObject({ status: 'starting' })
  })

  it('revokes the old token as the owner when the runtime could not', async () => {
    const hosted = hostedAgent()
    s.on('GET', CORE.credentials, () =>
      executed({ credentials: [credential({ id: 'cred_old_runtime', token_prefix: hosted.token.prefix, label: 'AIShie runtime' })] }),
    )
    s.on('PUT', RUNTIME.token, () =>
      json(200, {
        agent: hostedAgent({ status: 'starting' }),
        previous_token: { ...hosted.token, revocation: 'failed', problem: 'agent_suspended' },
      }),
    )
    const w = await open({ mode: 'reconnect', hosted })
    expect(w.text()).toContain('Connect Study helper again')
    await press(w, '.host-dialog__submit')
    expect(s.revoked).toEqual(['cred_old_runtime'])
    expect(w.emitted('replaced')).toBeTruthy()
  })

  it('tells the owner to revoke the old token when neither could', async () => {
    const hosted = hostedAgent()
    s.on('GET', CORE.credentials, () =>
      executed({ credentials: [credential({ id: 'cred_old_runtime', token_prefix: hosted.token.prefix })] }),
    )
    s.on('POST', CORE.revoke, () => json(403, { status: 'denied', action_id: 'a', error: { code: 'forbidden', message: 'no' } }))
    s.on('PUT', RUNTIME.token, () =>
      json(200, { agent: hostedAgent(), previous_token: { ...hosted.token, revocation: 'failed', problem: 'core_unavailable' } }),
    )
    const w = await open({ mode: 'replace', hosted })
    await press(w, '.host-dialog__submit')
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({
      type: 'warning',
      message: expect.stringContaining('Revoke the older “AIShie runtime” token'),
    })
  })

  it('revokes the issued token when the runtime refuses it for another agent', async () => {
    s.on('PUT', RUNTIME.token, () => refusal(422, 'failed_precondition', 'token_other_agent'))
    const w = await open({ mode: 'replace', hosted: hostedAgent() })
    await press(w, '.host-dialog__submit')
    expect(s.revoked).toEqual([s.issued[0].credentialId])
    expect(w.text()).toContain('This token belongs to another agent.')
  })
})
