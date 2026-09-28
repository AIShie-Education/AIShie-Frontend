import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { HostedAgent, KeyTestResult } from '@/api/runtime-types'
import ModelKeyDialog from './ModelKeyDialog.vue'
import { AGENT_ID, RUNTIME, Servers, hostedAgent, json, newKey, newToken, refusal } from './hostingFakes'

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
let agent: HostedAgent
let logged: unknown[][]

beforeEach(() => {
  setLocale('en')
  agent = hostedAgent({ status: 'needs_model', model: { own: null, school: null }, own_key: null })
  s = new Servers().install()
  s.on('GET', RUNTIME.agent, () => json(200, agent, { ETag: `"${agent.version}"` }))
  vi.mocked(ElMessageBox.confirm).mockReset()
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
  form: { provider: string; adapter: string; model: string; resource: string; region: string; endpoint: string }
  key: string
  keyMode: 'keep' | 'new'
  onProvider: (p: string) => void
  error: unknown
  lastTest: unknown
}

async function open(props: Record<string, unknown> = {}) {
  const w = mount(ModelKeyDialog, {
    props: { modelValue: true, agentId: AGENT_ID, name: 'Study helper', ...props },
    global,
    attachTo: document.body,
  })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}

async function fill(vm: Vm, key = newKey()) {
  vm.onProvider('openai')
  vm.form.model = 'gpt-4.1-mini'
  vm.key = key
  await flushPromises()
  return key
}

// Element Plus shows a field's error 100 ms after it is set.
const settle = async () => {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 120))
  await flushPromises()
}
const click = async (w: Awaited<ReturnType<typeof open>>['w'], cls: string) => {
  await w.find(cls).trigger('click')
  await settle()
}
/** An alert's own element (under the transition that wraps it in tests). */
function alertEl(w: Awaited<ReturnType<typeof open>>['w'], cls: string) {
  const found = w.find(cls)
  return found.classes().includes('el-alert') ? found : found.find('.el-alert')
}

function answerTest(result: KeyTestResult, http_status: number | null = 200) {
  s.on('POST', RUNTIME.keyTest, () => json(200, { result, http_status, provider_code: null, latency_ms: 120 }))
}

describe('ModelKeyDialog', () => {
  it('reads the offers and the agent when it opens, and offers only the providers the runtime names', async () => {
    const { w } = await open()
    expect(s.to('GET', RUNTIME.models)).toHaveLength(1)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(1)
    const labels = Array.from(document.body.querySelectorAll('.el-select-dropdown__item'), (o) => o.textContent?.trim())
    expect(labels).toEqual(['OpenAI', 'Azure OpenAI', 'Amazon Bedrock', 'Moonshot (Kimi)', 'Zhipu GLM'])
    // Nothing chosen yet: nothing to save.
    expect(w.find('.model-dialog__save').attributes('disabled')).toBeDefined()
  })

  it('shows the fields each endpoint kind needs, and the warning naming the provider', async () => {
    const { w, vm } = await open()
    vm.onProvider('openai')
    await flushPromises()
    expect(w.find('.model-form__adapter').exists()).toBe(true)
    expect(w.find('.model-form__resource').exists()).toBe(false)
    expect(w.text()).toContain('go to OpenAI under your key and that provider’s terms')
    // The model is chosen from the provider's suggestions, or typed; one the runtime has no price for says so.
    const suggested: unknown[] = []
    ;(vm as unknown as { suggest: (q: string, cb: (x: unknown[]) => void) => void }).suggest('gpt', (x) => suggested.push(...x))
    expect(suggested).toEqual([
      { value: 'gpt-4.1-mini', priced: true },
      { value: 'gpt-5', priced: false },
    ])

    vm.onProvider('azure')
    await flushPromises()
    expect(w.find('.model-form__resource').exists()).toBe(true)
    vm.onProvider('bedrock')
    await flushPromises()
    expect(w.find('.model-form__region').exists()).toBe(true)
    expect(w.find('.model-form__adapter').exists()).toBe(false)
    vm.onProvider('moonshot')
    await flushPromises()
    expect(w.find('.model-form__endpoint').exists()).toBe(true)
    expect(vm.form.endpoint).toBe('global')
  })

  it('offers a provider’s endpoints as GET /models lists them: GLM’s global one alone, and sends it', async () => {
    const { w, vm } = await open()
    vm.onProvider('glm')
    await flushPromises()
    expect(vm.form.endpoint).toBe('global')
    const endpoint = w.find('.model-form__endpoint')
    expect(endpoint.exists()).toBe(true)
    const options = Array.from(document.body.querySelectorAll('.el-select-dropdown__item'), (o) => o.textContent?.trim())
    expect(options).toContain('Global')
    expect(options).not.toContain('China')
    vm.form.model = 'glm-4.6'
    vm.key = newKey()
    await flushPromises()
    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    expect(JSON.parse(s.to('POST', RUNTIME.keyTest)[0].body!)).toMatchObject({ provider: 'glm', endpoint: 'global' })

    // Moonshot lists both of its own, so both are offered.
    vm.onProvider('moonshot')
    await flushPromises()
    const all = Array.from(document.body.querySelectorAll('.el-select-dropdown__item'), (o) => o.textContent?.trim())
    expect(all).toContain('China')
  })

  it.each([
    ['ok', 200, 'The key works with gpt-4.1-mini.', 'success'],
    ['key_refused', 401, 'OpenAI refused this key.', 'error'],
    ['model_not_found', 404, 'The key works, but OpenAI has no model gpt-4.1-mini.', 'warning'],
    ['key_accepted', 429, 'The key was accepted, but the test call failed (HTTP 429). You can still save.', 'warning'],
    ['unreachable', null, 'Could not reach OpenAI. Try again.', 'warning'],
  ] as const)('tests the key with one token: %s', async (result, status, words, tone) => {
    const { w, vm } = await open()
    const key = await fill(vm)
    answerTest(result, status)
    await click(w, '.model-dialog__test-button')
    const [call] = s.to('POST', RUNTIME.keyTest)
    expect(JSON.parse(call.body!)).toEqual({ provider: 'openai', adapter: 'openai_chat', model: 'gpt-4.1-mini', key })
    const alert = alertEl(w, '.model-dialog__test')
    expect(alert.text()).toBe(words)
    expect(alert.classes()).toContain(`el-alert--${tone}`)
  })

  it('says the test’s result in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const { w, vm } = await open()
    await fill(vm)
    answerTest('key_refused', 401)
    await click(w, '.model-dialog__test-button')
    expect(w.find('.model-dialog__test').text()).toBe('OpenAI 拒絕了這個金鑰。')
  })

  it('saves at the version it read, without asking, once the key passed a test of exactly these inputs', async () => {
    const { w, vm } = await open()
    const key = await fill(vm)
    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    s.on('PATCH', RUNTIME.agent, () => json(200, { ...agent, version: 4, status: 'starting' }, { ETag: '"4"' }))
    await click(w, '.model-dialog__save')
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    const [patch] = s.to('PATCH', RUNTIME.agent)
    expect(patch.headers['If-Match']).toBe('"3"')
    expect(JSON.parse(patch.body!)).toEqual({
      model: { own: { provider: 'openai', adapter: 'openai_chat', model: 'gpt-4.1-mini' } },
      own_key: { value: key },
    })
    expect(w.emitted('saved')?.[0]?.[0]).toMatchObject({ version: 4, status: 'starting' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(vm.key).toBe('')
  })

  it('asks first when the key was not tested, and saves nothing when told not to', async () => {
    const { w, vm } = await open()
    await fill(vm)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await click(w, '.model-dialog__save')
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe('The key did not pass the test (not tested). Save anyway?')
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(0)

    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm' as never)
    s.on('PATCH', RUNTIME.agent, () => json(200, { ...agent, version: 4 }))
    await click(w, '.model-dialog__save')
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(1)
  })

  it('asks first when the key failed its test, or when the inputs changed since', async () => {
    const { w, vm } = await open()
    await fill(vm)
    answerTest('key_refused', 401)
    await click(w, '.model-dialog__test-button')
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    await click(w, '.model-dialog__save')
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0]).toBe(
      'The key did not pass the test (the key was refused). Save anyway?',
    )

    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    // Another model: the test was not of these inputs.
    vm.form.model = 'gpt-5'
    await flushPromises()
    await click(w, '.model-dialog__save')
    expect(vi.mocked(ElMessageBox.confirm).mock.calls[1][0]).toBe('The key did not pass the test (not tested). Save anyway?')

    // Another key: neither.
    vm.form.model = 'gpt-4.1-mini'
    vm.key = newKey()
    await flushPromises()
    expect(vm.lastTest).toBeNull()
    await click(w, '.model-dialog__save')
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(3)
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(0)
  })

  it('on 412, reads the agent again, says so, and keeps what was typed, key included', async () => {
    const { w, vm } = await open()
    const key = await fill(vm)
    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    s.once('PATCH', RUNTIME.agent, () =>
      refusal(412, 'version_mismatch', 'version_mismatch', { current_version: 5 }),
    )
    agent = { ...agent, version: 5 }
    await click(w, '.model-dialog__save')
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(1)
    expect(s.to('GET', RUNTIME.agent)).toHaveLength(2)
    expect(w.find('.model-dialog__notice').text()).toBe(
      'This agent changed in another tab or window; check and save again.',
    )
    expect(vm.key).toBe(key)
    expect(vm.form.model).toBe('gpt-4.1-mini')
    expect(w.emitted('saved')).toBeUndefined()

    // Saved again, at the version read again.
    s.on('PATCH', RUNTIME.agent, () => json(200, { ...agent, version: 6 }))
    await click(w, '.model-dialog__save')
    expect(s.to('PATCH', RUNTIME.agent)[1].headers['If-Match']).toBe('"5"')
  })

  it('keeps the saved key by default for the same provider, and asks for a new one for another', async () => {
    agent = hostedAgent()
    const { w, vm } = await open()
    expect(vm.form).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini' })
    expect(vm.keyMode).toBe('keep')
    expect(w.text()).toContain('Keep saved key sk-…3f9a')
    expect(w.find('.model-form__key').exists()).toBe(false)
    vm.form.model = 'gpt-5'
    s.on('PATCH', RUNTIME.agent, () => json(200, { ...agent, version: 4 }))
    await click(w, '.model-dialog__save')
    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(JSON.parse(s.to('PATCH', RUNTIME.agent)[0].body!)).toEqual({
      model: { own: { provider: 'openai', adapter: 'openai_chat', model: 'gpt-5' } },
    })

    vm.onProvider('moonshot')
    await flushPromises()
    expect(w.text()).not.toContain('Keep saved key')
    expect(w.find('.model-form__key').exists()).toBe(true)
  })

  it('refuses to send a key that is not one, and a Core token above all, saying it is an AIShie token', async () => {
    const { w, vm } = await open()
    const token = newToken().token
    for (const pasted of [token, `"${token}"`, `Bearer ${token}`]) {
      await fill(vm, pasted)
      await click(w, '.model-dialog__test-button')
      await click(w, '.model-dialog__save')
      expect(w.text()).toContain(
        'That is an AIshie token (yours or an agent’s), not an API key from OpenAI. An AIshie token is never sent to a provider: paste the key OpenAI gave you.',
      )
    }
    await fill(vm, 'sk-with a space')
    await click(w, '.model-dialog__test-button')
    expect(w.text()).toContain('That does not look like an API key from OpenAI.')
    expect(s.to('POST', RUNTIME.keyTest)).toHaveLength(0)
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(0)
    expect(s.everything()).not.toContain(token)
  })

  it('says so in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const { w, vm } = await open()
    await fill(vm, newToken().token)
    await click(w, '.model-dialog__test-button')
    expect(w.text()).toContain('這是 AIshie 的權杖（你的或代理的），不是 OpenAI 的 API 金鑰。')
  })

  it('puts a field’s refusal on its field', async () => {
    const { w, vm } = await open()
    vm.onProvider('azure')
    vm.form.model = 'gpt-4.1'
    vm.form.resource = 'my-res'
    vm.key = newKey()
    await flushPromises()
    s.on('POST', RUNTIME.keyTest, () => refusal(400, 'invalid_argument', 'invalid_field', { field: '/resource' }))
    await click(w, '.model-dialog__test-button')
    const item = w.find('.model-form__resource').element.closest('.el-form-item')!
    expect(item.textContent).toContain('This value is not accepted here.')
  })

  it.each([
    [422, 'failed_precondition', 'model_denied', 'The school does not allow this model. Choose another.'],
    [422, 'failed_precondition', 'own_key_required', 'Enter your API key for OpenAI.'],
    [422, 'failed_precondition', 'own_key_provider_mismatch', 'Your saved key is for another provider. Enter a key for OpenAI.'],
    [422, 'failed_precondition', 'school_key_not_offered', 'The school’s key is not offered yet.'],
    [400, 'invalid_argument', 'key_malformed', 'That does not look like an API key from OpenAI.'],
    [400, 'invalid_argument', 'unknown_field', 'The school’s runtime did not take this request: it has no field “/model/Own”.'],
  ] as const)('says a refusal to save in words: %s', async (status, code, reason, words) => {
    const { w, vm } = await open()
    await fill(vm)
    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    s.on('PATCH', RUNTIME.agent, () => refusal(status, code, reason, reason === 'unknown_field' ? { field: '/model/Own' } : {}))
    await click(w, '.model-dialog__save')
    expect(w.text()).toContain(words)
    expect(w.emitted('saved')).toBeUndefined()
  })

  it('lists the runtime’s problems with the settings under Details', async () => {
    const { w, vm } = await open()
    await fill(vm)
    answerTest('ok')
    await click(w, '.model-dialog__test-button')
    s.on('PATCH', RUNTIME.agent, () =>
      refusal(422, 'failed_precondition', 'settings_rejected', { problems: ['max_output_tokens: too large', 'model: unknown'] }),
    )
    await click(w, '.model-dialog__save')
    const e = w.find('.model-dialog__error')
    expect(e.text()).toContain('The runtime cannot run these settings.')
    expect(e.find('details').text()).toContain('max_output_tokens: too large')
    expect(e.find('details').text()).toContain('model: unknown')
  })

  it('never sends a PATCH or a key test again by itself', async () => {
    const { w, vm } = await open()
    await fill(vm)
    s.on('POST', RUNTIME.keyTest, () => json(503, { error: { code: 'unavailable', message: 'down', details: { reason: 'store_unavailable' } } }))
    await click(w, '.model-dialog__test-button')
    expect(s.to('POST', RUNTIME.keyTest)).toHaveLength(1)
    expect(w.text()).toContain('The school’s runtime is not available right now. Try again in a minute.')

    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    s.on('PATCH', RUNTIME.agent, () => json(503, { error: { code: 'unavailable', message: 'down', details: { reason: 'store_unavailable' } } }))
    await click(w, '.model-dialog__save')
    expect(s.to('PATCH', RUNTIME.agent)).toHaveLength(1)
  })

  it('keeps the key out of the page, the logs, the errors and every request but the two that need it', async () => {
    const { w, vm } = await open()
    const key = await fill(vm)
    answerTest('key_refused', 401)
    await click(w, '.model-dialog__test-button')
    s.on('PATCH', RUNTIME.agent, () => refusal(422, 'failed_precondition', 'model_denied'))
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    await click(w, '.model-dialog__save')

    expect(w.html()).not.toContain(key)
    expect(document.body.innerHTML).not.toContain(key)
    expect(JSON.stringify(logged)).not.toContain(key)
    const e = vm.error as Error
    expect([String(e), e.message, e.stack, JSON.stringify(e)].join('\n')).not.toContain(key)
    for (const c of s.calls) {
      const carries = JSON.stringify(c).includes(key)
      const may = (c.method === 'POST' && RUNTIME.keyTest.test(c.url)) || (c.method === 'PATCH' && RUNTIME.agent.test(c.url))
      expect(carries && !may, `${c.method} ${c.url}`).toBe(false)
    }
    expect(localStorage.length + sessionStorage.length === 0 || !JSON.stringify({ ...localStorage, ...sessionStorage }).includes(key)).toBe(true)

    // Closed, the field is emptied.
    await w.setProps({ modelValue: false })
    expect(vm.key).toBe('')
  })

  it('shows the wizard’s steps as its second step', async () => {
    const { w } = await open({ wizard: true })
    expect(w.find('.model-dialog__steps').exists()).toBe(true)
    expect(w.text()).toContain('Later')
  })
})
