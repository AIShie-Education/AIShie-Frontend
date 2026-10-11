import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, h, ref } from 'vue'
import { i18n, setLocale } from '@/i18n'
import FilterChips from './FilterChips.vue'
import RefreshButton from './RefreshButton.vue'

const global = { plugins: [i18n, ElementPlus] }

beforeEach(() => setLocale('en'))

function chips(initial = '') {
  const value = ref(initial)
  const w = mount(
    defineComponent({
      setup: () => () =>
        h(FilterChips, {
          modelValue: value.value,
          'onUpdate:modelValue': (v: string) => (value.value = v),
          options: [
            { value: 'published', label: 'Published', count: 7 },
            { value: 'unpublished', label: 'Not published', count: 0 },
          ],
          allCount: 7,
          label: 'Which assignments',
        }),
    }),
    { global },
  )
  return { w, value }
}

describe('FilterChips', () => {
  it('offers "All N" first, then each choice with its count, as radios of a named group', () => {
    const { w } = chips()
    expect(w.find('.filter-chips').attributes()).toMatchObject({ role: 'radiogroup', 'aria-label': 'Which assignments' })
    const all = w.findAll('.filter-chip')
    expect(all.map((c) => c.text())).toEqual(['All 7', 'Published 7', 'Not published 0'])
    expect(all.map((c) => c.attributes('role'))).toEqual(['radio', 'radio', 'radio'])
    expect(all[0]!.attributes('aria-checked')).toBe('true')
    expect(all[0]!.classes()).toContain('el-check-tag')
    // One with nothing in it is marked so (its count is quieter), and none is Element Plus's rounded one.
    expect(all[2]!.classes()).toContain('is-zero')
    for (const c of all) expect(c.classes()).not.toContain('is-round')
  })

  it('chooses one at a time, by a click or from the keyboard, and the chosen one again goes back to all', async () => {
    const { w, value } = chips()
    await w.findAll('.filter-chip')[1]!.trigger('click')
    expect(value.value).toBe('published')
    expect(w.findAll('.filter-chip')[1]!.attributes('aria-checked')).toBe('true')
    // Drawn as chosen by Element Plus's own class, which element.css gives the indigo's tint and line.
    expect(w.findAll('.filter-chip').map((c) => c.classes().includes('is-checked'))).toEqual([false, true, false])
    await w.findAll('.filter-chip')[1]!.trigger('click')
    expect(value.value).toBe('')
    await w.findAll('.filter-chip')[2]!.trigger('keydown', { key: 'Enter' })
    expect(value.value).toBe('unpublished')
    await w.findAll('.filter-chip')[0]!.trigger('keydown', { key: ' ' })
    expect(value.value).toBe('')
  })
})

describe('RefreshButton', () => {
  it('is a text button with its words, never one of a type, and never round', async () => {
    const w = mount(RefreshButton, { props: { loading: false }, global })
    const button = w.find('button')
    expect(button.text()).toBe('Refresh')
    expect(button.classes()).toContain('refresh-button')
    for (const type of ['primary', 'success', 'warning', 'danger', 'info'])
      expect(button.classes()).not.toContain(`el-button--${type}`)
    expect(button.classes()).not.toContain('is-circle')
    await button.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('is a square of its icon alone on a phone’s screen, with its words in its name', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(max-width: 600px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const button = mount(RefreshButton, { global }).find('button')
      expect(button.classes()).toContain('is-icon')
      expect(button.classes()).not.toContain('is-circle')
      expect(button.attributes('aria-label')).toBe('Refresh')
      expect(button.text()).toBe('')
    } finally {
      window.matchMedia = matchMedia
    }
  })
})
