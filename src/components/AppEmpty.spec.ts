import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import AppEmpty from './AppEmpty.vue'
import AsyncState from './AsyncState.vue'

const global = { plugins: [i18n, ElementPlus] }

describe('AppEmpty', () => {
  it('says it in one line inside a card, with no picture, and what to do about it after', () => {
    const w = mount(AppEmpty, { props: { text: 'No materials yet.' }, slots: { default: '<button>Add one</button>' }, global })
    expect(w.classes()).toContain('app-empty--inline')
    expect(w.find('svg').exists()).toBe(false)
    expect(w.find('.app-empty__text').text()).toBe('No materials yet.')
    expect(w.find('.app-empty__more button').text()).toBe('Add one')
    // Nothing after it where nothing is given.
    expect(mount(AppEmpty, { props: { text: 'x' }, global }).find('.app-empty__more').exists()).toBe(false)
  })

  it('fills a page with the brand’s line icon over its title and words', () => {
    const w = mount(AppEmpty, { props: { text: 'Pick a student.', title: 'Nobody chosen', page: true }, global })
    expect(w.classes()).toContain('app-empty--page')
    const icon = w.find('svg.app-empty__icon')
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(icon.attributes('stroke-width')).toBe('1.75')
    expect(w.find('.app-empty__title').text()).toBe('Nobody chosen')
    expect(w.find('.app-empty__text').text()).toBe('Pick a student.')
  })

  it('is what AsyncState shows when there is nothing, never Element Plus’s grey box', () => {
    setLocale('en')
    const w = mount(AsyncState, { props: { empty: true, emptyText: 'No links yet.' }, global })
    expect(w.find('.el-empty').exists()).toBe(false)
    expect(w.find('.app-empty--inline .app-empty__text').text()).toBe('No links yet.')
    expect(w.find('.app-empty__more').exists()).toBe(false)
    const page = mount(AsyncState, {
      props: { empty: true, emptyPage: true },
      slots: { empty: '<a href="/admin">Administration</a>' },
      global,
    })
    expect(page.find('.app-empty--page .app-empty__text').text()).toBe('Nothing here yet')
    expect(page.find('.app-empty__more a').text()).toBe('Administration')
  })
})
