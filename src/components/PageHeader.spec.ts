import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n } from '@/i18n'
import PageHeader from './PageHeader.vue'

const global = { plugins: [i18n, ElementPlus] }

// Its style as written, and one rule of it by its selector.
const style = Object.values(
  import.meta.glob<string>('./PageHeader.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')
const rule = (selector: string) => {
  const at = style.indexOf(`\n${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return style.slice(at, style.indexOf('}', at))
}

describe('PageHeader', () => {
  it('sets its subtitle under the title in the third ink, as wide as the actions leave it, never at the measure', () => {
    const w = mount(PageHeader, { props: { title: 'Members', subtitle: 'Everyone in the course.' }, global })
    expect(w.find('h1').text()).toBe('Members')
    expect(w.find('.page-header__subtitle').text()).toBe('Everyone in the course.')
    const subtitle = rule('.page-header__subtitle')
    expect(subtitle).toMatch(/color:\s*var\(--app-ink-3\);/)
    // A lede beside the actions, not running text: stopped at the measure (442 px at its 13 px), it took a
    // second line on nearly every course page, whose content then started past 200 px (e2e/course-header.spec.ts).
    expect(style).not.toMatch(/__subtitle[^{]*\{[^}]*max-width/)
  })
})
