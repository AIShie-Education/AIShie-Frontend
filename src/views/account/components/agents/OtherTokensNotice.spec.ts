import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import type { OtherTokens } from '@/api/runtime-types'
import OtherTokensNotice from './OtherTokensNotice.vue'
import { ACTOR, CORE, Servers, credential, executed, json, otherToken, otherTokens } from './hostingFakes'

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

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

async function notice(others: OtherTokens | null | undefined, props: Record<string, unknown> = {}) {
  const w = mount(OtherTokensNotice, { props: { actorId: ACTOR, others, ...props }, global, attachTo: document.body })
  await flushPromises()
  return w
}

async function revoke(w: VueWrapper, i: number) {
  await w.findAll('.other-tokens__revoke')[i].trigger('click')
  await flushPromises()
  await vi.waitFor(() => expect(w.find('.other-tokens__revoke.is-loading').exists()).toBe(false))
  await flushPromises()
}

const BUSY = () =>
  otherTokens([
    otherToken({ prefix: 'k7v2m4qhx3ab', label: 'my laptop', last_used_at: minutesAgo(3), recent: true }),
    otherToken({ prefix: 'oldoldoldold', label: 'old laptop', last_used_at: minutesAgo(600) }),
    otherToken({ prefix: 'nevernevernv', label: null, last_used_at: null }),
  ])

describe('OtherTokensNotice: a token in use', () => {
  it('warns in the words the contract suggests, naming the token used last and when', async () => {
    const w = await notice(BUSY())
    const alert = w.find('.other-tokens')
    expect(w.find('.el-alert--warning').exists()).toBe(true)
    expect(alert.text()).toContain('This agent seems to be running somewhere else')
    expect(w.find('.other-tokens__body').text()).toBe(
      'Its token ais_k7v2m4qhx3ab… was used 3 minutes ago. An agent has one brain at a time. Stop the other runtime, or revoke that token in AIShie, so that only this runtime answers as your agent.',
    )
  })

  it('lists every token by its prefix, label and last use, and offers to revoke each', async () => {
    const w = await notice(BUSY())
    const rows = w.findAll('.other-tokens__token')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('ais_k7v2m4qhx3ab…')
    expect(rows[0].text()).toContain('my laptop')
    expect(rows[0].text()).toContain('In use')
    expect(rows[0].text()).toContain('last used')
    expect(rows[1].text()).toContain('old laptop')
    expect(rows[1].text()).not.toContain('In use')
    expect(rows[2].text()).toContain('No label')
    expect(rows[2].text()).toContain('never used')
    expect(w.findAll('.other-tokens__revoke').map((b) => b.text())).toEqual(['Revoke', 'Revoke', 'Revoke'])
    // Nothing is revoked unless asked.
    expect(s.to('POST', CORE.revoke)).toHaveLength(0)
  })

  it('revokes one as the owner, found by its prefix among the agent’s tokens, and says so', async () => {
    s.on('GET', CORE.credentials, () =>
      executed({
        credentials: [
          credential({ id: 'cred_old_revoked', token_prefix: 'k7v2m4qhx3ab', revoked_at: minutesAgo(60) }),
          credential({ id: 'cred_laptop', token_prefix: 'k7v2m4qhx3ab' }),
          credential({ id: 'cred_other', token_prefix: 'oldoldoldold' }),
        ],
      }),
    )
    const w = await notice(BUSY())
    await revoke(w, 0)
    expect(s.to('GET', CORE.credentials)[0].url).toBe(`/v1/me/agents/${ACTOR}/credentials`)
    expect(s.revoked).toEqual(['cred_laptop'])
    expect(w.emitted('revoked')).toEqual([['k7v2m4qhx3ab']])
    expect(w.emitted('credsChanged')).toBeTruthy()
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({
      type: 'success',
      message: 'ais_k7v2m4qhx3ab… is revoked: nothing can act as your agent with it now.',
    })
  })

  it('takes a token that no longer works for gone, with nothing to revoke', async () => {
    s.on('GET', CORE.credentials, () => executed({ credentials: [] }))
    const w = await notice(BUSY())
    await revoke(w, 1)
    expect(s.revoked).toEqual([])
    expect(w.emitted('revoked')).toEqual([['oldoldoldold']])
    expect(vi.mocked(ElMessage).mock.calls[0][0]).toMatchObject({
      message: 'ais_oldoldoldold… no longer works: there was nothing to revoke.',
    })
  })

  it('says so on its row when it could not be revoked, and keeps it', async () => {
    s.on('GET', CORE.credentials, () => executed({ credentials: [credential({ id: 'cred_laptop', token_prefix: 'k7v2m4qhx3ab' })] }))
    s.on('POST', CORE.revoke, () => json(403, { status: 'denied', action_id: 'a', error: { code: 'forbidden', message: 'no' } }))
    const w = await notice(BUSY())
    await revoke(w, 0)
    expect(w.emitted('revoked')).toBeUndefined()
    expect(w.findAll('.other-tokens__token')[0].text()).toContain(
      'It could not be revoked. Try again, or revoke it in the Tokens list below.',
    )
  })

  it('says it in Traditional Chinese too', async () => {
    setLocale('zh-Hant')
    const w = await notice(BUSY())
    expect(w.find('.other-tokens').text()).toContain('這個代理似乎正在其他地方運行')
    expect(w.find('.other-tokens__body').text()).toContain('它的權杖 ais_k7v2m4qhx3ab… 最近一次使用是 3 分鐘前')
    expect(w.find('.other-tokens__body').text()).toContain('代理同一時間只能有一個「大腦」')
    expect(w.findAll('.other-tokens__revoke')[0].text()).toBe('撤銷')
  })
})

describe('OtherTokensNotice: tokens that still work, unused', () => {
  it('is a quieter note, listing them with the same revoke', async () => {
    const quiet = otherTokens([otherToken({ prefix: 'oldoldoldold', label: 'old laptop', last_used_at: minutesAgo(600) })])
    expect(quiet.in_use).toBe(false)
    const w = await notice(quiet)
    const alert = w.find('.other-tokens')
    expect(w.find('.el-alert--info').exists()).toBe(true)
    expect(w.find('.el-alert--warning').exists()).toBe(false)
    expect(alert.classes()).toContain('is-unused')
    expect(alert.text()).toContain('This agent has other tokens')
    expect(w.find('.other-tokens__body').text()).toBe(
      'They still work, but have not been used lately. Revoke any that nothing of yours needs.',
    )
    expect(w.text()).not.toContain('running somewhere else')
    expect(w.findAll('.other-tokens__revoke')).toHaveLength(1)
  })
})

describe('OtherTokensNotice: nothing to say', () => {
  it('says nothing when there are no other tokens', async () => {
    const w = await notice(otherTokens([]))
    expect(w.find('.other-tokens').exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('says nothing when they could not be checked, or a muted line where asked', async () => {
    const w = await notice(null)
    expect(w.text()).toBe('')
    const asked = await notice(null, { sayUnknown: true })
    expect(asked.find('.other-tokens__unknown').text()).toBe('Could not check for other copies of this agent.')
    expect(asked.find('.el-alert').exists()).toBe(false)
    // Not asked yet (undefined) is not "could not check".
    expect((await notice(undefined, { sayUnknown: true })).text()).toBe('')
  })

  it('can be put away once the agent is connected', async () => {
    const w = await notice(BUSY(), { closable: true })
    await w.find('.el-alert__close-btn').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
