import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { HostedAgent, HostedStatus, ProblemReason } from '@/api/runtime-types'
import HostedAgentCard from './HostedAgentCard.vue'
import {
  ACTOR,
  CORE,
  OFFERS,
  RUNTIME,
  Servers,
  credential,
  hostedAgent,
  json,
  refusal,
  seat,
} from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }),
  }
})

const pinia = createPinia()
setActivePinia(pinia)
const global = { plugins: [pinia, i18n, ElementPlus], components: icons }

let s: Servers

beforeEach(() => {
  setLocale('en')
  s = new Servers().install()
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
  vi.mocked(ElMessageBox.confirm).mockReset()
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card(agent: HostedAgent, props: Record<string, unknown> = {}) {
  const w = mount(HostedAgentCard, {
    props: { agent, actorId: ACTOR, name: 'Study helper', credentials: [], standing: 'active', offers: OFFERS, ...props },
    global,
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

const tag = (w: VueWrapper) => w.find('.hosted-card__tag').text()
const body = (w: VueWrapper) => w.find('.hosted-card__status').text()

describe('HostedAgentCard: what it says', () => {
  const COPY: Record<Exclude<HostedStatus, 'error'>, [string, string]> = {
    needs_model: [
      'Choose a model',
      'Your agent is connected, but it has no model yet. Choose a provider and model and give your API key to start it.',
    ],
    starting: ['Starting', 'The runtime is starting your agent with its latest settings. This takes a few seconds.'],
    running: ['Running', 'Your agent runs on the school’s runtime and answers in its courses.'],
    paused: [
      'Paused',
      'Your agent answers nobody and makes no calls, so it shows as offline. Resume it to start again. (This is not Suspend: the agent stays active in AIshie.)',
    ],
    needs_token: [
      'Needs a new token',
      'AIshie refused your agent’s token: it was revoked or expired. Connect it again to give the runtime a new one.',
    ],
    stopped: [
      'Restarting',
      'The runtime stopped your agent while it restarts or hands it to another worker. It starts again by itself.',
    ],
  }

  it.each(Object.entries(COPY))('%s: its tag and sentence', async (status, [title, sentence]) => {
    const w = await card(hostedAgent({ status: status as HostedStatus, paused: status === 'paused' }))
    expect(tag(w)).toBe(title)
    expect(body(w)).toBe(sentence)
  })

  const PROBLEMS: Record<ProblemReason, string> = {
    token_refused: 'AIshie refused the agent’s token.',
    settings_rejected: 'Its settings do not work here: model: unknown. Change the model or key.',
    runtime_misconfigured: 'The school’s runtime is not set up to run hosted agents. Tell your administrator.',
    operator_agent: 'The school’s operator already runs this agent, so this copy does not run.',
    actor_in_use: 'Another agent here already uses this agent’s identity.',
    token_other_agent: 'Its token belongs to another agent. Connect it again.',
    token_not_agent: 'Its token is a person’s, not the agent’s. Connect it again.',
    owner_changed: 'This agent now belongs to someone else in AIshie, so the runtime stopped it. Delete it here.',
    core_too_old: 'This AIshie server cannot say who owns an agent. Tell your administrator.',
    agent_suspended: 'The agent is suspended in AIshie. Reactivate it and it starts again by itself.',
    failing: 'It could not start and will try again shortly: model: unknown.',
  }

  it.each(Object.entries(PROBLEMS))('error, %s: “Not running”, the problem’s sentence and its details', async (reason, sentence) => {
    const w = await card(
      hostedAgent({ status: 'error', problem: { reason: reason as ProblemReason, detail: 'model: unknown', since: '2026-09-28T08:00:00Z' } }),
    )
    expect(tag(w)).toBe('Not running')
    expect(body(w)).toBe(sentence)
    const details = w.find('.hosted-card__problem')
    expect(details.find('summary').text()).toBe('Details')
    expect(details.find('.hosted-card__detail').text()).toBe('model: unknown')
  })

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = await card(hostedAgent({ status: 'paused', paused: true }))
    expect(tag(w)).toBe('已暫停')
    expect(body(w)).toContain('這不是「停用」')
    expect(w.find('.hosted-card__resume').text()).toBe('恢復')
  })

  it('shows the model, the key and token by their hints, today’s answers and cost, and the seats in sentences', async () => {
    const w = await card(
      hostedAgent({
        seats: [seat(), seat({ course_id: 'c-2', course_code: 'MA201', section: '', kind: 'course_tutor', reads_work: false, answer_level: 'confirm_required' })],
        proposals_waiting: 2,
      }),
    )
    expect(w.find('.hosted-card__model').text()).toBe('OpenAI · gpt-4.1-mini')
    expect(w.text()).toContain('sk-…3f9a')
    expect(w.text()).toContain('ais_runtimetoken…')
    expect(w.find('.hosted-card__today').text()).toBe('4 answers, $0.004213')
    expect(w.text()).toContain('2 answers wait for approval.')
    expect(w.text()).toContain('Your delegate in CS101 · A: reads the course material and students’ work; answers only you.')
    expect(w.text()).toContain('Tutor of MA201: answers every student; reads the course material.')
    expect(w.text()).toContain('Its answers wait for approval.')
  })

  it('says the cost is unknown when the runtime has no price for the model', async () => {
    const a = hostedAgent()
    a.model.own!.price_known = false
    const w = await card(a)
    expect(w.find('.hosted-card__today').text()).toBe('4 answers, cost unknown')
  })

  it('folds the other two ways away while hosted, saying they apply only after hosting is deleted', async () => {
    const w = await card(hostedAgent())
    const self = w.find('details.hosted-card__self')
    expect(self.attributes('open')).toBeUndefined()
    expect(self.find('summary').text()).toBe('Connect another AI tool, or run the runtime yourself, instead')
    expect(self.text()).toContain('These apply only after you stop hosting: delete the agent from AIshie’s hosting first')
    expect(self.findAll('.hosted-card__self-h').map((h) => h.text())).toEqual([
      'Connect another AI tool (Claude, ChatGPT, an agent SDK…)',
      'Run the AIshie runtime yourself (advanced)',
    ])
    expect(self.text()).toContain('Authorization: Bearer <token>')
    // The agent file is folded away within, and holds no token.
    const file = self.find('details.own-runtime__file')
    expect(file.attributes('open')).toBeUndefined()
    expect(file.text()).not.toContain('ais_')
  })

  it('folds them away in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = await card(hostedAgent())
    const self = w.find('details.hosted-card__self')
    expect(self.find('summary').text()).toBe('改用其他 AI 工具連接，或自己架 runtime')
    expect(self.text()).toContain('這些只適用於停止代管之後')
    expect(w.find('.hosted-card__title').text()).toContain('由 AIshie 代管')
  })
})

describe('HostedAgentCard: what the owner can do', () => {
  it.each([
    ['needs_model', 'Choose a model', 'chooseModel'],
    ['needs_token', 'Connect again', 'newToken'],
    ['running', 'Change model or key', 'chooseModel'],
    ['starting', 'Change model or key', 'chooseModel'],
    ['error', 'Change model or key', 'chooseModel'],
    ['stopped', 'Change model or key', 'chooseModel'],
  ] as const)('%s: its primary action is “%s”', async (status, words, event) => {
    const w = await card(hostedAgent({ status }))
    const b = w.find('.hosted-card__primary')
    expect(b.text()).toBe(words)
    await b.trigger('click')
    expect(w.emitted(event)).toBeTruthy()
    if (event === 'newToken') expect(w.emitted('newToken')![0]).toEqual(['reconnect'])
  })

  it.each([
    ['needs_token', { canConnect: false }],
    ['needs_model', { canChooseModel: false }],
    ['running', { canChooseModel: false }],
  ] as const)('%s: offers no primary action the runtime does not take (%o)', async (status, props) => {
    const w = await card(hostedAgent({ status }), props)
    expect(w.find('.hosted-card__primary').exists()).toBe(false)
    expect(w.find('.hosted-card__off').exists()).toBe(true)
  })

  it('offers no new token from its menu when the runtime takes none', async () => {
    const w = await card(hostedAgent(), { canConnect: false })
    ;(w.vm as unknown as { onCommand: (c: string) => void }).onCommand('replace')
    expect(w.emitted('newToken')).toBeUndefined()
    const items = Array.from(document.body.querySelectorAll('.el-dropdown-menu__item'), (e) => e.textContent?.trim())
    expect(items).toEqual(['Delete from the school’s runtime'])
    // A model can still be changed.
    expect(w.find('.hosted-card__primary').text()).toBe('Change model or key')
  })

  it('cannot give a suspended agent a new token', async () => {
    const w = await card(hostedAgent({ status: 'needs_token' }), { standing: 'suspendedByAdmin' })
    expect(w.find('.hosted-card__primary').attributes('disabled')).toBeDefined()
  })

  it('pauses on the runtime, with the tooltip saying the agent stays active in AIShie', async () => {
    s.on('POST', RUNTIME.pause, () => json(200, hostedAgent({ status: 'paused', paused: true })))
    const w = await card(hostedAgent())
    expect(w.find('.hosted-card__pause').text()).toBe('Pause')
    await w.find('.hosted-card__pause').trigger('click')
    await flushPromises()
    expect(s.to('POST', RUNTIME.pause)).toHaveLength(1)
    expect(s.to('POST', RUNTIME.pause)[0].body).toBeUndefined()
    expect(w.emitted('update')![0][0]).toMatchObject({ status: 'paused' })
    expect(i18n.global.t('hosting.card.pauseHint')).toBe('Stops the agent here; it stays active in AIshie.')
  })

  it('resumes', async () => {
    s.on('POST', RUNTIME.resume, () => json(200, hostedAgent({ status: 'starting' })))
    const w = await card(hostedAgent({ status: 'paused', paused: true }))
    await w.find('.hosted-card__resume').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(w.emitted('update')![0][0]).toMatchObject({ status: 'starting' })
  })

  describe('resuming while something else runs the agent', () => {
    const busy = () => [credential({ id: 'cred_laptop', last_used_at: new Date().toISOString() })]

    it('revokes those tokens first when the owner says so', async () => {
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      s.on('POST', RUNTIME.resume, () => json(200, hostedAgent({ status: 'starting' })))
      const w = await card(hostedAgent({ status: 'paused', paused: true }), { credentials: busy() })
      await w.find('.hosted-card__resume').trigger('click')
      await flushPromises()
      expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][1]).toBe('Something else is running this agent')
      expect(s.revoked).toEqual(['cred_laptop'])
      expect(s.to('POST', RUNTIME.resume)).toHaveLength(1)
    })

    it('resumes anyway, revoking nothing', async () => {
      vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
      s.on('POST', RUNTIME.resume, () => json(200, hostedAgent({ status: 'starting' })))
      const w = await card(hostedAgent({ status: 'paused', paused: true }), { credentials: busy() })
      await w.find('.hosted-card__resume').trigger('click')
      await flushPromises()
      expect(s.revoked).toEqual([])
      expect(s.to('POST', RUNTIME.resume)).toHaveLength(1)
    })

    it('does nothing when the owner closes the question', async () => {
      vi.mocked(ElMessageBox.confirm).mockRejectedValue('close')
      const w = await card(hostedAgent({ status: 'paused', paused: true }), { credentials: busy() })
      await w.find('.hosted-card__resume').trigger('click')
      await flushPromises()
      expect(s.revoked).toEqual([])
      expect(s.to('POST', RUNTIME.resume)).toHaveLength(0)
    })
  })

  it('asks for a new token from its menu', async () => {
    const w = await card(hostedAgent())
    ;(w.vm as unknown as { onCommand: (c: string) => void }).onCommand('replace')
    expect(w.emitted('newToken')![0]).toEqual(['replace'])
    const items = Array.from(document.body.querySelectorAll('.el-dropdown-menu__item'), (e) => e.textContent?.trim())
    expect(items).toEqual(['Replace token', 'Delete from the school’s runtime'])
  })

  it.each(['pause', 'resume'] as const)('reads the agent again when %s finds it changed meanwhile (412), and says so', async (what) => {
    const paused = what === 'resume'
    s.on('POST', what === 'pause' ? RUNTIME.pause : RUNTIME.resume, () =>
      refusal(412, 'version_mismatch', 'version_mismatch', { current_version: 7 }),
    )
    s.on('GET', RUNTIME.agent, () => json(200, hostedAgent({ version: 7, status: 'needs_token' })))
    const w = await card(hostedAgent({ paused, status: paused ? 'paused' : 'running' }))
    await w.find(`.hosted-card__${what}`).trigger('click')
    await flushPromises()
    expect(s.to('POST', what === 'pause' ? RUNTIME.pause : RUNTIME.resume)[0].headers['If-Match']).toBeUndefined()
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(1)
    expect(w.emitted('update')![0][0]).toMatchObject({ version: 7, status: 'needs_token' })
    expect(w.find('.hosted-card__alert').text()).toBe(
      'This agent changed meanwhile, in another tab or window. Here it is as it is now: check it and try again.',
    )
  })

  it('takes a hosting deleted elsewhere for gone', async () => {
    s.on('POST', RUNTIME.pause, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await card(hostedAgent())
    await w.find('.hosted-card__pause').trigger('click')
    await flushPromises()
    expect(w.emitted('deleted')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({ message: 'This agent is no longer on the school’s runtime.' })
  })
})

describe('HostedAgentCard: keeping it fresh', () => {
  it('asks every 3 s while it starts, and every 30 s while it runs', async () => {
    vi.useFakeTimers()
    let answer = hostedAgent({ status: 'starting' })
    s.on('GET', RUNTIME.agent, () => json(200, answer))
    const w = await card(answer)
    await vi.advanceTimersByTimeAsync(2_900)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(1)

    answer = hostedAgent({ status: 'running' })
    await w.setProps({ agent: answer })
    await vi.advanceTimersByTimeAsync(29_000)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(2)
  })

  it('slows to every 15 s after two minutes of starting', async () => {
    vi.useFakeTimers()
    s.on('GET', RUNTIME.agent, () => json(200, hostedAgent({ status: 'starting' })))
    await card(hostedAgent({ status: 'starting' }))
    await vi.advanceTimersByTimeAsync(120_000)
    const before = s.to('GET', RUNTIME.agent).length
    expect(before).toBeGreaterThanOrEqual(35)
    await vi.advanceTimersByTimeAsync(15_100)
    expect(s.to('GET', RUNTIME.agent).length - before).toBeLessThanOrEqual(2)
  })

  it('stops, and says so, when the hosting is gone', async () => {
    vi.useFakeTimers()
    s.on('GET', RUNTIME.agent, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await card(hostedAgent({ status: 'starting' }))
    await vi.advanceTimersByTimeAsync(3_100)
    expect(w.emitted('deleted')).toBeTruthy()
  })
})

describe('HostedAgentCard: deleting', () => {
  async function deleteDialog(agent: HostedAgent, props: Record<string, unknown> = {}) {
    const w = await card(agent, props)
    ;(w.vm as unknown as { onCommand: (c: string) => void }).onCommand('delete')
    await flushPromises()
    return w
  }
  async function submit(w: VueWrapper) {
    await w.find('.delete-hosting__submit').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(w.find('.delete-hosting__submit.is-loading').exists()).toBe(false))
    await flushPromises()
  }
  const ownCred = (over = {}) =>
    credential({ id: 'cred_runtime', token_prefix: 'runtimetoken', label: 'AIShie runtime', ...over })
  const answer = (revocation: string, problem: string | null = null) =>
    json(200, {
      deleted: { id: 'agt_1', core_actor_id: ACTOR },
      token: { hint: 'ais_runtimetoken…', prefix: 'runtimetoken', revocation, problem },
    })

  it('says what deleting does, the answers still waiting included', async () => {
    const w = await deleteDialog(hostedAgent({ proposals_waiting: 3 }), { credentials: [ownCred()] })
    const text = w.find('.delete-hosting').text()
    expect(text).toContain(
      'The runtime stops this agent, forgets its settings and your key, and revokes its token “AIShie runtime”. The agent stays in AIshie; you can host it again later.',
    )
    expect(text).toContain('3 answers still waiting for approval stay in AIshie.')
    // Its own token is revoked without asking.
    expect(w.find('.delete-hosting__revoke').exists()).toBe(false)
  })

  it.each(['revoked', 'already_invalid'])('succeeds when the runtime answers %s, asking nothing more', async (revocation) => {
    s.on('DELETE', RUNTIME.agent, () => answer(revocation))
    const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
    await submit(w)
    const sent = s.to('DELETE', RUNTIME.agent)[0]
    expect(sent.url).toMatch(/\?revoke_token=true$/)
    // No version named, as §9.1's remove(id, revoke) sends it.
    expect(sent.headers['If-Match']).toBeUndefined()
    expect(s.to('GET', CORE.credentials)).toHaveLength(0)
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({ type: 'success', message: 'Study helper is no longer on the school’s runtime' })
    expect(w.emitted('deleted')).toBeTruthy()
    expect(w.emitted('unrevoked')).toBeUndefined()
  })

  it.each(['agent_suspended', 'core_unavailable', 'core_refused'])(
    'tells the owner its token may still work when the runtime could not revoke it (%s), revoking nothing by itself',
    async (problem) => {
      s.on('DELETE', RUNTIME.agent, () => answer('failed', problem))
      const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
      await submit(w)
      expect(w.emitted('deleted')).toBeTruthy()
      expect(w.emitted('unrevoked')).toEqual([[{ hint: 'ais_runtimetoken…', prefix: 'runtimetoken', problem }]])
      expect(s.revoked).toEqual([])
      expect(s.to('GET', CORE.credentials)).toHaveLength(0)
      expect(ElNotification).not.toHaveBeenCalled()
    },
  )

  it('takes a 404 for deleted already, and offers to revoke the token it read before', async () => {
    s.on('DELETE', RUNTIME.agent, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
    await submit(w)
    expect(w.emitted('deleted')).toBeTruthy()
    expect(w.emitted('unrevoked')).toEqual([[{ hint: 'ais_runtimetoken…', prefix: 'runtimetoken', problem: null }]])
    expect(s.revoked).toEqual([])
  })

  it('offers to keep a pasted token, and says it still works when kept', async () => {
    s.on('DELETE', RUNTIME.agent, () => answer('not_attempted'))
    const pasted = credential({ token_prefix: 'runtimetoken', label: 'laptop' })
    const w = await deleteDialog(hostedAgent(), { credentials: [pasted] })
    const box = w.find('.delete-hosting__revoke')
    expect(box.text()).toContain('Also revoke its token')
    expect(box.text()).toContain('“laptop”')
    expect(box.find('input[type="checkbox"]').element).toHaveProperty('checked', true)
    await box.find('input[type="checkbox"]').setValue(false)
    await submit(w)
    expect(s.to('DELETE', RUNTIME.agent)[0].url).toMatch(/\?revoke_token=false$/)
    expect(vi.mocked(ElNotification).mock.calls[0][0]).toMatchObject({
      type: 'info',
      message: 'Its token still works; revoke it below if nothing else uses it.',
    })
    expect(s.revoked).toEqual([])
  })

  it('reads the agent again when it changed meanwhile (412), keeps it, and deletes when asked again', async () => {
    s.once('DELETE', RUNTIME.agent, () => refusal(412, 'version_mismatch', 'version_mismatch', { current_version: 8 }))
    s.on('GET', RUNTIME.agent, () => json(200, hostedAgent({ version: 8, status: 'starting' })))
    const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
    await submit(w)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(1)
    expect(w.emitted('update')![0][0]).toMatchObject({ version: 8, status: 'starting' })
    expect(w.emitted('deleted')).toBeUndefined()
    expect(w.find('.delete-hosting').text()).toContain(
      'This agent changed meanwhile, in another tab or window. Here it is as it is now: check it and try again.',
    )
    s.on('DELETE', RUNTIME.agent, () => answer('revoked'))
    await submit(w)
    expect(s.to('DELETE', RUNTIME.agent)).toHaveLength(2)
    expect(s.to('DELETE', RUNTIME.agent)[1].headers['If-Match']).toBeUndefined()
    expect(w.emitted('deleted')).toBeTruthy()
  })

  it('takes a hosting found gone when read again after a 412 for deleted', async () => {
    s.on('DELETE', RUNTIME.agent, () => refusal(412, 'version_mismatch', 'version_mismatch', { current_version: 8 }))
    s.on('GET', RUNTIME.agent, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
    await submit(w)
    expect(w.emitted('deleted')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({ message: 'This agent is no longer on the school’s runtime.' })
  })

  it('shows the runtime’s refusal and keeps the hosting', async () => {
    s.on('DELETE', RUNTIME.agent, () => refusal(429, 'rate_limited', 'rate_limited', { retry_after_seconds: 7 }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const w = await deleteDialog(hostedAgent(), { credentials: [ownCred()] })
    await w.find('.delete-hosting__submit').trigger('click')
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.waitFor(() => expect(w.text()).toContain('Too many tries. Wait 7 seconds.'))
    expect(w.emitted('deleted')).toBeUndefined()
  })
})
