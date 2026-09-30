import { afterEach, describe, expect, it } from 'vitest'
import { LOCALES, i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { RuntimeError } from '@/api/runtime'
import { KEY_TRIAL_FAILURES, OCR_UNAVAILABLE_REASONS, OFFER_STATUSES } from '@/api/runtime-types'
import { OFFERS } from '@/views/account/components/agents/hostingFakes'
import { defaultsFor, emptyModelForm } from '@/views/account/components/agents/hosting'
import {
  OFFER_STATUS_TAG,
  adminErrorText,
  formFromOffer,
  isNotAdmin,
  isNotOffered,
  isUnreachable,
  keyTrialDetail,
  keyTrialOf,
  keyTrialText,
  languageName,
  offerCreateFrom,
  offerFieldOf,
  offerPatchFrom,
  offerProblems,
  quotaProblem,
  retestsKey,
  sameLanguages,
} from './runtimeAdmin'
import { newToken, siteOffer } from './adminFakes'

const g = i18n.global as unknown as {
  t: (key: string, params: Record<string, unknown>) => string
  te: (key: string, locale: string) => boolean
}
const t = (key: string, params?: Record<string, unknown>) => g.t(key, params ?? {})
const te = (key: string) => LOCALES.every((l) => g.te(key, l.value))

function err(reason: string, details: Record<string, unknown> = {}, status = 400) {
  return new RuntimeError({ status, code: 'x', message: `developer words for ${reason}`, reason, details })
}

afterEach(() => setLocale('en'))

describe('whether a section is there', () => {
  it('takes a 404 without an offer or agent named, or a 405, for a runtime from before the route', () => {
    expect(isNotOffered(err('no_route', {}, 404))).toBe(true)
    expect(isNotOffered(err('not_found', {}, 404))).toBe(true)
    // A proxy's page: no envelope, the status alone.
    expect(
      isNotOffered(new RuntimeError({ status: 404, code: 'unknown', message: 'HTTP 404', reason: 'unknown' })),
    ).toBe(true)
    expect(isNotOffered(err('method_not_allowed', {}, 405))).toBe(true)
    // An offer gone, or the whole runtime gone, is something else.
    expect(isNotOffered(err('offer_not_found', {}, 404))).toBe(false)
    expect(isNotOffered(err('runtime_absent', {}, 404))).toBe(false)
    expect(isNotOffered(err('not_admin', {}, 403))).toBe(false)
    expect(isNotOffered(new ApiError({ status: 404, code: 'not_found', message: 'Core' }))).toBe(false)
  })

  it('tells a runtime that did not answer, or could not, from a refusal', () => {
    expect(isUnreachable(err('network', {}, 0))).toBe(true)
    expect(isUnreachable(err('runtime_unavailable', {}, 502))).toBe(true)
    expect(isUnreachable(err('store_unavailable', {}, 503))).toBe(true)
    expect(isUnreachable(err('no_route', {}, 404))).toBe(false)
    expect(isUnreachable(null)).toBe(false)
    expect(isNotAdmin(err('not_admin', {}, 403))).toBe(true)
    expect(isNotAdmin(err('forbidden', {}, 403))).toBe(false)
  })
})

describe('the words for the administrators’ refusals', () => {
  const OWN: Record<string, [Record<string, unknown>, string]> = {
    not_admin: [{}, 'Only the runtime’s administrators may do this, and your account is not one of them.'],
    ocr_unavailable: [
      { field: '/ocr/enabled' },
      'OCR cannot run on this server now, so it cannot be turned on or given languages. It can still be turned off, or set back to the server’s languages.',
    ],
    offer_not_found: [{}, 'This model is no longer on the plan: someone deleted it meanwhile.'],
    offer_read_only: [{}, 'The server’s operator set this model in runtime.yaml, so it cannot be changed here.'],
    offer_not_priced: [
      { field: '/model' },
      'The plan has a quota in dollars, and the runtime’s price table has no price for this model, so it cannot be offered. Choose a priced model, or ask the operator.',
    ],
    key_required: [{ field: '/key' }, 'Another provider needs its own key: enter the school’s key for OpenAI.'],
    model_denied: [
      { field: '/model' },
      'The server’s model lists (allowed_models and denied_models in runtime.yaml) do not allow this model on the school’s key. Choose another, or ask the operator.',
    ],
  }

  it.each(Object.entries(OWN))(
    '%s is said in the administrators’ words, in every language',
    (reason, [details, words]) => {
      expect(adminErrorText(err(reason, details), t, { provider: 'OpenAI' })).toBe(words)
      for (const l of ['zh-Hant', 'zh-Hans'] as const) {
        setLocale(l)
        const zh = adminErrorText(err(reason, details), t, { provider: 'OpenAI' })
        expect(zh).toMatch(/[一-鿿]/)
        expect(zh).not.toContain('developer words')
      }
    },
  )

  it('says whose an ID taken is, runtime.yaml’s or the site’s', () => {
    expect(adminErrorText(err('offer_exists', { field: '/id', source: 'config' }, 409), t)).toBe(
      'The server’s runtime.yaml already has a model with this ID. Choose another.',
    )
    expect(adminErrorText(err('offer_exists', { field: '/id', source: 'site' }, 409), t)).toBe(
      'The plan already has a model with this ID. Choose another, or edit that one.',
    )
  })

  it('says a change made meanwhile in the administrators’ words, not an agent’s', () => {
    const e = err('version_mismatch', { current_version: 5 }, 412)
    expect(adminErrorText(e, t)).toBe(
      'This changed meanwhile, in another tab or by another administrator. Here it is as it is now: check it and try again.',
    )
  })

  it('names the member refused, when the runtime names one', () => {
    expect(adminErrorText(err('invalid_field', { field: '/per_day' }), t)).toBe(
      'The runtime did not take this: “/per_day” is not accepted. Check it and try again.',
    )
    expect(adminErrorText(err('missing_field', { field: '/label' }), t)).toBe(
      'The runtime did not take this: “/label” is missing. Reload the page and try again.',
    )
  })

  it('leaves what it shares with the hosting pages to their words', () => {
    expect(adminErrorText(err('network', {}, 0), t)).toBe(
      'The school’s runtime could not be reached. Check your connection and try again.',
    )
    expect(adminErrorText(err('rate_limited', { retry_after_seconds: 9 }, 429), t)).toBe(
      'Too many tries. Wait 9 seconds.',
    )
    expect(adminErrorText(err('unknown_provider', { field: '/provider' }), t)).toBe(
      'Choose one of the providers offered.',
    )
    expect(adminErrorText(err('key_malformed', { field: '/key' }), t, { provider: 'OpenAI' })).toContain(
      'That does not look like an API key from OpenAI.',
    )
  })

  it('has words for every status, why, OCR’s reasons and a trial’s failures, in every language', () => {
    for (const s of OFFER_STATUSES) {
      expect(te(`runtimeAdmin.offers.statuses.${s}`), s).toBe(true)
      expect(OFFER_STATUS_TAG[s], s).toBeTruthy()
      if (s !== 'offered') expect(te(`runtimeAdmin.offers.why.${s}`), s).toBe(true)
    }
    for (const r of OCR_UNAVAILABLE_REASONS) expect(te(`runtimeAdmin.ocr.unavailable.${r}`), r).toBe(true)
    for (const r of KEY_TRIAL_FAILURES) expect(te(`hosting.keyTest.${r}`), r).toBe(true)
  })
})

describe('a key’s trial that failed', () => {
  it('says what the provider answered, its status and its code', () => {
    const e = err(
      'key_test_failed',
      { field: '/key', result: 'key_refused', http_status: 401, provider_code: 'invalid_api_key' },
      422,
    )
    const trial = keyTrialOf(e)!
    expect(trial).toEqual({ result: 'key_refused', httpStatus: 401, providerCode: 'invalid_api_key' })
    expect(keyTrialText(trial, t, { provider: 'OpenAI', model: 'gpt-5' })).toBe(
      'The key did not pass its trial: OpenAI refused this key.',
    )
    expect(keyTrialDetail(trial, t)).toBe('The provider answered HTTP 401 · its code: invalid_api_key')
    expect(adminErrorText(e, t, { provider: 'OpenAI', model: 'gpt-5' })).toBe(
      'The key did not pass its trial: OpenAI refused this key.',
    )
  })

  it('says no such model, or no answer, with what there is of it', () => {
    const missing = keyTrialOf(
      err('key_test_failed', { result: 'model_not_found', http_status: 404, provider_code: null }, 422),
    )!
    expect(keyTrialText(missing, t, { provider: 'OpenAI', model: 'gpt-9' })).toBe(
      'The key did not pass its trial: The key works, but OpenAI has no model gpt-9.',
    )
    expect(keyTrialDetail(missing, t)).toBe('The provider answered HTTP 404')
    const away = keyTrialOf(
      err('key_test_failed', { result: 'unreachable', http_status: null, provider_code: null }, 422),
    )!
    expect(keyTrialText(away, t, { provider: 'OpenAI', model: 'm' })).toBe(
      'The key did not pass its trial: Could not reach OpenAI. Try again.',
    )
    expect(keyTrialDetail(away, t)).toBe('')
    setLocale('zh-Hant')
    expect(keyTrialText(away, t, { provider: 'OpenAI', model: 'm' })).toBe(
      '金鑰未通過試用：無法連接 OpenAI。請再試一次。',
    )
  })

  it('is no trial for any other refusal', () => {
    expect(keyTrialOf(err('key_malformed'))).toBeNull()
    expect(keyTrialOf(new Error('x'))).toBeNull()
  })
})

describe('OCR’s languages', () => {
  it('are named by their own names, a vertical script’s as vertical, and an unknown one by its code', () => {
    expect(languageName('chi_tra', t)).toBe('繁體中文')
    expect(languageName('chi_sim', t)).toBe('简体中文')
    expect(languageName('eng', t)).toBe('English')
    expect(languageName('chi_tra_vert', t)).toBe('繁體中文 (vertical)')
    expect(languageName('osd', t)).toBe('Orientation and script')
    expect(languageName('xyz', t)).toBe('xyz')
    setLocale('zh-Hant')
    expect(languageName('eng', t)).toBe('English')
    expect(languageName('chi_tra_vert', t)).toBe('繁體中文（直排）')
  })

  it('are the same only in the same order', () => {
    expect(sameLanguages(['eng', 'chi_tra'], ['eng', 'chi_tra'])).toBe(true)
    expect(sameLanguages(['chi_tra', 'eng'], ['eng', 'chi_tra'])).toBe(false)
    expect(sameLanguages(null, [])).toBe(true)
  })
})

describe('an offer’s form', () => {
  const openai = OFFERS[0]
  const azure = OFFERS[1]
  const moonshot = OFFERS[3]
  const meta = { id: 'fast', label: 'School AI (fast)', enabled: true }

  it('is filled from an offer as the own-model form is from a model', () => {
    const f = formFromOffer(
      siteOffer({ provider: 'moonshot', endpoint: 'china', model: 'kimi-k2', max_output_tokens: 1024 }),
      OFFERS,
    )
    expect(f).toMatchObject({
      provider: 'moonshot',
      adapter: 'openai_chat',
      endpoint: 'china',
      model: 'kimi-k2',
      maxOutputTokens: 1024,
    })
  })

  it('finds what is wrong with it, field by field', () => {
    const form = { ...defaultsFor(emptyModelForm(), openai), model: 'gpt-4.1-mini' }
    const base = {
      meta,
      form,
      provider: openai,
      creating: true,
      takenIds: [] as string[],
      sendingKey: true,
      key: 'sk-0123456789',
    }
    expect(offerProblems(base)).toEqual({})
    expect(offerProblems({ ...base, meta: { ...meta, id: 'has space' } }).id).toBe('runtimeAdmin.offer.invalid.id')
    expect(offerProblems({ ...base, meta: { ...meta, id: 'x'.repeat(65) } }).id).toBe('runtimeAdmin.offer.invalid.id')
    expect(offerProblems({ ...base, takenIds: ['fast'] }).id).toBe('runtimeAdmin.offer.invalid.idTaken')
    expect(offerProblems({ ...base, meta: { ...meta, id: ' ' } }).id).toBe('hosting.model.invalid.required')
    // Not asked of an edit, whose id is fixed.
    expect(offerProblems({ ...base, creating: false, takenIds: ['fast'] }).id).toBeUndefined()
    expect(offerProblems({ ...base, meta: { ...meta, label: 'x'.repeat(81) } }).label).toBe(
      'runtimeAdmin.offer.invalid.label',
    )
    expect(offerProblems({ ...base, meta: { ...meta, label: '  ' } }).label).toBe('hosting.model.invalid.required')
    expect(offerProblems({ ...base, key: '' }).key).toBe('runtimeAdmin.offer.invalid.keyRequired')
    expect(offerProblems({ ...base, key: 'sk with space' }).key).toBe('hosting.errors.key_malformed')
    expect(offerProblems({ ...base, key: newToken().token }).key).toBe('hosting.errors.key_is_aishie_token')
    expect(offerProblems({ ...base, key: '', sendingKey: false }).key).toBeUndefined()
    expect(offerProblems({ ...base, form: { ...form, model: '' } }).model).toBe('hosting.model.invalid.required')
    expect(offerProblems({ ...base, provider: undefined }).provider).toBe('hosting.model.invalid.required')
  })

  it('makes a new offer of the members its provider takes, and the key', () => {
    const form = { ...defaultsFor(emptyModelForm(), azure), resource: 'school-ai', model: 'gpt-4.1' }
    expect(offerCreateFrom({ meta, form, provider: azure, key: 'k-0123456789', skipKeyTest: false })).toEqual({
      id: 'fast',
      label: 'School AI (fast)',
      provider: 'azure',
      adapter: 'openai_responses',
      resource: 'school-ai',
      model: 'gpt-4.1',
      enabled: true,
      key: 'k-0123456789',
    })
    const m = {
      ...defaultsFor(emptyModelForm(), moonshot),
      model: 'kimi-k2',
      maxOutputTokens: 2048,
      reasoningEffort: 'low' as const,
    }
    expect(
      offerCreateFrom({
        meta: { ...meta, enabled: false },
        form: m,
        provider: moonshot,
        key: 'sk-0123456789',
        skipKeyTest: true,
      }),
    ).toEqual({
      id: 'fast',
      label: 'School AI (fast)',
      provider: 'moonshot',
      adapter: 'openai_chat',
      endpoint: 'global',
      model: 'kimi-k2',
      max_output_tokens: 2048,
      reasoning_effort: 'low',
      enabled: false,
      key: 'sk-0123456789',
      skip_key_test: true,
    })
  })

  describe('changes', () => {
    const offer = siteOffer({ max_output_tokens: 2048 })
    const initial = formFromOffer(offer, OFFERS)
    const patch = (over: Partial<Parameters<typeof offerPatchFrom>[0]> = {}) =>
      offerPatchFrom({
        offer,
        initial,
        meta,
        form: { ...initial },
        provider: openai,
        key: null,
        skipKeyTest: false,
        ...over,
      })

    it('send nothing when nothing changed', () => {
      expect(patch()).toEqual({})
    })

    it('send only what changed: a label alone keeps the key’s trial', () => {
      const p = patch({ meta: { ...meta, label: 'Quick', enabled: false } })
      expect(p).toEqual({ label: 'Quick', enabled: false })
      expect(retestsKey(p)).toBe(false)
    })

    it('send a model changed, which the key kept was not tried with', () => {
      const p = patch({ form: { ...initial, model: 'gpt-5', adapter: 'openai_responses' } })
      expect(p).toEqual({ model: 'gpt-5', adapter: 'openai_responses' })
      expect(retestsKey(p)).toBe(true)
    })

    it('send an output bound or effort cleared as null, the runtime’s default', () => {
      expect(patch({ form: { ...initial, maxOutputTokens: null, reasoningEffort: 'high' } })).toEqual({
        max_output_tokens: null,
        reasoning_effort: 'high',
      })
    })

    it('send a new key, untried when asked', () => {
      const p = patch({ key: 'sk-9999999999', skipKeyTest: true })
      expect(p).toEqual({ key: 'sk-9999999999', skip_key_test: true })
      expect(retestsKey(p)).toBe(false)
    })

    it('send another provider with its model, its endpoint as its kind takes it, and the key', () => {
      const form = { ...defaultsFor(initial, azure), resource: 'school-ai', model: 'gpt-4.1' }
      expect(patch({ form, provider: azure, key: 'k-0123456789' })).toEqual({
        provider: 'azure',
        adapter: 'openai_responses',
        resource: 'school-ai',
        model: 'gpt-4.1',
        key: 'k-0123456789',
      })
    })

    it('send an endpoint changed, and only for the kind that takes one', () => {
      const kimi = siteOffer({ provider: 'moonshot', endpoint: 'global', model: 'kimi-k2' })
      const start = formFromOffer(kimi, OFFERS)
      expect(
        offerPatchFrom({
          offer: kimi,
          initial: start,
          meta,
          form: { ...start, endpoint: 'china' },
          provider: moonshot,
          key: null,
          skipKeyTest: false,
        }),
      ).toEqual({ endpoint: 'china' })
    })
  })

  it('names its fields from the runtime’s pointers', () => {
    expect(offerFieldOf('/id')).toBe('id')
    expect(offerFieldOf('/label')).toBe('label')
    expect(offerFieldOf('/model')).toBe('model')
    expect(offerFieldOf('/max_output_tokens')).toBe('maxOutputTokens')
    expect(offerFieldOf('/key')).toBe('key')
    expect(offerFieldOf(7)).toBeNull()
  })
})

describe('a quota', () => {
  it('is a whole number from 1 to 1,000,000, and per_day alone may be none', () => {
    expect(quotaProblem(1, true)).toBeNull()
    expect(quotaProblem(1_000_000, true)).toBeNull()
    expect(quotaProblem(null, false)).toBeNull()
    expect(quotaProblem(null, true)).toBe('hosting.model.invalid.required')
    for (const bad of [0, -1, 1.5, 1_000_001])
      expect(quotaProblem(bad, true), String(bad)).toBe('runtimeAdmin.quotas.invalid')
  })
})
