import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { HostedAgent, HostedStatus, ProblemReason } from '@/api/runtime-types'
import HostedAgentCard from './HostedAgentCard.vue'
import { ACTOR, CORE, OFFERS, RUNTIME, Servers, hostedAgent, json, onSchoolPlan, refusal, seat } from './hostingFakes'

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

// vi.waitFor gives up after a second of the clock; what it waits for here
// is a render, whose CPU a busy machine stretches past that. It waits for as
// long as the test may, nearly (vite.config.ts).
const rendered = { timeout: 20_000 }

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setLocale('en')
  document.body.innerHTML = ''
})

async function card(agent: HostedAgent, props: Record<string, unknown> = {}) {
  const w = mount(HostedAgentCard, {
    props: {
      agent,
      actorId: ACTOR,
      name: 'Study helper',
      standing: 'active',
      offers: OFFERS,
      ...props,
    },
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
      'Your agent is hosted, but it has no model yet. Choose a provider and model and give your API key to start it.',
    ],
    starting: ['Starting', 'The agent service is starting your agent with its latest settings. This takes a few seconds.'],
    running: ['Running', 'Your agent runs on the school’s agent service and answers in its courses.'],
    paused: [
      'Paused',
      'Your agent answers nobody, makes no calls and cannot be asked on the site: its token was revoked in AIshie. Resume it to start again with a new one. (This is not Suspend: the agent stays active in AIshie.)',
    ],
    needs_token: [
      'Needs a new token',
      'The token the agent service held for your agent was revoked in AIshie, by you or an administrator. Connect it again to have the agent service issued a new one; you never see it.',
    ],
    stopped: [
      'Restarting',
      'The agent service stopped your agent while it restarts or hands it to another worker. It starts again by itself.',
    ],
  }

  it.each(Object.entries(COPY))('%s: its tag and sentence', async (status, [title, sentence]) => {
    const w = await card(hostedAgent({ status: status as HostedStatus, paused: status === 'paused' }))
    expect(tag(w)).toBe(title)
    expect(body(w)).toBe(sentence)
  })

  const PROBLEMS: Record<ProblemReason, string> = {
    token_refused: 'AIshie revoked the token the agent service held for it.',
    settings_rejected: 'Its settings do not work here: model: unknown. Change the model or key.',
    runtime_misconfigured: 'The school’s agent service is not set up to run hosted agents. Tell your administrator.',
    operator_agent: 'The school’s operator already runs this agent, so this copy does not run.',
    actor_in_use: 'Another agent here already uses this agent’s identity.',
    token_other_agent: 'The token the agent service held belongs to another agent. Connect it again.',
    owner_changed: 'AIshie does not count this agent as yours, so the agent service stopped it. Delete it here.',
    core_too_old: 'This AIshie server cannot say who owns an agent. Tell your administrator.',
    agent_suspended: 'The agent is suspended in AIshie. Reactivate it and it starts again by itself.',
    owner_suspended: 'Its owner is suspended in AIshie. It starts again by itself once they are reactivated.',
    mcp_agent:
      'AIshie says this agent has MCP access: it is used from its owner’s own tools, so the agent service cannot host it. Delete it here.',
    agent_not_found: 'AIshie has no such agent any more. Delete it here.',
    failing: 'It could not start and will try again shortly: model: unknown.',
    offer_withdrawn:
      'The school no longer offers the model it was on, and no model of yours stands behind it, so it does not run. Choose another of the school’s models, or a model of your own.',
  }

  it.each(Object.entries(PROBLEMS))(
    'error, %s: “Not running”, the problem’s sentence and its details',
    async (reason, sentence) => {
      const w = await card(
        hostedAgent({
          status: 'error',
          problem: { reason: reason as ProblemReason, detail: 'model: unknown', since: '2026-09-28T08:00:00Z' },
        }),
      )
      expect(tag(w)).toBe('Not running')
      expect(body(w)).toBe(sentence)
      const details = w.find('.hosted-card__problem')
      expect(details.find('summary').text()).toBe('Details')
      expect(details.find('.hosted-card__detail').text()).toBe('model: unknown')
    },
  )

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = await card(hostedAgent({ status: 'paused', paused: true }))
    expect(tag(w)).toBe('已暫停')
    expect(body(w)).toContain('這不是「停用」')
    expect(w.find('.hosted-card__resume').text()).toBe('恢復')
  })

  it('shows the model and the key by its hint, today’s answers and cost, and the seats in sentences, and no token', async () => {
    const w = await card(
      hostedAgent({
        seats: [
          seat(),
          seat({
            course_id: 'c-2',
            course_code: 'MA201',
            section: '',
            kind: 'course_tutor',
            reads_work: false,
            answer_level: 'confirm_required',
          }),
        ],
        proposals_waiting: 2,
      }),
    )
    expect(w.find('.hosted-card__model').text()).toBe('OpenAI · gpt-4.1-mini')
    expect(w.text()).toContain('sk-…3f9a')
    expect(w.text()).not.toContain('ais_')
    expect(w.findAll('.hosted-card__facts dt').map((d) => d.text())).toEqual(['Model', 'Key', 'Today'])
    expect(w.find('.hosted-card__today').text()).toBe('4 answers, US$0.00421')
    expect(w.text()).toContain('2 answers wait for approval.')
    expect(w.text()).toContain(
      'Your delegate in CS101 · A: reads the course material and students’ work; answers only you.',
    )
    expect(w.text()).toContain('Tutor of MA201: answers every student; reads the course material.')
    expect(w.text()).toContain('Its answers wait for approval.')
  })

  it('says the cost is unknown when the runtime has no price for the model', async () => {
    const a = hostedAgent()
    a.model.own!.price_known = false
    const w = await card(a)
    expect(w.find('.hosted-card__today').text()).toBe('4 answers, cost unknown')
  })

  it('offers no other way to run it: it is hosted on AIshie for good', async () => {
    const w = await card(hostedAgent())
    expect(w.find('details.hosted-card__self').exists()).toBe(false)
    expect(w.text()).not.toContain('Authorization')
    expect(w.text()).not.toContain('MCP')
  })

  it('is titled 站內託管 in Traditional Chinese, and 站内托管 in Simplified', async () => {
    setLocale('zh-Hant')
    let w = await card(hostedAgent())
    expect(w.find('.hosted-card__title').text()).toContain('站內託管')
    w.unmount()
    setLocale('zh-Hans')
    w = await card(hostedAgent())
    expect(w.find('.hosted-card__title').text()).toContain('站内托管')
  })
})

describe('HostedAgentCard: what the owner can do', () => {
  it.each([
    ['needs_model', 'Choose a model', 'chooseModel'],
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
  })

  it('needs_token: connects it again, asking the runtime for a new token with no body, and handles none', async () => {
    s.on('POST', RUNTIME.token, () => json(200, hostedAgent({ status: 'starting', version: 4 })))
    const w = await card(hostedAgent({ status: 'needs_token' }))
    const b = w.find('.hosted-card__primary')
    expect(b.text()).toBe('Connect again')
    await b.trigger('click')
    await flushPromises()
    const [sent] = s.to('POST', RUNTIME.token)
    expect(sent.body).toBeUndefined()
    expect(s.to('POST', CORE.issue)).toHaveLength(0)
    expect(w.emitted('update')![0][0]).toMatchObject({ status: 'starting', version: 4 })
    expect(w.emitted('changed')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({
      type: 'success',
      message: 'The agent service is being issued a new token for Study helper.',
    })
  })

  it('needs_token: says why it cannot be connected again where Core says it may not be hosted', async () => {
    s.on('POST', RUNTIME.token, () => refusal(422, 'failed_precondition', 'owner_changed'))
    const w = await card(hostedAgent({ status: 'needs_token' }))
    await w.find('.hosted-card__primary').trigger('click')
    await flushPromises()
    expect(w.find('.hosted-card__alert').text()).toBe('AIshie no longer counts this agent as yours: delete it here.')
  })

  it.each([
    ['needs_token', { canRenew: false }],
    ['needs_model', { canChooseModel: false }],
    ['running', { canChooseModel: false }],
  ] as const)('%s: offers no primary action the agent service does not take (%o)', async (status, props) => {
    const w = await card(hostedAgent({ status }), props)
    expect(w.find('.hosted-card__primary').exists()).toBe(false)
    expect(w.find('.hosted-card__off').exists()).toBe(true)
  })

  it('offers deleting alone from its menu: there is no token to replace', async () => {
    const w = await card(hostedAgent())
    ;(w.vm as unknown as { onCommand: (c: string) => void }).onCommand('replace')
    const items = Array.from(document.body.querySelectorAll('.el-dropdown-menu__item'), (e) => e.textContent?.trim())
    expect(items).toEqual(['Delete from the school’s agent service'])
    expect(w.find('.delete-hosting').exists()).toBe(false)
  })

  it('cannot give a suspended agent a new token', async () => {
    const w = await card(hostedAgent({ status: 'needs_token' }), { standing: 'suspendedByAdmin' })
    expect(w.find('.hosted-card__primary').attributes('disabled')).toBeDefined()
  })

  it('pauses on the runtime, with the tooltip saying the agent stays active in AIshie', async () => {
    s.on('POST', RUNTIME.pause, () =>
      json(200, { ...hostedAgent({ status: 'paused', paused: true }), revocation: { outcome: 'revoked', problem: null } }),
    )
    const w = await card(hostedAgent())
    expect(w.find('.hosted-card__pause').text()).toBe('Pause')
    await w.find('.hosted-card__pause').trigger('click')
    await flushPromises()
    expect(s.to('POST', RUNTIME.pause)).toHaveLength(1)
    expect(s.to('POST', RUNTIME.pause)[0].body).toBeUndefined()
    const updated = w.emitted('update')![0][0] as Record<string, unknown>
    expect(updated).toMatchObject({ status: 'paused' })
    expect('revocation' in updated).toBe(false)
    // Its token was revoked: whether people can ask it is read again.
    expect(w.emitted('changed')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({ type: 'success' })
    expect(ElNotification).not.toHaveBeenCalled()
    expect(i18n.global.t('hosting.card.pauseHint')).toBe('Stops the agent here; it stays active in AIshie.')
  })

  it('says when pausing could not revoke its token, and that pausing again tries again', async () => {
    s.on('POST', RUNTIME.pause, () =>
      json(200, {
        ...hostedAgent({ status: 'paused', paused: true }),
        revocation: { outcome: 'failed', problem: 'core_unavailable' },
      }),
    )
    const w = await card(hostedAgent())
    await w.find('.hosted-card__pause').trigger('click')
    await flushPromises()
    expect(vi.mocked(ElNotification).mock.calls[0][0]).toMatchObject({
      type: 'warning',
      message:
        'Its token could not be revoked in AIshie (AIshie could not be reached), so people may still be offered to ask it on the site. Pause it again to try once more.',
    })
  })

  it('resumes', async () => {
    s.on('POST', RUNTIME.resume, () => json(200, hostedAgent({ status: 'starting' })))
    const w = await card(hostedAgent({ status: 'paused', paused: true }))
    await w.find('.hosted-card__resume').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(w.emitted('update')![0][0]).toMatchObject({ status: 'starting' })
    expect(w.emitted('changed')).toBeTruthy()
  })

  it.each(['pause', 'resume'] as const)(
    'reads the agent again when %s finds it changed meanwhile (412), and says so',
    async (what) => {
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
    },
  )

  it('takes a hosting deleted elsewhere for gone', async () => {
    s.on('POST', RUNTIME.pause, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await card(hostedAgent())
    await w.find('.hosted-card__pause').trigger('click')
    await flushPromises()
    expect(w.emitted('deleted')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({
      message: 'This agent is no longer on the school’s agent service.',
    })
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
  async function deleteDialog(agent: HostedAgent) {
    const w = await card(agent)
    ;(w.vm as unknown as { onCommand: (c: string) => void }).onCommand('delete')
    await flushPromises()
    return w
  }
  async function submit(w: VueWrapper) {
    await w.find('.delete-hosting__submit').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(w.find('.delete-hosting__submit.is-loading').exists()).toBe(false), rendered)
    await flushPromises()
  }
  const answer = (outcome: string, problem: string | null = null) =>
    json(200, { deleted: { id: 'agt_1', core_actor_id: ACTOR }, revocation: { outcome, problem } })

  it('says what deleting does, the answers still waiting included, and asks nothing of tokens', async () => {
    const w = await deleteDialog(hostedAgent({ proposals_waiting: 3 }))
    const text = w.find('.delete-hosting').text()
    expect(text).toContain(
      'The agent service stops this agent and forgets its settings and your key, and its token is revoked in AIshie: nobody can ask it on the site until you host it again. The agent stays in AIshie.',
    )
    expect(text).toContain('3 answers still waiting for approval stay in AIshie.')
    expect(w.find('.delete-hosting input[type="checkbox"]').exists()).toBe(false)
  })

  it.each(['revoked', 'none'])('succeeds when the runtime answers %s, asking nothing more', async (outcome) => {
    s.on('DELETE', RUNTIME.agent, () => answer(outcome))
    const w = await deleteDialog(hostedAgent())
    await submit(w)
    const sent = s.to('DELETE', RUNTIME.agent)[0]
    // No query, and no version named.
    expect(sent.url).not.toContain('?')
    expect(sent.headers['If-Match']).toBeUndefined()
    expect(s.to('GET', CORE.credentials)).toHaveLength(0)
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({
      type: 'success',
      message: 'Study helper is no longer on the school’s agent service',
    })
    expect(ElNotification).not.toHaveBeenCalled()
    expect(w.emitted('deleted')).toBeTruthy()
  })

  it.each([
    ['core_unavailable', 'AIshie could not be reached'],
    ['runtime_misconfigured', 'the school’s agent service is not set up to'],
    ['core_too_old', 'this AIshie server is too old'],
  ])('tells the owner people may still be offered to ask it when its token could not be revoked (%s)', async (problem, why) => {
    s.on('DELETE', RUNTIME.agent, () => answer('failed', problem))
    const w = await deleteDialog(hostedAgent())
    await submit(w)
    expect(w.emitted('deleted')).toBeTruthy()
    expect(vi.mocked(ElNotification).mock.calls[0][0]).toMatchObject({
      type: 'warning',
      title: 'Study helper is no longer on the school’s agent service',
      message: `Its token could not be revoked in AIshie (${why}), so people may still be offered to ask it on the site. Suspend the agent to stop that.`,
    })
    expect(s.revoked).toEqual([])
  })

  it('says its token was not revoked where the operator runs the agent', async () => {
    s.on('DELETE', RUNTIME.agent, () => answer('not_attempted', 'operator_agent'))
    const w = await deleteDialog(hostedAgent())
    await submit(w)
    expect(vi.mocked(ElNotification).mock.calls[0][0]).toMatchObject({
      message: 'Its token was not revoked (the school’s operator runs this agent).',
    })
  })

  it('takes a 404 for deleted already', async () => {
    s.on('DELETE', RUNTIME.agent, () => refusal(404, 'not_found', 'agent_not_found'))
    const w = await deleteDialog(hostedAgent())
    await submit(w)
    expect(w.emitted('deleted')).toBeTruthy()
    expect(s.revoked).toEqual([])
  })

  it('reads the agent again when it changed meanwhile (412), keeps it, and deletes when asked again', async () => {
    s.once('DELETE', RUNTIME.agent, () => refusal(412, 'version_mismatch', 'version_mismatch', { current_version: 8 }))
    s.on('GET', RUNTIME.agent, () => json(200, hostedAgent({ version: 8, status: 'starting' })))
    const w = await deleteDialog(hostedAgent())
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
    const w = await deleteDialog(hostedAgent())
    await submit(w)
    expect(w.emitted('deleted')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls.at(-1)![0]).toMatchObject({
      message: 'This agent is no longer on the school’s agent service.',
    })
  })

  it('shows the runtime’s refusal and keeps the hosting', async () => {
    s.on('DELETE', RUNTIME.agent, () => refusal(429, 'rate_limited', 'rate_limited', { retry_after_seconds: 7 }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const w = await deleteDialog(hostedAgent())
    await w.find('.delete-hosting__submit').trigger('click')
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.waitFor(() => expect(w.text()).toContain('Too many tries. Wait 7 seconds.'), rendered)
    expect(w.emitted('deleted')).toBeUndefined()
  })
})

describe('HostedAgentCard: on the school’s plan', () => {
  // The reader is in Hong Kong: the runtime's day starts again at 08:00 there.
  beforeEach(() => vi.stubEnv('TZ', 'Asia/Hong_Kong'))
  afterEach(() => vi.unstubAllEnvs())

  it('shows the plan’s label, not a key, and the owner’s use of it today against the quota, with no cost', async () => {
    const w = await card(onSchoolPlan(false), { canChooseSchool: true })
    expect(w.find('.hosted-card__model').text()).toBe('School AI (Claude Haiku) claude-haiku-4-5')
    expect(w.find('.hosted-card__plan').text()).toBe('School plan (paid by the school)')
    expect(w.find('.hosted-card__fallback').text()).toBe(
      'None: answers pause until tomorrow once the allowance is used up',
    )
    expect(w.find('.hosted-card__school-count').text()).toBe('12 / 100 today')
    expect(w.find('.hosted-card__school-hint').text()).toBe(
      'The school plan, across all your agents. Starts again at 08:00 (Hong Kong Standard Time).',
    )
    expect(w.find('.hosted-card__per-asker').text()).toBe('Each person who asks: up to 20 a day')
    expect(w.find('.hosted-card__agent-today').text()).toBe('4 answers')
    expect(w.text()).not.toContain('cost unknown')
    expect(w.text()).not.toContain('$')
    expect(w.text()).not.toContain('Key')
    expect(w.find('.hosted-card__spent').exists()).toBe(false)
    expect(w.find('.hosted-card__primary').text()).toBe('Change model or key')
  })

  it('shows the owner’s own model and key behind the plan', async () => {
    const w = await card(onSchoolPlan(true))
    expect(w.find('.hosted-card__fallback').text()).toBe('OpenAI · gpt-4.1-mini, sk-…3f9a')
  })

  it('says when the school allowance starts again in the reader’s time, from the runtime’s day, with the exact UTC on hover', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
    // A runtime whose day starts at midnight in Hong Kong: its today.since is
    // 16:00 UTC, so the counts start again at 00:00 there, not at the 08:00
    // the next 00:00 UTC would give.
    const today = (a: HostedAgent) => ({ ...a, today: { ...a.today, since: '2026-09-30T16:00:00Z' } })
    const w = await card(today(onSchoolPlan(false)))
    expect(w.find('.hosted-card__school-hint').text()).toBe(
      'The school plan, across all your agents. Starts again at 00:00 (Hong Kong Standard Time).',
    )
    const at = w.find('.hosted-card__school-hint time')
    expect(at.attributes('datetime')).toBe('2026-10-01T16:00:00.000Z')
    const tip = w
      .findAllComponents({ name: 'ElTooltip' })
      .find((x) => x.find('time').exists() && x.find('time').element === at.element)
    expect(tip?.props('content')).toBe('2026-10-01 16:00 UTC')
    w.unmount()
    const spent = today(onSchoolPlan(true))
    spent.today.school = { ...spent.today.school!, used: 100 }
    const alert = await card(spent)
    expect(alert.find('.hosted-card__spent').text()).toBe(
      'Today’s school allowance is used up: your own key answers until 00:00 (Hong Kong Standard Time).',
    )
    alert.unmount()
    setLocale('zh-Hant')
    const zh = await card(today(onSchoolPlan(false)))
    expect(zh.find('.hosted-card__school-hint').text()).toBe(
      '學校方案，你所有的代理合計；每天香港標準時間 00:00重新計算。',
    )
  })

  it('says the day’s allowance is used up, and what happens until it starts again', async () => {
    const spent = (fallback: boolean) => {
      const a = onSchoolPlan(fallback)
      a.today.school!.used = 100
      return a
    }
    let w = await card(spent(false))
    expect(w.find('.hosted-card__school-count').classes()).toContain('is-spent')
    expect(w.find('.hosted-card__spent').text()).toBe(
      'Today’s school allowance is used up: until 08:00 (Hong Kong Standard Time) your agent asks people to try again tomorrow.',
    )
    w.unmount()
    w = await card(spent(true))
    expect(w.find('.hosted-card__spent').text()).toBe(
      'Today’s school allowance is used up: your own key answers until 08:00 (Hong Kong Standard Time).',
    )
  })

  it('says so when the school no longer offers the plan', async () => {
    const a = onSchoolPlan(false)
    a.model.school = { ...a.model.school!, offered: false, label: 'standard', model: '' }
    const w = await card(a)
    expect(w.find('.hosted-card__model').text()).toBe('standard')
    expect(w.find('.hosted-card__withdrawn').text()).toBe(
      'The school no longer offers this plan. Choose another, or your own key.',
    )
  })

  it('says why it does not run when the offer was withdrawn with nothing of the owner’s behind it, once', async () => {
    const a = onSchoolPlan(false, {
      status: 'error',
      problem: {
        reason: 'offer_withdrawn',
        detail: 'not run: agent.model.offer "standard": the school no longer offers it',
        since: '2026-09-28T09:00:00Z',
      },
    })
    a.model.school = { ...a.model.school!, offered: false, label: 'standard', model: '' }
    let w = await card(a)
    expect(tag(w)).toBe('Not running')
    expect(body(w)).toBe(
      'The school no longer offers the model it was on, and no model of yours stands behind it, so it does not run. Choose another of the school’s models, or a model of your own.',
    )
    expect(w.find('.hosted-card__detail').text()).toContain('the school no longer offers it')
    // The status says it: no second notice.
    expect(w.find('.hosted-card__withdrawn').exists()).toBe(false)
    w.unmount()

    setLocale('zh-Hant')
    w = await card(a)
    expect(body(w)).toBe(
      '學校已不再提供它所用的模型，而你也沒有設定自己的模型作為備用，所以它沒有運行。請改選學校的其他模型，或使用你自己的模型。',
    )
  })

  it('says its own model answers when the offer was withdrawn with the owner’s model behind it', async () => {
    const a = onSchoolPlan(true)
    a.model.school = { ...a.model.school!, offered: false }
    const w = await card(a)
    expect(tag(w)).toBe('Running')
    expect(w.find('.hosted-card__withdrawn').text()).toBe(
      'The school no longer offers this plan: your agent answers with your own model and key until you choose another.',
    )
  })

  it('reads 「今日 12 / 100 次」 in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await card(onSchoolPlan(false), { canChooseSchool: true })
    expect(w.find('.hosted-card__plan').text()).toBe('學校方案（由學校付費）')
    expect(w.find('.hosted-card__school-count').text()).toBe('今日12 / 100次')
    expect(w.find('.hosted-card__per-asker').text()).toBe('每位提問者每天最多20次')
  })

  it('offers choosing a model where only the school’s plan is offered, and asks for one on it', async () => {
    const w = await card(hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null }), {
      canChooseModel: false,
      canChooseSchool: true,
    })
    expect(w.find('.hosted-card__primary').text()).toBe('Choose a model')
    expect(w.find('.hosted-card__off').exists()).toBe(false)
    expect(body(w)).toBe(
      'Your agent is hosted, but it has no model yet. Choose the school’s plan, or a provider and model with your API key, to start it.',
    )
  })

  it('keeps cost unknown for a model on the owner’s key that the runtime has no price for', async () => {
    const a = hostedAgent()
    a.model.own = { ...a.model.own!, price_known: false }
    const w = await card(a)
    expect(w.find('.hosted-card__today').text()).toBe('4 answers, cost unknown')
  })
})
