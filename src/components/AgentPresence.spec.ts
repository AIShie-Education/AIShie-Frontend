import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h } from 'vue'
import { i18n, setLocale } from '@/i18n'
import AgentBadge from './AgentBadge.vue'
import PresenceText from './PresenceText.vue'

const TooltipStub = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' } },
  setup:
    (p, { slots }) =>
    () =>
      h('span', { class: 'tip', 'data-tip': p.content }, slots.default?.()),
})
const global = { plugins: [i18n, ElementPlus], components: icons, stubs: { ElTooltip: TooltipStub } }

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())
// Registered after, so run before: every mounted text lets go of the shared clock first.
enableAutoUnmount(afterEach)

describe('PresenceText', () => {
  it('says never connected, online, or when last seen', async () => {
    expect(mount(PresenceText, { props: { value: null }, global }).text()).toBe('Never connected')
    expect(mount(PresenceText, { props: { value: '2026-09-26T11:59:00Z' }, global }).text()).toBe('Online')
    expect(mount(PresenceText, { props: { value: '2026-09-26T09:00:00Z' }, global }).text()).toBe(
      'Last seen 3 hours ago',
    )
  })

  it('stops saying online as time passes', async () => {
    const w = mount(PresenceText, { props: { value: '2026-09-26T12:00:00Z' }, global })
    expect(w.text()).toBe('Online')
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000)
    expect(w.text()).toMatch(/^Last seen/)
  })

  it('reads naturally in Traditional Chinese', () => {
    setLocale('zh-Hant')
    expect(mount(PresenceText, { props: { value: null }, global }).text()).toBe('從未連線')
    expect(mount(PresenceText, { props: { value: '2026-09-26T11:59:30Z' }, global }).text()).toBe('在線')
  })
})

describe('AgentBadge', () => {
  it('names whose agent it is, and nothing for a person', () => {
    expect(mount(AgentBadge, { props: { kind: 'agent' }, global }).text()).toBe('Agent')
    expect(mount(AgentBadge, { props: { kind: 'agent', ownerName: 'Yuki' }, global }).text()).toBe('Yuki’s agent')
    expect(mount(AgentBadge, { props: { mine: true, ownerName: 'Yuki' }, global }).text()).toBe('Your agent')
    expect(mount(AgentBadge, { props: { kind: 'human', ownerName: 'Yuki' }, global }).text()).toBe('')
  })

  it('says a delegate never holds more than its owner', () => {
    const w = mount(AgentBadge, { props: { ownerName: 'Yuki' }, global })
    expect(w.find('.tip').attributes('data-tip')).toContain('never with more than their seat')
  })
})
