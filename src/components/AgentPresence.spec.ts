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
  // Said of a program that connects, never as a person who is online.
  it('says never connected, connected, or when it last connected', async () => {
    expect(mount(PresenceText, { props: { value: null }, global }).text()).toBe('Never connected')
    expect(mount(PresenceText, { props: { value: '2026-09-26T11:59:00Z' }, global }).text()).toBe('Connected')
    expect(mount(PresenceText, { props: { value: '2026-09-26T09:00:00Z' }, global }).text()).toBe(
      'Last connected 3 hours ago',
    )
  })

  it('stops saying connected as time passes', async () => {
    const w = mount(PresenceText, { props: { value: '2026-09-26T12:00:00Z' }, global })
    expect(w.text()).toBe('Connected')
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000)
    expect(w.text()).toMatch(/^Last connected/)
  })

  it('has no dot of colour', () => {
    const w = mount(PresenceText, { props: { value: '2026-09-26T11:59:00Z' }, global })
    expect(w.find('.presence__dot').exists()).toBe(false)
  })

  it('reads naturally in Traditional Chinese', () => {
    setLocale('zh-Hant')
    expect(mount(PresenceText, { props: { value: null }, global }).text()).toBe('從未連線')
    expect(mount(PresenceText, { props: { value: '2026-09-26T11:59:30Z' }, global }).text()).toBe('已連線')
  })
})

describe('AgentBadge', () => {
  const owner = (props: Record<string, unknown>) => mount(AgentBadge, { props, global }).find('.agent-badge__owner')
  const ai = (props: Record<string, unknown>) => mount(AgentBadge, { props, global }).find('.ai-badge')

  it('says AI, and nothing for a person', () => {
    expect(ai({ kind: 'agent' }).text()).toBe('AI')
    expect(mount(AgentBadge, { props: { kind: 'human', ownerName: 'Yuki' }, global }).text()).toBe('')
  })

  it('names whose agent it is', () => {
    expect(owner({ kind: 'agent' }).exists()).toBe(false)
    expect(owner({ kind: 'agent', ownerName: 'Yuki' }).text()).toBe('Yuki’s agent')
    expect(owner({ mine: true, ownerName: 'Yuki' }).text()).toBe('Your agent')
  })

  it('leaves the AI out where the name says it already', () => {
    expect(ai({ mine: true, noAi: true }).exists()).toBe(false)
    expect(owner({ mine: true, noAi: true }).text()).toBe('Your agent')
    expect(mount(AgentBadge, { props: { noAi: true }, global }).text()).toBe('')
  })

  it('says AI in every language', () => {
    setLocale('zh-Hant')
    expect(ai({ kind: 'agent' }).text()).toBe('AI')
    setLocale('zh-Hans')
    expect(ai({ kind: 'agent' }).text()).toBe('AI')
  })

  it('says a delegate never holds more than its owner', () => {
    const w = mount(AgentBadge, { props: { ownerName: 'Yuki' }, global })
    expect(w.find('.tip').attributes('data-tip')).toContain('never with more than their seat')
  })
})
