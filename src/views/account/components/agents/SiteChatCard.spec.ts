import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { AgentFull } from '@/api/types'
import { i18n, setLocale } from '@/i18n'
import SiteChatCard from './SiteChatCard.vue'

const global = { plugins: [i18n, ElementPlus], components: icons }

function agent(over: Partial<AgentFull> = {}): AgentFull {
  return {
    actor_id: 'agent-1',
    display_name: 'Study helper',
    created_at: '2026-09-01T00:00:00Z',
    hosting: 'runtime',
    requests: [],
    seats: [],
    site_chat: false,
    status: 'active',
    suspended_by_me: false,
    ...over,
  }
}

beforeEach(() => setLocale('en'))
enableAutoUnmount(afterEach)

const card = (over: Partial<AgentFull> = {}) => mount(SiteChatCard, { props: { agent: agent(over) }, global })

describe('SiteChatCard', () => {
  it('says people can ask an agent AIshie runs now, and what stops that; it switches nothing', () => {
    const w = card({ site_chat: true })
    expect(w.find('.app-card__title').text()).toBe('Questions on the site')
    expect(w.find('.el-tag').text()).toBe('Can be asked on the site')
    expect(w.findAll('.site-chat__text').map((p) => p.text())).toEqual([
      'People in its courses can ask it on the site: AIshie’s runtime runs it now.',
      'To stop people asking it, pause its hosting, or suspend it.',
    ])
    expect(w.find('button').exists()).toBe(false)
  })

  it('says nobody can ask one hosted on AIshie that the runtime does not run now', () => {
    const w = card()
    expect(w.find('.el-tag').text()).toBe('Not running')
    expect(w.find('.site-chat__text').text()).toContain('AIshie’s runtime is not running it')
    expect(w.find('button').exists()).toBe(false)
  })

  it('says nobody asks a suspended agent', () => {
    expect(card({ status: 'suspended' }).find('.site-chat__text').text()).toBe(
      'Nobody can ask it on the site while it is suspended.',
    )
  })

  it('says one with MCP access is never asked on the site, and what is', () => {
    const w = card({ hosting: 'mcp' })
    expect(w.find('.el-tag').text()).toBe('MCP access')
    expect(w.find('.site-chat__text').text()).toBe(
      'Nobody can ask it on the site: it has MCP access, and is used from your own tools. An agent people ask here is one created as hosted on AIshie.',
    )
  })

  it('says so in Traditional and Simplified Chinese', () => {
    setLocale('zh-Hant')
    expect(card({ site_chat: true }).find('.el-tag').text()).toBe('可在站內提問')
    expect(card().find('.el-tag').text()).toBe('未在執行')
    expect(card({ hosting: 'mcp' }).find('.site-chat__text').text()).toContain('站內無法向它提問')
    setLocale('zh-Hans')
    expect(card({ site_chat: true }).find('.el-tag').text()).toBe('可在站内提问')
    expect(card().find('.el-tag').text()).toBe('未在运行')
  })
})
