import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { setLocale } from '@/i18n'
import { Servers, executed, json } from './adminFakes'
import { mountGlobal } from './testSetup'
import AgentRuntimeCard from './AgentRuntimeCard.vue'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }),
  }
})

const LIST = /^\/v1\/services\/agent_runtime\/credentials$/
const REVOKE = /^\/v1\/services\/agent_runtime\/credentials\/([^/]+)\/revoke$/
const ROOT = '0192f3c1-aaaa-7c3a-9b1f-2a4c6e8f0a1b'

function credential(over: Record<string, unknown> = {}) {
  return {
    id: 'c-setup',
    label: 'runtime',
    token_prefix: 'k7v2m4qhx3ab',
    created_at: '2026-09-30T08:00:00Z',
    last_used_at: '2026-10-01T03:00:00Z',
    issued_by_actor_id: null,
    issued_by_name: null,
    expires_at: null,
    revoked_at: null,
    live: true,
    claims_held: 0,
    ...over,
  }
}

let s: Servers
let credentials: ReturnType<typeof credential>[]

beforeEach(() => {
  setLocale('en')
  credentials = [credential()]
  s = new Servers()
  s.on('GET', LIST, () => executed({ scope: 'agent_runtime', service_actor_id: 'svc', credentials }))
  s.on('GET', /^\/v1\/actors\/([^/]+)$/, (_, m) => executed({ id: m[1], display_name: 'Root', kind: 'human' }))
  s.install()
  vi.mocked(ElMessageBox.confirm).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function card() {
  const { global } = await mountGlobal()
  const w = mount(AgentRuntimeCard, { global, attachTo: document.body })
  await flushPromises()
  return w
}

function items(w: VueWrapper) {
  return w.findAll('.agent-runtime-card__item')
}

describe('AgentRuntimeCard', () => {
  it('lists the agent runtime’s credentials, and says setup makes one and aishie runtime-credential rotates it', async () => {
    const w = await card()
    expect(w.find('.agent-runtime-card__title').text()).toContain('The agent runtime’s credential for AIshie')
    expect(w.find('.agent-runtime-card__setup').text()).toBe(
      'Setting up the server makes it and gives it to the runtime. To rotate it, run aishie runtime-credential on the server: it issues a new one, revokes the others, and restarts the runtime with it.',
    )
    const [one] = items(w)
    expect(one.text()).toContain('runtime')
    expect(one.text()).toContain('Live')
    expect(one.text()).toContain('aissvc_k7v2m4qhx3ab…')
    // Issued on the command line at setup: nobody is recorded.
    expect(one.text()).toContain('The server, at setup')
    expect(w.find('.agent-runtime-card__none').exists()).toBe(false)
  })

  it('says the runtime hosts nothing while no credential is live, and what to run', async () => {
    credentials = [credential({ live: false, revoked_at: '2026-10-01T00:00:00Z' })]
    const w = await card()
    expect(w.find('.agent-runtime-card__none').text()).toBe(
      'There is no live credential, so the runtime hosts no agent. Run aishie runtime-credential on the server.',
    )
    // The revoked one is shown only when asked.
    expect(items(w)).toHaveLength(0)
    await w.find('.agent-runtime-card__toolbar .el-switch').trigger('click')
    expect(items(w)).toHaveLength(1)
    expect(items(w)[0].text()).toContain('Revoked')
    expect(items(w)[0].find('.agent-runtime-card__revoke').exists()).toBe(false)
  })

  it('revokes one once the administrator has confirmed, saying what that does to the runtime', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    s.on('POST', REVOKE, () => executed({ ok: true, claims_released: 0 }))
    const w = await card()
    await w.find('.agent-runtime-card__revoke').trigger('click')
    await flushPromises()
    const [body, title] = vi.mocked(ElMessageBox.confirm).mock.calls[0]!
    expect(title).toBe('Revoke this credential?')
    expect(JSON.stringify(body)).toContain('it hosts no agent until it is given another: run aishie runtime-credential')
    expect(JSON.stringify(body)).toContain('The tokens of the agents it hosts are not revoked.')
    const [sent] = s.to('POST', REVOKE)
    expect(sent.url).toBe('/v1/services/agent_runtime/credentials/c-setup/revoke')
    expect(s.to('GET', LIST)).toHaveLength(2)
  })

  it('does nothing when the administrator thinks better of revoking', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const w = await card()
    await w.find('.agent-runtime-card__revoke').trigger('click')
    await flushPromises()
    expect(s.to('POST', REVOKE)).toHaveLength(0)
  })

  it('issues one, shows it once with where it goes, and forgets it when the dialog closes', async () => {
    const token = `aissvc_abcdefghijkl_${'S'.repeat(43)}`
    s.on('POST', LIST, (call) => {
      credentials = [credential({ id: 'c-new', label: JSON.parse(call.body!).label, issued_by_actor_id: ROOT }), ...credentials]
      return executed({ service_actor_id: 'svc', credential_id: 'c-new', token, token_prefix: 'abcdefghijkl' })
    })
    const w = await card()
    await w.find('.agent-runtime-card__issue').trigger('click')
    await flushPromises()
    const dialog = () => document.body.querySelector('.agent-runtime-issue')!
    expect(dialog().textContent).toContain('aishie runtime-credential on the server does all of that')
    ;(dialog().querySelector('.agent-runtime-issue__submit') as HTMLElement).click()
    await flushPromises()
    const [sent] = s.to('POST', LIST)
    expect(JSON.parse(sent.body!)).toEqual({ label: 'runtime localhost:3000' })
    expect(dialog().textContent).toContain('This is the only time it is shown')
    expect(dialog().querySelector('.copy-block__text')?.textContent).toBe(token)
    expect(dialog().textContent).toContain('/etc/aishie/runtime/secrets/core/agent_runtime')
    expect(items(w)).toHaveLength(2)
    ;(document.body.querySelector('.agent-runtime-issue .el-dialog__footer .el-button') as HTMLElement).click()
    await flushPromises()
    // Once the dialog has gone (its fade, which the tests do not play, ends with closed).
    w.findComponent({ name: 'ElDialog' }).vm.$emit('closed')
    await flushPromises()
    expect(JSON.stringify((w.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState.issued)).not.toContain(
      'S'.repeat(43),
    )
  })

  it('revokes the others as it issues one, when asked', async () => {
    s.on('POST', LIST, () =>
      executed({ service_actor_id: 'svc', credential_id: 'c-new', token: 'aissvc_x', token_prefix: 'x', revoked: ['c-setup'] }),
    )
    const w = await card()
    await w.find('.agent-runtime-card__issue').trigger('click')
    await flushPromises()
    const box = document.body.querySelector('.agent-runtime-issue .el-checkbox') as HTMLElement
    box.click()
    await flushPromises()
    ;(document.body.querySelector('.agent-runtime-issue__submit') as HTMLElement).click()
    await flushPromises()
    expect(JSON.parse(s.to('POST', LIST)[0].body!)).toMatchObject({ replace: true })
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    const w = await card()
    expect(w.find('.agent-runtime-card__title').text()).toContain('代理執行環境在 AIshie 的憑證')
    expect(w.find('.agent-runtime-card__setup').text()).toContain('請在伺服器上執行aishie runtime-credential')
  })

  it('shows Core’s refusal of too many credentials in its own words', async () => {
    s.on('POST', LIST, () =>
      json(422, {
        error: { code: 'failed_precondition', message: 'too many', details: { reason: 'too_many_credentials' } },
      }),
    )
    const w = await card()
    await w.find('.agent-runtime-card__issue').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.agent-runtime-issue__submit') as HTMLElement).click()
    await flushPromises()
    const { ElMessage } = await import('element-plus')
    expect(JSON.stringify(vi.mocked(ElMessage).mock.calls)).toContain(
      'The agent runtime holds as many credentials as AIshie allows.',
    )
  })
})
