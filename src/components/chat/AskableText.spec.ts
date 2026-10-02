import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'
import { i18n, setLocale } from '@/i18n'
import AskableText from './AskableText.vue'

const TooltipStub = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' } },
  setup:
    (p, { slots }) =>
    () =>
      h('span', { class: 'tip', 'data-tip': p.content }, slots.default?.()),
})
const global = { plugins: [i18n, ElementPlus], stubs: { ElTooltip: TooltipStub } }
const agent = (extra: Record<string, unknown>) => ({ kind: 'agent', answer_level: 'autonomous', ...extra })
const ask = (who: Record<string, unknown>) =>
  mount(AskableText, { props: { who: agent(who), name: 'Lab tutor' }, global })

beforeEach(() => {
  setLocale('en')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())
enableAutoUnmount(afterEach)

describe('AskableText', () => {
  it('says it can be asked while something runs it, in plain ink', () => {
    const w = ask({ last_seen_at: '2026-09-26T11:59:00Z' })
    expect(w.text()).toBe('Can be asked')
    expect(w.find('.askable').classes()).not.toContain('is-paused')
    expect(w.text()).not.toMatch(/online/i)
  })

  it.each([
    [{ last_seen_at: '2026-09-26T09:00:00Z' }, /^Last connected 3 hours ago/],
    [{ last_seen_at: null }, /^No token of this agent/],
    [{ last_seen_at: '2026-09-26T11:59:00Z', seat_status: 'paused' }, /^Lab tutor is paused/],
    [{ last_seen_at: '2026-09-26T11:59:00Z', answer_level: 'denied' }, /^Lab tutor is not answering/],
  ])('says paused otherwise, and why on hover: %j', (who, why) => {
    const w = ask(who)
    expect(w.text()).toBe('Paused')
    expect(w.find('.askable').classes()).toContain('is-paused')
    expect(w.find('.tip').attributes('data-tip')).toMatch(why)
  })

  it.each([
    ['zh-Hant', '可提問', '暫停'],
    ['zh-Hans', '可提问', '暂停'],
  ] as const)('reads naturally in %s', (lang, askable, paused) => {
    setLocale(lang)
    expect(ask({ last_seen_at: '2026-09-26T11:59:00Z' }).text()).toBe(askable)
    expect(ask({ last_seen_at: null }).text()).toBe(paused)
  })
})
