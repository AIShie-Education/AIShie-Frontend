import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { ApiError } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import AppEmpty from './AppEmpty.vue'
import AsyncState from './AsyncState.vue'

const global = { plugins: [i18n, ElementPlus] }

// Its style as written, and one rule of it by its selector.
const style = Object.values(
  import.meta.glob<string>('./AppEmpty.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')
const asyncStyle = Object.values(
  import.meta.glob<string>('./AsyncState.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!
const rule = (selector: string) => {
  const at = style.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return style.slice(at, style.indexOf('}', at))
}

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

  it('fills a page with its title over its words, at the page’s left, and no picture', () => {
    const w = mount(AppEmpty, { props: { text: 'Pick a student.', title: 'Nobody chosen', page: true }, global })
    expect(w.classes()).toContain('app-empty--page')
    // An illustration over an empty place is a template's; the amber light is the wordmark's alone.
    expect(w.find('svg').exists()).toBe(false)
    expect(w.findAll('.app-empty > p').map((p) => p.classes()[0])).toEqual(['app-empty__title', 'app-empty__text'])
    expect(w.find('.app-empty__title').text()).toBe('Nobody chosen')
    expect(w.find('.app-empty__text').text()).toBe('Pick a student.')
    // Left-aligned, as the page's text is, never centred under an icon; its words at the measure.
    const page = rule('.app-empty--page')
    expect(page).toMatch(/align-items:\s*flex-start;/)
    expect(page).toMatch(/text-align:\s*start;/)
    expect(page).toMatch(/max-width:\s*var\(--app-measure\);/)
    expect(page).not.toMatch(/center/)
    expect(style).not.toMatch(/--app-light/)
  })

  it('is what AsyncState shows when there is nothing, never Element Plus’s grey box; a failure offers Retry as a text button', () => {
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
    // Not a second solid button beside the page's own.
    const failed = mount(AsyncState, {
      props: { error: new ApiError({ status: 500, code: 'internal', message: 'Down' }) },
      global,
    })
    // Said at the left with no icon on a filled circle over it (AsyncState's own style).
    expect(failed.find('.el-result').classes()).toContain('async-state__result')
    expect(asyncStyle).toMatch(/\.async-state__result :deep\(\.el-result__icon\) \{\s*display: none;/)
    expect(asyncStyle).toMatch(/\.el-result\.async-state__result \{[^}]*text-align: start;/)
    const retry = failed.find('.async-state__retry')
    expect(retry.text()).toBe('Retry')
    expect(retry.classes().filter((c) => /^el-button--(primary|success|warning|danger|info)$/.test(c))).toEqual([])
  })
})
