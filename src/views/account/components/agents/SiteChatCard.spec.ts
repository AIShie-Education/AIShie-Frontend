import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AgentFull } from '@/api/types'

const writes: { tool: string; args: Record<string, unknown> }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return { status: 'executed', actionId: 'a1', reviewState: 'none', result: { ok: true }, replayed: false }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }),
  }
})

const { i18n, setLocale } = await import('@/i18n')
const { default: SiteChatCard } = await import('./SiteChatCard.vue')
const { siteChatState } = await import('./agents')

const global = { plugins: [i18n, ElementPlus], components: icons }

function agent(over: Partial<AgentFull> = {}): AgentFull {
  return {
    actor_id: 'agent-1',
    display_name: 'Study helper',
    created_at: '2026-09-01T00:00:00Z',
    requests: [],
    seats: [],
    site_chat: false,
    status: 'active',
    suspended_by_me: false,
    ...over,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  writes.length = 0
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElMessageBox.confirm).mockReset()
})
enableAutoUnmount(afterEach)

describe('siteChatState', () => {
  it('tells an agent that takes conversations here from one operated from outside', () => {
    expect(siteChatState({ site_chat: true, status: 'active' })).toBe('on')
    expect(siteChatState({ site_chat: false, status: 'active' })).toBe('external')
    // AIshie's runtime hosts it: it says so again when it next starts it.
    expect(siteChatState({ site_chat: false, status: 'active' }, { hosted: true })).toBe('hostedOff')
    expect(siteChatState({ site_chat: false, status: 'suspended' }, { hosted: true })).toBe('suspended')
    expect(siteChatState({ site_chat: true, status: 'active' }, { hosted: true })).toBe('on')
  })
})

describe('SiteChatCard', () => {
  it('tells the owner of an agent operated from outside why nobody may ask it here, and how that would change', () => {
    const w = mount(SiteChatCard, { props: { agent: agent() }, global })
    expect(w.find('.el-tag').text()).toBe('Operated from outside')
    expect(w.findAll('.site-chat__text').map((p) => p.text())).toEqual([
      'This agent is operated from an external tool (such as Claude through MCP); it does not take conversations on the site.',
      'When AIshie’s runtime hosts it, it takes conversations on the site by itself.',
    ])
    // Only what runs it switches them on: the owner is never offered to.
    expect(w.find('button').exists()).toBe(false)
  })

  it('says so in Traditional Chinese', () => {
    setLocale('zh-Hant')
    const w = mount(SiteChatCard, { props: { agent: agent() }, global })
    expect(w.find('.app-card__title').text()).toBe('站內對話')
    expect(w.find('.el-tag').text()).toBe('外部操作')
    expect(w.findAll('.site-chat__text').map((p) => p.text())).toEqual([
      '這個代理是從外部工具操作的（例如 Claude 透過 MCP），不在站內對話。',
      '交由 AIshie 的執行環境代管時，它會自行在站內接受對話。',
    ])
  })

  it('says of a hosted agent switched off that the runtime switches them on again, and offers nothing', () => {
    const w = mount(SiteChatCard, { props: { agent: agent(), hosted: true }, global })
    expect(w.find('.el-tag').text()).toBe('Not taking conversations on the site')
    expect(w.text()).toContain('AIshie’s runtime hosts it, and takes conversations on the site again')
    expect(w.text()).not.toContain('external tool')
    expect(w.find('button').exists()).toBe(false)
  })

  it('switches them off once the owner has confirmed, saying what turns them on again', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    const w = mount(SiteChatCard, { props: { agent: agent({ site_chat: true }) }, global })
    expect(w.find('.el-tag').text()).toBe('Takes conversations on the site')
    await w.find('button').trigger('click')
    await flushPromises()
    const [body, title] = vi.mocked(ElMessageBox.confirm).mock.calls[0]!
    expect(title).toBe('Switch off conversations with Study helper on the site?')
    const said = JSON.stringify(body)
    expect(said).toContain('the next time it starts the agent')
    expect(said).toContain('ending its hosting on AIshie, ends them too')
    expect(writes).toEqual([{ tool: 'agent.update', args: { actor_id: 'agent-1', site_chat: false } }])
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('does nothing when the owner thinks better of it', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const w = mount(SiteChatCard, { props: { agent: agent({ site_chat: true }) }, global })
    await w.find('button').trigger('click')
    await flushPromises()
    expect(writes).toEqual([])
    expect(w.emitted('changed')).toBeUndefined()
  })
})
