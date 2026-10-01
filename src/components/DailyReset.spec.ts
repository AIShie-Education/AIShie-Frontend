import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { defineComponent, h, nextTick } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { useUiStore } from '@/stores/ui'
import DailyReset from './DailyReset.vue'

const TooltipStub = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' } },
  setup:
    (p, { slots }) =>
    () =>
      h('span', { class: 'tip', 'data-tip': p.content }, slots.default?.()),
})
const global = { plugins: [i18n, ElementPlus], stubs: { ElTooltip: TooltipStub } }

beforeEach(() => {
  // jsdom has no matchMedia, which the UI store (for the theme) asks.
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setActivePinia(createPinia())
  setLocale('en')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
  vi.stubEnv('TZ', 'Asia/Hong_Kong')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setLocale('en')
})
enableAutoUnmount(afterEach)

describe('DailyReset', () => {
  it('says when the counts start again on the reader’s clock, the zone named, and the exact UTC on hover', () => {
    const w = mount(DailyReset, { props: { since: '2026-10-01T00:00:00Z' }, global })
    expect(w.text()).toBe('08:00 (Hong Kong Standard Time)')
    expect(w.find('time').attributes('datetime')).toBe('2026-10-02T00:00:00.000Z')
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-02 00:00 UTC')
  })

  it('follows the runtime’s day, should it start at another hour', () => {
    const w = mount(DailyReset, { props: { since: '2026-09-30T16:00:00Z' }, global })
    expect(w.text()).toBe('00:00 (Hong Kong Standard Time)')
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-01 16:00 UTC')
  })

  it('is the next 00:00 UTC where the runtime names no day', () => {
    const w = mount(DailyReset, { global })
    expect(w.text()).toBe('08:00 (Hong Kong Standard Time)')
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-02 00:00 UTC')
  })

  it('moves on to the next one by itself once it has passed, on a page left open', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-01T23:59:50Z'))
    const w = mount(DailyReset, { global })
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-02 00:00 UTC')
    vi.advanceTimersByTime(30_000)
    await nextTick()
    expect(w.find('time').attributes('datetime')).toBe('2026-10-03T00:00:00.000Z')
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-03 00:00 UTC')
    expect(w.text()).toBe('08:00 (Hong Kong Standard Time)')
  })

  it('is in the reader’s own time zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const w = mount(DailyReset, { global })
    expect(w.text()).toBe('17:00 (Pacific Daylight Time)')
    expect(w.find('.tip').attributes('data-tip')).toBe('2026-10-02 00:00 UTC')
  })

  it('names the zone in the page’s language, and follows it when it changes', async () => {
    const w = mount(DailyReset, { global })
    useUiStore().locale = 'zh-Hant'
    await nextTick()
    await nextTick()
    expect(w.text()).toBe('香港標準時間 08:00')
    useUiStore().locale = 'zh-Hans'
    await nextTick()
    await nextTick()
    expect(w.text()).toBe('香港标准时间 08:00')
  })
})
