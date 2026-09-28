import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import UnrevokedTokenNotice from './UnrevokedTokenNotice.vue'
import type { UnrevokedToken } from './hosting'
import { ACTOR, CORE, Servers, credential, executed, json } from './hostingFakes'

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const pinia = createPinia()
setActivePinia(pinia)
const global = { plugins: [pinia, i18n, ElementPlus], components: icons }

let s: Servers

beforeEach(() => {
  setLocale('en')
  s = new Servers().install()
  vi.mocked(ElMessage).mockClear()
})

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

const OLD: UnrevokedToken = { hint: 'ais_oldruntimetk…', prefix: 'oldruntimetk', problem: 'core_refused' }

async function notice(token: UnrevokedToken = OLD, props: Record<string, unknown> = {}) {
  const w = mount(UnrevokedTokenNotice, { props: { actorId: ACTOR, token, ...props }, global, attachTo: document.body })
  await flushPromises()
  return w
}

async function press(w: VueWrapper, cls: string) {
  await w.find(cls).trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.unrevoked__revoke.is-loading').exists()).toBe(false))
  await flushPromises()
}

describe('UnrevokedTokenNotice', () => {
  it.each([
    ['agent_suspended', 'the agent is suspended in AIshie'],
    ['core_unavailable', 'it could not reach AIshie'],
    ['core_refused', 'AIshie refused its request'],
    [null, 'it could not tell whether it did'],
  ] as const)('says the token may still work, and why (%s)', async (problem, why) => {
    const w = await notice({ ...OLD, problem })
    expect(w.find('.unrevoked').text()).toContain('A token of this agent may still work')
    expect(w.find('.unrevoked__body').text()).toBe(
      `The school’s runtime could not revoke the token ais_oldruntimetk… in AIshie (${why}), so whatever has it may still act as your agent. Revoke it here, as the agent’s owner.`,
    )
    expect(w.find('.unrevoked__revoke').text()).toBe('Revoke it in AIshie')
    // Offered, not done.
    expect(s.calls).toHaveLength(0)
  })

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = await notice({ ...OLD, problem: 'agent_suspended' })
    expect(w.find('.unrevoked__body').text()).toContain('學校的執行環境未能在 AIshie 中撤銷權杖 ais_oldruntimetk…（這個代理在 AIshie 中已停用）')
    expect(w.find('.unrevoked__revoke').text()).toBe('在 AIshie 中撤銷')
  })

  it('revokes it as the owner, the live API token with that prefix in the agent’s list', async () => {
    s.on('GET', CORE.credentials, () =>
      executed({
        credentials: [
          credential({ id: 'cred_revoked', token_prefix: 'oldruntimetk', revoked_at: '2026-09-01T00:00:00Z' }),
          credential({ id: 'cred_session', token_prefix: 'oldruntimetk', kind: 'session' }),
          credential({ id: 'cred_old', token_prefix: 'oldruntimetk', label: 'AIShie runtime' }),
          credential({ id: 'cred_new', token_prefix: 'newruntimetk', label: 'AIShie runtime' }),
        ],
      }),
    )
    const w = await notice()
    await press(w, '.unrevoked__revoke')
    expect(s.to('GET', CORE.credentials)[0].url).toBe(`/v1/me/agents/${ACTOR}/credentials`)
    expect(s.revoked).toEqual(['cred_old'])
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({ type: 'success', message: 'ais_oldruntimetk… is revoked.' })
    expect(w.emitted('done')).toBeTruthy()
    expect(w.emitted('credsChanged')).toBeTruthy()
  })

  it('finds nothing to revoke when the token no longer works', async () => {
    s.on('GET', CORE.credentials, () => executed({ credentials: [] }))
    const w = await notice()
    await press(w, '.unrevoked__revoke')
    expect(s.revoked).toEqual([])
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({
      message: 'ais_oldruntimetk… no longer works: there was nothing to revoke.',
    })
    expect(w.emitted('done')).toBeTruthy()
  })

  it('says to revoke it in the Tokens list when it could not be revoked here either, and stays', async () => {
    s.on('GET', CORE.credentials, () => executed({ credentials: [credential({ id: 'cred_old', token_prefix: 'oldruntimetk' })] }))
    s.on('POST', CORE.revoke, () => json(403, { status: 'denied', action_id: 'a', error: { code: 'forbidden', message: 'no' } }))
    const w = await notice()
    await press(w, '.unrevoked__revoke')
    expect(w.find('.unrevoked__failed').text()).toBe('It could not be revoked here either. Revoke it in the Tokens list below.')
    expect(w.emitted('done')).toBeUndefined()
  })

  it('never revokes the token the runtime holds now', async () => {
    const w = await notice(OLD, { held: 'oldruntimetk' })
    await press(w, '.unrevoked__revoke')
    expect(s.calls).toHaveLength(0)
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({
      type: 'info',
      message: 'The runtime holds ais_oldruntimetk… now, so it was not revoked.',
    })
    expect(w.emitted('done')).toBeTruthy()
  })

  it('can be put aside', async () => {
    const w = await notice()
    await w.find('.unrevoked__later').trigger('click')
    expect(w.emitted('done')).toBeTruthy()
    expect(s.calls).toHaveLength(0)
  })
})
