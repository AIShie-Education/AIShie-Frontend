import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { setLocale } from '@/i18n'
import type { PlanOffer } from '@/api/runtime-types'
import OfferDialog from './OfferDialog.vue'
import {
  ADMIN,
  OFFERS,
  Servers,
  adminState,
  json,
  newKey,
  newToken,
  refusal,
  siteOffer,
  withAdmin,
  type AdminState,
} from './adminFakes'
import { mountGlobal, settle } from './testSetup'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }) }
})

let s: Servers
let state: AdminState
let logged: unknown[][]

beforeEach(() => {
  setLocale('en')
  state = adminState()
  s = withAdmin(new Servers(), state).install()
  vi.mocked(ElMessage).mockReset()
  logged = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args))
  }
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setLocale('en')
  document.body.innerHTML = ''
})

type Vm = {
  meta: { id: string; label: string; enabled: boolean }
  form: {
    provider: string
    adapter: string
    model: string
    endpoint: string
    resource: string
    region: string
    maxOutputTokens: number | null
  }
  key: string
  keyMode: 'keep' | 'new'
  skipKeyTest: boolean
  onProvider: (p: string) => void
}

async function open(offer: PlanOffer | null = null, props: Record<string, unknown> = {}) {
  const { global } = await mountGlobal()
  const w = mount(OfferDialog, {
    props: { modelValue: true, offer, providers: OFFERS, takenIds: state.plan.offers.map((o) => o.id), ...props },
    global,
    attachTo: document.body,
  })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}
const save = async (w: VueWrapper) => {
  // What was typed settles first, as it does before anyone can click.
  await flushPromises()
  await w.find('.offer-dialog__save').trigger('click')
  await settle()
}
/** A field's form item, by the class of its control. */
const item = (w: VueWrapper, cls: string) => w.find(cls).element.closest('.el-form-item')!
/** The error shown under a field, or ''. */
const fieldError = (w: VueWrapper, cls: string) =>
  item(w, cls).querySelector('.el-form-item__error')?.textContent?.trim() ?? ''
const lastMessage = () => vi.mocked(ElMessage).mock.calls.at(-1)?.[0] as { type: string; message: string } | undefined

async function fillNew(vm: Vm, key = newKey()) {
  vm.meta.id = 'gpt5'
  vm.meta.label = 'School AI (GPT-5)'
  vm.onProvider('openai')
  vm.form.model = 'gpt-5'
  await flushPromises()
  vm.key = key
  await flushPromises()
  return key
}

describe('adding a model to the plan', () => {
  it('asks for an ID, a name, the model as an owner chooses one, and the school’s key', async () => {
    const { w } = await open()
    expect(w.find('.el-dialog__title').text()).toBe('Add a model to the school’s plan')
    expect(w.find('.offer-form__id').exists()).toBe(true)
    expect(w.find('.offer-form__enabled').classes()).toContain('is-checked')
    // Nothing to add until a provider is chosen.
    expect(w.find('.offer-dialog__save').attributes('disabled')).toBeDefined()
    const labels = Array.from(document.body.querySelectorAll('.el-select-dropdown__item'), (o) => o.textContent?.trim())
    expect(labels).toEqual(['OpenAI', 'Azure OpenAI', 'Amazon Bedrock', 'Moonshot (Kimi)', 'Zhipu GLM'])
  })

  it('shows the fields each endpoint kind needs', async () => {
    const { w, vm } = await open()
    vm.onProvider('openai')
    await flushPromises()
    expect(w.find('.offer-form__adapter').exists()).toBe(true)
    expect(w.find('.offer-form__resource').exists()).toBe(false)
    expect(w.find('.offer-form__key input').attributes('type')).toBe('password')
    expect(w.find('.offer-form__key input').attributes('placeholder')).toBe('The school’s API key for OpenAI (sk-…)')
    vm.onProvider('azure')
    await flushPromises()
    expect(w.find('.offer-form__resource').exists()).toBe(true)
    vm.onProvider('bedrock')
    await flushPromises()
    expect(w.find('.offer-form__region').exists()).toBe(true)
    expect(w.find('.offer-form__adapter').exists()).toBe(false)
    vm.onProvider('moonshot')
    await flushPromises()
    expect(w.find('.offer-form__endpoint').exists()).toBe(true)
    expect(vm.form.endpoint).toBe('global')
  })

  it('sends the offer, its key tried first, and says it is on the plan', async () => {
    const { w, vm } = await open()
    const key = await fillNew(vm)
    await save(w)
    const [post] = s.to('POST', ADMIN.offers)
    expect(JSON.parse(post.body!)).toEqual({
      id: 'gpt5',
      label: 'School AI (GPT-5)',
      provider: 'openai',
      adapter: 'openai_chat',
      model: 'gpt-5',
      enabled: true,
      key,
    })
    expect(post.headers['If-Match']).toBeUndefined()
    expect(lastMessage()).toMatchObject({ type: 'success', message: 'School AI (GPT-5) is on the school’s plan.' })
    expect(w.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 'gpt5', key_status: 'tested' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(vm.key).toBe('')
  })

  it('keeps a key untried when asked, warning what that means', async () => {
    const { w, vm } = await open()
    await fillNew(vm)
    vm.skipKeyTest = true
    vm.meta.enabled = false
    await flushPromises()
    expect(w.find('.offer-form__skip-warning').text()).toBe(
      'The key is not tried with OpenAI. If it does not work, agents on this model fail until it is replaced. It shows as not tested.',
    )
    await save(w)
    expect(JSON.parse(s.to('POST', ADMIN.offers)[0].body!)).toMatchObject({ enabled: false, skip_key_test: true })
    expect(lastMessage()?.message).toBe('School AI (GPT-5) is on the school’s plan. Its key was not tried.')
  })

  it('says what is wrong on each field, and sends nothing', async () => {
    const { w, vm } = await open()
    vm.onProvider('openai')
    await flushPromises()
    vm.meta.id = 'has space'
    await save(w)
    expect(fieldError(w, '.offer-form__id')).toBe('Letters, digits, _ and -, up to 64.')
    expect(fieldError(w, '.offer-form__label')).toBe('Required')
    expect(fieldError(w, '.offer-form__model')).toBe('Required')
    expect(fieldError(w, '.offer-form__key')).toBe('Enter the school’s API key for OpenAI.')
    vm.meta.id = 'fast'
    await save(w)
    expect(fieldError(w, '.offer-form__id')).toBe('The plan already has a model with this ID.')
    // Mended, its words go.
    vm.meta.id = 'fast2'
    await settle()
    expect(fieldError(w, '.offer-form__id')).toBe('')
    expect(s.to('POST', ADMIN.offers)).toHaveLength(0)
  })

  it('never sends an AIshie token as a key, and says it is one', async () => {
    const { w, vm } = await open()
    const token = newToken().token
    await fillNew(vm, token)
    await save(w)
    expect(fieldError(w, '.offer-form__key')).toContain(
      'That is an AIshie token (yours or an agent’s), not an API key from OpenAI.',
    )
    expect(s.everything()).not.toContain(token)
  })

  it('says what the provider answered when the key failed its trial, and keeps nothing', async () => {
    const { w, vm } = await open()
    const key = await fillNew(vm)
    s.once('POST', ADMIN.offers, () =>
      refusal(422, 'failed_precondition', 'key_test_failed', {
        field: '/key',
        result: 'key_refused',
        http_status: 401,
        provider_code: 'invalid_api_key',
      }),
    )
    await save(w)
    const trial = w.find('.offer-dialog__trial')
    expect(trial.find('.el-alert__title').text()).toBe('The key did not pass its trial: OpenAI refused this key.')
    expect(trial.find('.offer-dialog__trial-text').text()).toContain('Nothing was saved.')
    expect(trial.find('.offer-dialog__trial-detail').text()).toBe(
      'The provider answered HTTP 401 · its code: invalid_api_key',
    )
    expect(w.emitted('saved')).toBeUndefined()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    // The key stays to be mended, and a new one forgets the trial.
    expect(vm.key).toBe(key)
    vm.key = newKey()
    await flushPromises()
    expect(w.find('.offer-dialog__trial').exists()).toBe(false)
  })

  it.each([
    [
      409,
      'conflict',
      'offer_exists',
      { field: '/id', source: 'config' },
      '.offer-form__id',
      'The server’s settings already have a model with this ID.',
    ],
    [422, 'failed_precondition', 'model_denied', { field: '/model' }, '.offer-form__model', 'The server’s model lists'],
    [
      422,
      'failed_precondition',
      'offer_not_priced',
      { field: '/model', offers: ['gpt5'] },
      '.offer-form__model',
      'A quota in dollars needs a price today for every model',
    ],
    [400, 'invalid_argument', 'unknown_endpoint', { field: '/endpoint' }, '.offer-form__adapter', null],
    [
      400,
      'invalid_argument',
      'key_malformed',
      { field: '/key' },
      '.offer-form__key',
      'That does not look like an API key from OpenAI.',
    ],
    [
      400,
      'invalid_argument',
      'invalid_field',
      { field: '/label' },
      '.offer-form__label',
      'This value is not accepted here.',
    ],
  ] as const)('puts a refusal on its field: %s %s', async (status, code, reason, details, cls, words) => {
    const { w, vm } = await open()
    await fillNew(vm)
    s.once('POST', ADMIN.offers, () => refusal(status, code, reason, details))
    await save(w)
    if (words) expect(fieldError(w, cls)).toContain(words)
    // A field the form does not show for this provider: said above it.
    else expect(w.find('.offer-dialog__error').text()).toContain('Choose one of the endpoints offered.')
  })

  it('offers to add a price for the model when a quota in dollars needs one', async () => {
    const { w, vm } = await open()
    await fillNew(vm)
    s.once('POST', ADMIN.offers, () =>
      refusal(422, 'failed_precondition', 'offer_not_priced', { field: '/model', offers: ['gpt5'] }),
    )
    await save(w)
    expect(fieldError(w, '.offer-form__model')).toContain('A quota in dollars needs a price today')
    const notice = w.find('.offer-dialog__unpriced')
    expect(notice.text()).toContain('A quota in dollars needs a price for this model first:')
    expect(notice.find('.unpriced__label').text()).toBe('School AI (GPT-5)')
    expect(notice.find('.unpriced__model').text()).toBe('openai · gpt-5')
    await notice.find('.unpriced__add').trigger('click')
    await flushPromises()
    const price = document.body.querySelector('.price-dialog') as HTMLElement
    expect((price.querySelector('.price-form__model input') as HTMLInputElement).value).toBe('gpt-5')
  })

  it('says a rate limit above the form, and never sends it again by itself', async () => {
    const { w, vm } = await open()
    await fillNew(vm)
    s.on('POST', ADMIN.offers, () =>
      json(
        429,
        {
          error: {
            code: 'rate_limited',
            message: 'slow down',
            details: { reason: 'rate_limited', retry_after_seconds: 20 },
          },
        },
        { 'Retry-After': '20' },
      ),
    )
    await save(w)
    expect(w.find('.offer-dialog__error').text()).toBe('Too many tries. Wait 20 seconds.')
    expect(s.to('POST', ADMIN.offers)).toHaveLength(1)
  })

  it('keeps the key out of the page, the logs, the errors and every request but the one that needs it', async () => {
    const { w, vm } = await open()
    const key = await fillNew(vm)
    s.once('POST', ADMIN.offers, () => refusal(422, 'failed_precondition', 'model_denied', { field: '/model' }))
    await save(w)
    await save(w)
    const withKey = s.calls.filter((c) => JSON.stringify(c).includes(key))
    expect(withKey.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /runtime/api/v1/admin/school-plan/offers',
      'POST /runtime/api/v1/admin/school-plan/offers',
    ])
    expect(JSON.stringify(logged)).not.toContain(key)
    expect(document.body.innerHTML).not.toContain(key)
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!)).not.toContain(key)
    }
  })

  it('says when the runtime offers no provider, or they could not be read', async () => {
    let { w } = await open(null, { providers: [] })
    expect(w.find('.offer-dialog__no-providers').text()).toContain('The agent service offers no provider for a key.')
    w.unmount()
    ;({ w } = await open(null, {
      providers: null,
      providersError: refusal(503, 'unavailable', 'store_unavailable') && new Error('x'),
    }))
    expect(w.find('.offer-dialog__providers-failed').text()).toContain(
      'Could not read the providers the agent service offers.',
    )
    await w.find('.offer-dialog__providers-failed button').trigger('click')
    expect(w.emitted('reloadProviders')).toHaveLength(1)
  })
})

describe('editing a model of the site’s', () => {
  const fast = () => state.plan.offers.find((o) => o.id === 'fast' && o.source === 'site')!

  it('shows it as it is, its ID fixed and its key as its hint, kept by default', async () => {
    const { w, vm } = await open(fast())
    expect(w.find('.el-dialog__title').text()).toBe('Edit School AI (fast)')
    expect(w.find('.offer-form__id').exists()).toBe(false)
    expect(w.find('.offer-form__id-fixed').text()).toBe('fast')
    expect(vm.form).toMatchObject({ provider: 'openai', adapter: 'openai_chat', model: 'gpt-4.1-mini' })
    expect(vm.keyMode).toBe('keep')
    expect(w.find('.offer-form__keymode').text()).toContain('Keep the key sk-…3f9a')
    expect(w.find('.offer-form__key-status').text()).toBe('Tested')
    expect(w.find('.offer-form__key').exists()).toBe(false)
  })

  it('sends only a name changed, at the version read, keeping the key’s trial', async () => {
    const { w, vm } = await open(fast())
    vm.meta.label = 'Quick'
    await save(w)
    const [patch] = s.to('PATCH', ADMIN.offer)
    expect(patch.url).toBe('/runtime/api/v1/admin/school-plan/offers/fast')
    expect(patch.headers['If-Match']).toBe('"4"')
    expect(JSON.parse(patch.body!)).toEqual({ label: 'Quick' })
    expect(lastMessage()?.message).toBe('Quick is saved.')
    expect(w.emitted('saved')?.[0]?.[0]).toMatchObject({ label: 'Quick', key_status: 'tested', version: 5 })
  })

  it('sends nothing when nothing changed', async () => {
    const { w } = await open(fast())
    await save(w)
    expect(s.to('PATCH', ADMIN.offer)).toHaveLength(0)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('says the key kept will show as untested when the model changes without a new one', async () => {
    const { w, vm } = await open(fast())
    expect(w.find('.offer-form__retests').exists()).toBe(false)
    vm.form.model = 'gpt-5'
    await flushPromises()
    expect(w.find('.offer-form__retests').text()).toBe(
      'The key kept was tried with another model. Saved like this, it shows as not tested: replace it to try it with this one.',
    )
    await save(w)
    expect(JSON.parse(s.to('PATCH', ADMIN.offer)[0].body!)).toEqual({ model: 'gpt-5' })
    expect(lastMessage()?.message).toBe('School AI (fast) is saved. Its key shows as not tested until it is replaced.')
  })

  it('replaces the key when asked, and sends the new one alone', async () => {
    const { w, vm } = await open(fast())
    vm.keyMode = 'new'
    await flushPromises()
    expect(w.find('.offer-form__key').exists()).toBe(true)
    await save(w)
    expect(fieldError(w, '.offer-form__key')).toBe('Enter the school’s API key for OpenAI.')
    const key = newKey()
    vm.key = key
    await flushPromises()
    await save(w)
    expect(JSON.parse(s.to('PATCH', ADMIN.offer)[0].body!)).toEqual({ key })
  })

  it('asks for a key of another provider’s own, and sends its model and endpoint with it', async () => {
    const { w, vm } = await open(fast())
    vm.onProvider('moonshot')
    await flushPromises()
    expect(w.find('.offer-form__keymode').exists()).toBe(false)
    expect(w.find('.offer-form__other-provider').text()).toBe('Another provider needs its own key.')
    // Back to its own provider, its key may be kept again.
    vm.onProvider('openai')
    await flushPromises()
    expect(vm.keyMode).toBe('keep')
    expect(vm.form.model).toBe('gpt-4.1-mini')
    vm.onProvider('moonshot')
    vm.form.model = 'kimi-k2'
    vm.form.endpoint = 'china'
    await save(w)
    expect(fieldError(w, '.offer-form__key')).toBe('Enter the school’s API key for Moonshot (Kimi).')
    const key = newKey()
    vm.key = key
    await save(w)
    expect(JSON.parse(s.to('PATCH', ADMIN.offer)[0].body!)).toEqual({
      provider: 'moonshot',
      adapter: 'openai_chat',
      endpoint: 'china',
      model: 'kimi-k2',
      key,
    })
  })

  it('says a key the runtime still asks for on another provider, on the key', async () => {
    const { w, vm } = await open(fast())
    vm.meta.label = 'Quick'
    s.once('PATCH', ADMIN.offer, () => refusal(422, 'failed_precondition', 'key_required', { field: '/key' }))
    await save(w)
    expect(vm.keyMode).toBe('new')
    expect(fieldError(w, '.offer-form__key')).toBe(
      'Another provider needs its own key: enter the school’s key for OpenAI.',
    )
  })

  it('on 412, reads it again, keeps what was changed here over it, says so, and saves at the new version', async () => {
    const { w, vm } = await open(fast())
    vm.meta.label = 'Quick'
    // Meanwhile, another administrator changes its model.
    const i = state.plan.offers.indexOf(fast())
    state.plan.offers[i] = { ...fast(), model: 'gpt-5', version: 6 }
    await save(w)
    expect(s.to('PATCH', ADMIN.offer)[0].headers['If-Match']).toBe('"4"')
    expect(s.to('GET', ADMIN.offer)).toHaveLength(1)
    expect(w.find('.offer-dialog__notice').text()).toBe(
      'This model changed meanwhile, in another tab or by another administrator. What you changed is kept over it as it is now: check and save again.',
    )
    expect(vm.meta.label).toBe('Quick')
    expect(vm.form.model).toBe('gpt-5')
    expect(w.emitted('saved')).toBeUndefined()
    await save(w)
    const again = s.to('PATCH', ADMIN.offer)[1]
    expect(again.headers['If-Match']).toBe('"6"')
    // Only the name: the other administrator's model stands.
    expect(JSON.parse(again.body!)).toEqual({ label: 'Quick' })
  })

  it('closes, says so and asks for the plan again when it was deleted meanwhile', async () => {
    const { w, vm } = await open(fast())
    state.plan.offers = state.plan.offers.filter((o) => o.id !== 'fast')
    vm.meta.label = 'Quick'
    await save(w)
    expect(lastMessage()).toMatchObject({
      type: 'info',
      message: 'This model is no longer on the plan: someone deleted it meanwhile.',
    })
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('shows an offer’s output bound and effort under Advanced, and clears them to the defaults', async () => {
    const { w, vm } = await open(siteOffer({ max_output_tokens: 2048, reasoning_effort: 'low' }))
    expect(w.find('.offer-form__max-tokens').isVisible()).toBe(true)
    vm.form.maxOutputTokens = null
    ;(vm.form as unknown as { reasoningEffort: string }).reasoningEffort = ''
    await save(w)
    expect(JSON.parse(s.to('PATCH', ADMIN.offer)[0].body!)).toEqual({ max_output_tokens: null, reasoning_effort: null })
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const { w } = await open(fast())
    expect(w.find('.el-dialog__title').text()).toBe('編輯School AI (fast)')
    expect(w.find('.offer-form__keymode').text()).toContain('保留金鑰sk-…3f9a')
  })
})
