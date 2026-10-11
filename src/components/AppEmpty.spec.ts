import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { ApiError } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import AppEmpty from './AppEmpty.vue'
import AppResult from './AppResult.vue'
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

describe('AsyncState', () => {
  const failing = (status: number, code: string) =>
    mount(AsyncState, { props: { error: new ApiError({ status, code, message: 'Down' }) }, global })

  it('says what went wrong at the left, as an AppResult: its title after a glyph of what it is, in the refused colour', () => {
    setLocale('en')
    // A lock for a refusal, a warning for what is not there, a cross for a failure: each its own glyph.
    const glyphs = new Set<string>()
    for (const [status, code, title, kind] of [
      [403, 'forbidden', 'You do not have permission to see this.', 'forbidden'],
      [404, 'not_found', 'Not found. It may have been removed, or it is outside what you can see.', 'missing'],
      [500, 'internal', 'Something went wrong', 'failed'],
    ] as const) {
      const w = failing(status, code)
      const result = w.findComponent(AppResult)
      expect(result.props('kind')).toBe(kind)
      expect(w.find('.el-result').classes()).toEqual(expect.arrayContaining(['async-state__result', 'app-result']))
      expect(w.find('.app-result__title').text()).toBe(title)
      // On the title's line, before its words, never Element Plus's icon on a filled circle over it.
      const glyph = w.find('.app-result__title > .app-result__glyph')
      expect(glyph.exists()).toBe(true)
      expect(glyph.attributes('aria-hidden')).toBe('true')
      glyphs.add(glyph.html())
    }
    expect(glyphs.size).toBe(3)
    // Its look is every result's now, not AsyncState's own: nothing of Element Plus's result is restyled here.
    expect(asyncStyle.slice(asyncStyle.indexOf('<style'))).not.toMatch(/el-result/)
  })

  it('offers Retry after a failure alone: the indigo’s words after their icon, never a second solid button', async () => {
    setLocale('en')
    for (const [status, code] of [
      [403, 'forbidden'],
      [404, 'not_found'],
    ] as const)
      expect(failing(status, code).find('.async-state__retry').exists()).toBe(false)
    const failed = failing(500, 'internal')
    const retry = failed.find('.async-state__retry')
    expect(retry.text()).toBe('Retry')
    // A text button of the indigo's rank, with an icon: pressable at a glance, on a phone too, with no ground.
    expect(retry.classes()).toEqual(expect.arrayContaining(['el-button--primary', 'is-text']))
    expect(retry.find('svg').exists()).toBe(true)
    // Its icon in the glyph's column: the room at its left taken back by as much outside it.
    expect(asyncStyle).toMatch(
      /\.el-button\.async-state__retry \{\s*padding-inline: var\(--app-space-sm\);\s*margin-inline-start: calc\(-1 \* var\(--app-space-sm\)\);/,
    )
    await retry.trigger('click')
    expect(failed.emitted('retry')).toHaveLength(1)
  })
})
