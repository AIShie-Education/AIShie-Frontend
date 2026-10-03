import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { defineComponent, h, nextTick } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { useUiStore } from '@/stores/ui'
import TimeText from './TimeText.vue'

// The tooltip, laid out in place: what it says (its content, or its content slot) apart from what it is on.
const TooltipStub = defineComponent({
  name: 'ElTooltip',
  props: { content: { type: String, default: '' } },
  setup:
    (p, { slots }) =>
    () =>
      h('span', { class: 'tip' }, [
        h('span', { class: 'tip__says' }, slots.content ? slots.content() : p.content),
        h('span', { class: 'tip__on' }, slots.default?.()),
      ]),
})
const global = { plugins: [i18n, ElementPlus], stubs: { ElTooltip: TooltipStub } }

// Due on 8 October at 23:59 in Hong Kong: 15:59 UTC.
const DUE = '2026-10-08T15:59:00Z'

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
  vi.setSystemTime(new Date('2026-10-03T04:00:00Z'))
  vi.stubEnv('TZ', 'Asia/Hong_Kong')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  setLocale('en')
})
enableAutoUnmount(afterEach)

const shown = (w: ReturnType<typeof mount>) => w.find('.tip__on').text()
const tip = (w: ReturnType<typeof mount>) => w.findAll('.tip__says .time-text__tip').map((s) => s.text())

describe('TimeText', () => {
  it('shows a time on the reader’s clock, and how long ago or how soon on hover, with no zone or UTC', () => {
    const w = mount(TimeText, { props: { value: DUE }, global })
    expect(shown(w)).toBe('2026-10-08 23:59')
    expect(w.find('.tip__says').text()).toBe('in 5 days')
    expect(w.text()).not.toContain('UTC')
  })

  it('names the zone of a cut-off, and gives the exact UTC on hover', () => {
    const w = mount(TimeText, { props: { value: DUE, cutoff: true }, global })
    expect(shown(w)).toBe('2026-10-08 23:59 (Hong Kong Standard Time)')
    expect(w.find('time').attributes('datetime')).toBe(DUE)
    expect(tip(w)).toEqual(['in 5 days', '2026-10-08 15:59 UTC'])
  })

  it('shown relative, a cut-off has its time, zone and UTC on hover', () => {
    const w = mount(TimeText, { props: { value: DUE, cutoff: true, relative: true }, global })
    expect(shown(w)).toBe('in 5 days')
    expect(tip(w)).toEqual(['2026-10-08 23:59 (Hong Kong Standard Time)', '2026-10-08 15:59 UTC'])
  })

  it('is on the clock of wherever the reader is, its zone as it is that day', () => {
    vi.stubEnv('TZ', 'Europe/London')
    const w = mount(TimeText, { props: { value: DUE, cutoff: true }, global })
    expect(shown(w)).toBe('2026-10-08 16:59 (British Summer Time)')
    expect(tip(w)[1]).toBe('2026-10-08 15:59 UTC')
  })

  it.each([
    ['zh-Hant', '香港標準時間 2026-10-08 23:59', '5 天內'],
    ['zh-Hans', '香港标准时间 2026-10-08 23:59', '5 天内'],
  ] as const)('writes a cut-off as %s does, and follows the language when it changes', async (lang, text, rel) => {
    const w = mount(TimeText, { props: { value: DUE, cutoff: true }, global })
    useUiStore().locale = lang
    await nextTick()
    await nextTick()
    expect(shown(w)).toBe(text)
    expect(tip(w)).toEqual([rel, '2026-10-08 15:59 UTC'])
  })

  it('is a dash for no time', () => {
    const w = mount(TimeText, { props: { value: null, cutoff: true }, global })
    expect(w.text()).toBe('—')
  })
})
