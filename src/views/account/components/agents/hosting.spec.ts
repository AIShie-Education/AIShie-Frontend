import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCALES, i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { RuntimeError } from '@/api/runtime'
import {
  CLIENT_ERROR_REASONS,
  HOSTED_STATUSES,
  KEY_TEST_RESULTS,
  PROBLEM_REASONS,
  REVOCATIONS,
  REVOCATION_PROBLEMS,
  RUNTIME_ERROR_REASONS,
} from '@/api/runtime-types'
import {
  choiceFrom,
  choiceKey,
  courseLabel,
  defaultsFor,
  emptyModelForm,
  fieldOfPointer,
  formFromModel,
  formProblems,
  hostingErrorKey,
  hostingErrorText,
  isAishieToken,
  isDefinitive,
  isKeyShaped,
  keyProblem,
  pollInterval,
  problemsOf,
  revocationNotice,
  schoolSpent,
  seatSentences,
} from './hosting'
import { OFFERS, newToken, seat } from './hostingFakes'

// The message functions, as plainly typed as the helpers take them.
const g = i18n.global as unknown as {
  t: (key: string, params: Record<string, unknown>) => string
  te: (key: string, locale: string) => boolean
}
const t = (key: string, params?: Record<string, unknown>) => g.t(key, params ?? {})
// A key every language has.
const te = (key: string) => LOCALES.every((l) => g.te(key, l.value))

function err(reason: string, details: Record<string, unknown> = {}, status = 400) {
  return new RuntimeError({ status, code: 'x', message: `developer words for ${reason}`, reason, details })
}

beforeEach(() => setLocale('en'))
afterEach(() => setLocale('en'))

// The contract's words (§9.5), in English.
const EN: Record<string, string> = {
  assertion_missing: 'Could not sign you in to the school’s agent service. Reload the page and try again.',
  assertion_malformed: 'Could not sign you in to the school’s agent service. Reload the page and try again.',
  assertion_invalid: 'Could not sign you in to the school’s agent service. Reload the page and try again.',
  assertion_expired: 'Could not sign you in to the school’s agent service. Reload the page and try again.',
  keys_unavailable: 'The school’s agent service is not available right now. Try again in a minute.',
  store_unavailable: 'The school’s agent service is not available right now. Try again in a minute.',
  core_unavailable: 'The agent service could not reach AIshie. Try again in a minute.',
  rate_limited: 'Too many tries. Wait 12 seconds.',
  runtime_misconfigured: 'The school’s agent service is not set up to host agents. Tell your administrator.',
  mcp_agent: 'This agent has MCP access: it is used from your own tools, and is never hosted here.',
  agent_suspended: 'This agent is suspended in AIshie. Reactivate it first.',
  owner_suspended: 'Its owner is suspended in AIshie, so it cannot be hosted. Ask an administrator.',
  owner_changed: 'AIshie no longer counts this agent as yours: delete it here.',
  core_too_old: 'This AIshie server is too old for hosting. Tell your administrator.',
  operator_agent: 'The school’s operator already runs this agent.',
  agent_not_found: 'This agent is no longer on the school’s agent service.',
  version_mismatch: 'This agent changed in another tab or window. Check the latest settings and save again.',
  school_key_not_offered: 'The school’s plan is not offered here.',
  unknown_offer: 'The school no longer offers this model. Choose another.',
  own_key_required: 'Enter your API key for OpenAI.',
  own_key_provider_mismatch: 'Your saved key is for another provider. Enter a key for OpenAI.',
  model_denied: 'The school does not allow this model. Choose another.',
  settings_rejected: 'The agent service cannot run these settings.',
  key_malformed:
    'That does not look like an API key from OpenAI. Paste the key exactly as OpenAI gave it, with no spaces.',
  unknown_provider: 'Choose one of the providers offered.',
  adapter_not_offered: 'Choose one of the API styles offered.',
  unknown_endpoint: 'Choose one of the endpoints offered.',
  invalid_field: 'This value is not accepted here.',
  // This client's own.
  network: 'The school’s agent service could not be reached. Check your connection and try again.',
  runtime_unavailable: 'The school’s agent service is not available right now. Try again in a minute.',
  invalid_response: 'The school’s agent service is not available right now. Try again in a minute.',
  account_refused: 'Hosting on the school’s agent service is not available for this account.',
  runtime_absent: 'The school’s agent service is not available on this server. Reload the page.',
}

// Refused names (A.3.1, A.3.2): a page out of step with the runtime, said with the name refused.
const NAMED: Record<string, [string, string]> = {
  unknown_field: [
    '/model/Own',
    'The school’s agent service did not take this request: it has no field “/model/Own”. Reload the page and try again.',
  ],
  unknown_parameter: [
    'revoke',
    'The school’s agent service did not take this request: it takes no “revoke” in the address. Reload the page and try again.',
  ],
}

// The rest (§9.5's last row): the request itself was wrong; the app's generic words, with the message.
const GENERIC = [
  'cross_origin',
  'not_json',
  'body_too_large',
  'malformed_json',
  'missing_field',
  'bad_if_match',
  'version_required',
  'method_not_allowed',
  'no_route',
  'internal',
  // The administrators' routes, which this page never calls (their page words them: runtimeAdmin.errors).
  'not_admin',
  'ocr_unavailable',
  'offer_not_found',
  'offer_exists',
  'offer_read_only',
  'offer_not_priced',
  'key_required',
  'key_test_failed',
  'model_not_priced',
  'price_not_found',
  'price_exists',
  'price_read_only',
  'transcription_unavailable',
  'offer_no_file_input',
  'credential_rejected',
  'openrouter_unavailable',
  'openrouter_model_not_found',
]

describe('the words for each error reason', () => {
  it('cover the contract’s whole closed list, and this client’s own reasons', () => {
    const all = [...RUNTIME_ERROR_REASONS, ...CLIENT_ERROR_REASONS]
    for (const r of all) expect(r in EN || r in NAMED || GENERIC.includes(r), r).toBe(true)
    for (const r of Object.keys(EN)) expect(all as readonly string[], r).toContain(r)
  })

  it.each(Object.entries(EN))('%s reads as §9.5 says, in English', (reason, words) => {
    const e = err(reason, { retry_after_seconds: 12 })
    expect(hostingErrorText(e, t, { provider: 'OpenAI' })).toBe(words)
  })

  it.each(Object.keys(EN))('%s has its own words in Traditional Chinese', (reason) => {
    setLocale('zh-Hant')
    const e = err(reason, { retry_after_seconds: 12 })
    const words = hostingErrorText(e, t, { provider: 'OpenAI' })
    expect(words).not.toBe(EN[reason])
    expect(words).toMatch(/[一-鿿]/)
    expect(words).not.toContain('developer words')
    const key = hostingErrorKey(e)!
    expect(te(key), key).toBe(true)
  })

  it.each(Object.entries(NAMED))('%s names what the agent service refused, in every language', (reason, [field, words]) => {
    const e = err(reason, { field })
    expect(hostingErrorText(e, t)).toBe(words)
    setLocale('zh-Hant')
    const zh = hostingErrorText(e, t)
    expect(zh).toContain(`「${field}」`)
    expect(zh).toMatch(/[一-鿿]/)
    setLocale('zh-Hans')
    const zhHans = hostingErrorText(e, t)
    expect(zhHans).toContain(`“${field}”`)
    expect(zhHans).not.toBe(zh)
    setLocale('en')
    // Without a name, the app's generic words, with the runtime's message.
    expect(hostingErrorKey(err(reason))).toBeNull()
    expect(hostingErrorText(err(reason), t)).toContain(`developer words for ${reason}`)
  })

  it.each(GENERIC)('%s gets the app’s generic words, with the runtime’s message', (reason) => {
    const e = err(reason)
    expect(hostingErrorKey(e)).toBeNull()
    expect(hostingErrorText(e, t)).toContain(`developer words for ${reason}`)
  })

  it('says how long to wait, rounded up, and ten seconds when the runtime did not say', () => {
    expect(hostingErrorText(err('rate_limited', { retry_after_seconds: 2.2 }), t)).toBe(
      'Too many tries. Wait 3 seconds.',
    )
    expect(hostingErrorText(err('rate_limited'), t)).toBe('Too many tries. Wait 10 seconds.')
  })

  it('leaves errors that are not the runtime’s to the app’s own words', () => {
    const lapsed = new ApiError({ status: 401, code: 'unauthenticated', message: 'sign in' })
    expect(hostingErrorKey(lapsed)).toBeNull()
    expect(hostingErrorText(lapsed, t)).toBe('Your session has ended. Please sign in again.')
  })

  it('lists the runtime’s problems with the settings, at most twenty', () => {
    const e = err('settings_rejected', { problems: ['model: unknown', 7, 'key: missing', ...Array(30).fill('x')] }, 422)
    expect(problemsOf(e).slice(0, 2)).toEqual(['model: unknown', 'key: missing'])
    expect(problemsOf(e)).toHaveLength(20)
    expect(problemsOf(new Error('x'))).toEqual([])
  })

  it('word agent_not_found as said of hosting one of one’s agents, when asked to', () => {
    const e = err('agent_not_found', {}, 404)
    expect(hostingErrorText(e, t)).toBe('This agent is no longer on the school’s agent service.')
    expect(hostingErrorText(e, t, { notYours: true })).toBe('AIshie does not count this as one of your agents.')
    expect(hostingErrorText(err('mcp_agent', {}, 422), t, { notYours: true })).toBe(EN.mcp_agent)
  })

  it('tell a refusal from what cannot be known', () => {
    expect(isDefinitive(err('mcp_agent', {}, 422))).toBe(true)
    expect(isDefinitive(err('operator_agent', {}, 409))).toBe(true)
    expect(isDefinitive(err('assertion_invalid', {}, 401))).toBe(false)
    // Changed meanwhile: a request sent again after a lost answer is told so too.
    expect(isDefinitive(err('version_mismatch', { current_version: 4 }, 412))).toBe(false)
    expect(isDefinitive(err('core_unavailable', {}, 503))).toBe(false)
    expect(isDefinitive(err('network', {}, 0))).toBe(false)
  })
})

describe('statuses and problems', () => {
  it('have a title and a body for every status, and a sentence for every problem, in every language', () => {
    for (const s of HOSTED_STATUSES) {
      expect(te(`hosting.status.${s}.title`), s).toBe(true)
      expect(te(`hosting.status.${s}.body`), s).toBe(true)
    }
    for (const r of PROBLEM_REASONS) expect(te(`hosting.problem.${r}`), r).toBe(true)
    for (const r of KEY_TEST_RESULTS) {
      expect(te(`hosting.keyTest.${r}`), r).toBe(true)
      expect(te(`hosting.keyTest.short.${r}`), r).toBe(true)
    }
  })

  it('are watched closely while starting, less so after two minutes, and every half minute otherwise', () => {
    expect(pollInterval('starting', 0)).toBe(3_000)
    expect(pollInterval('stopped', 119_000)).toBe(3_000)
    expect(pollInterval('starting', 121_000)).toBe(15_000)
    for (const s of ['running', 'paused', 'needs_model', 'needs_token', 'error'] as const) {
      expect(pollInterval(s, 0)).toBe(30_000)
    }
  })
})

describe('seat sentences', () => {
  it('say what a delegate reads and whom it answers', () => {
    expect(seatSentences(seat(), t)).toEqual([
      'Your delegate in CS101 · A: reads the course material and students’ work; answers only you.',
    ])
  })

  it('say what a tutor is, from the facts', () => {
    const s = seat({ kind: 'course_tutor', section: '', reads_work: false })
    expect(courseLabel(s)).toBe('CS101')
    expect(seatSentences(s, t)).toEqual(['Tutor of CS101: answers every student; reads the course material.'])
  })

  it('say a member reads only what it reads', () => {
    expect(seatSentences(seat({ kind: 'member', reads_material: false }), t)[0]).toBe(
      'Member of CS101 · A: reads students’ work.',
    )
    expect(seatSentences(seat({ kind: 'member', reads_material: false, reads_work: false }), t)[0]).toBe(
      'Member of CS101 · A: reads nothing.',
    )
  })

  it.each([
    [{ seat_status: 'paused' }, 'seat paused'],
    [{ course_status: 'archived' }, 'course archived'],
    [{ answer_level: 'denied' as const }, 'answering is off'],
  ])('say why a seat does not answer now (%o)', (over, why) => {
    const lines = seatSentences(seat({ ...over, answers: false }), t)
    expect(lines[1]).toBe(`Does not answer now (${why}).`)
  })

  it('say when its answers wait for approval', () => {
    expect(seatSentences(seat({ answer_level: 'confirm_required' }), t)[1]).toBe('Its answers wait for approval.')
  })

  it('read naturally in Traditional Chinese', () => {
    setLocale('zh-Hant')
    expect(seatSentences(seat(), t)[0]).toBe('在CS101·A作為你的代表：讀取課程資料和學生作業；只回答你。')
    expect(seatSentences(seat({ reads_work: false, reads_material: false, kind: 'member' }), t)[0]).toBe(
      'CS101·A的成員：讀取不到任何內容。',
    )
  })

  it('read naturally in Simplified Chinese', () => {
    setLocale('zh-Hans')
    expect(seatSentences(seat(), t)[0]).toBe('在CS101·A作为你的代表：读取课程教材和学生作业；只回答你。')
    expect(seatSentences(seat({ kind: 'course_tutor', section: '', reads_work: false }), t)[0]).toBe(
      'CS101的辅导智能体：回答所有学生；读取课程教材。',
    )
  })
})

describe('what became of its token', () => {
  it('says nothing when it was revoked, or there was none', () => {
    for (const when of ['pause', 'delete'] as const) {
      expect(revocationNotice({ outcome: 'revoked', problem: null }, when, t)).toBeNull()
      expect(revocationNotice({ outcome: 'none', problem: null }, when, t)).toBeNull()
      expect(revocationNotice(null, when, t)).toBeNull()
    }
  })

  it('says a failure, and what to do, after pausing and after deleting', () => {
    const r = { outcome: 'failed', problem: 'core_unavailable' } as const
    expect(revocationNotice(r, 'pause', t)).toBe(
      'Its token could not be revoked in AIshie (AIshie could not be reached), so people may still be offered to ask it on the site. Pause it again to try once more.',
    )
    expect(revocationNotice(r, 'delete', t)).toBe(
      'Its token could not be revoked in AIshie (AIshie could not be reached), so people may still be offered to ask it on the site. Suspend the agent to stop that.',
    )
    expect(revocationNotice({ outcome: 'not_attempted', problem: 'operator_agent' }, 'delete', t)).toBe(
      'Its token was not revoked (the school’s operator runs this agent).',
    )
  })

  it('has words for every outcome and problem, in every language', () => {
    for (const l of ['en', 'zh-Hant', 'zh-Hans'] as const) {
      setLocale(l)
      for (const outcome of REVOCATIONS) {
        for (const problem of [...REVOCATION_PROBLEMS, null]) {
          const words = revocationNotice({ outcome, problem }, 'pause', t)
          if (outcome === 'revoked' || outcome === 'none') expect(words).toBeNull()
          else expect(words, `${l} ${outcome} ${problem}`).not.toMatch(/hosting\./)
        }
      }
      for (const p of [...REVOCATION_PROBLEMS, 'unknown']) expect(te(`hosting.revocation.why.${p}`), p).toBe(true)
    }
  })
})

describe('the model form', () => {
  it('sends only what applies to the provider’s endpoint', () => {
    const openai = OFFERS[0]
    const form = {
      ...emptyModelForm(),
      provider: 'openai',
      adapter: 'openai_responses',
      model: ' gpt-5 ',
      region: 'x',
      resource: 'y',
      endpoint: 'z',
    }
    expect(choiceFrom(form, openai)).toEqual({ provider: 'openai', adapter: 'openai_responses', model: 'gpt-5' })

    const azure = OFFERS[1]
    expect(
      choiceFrom(
        { ...form, provider: 'azure', resource: 'my-res', maxOutputTokens: 1024, reasoningEffort: 'low' },
        azure,
      ),
    ).toEqual({
      provider: 'azure',
      adapter: 'openai_responses',
      model: 'gpt-5',
      resource: 'my-res',
      max_output_tokens: 1024,
      reasoning_effort: 'low',
    })
    expect(choiceFrom({ ...form, provider: 'bedrock', region: 'eu-west-1' }, OFFERS[2])).toMatchObject({
      region: 'eu-west-1',
    })
    expect(choiceFrom({ ...form, provider: 'moonshot', endpoint: 'china' }, OFFERS[3])).toMatchObject({
      endpoint: 'china',
    })
  })

  it('comes back from the model an agent has', () => {
    const f = formFromModel(
      {
        provider: 'bedrock',
        adapter: 'bedrock_converse',
        model: 'anthropic.claude',
        endpoint: null,
        resource: null,
        region: 'eu-west-1',
        max_output_tokens: 4000,
        reasoning_effort: 'high',
        price_known: false,
      },
      OFFERS,
    )
    expect(f).toMatchObject({
      provider: 'bedrock',
      adapter: 'bedrock_converse',
      region: 'eu-west-1',
      maxOutputTokens: 4000,
      reasoningEffort: 'high',
    })
    expect(formFromModel(null, OFFERS)).toEqual(emptyModelForm())
  })

  it('says what is wrong before anything is sent', () => {
    const form = { ...emptyModelForm(), provider: 'azure', model: 'bad model', resource: 'Bad.Host' }
    expect(formProblems(form, OFFERS[1])).toEqual({
      model: 'hosting.model.invalid.model',
      resource: 'hosting.model.invalid.resource',
    })
    expect(formProblems({ ...form, provider: 'bedrock', model: 'm', region: 'moon-1' }, OFFERS[2])).toEqual({
      region: 'hosting.model.invalid.region',
    })
    expect(
      formProblems({ ...emptyModelForm(), provider: 'openai', model: 'm', maxOutputTokens: 100 }, OFFERS[0]),
    ).toEqual({
      maxOutputTokens: 'hosting.model.invalid.maxOutputTokens',
    })
    expect(formProblems(emptyModelForm(), undefined)).toEqual({ provider: 'hosting.model.invalid.required' })
  })

  it('takes a provider’s endpoint choices from the runtime’s offer alone', () => {
    const glm = OFFERS.find((o) => o.provider === 'glm')!
    const form = defaultsFor({ ...emptyModelForm(), model: 'glm-4.6' }, glm)
    expect(form.endpoint).toBe('global')
    expect(choiceFrom(form, glm)).toEqual({
      provider: 'glm',
      adapter: 'openai_chat',
      model: 'glm-4.6',
      endpoint: 'global',
    })
    // A saved endpoint the runtime no longer offers is shown as it is, and must be chosen again: never switched silently.
    const saved = formFromModel(
      {
        provider: 'glm',
        adapter: 'openai_chat',
        model: 'glm-4.6',
        endpoint: 'china',
        resource: null,
        region: null,
        max_output_tokens: null,
        reasoning_effort: null,
        price_known: true,
      },
      OFFERS,
    )
    expect(saved.endpoint).toBe('china')
    expect(formProblems(saved, glm)).toEqual({ endpoint: 'hosting.errors.unknown_endpoint' })
  })

  it('tells one choice from another whatever the order of its members', () => {
    expect(choiceKey({ provider: 'a', model: 'b' })).toBe(choiceKey({ model: 'b', provider: 'a' }))
    expect(choiceKey({ provider: 'a', model: 'b' })).not.toBe(choiceKey({ provider: 'a', model: 'c' }))
  })

  it('maps the runtime’s field pointers onto the form', () => {
    expect(fieldOfPointer('/model/own/region')).toBe('region')
    expect(fieldOfPointer('/model')).toBe('model')
    expect(fieldOfPointer('/own_key/value')).toBe('key')
    expect(fieldOfPointer('/key')).toBe('key')
    expect(fieldOfPointer('/model/own/max_output_tokens')).toBe('maxOutputTokens')
    expect(fieldOfPointer('/model/school')).toBeNull()
    expect(fieldOfPointer('/model/school/offer')).toBe('offer')
    expect(fieldOfPointer(7)).toBeNull()
  })

  it('refuses a key the runtime would, and a Core token above all', () => {
    expect(isKeyShaped('sk-abcdefgh')).toBe(true)
    expect(isKeyShaped('short')).toBe(false)
    expect(isKeyShaped('sk-with space')).toBe(false)
    expect(isKeyShaped(newToken().token)).toBe(false)
    expect(isKeyShaped('aisinv_abcdefghijkl_x')).toBe(false)
    expect(isKeyShaped('x'.repeat(4097))).toBe(false)
    // Anywhere in it, as the runtime looks (A.3.7): in quotes, or after other text.
    const token = newToken().token
    expect(isKeyShaped(`"${token}"`)).toBe(false)
    expect(isKeyShaped(`key=${token}`)).toBe(false)
    expect(isKeyShaped(`aisinv_${'abcdefghijkl'}_${'x'.repeat(20)}`)).toBe(false)
  })

  it('tells an AIshie token pasted as a key from a key that is merely malformed', () => {
    const token = newToken().token
    for (const k of [token, `"${token}"`, `Bearer ${token}`, `x${token}`, 'ais_short', 'aisinv_short']) {
      expect(isAishieToken(k), k).toBe(true)
      expect(keyProblem(k), k).toBe('hosting.errors.key_is_aishie_token')
    }
    expect(isAishieToken('sk-ais_abc')).toBe(false)
    expect(keyProblem('sk-with space')).toBe('hosting.errors.key_malformed')
    expect(keyProblem('short')).toBe('hosting.errors.key_malformed')
    expect(keyProblem('sk-abcdefgh')).toBeNull()
    expect(t('hosting.errors.key_is_aishie_token', { provider: 'OpenAI' })).toBe(
      'That is an AIshie token (yours or an agent’s), not an API key from OpenAI. An AIshie token is never sent to a provider: paste the key OpenAI gave you.',
    )
    setLocale('zh-Hant')
    expect(t('hosting.errors.key_is_aishie_token', { provider: 'OpenAI' })).toContain('AIshie 的權杖')
  })
})

describe('the school’s plan', () => {
  it('is spent once the owner’s answers today reach its quota', () => {
    const use = {
      scope: 'owner' as const,
      used: 99,
      limit: 100,
      used_usd: '0.000000',
      limit_usd: null,
      per_asker_limit: 20,
    }
    expect(schoolSpent(use)).toBe(false)
    expect(schoolSpent({ ...use, used: 100 })).toBe(true)
    expect(schoolSpent(null)).toBe(false)
    expect(schoolSpent(undefined)).toBe(false)
  })
})
