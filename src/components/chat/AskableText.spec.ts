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
    ['zh-Hant', '可提問', '暫停', /^最後連線：3 小時前。目前似乎沒有程式在運行它/],
    ['zh-Hans', '可提问', '暂停', /^最后连接：3 小时前。目前似乎没有程序在运行它/],
  ] as const)('reads naturally in %s, and says when it last connected in its words', (lang, askable, paused, since) => {
    setLocale(lang)
    expect(ask({ last_seen_at: '2026-09-26T11:59:00Z' }).text()).toBe(askable)
    expect(ask({ last_seen_at: null }).text()).toBe(paused)
    expect(ask({ last_seen_at: '2026-09-26T09:00:00Z' }).find('.tip').attributes('data-tip')).toMatch(since)
  })

  it('says whose agent it is first, where the header has no room for it', () => {
    const w = mount(AskableText, {
      props: { who: agent({ last_seen_at: '2026-09-26T11:59:00Z' }), name: 'Lab tutor', whose: 'Your agent' },
      global,
    })
    expect(w.find('.tip').attributes('data-tip')).toBe('Your agent. Something runs it now: a question gets an answer.')
    setLocale('zh-Hant')
    const z = mount(AskableText, {
      props: { who: agent({ last_seen_at: '2026-09-26T11:59:00Z' }), name: 'Lab tutor', whose: '你的代理' },
      global,
    })
    expect(z.find('.tip').attributes('data-tip')).toBe('你的代理。目前有程式在運行它：提問會得到回覆。')
  })

  it('takes focus to show why, except inside a control, which it describes instead', () => {
    expect(ask({ last_seen_at: null }).find('.askable').attributes('tabindex')).toBe('0')
    const w = mount(AskableText, {
      props: { who: agent({ last_seen_at: null }), name: 'Lab tutor', hintId: 'why-1' },
      global,
    })
    expect(w.find('.askable').attributes('tabindex')).toBeUndefined()
    const hidden = w.find('#why-1')
    expect(hidden.attributes('hidden')).toBeDefined()
    expect(hidden.text()).toMatch(/^No token of this agent/)
  })
})
