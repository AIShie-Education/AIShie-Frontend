import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { CircleCheck, CircleClose, Clock, Lock, Warning } from '@element-plus/icons-vue'
import AppResult, { type ResultKind } from './AppResult.vue'

const global = { plugins: [ElementPlus] }

// Its style as written: jsdom lays nothing out.
const style = Object.values(
  import.meta.glob<string>('./AppResult.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')
const rule = (selector: string) => {
  const at = style.indexOf(`\n${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return style.slice(at, style.indexOf('}', at))
}

describe('AppResult', () => {
  it('says what it is by a glyph on its title’s line, before its words, never Element Plus’s icon on a circle', () => {
    const cases: [ResultKind, unknown][] = [
      ['forbidden', Lock],
      ['missing', Warning],
      ['failed', CircleClose],
      ['waiting', Clock],
      ['done', CircleCheck],
    ]
    for (const [kind, icon] of cases) {
      const w = mount(AppResult, { props: { kind, title: 'Not found', subTitle: 'It may have been removed.' }, global })
      expect(w.classes()).toEqual(expect.arrayContaining(['el-result', 'app-result', `app-result--${kind}`]))
      expect(w.find('.app-result__title').text()).toBe('Not found')
      expect(w.find('.el-result__subtitle').text()).toBe('It may have been removed.')
      const glyph = w.find('.app-result__title > .app-result__glyph')
      expect(glyph.attributes('aria-hidden')).toBe('true')
      expect(glyph.findComponent(icon as never).exists(), kind).toBe(true)
      // Element Plus's own icon, which it draws whatever it is given, is never shown (element.css; styles/elementOverrides.spec.ts).
    }
  })

  it('draws the glyph in the outcome’s colour: refused, failed or missing in red, waiting in amber, done in green', () => {
    expect(rule('.app-result__glyph')).toMatch(/color: var\(--app-danger-fg\);/)
    expect(rule('.app-result--waiting .app-result__glyph')).toMatch(/color: var\(--app-wait-fg\);/)
    expect(rule('.app-result--done .app-result__glyph')).toMatch(/color: var\(--app-done-fg\);/)
    expect(style).not.toMatch(/__glyph \{[^}]*background/)
  })

  it('keeps the glyph on the first line of a title that wraps, at that line’s middle', () => {
    // The title's lines start at its top, not about its middle; the glyph is a line of the title tall.
    expect(rule('.app-result__title')).toMatch(/align-items: flex-start;/)
    expect(rule('.app-result__glyph')).toMatch(/height: 1lh;\s*line-height: inherit;/)
  })

  it('passes its words, and what to do about it, through its slots', () => {
    const w = mount(AppResult, {
      props: { kind: 'done', title: 'Your password is set' },
      slots: { 'sub-title': '<p class="mine">You can sign in.</p>', extra: '<button>Continue</button>' },
      global,
    })
    expect(w.find('.el-result__subtitle .mine').text()).toBe('You can sign in.')
    expect(w.find('.el-result__extra button').text()).toBe('Continue')
    const bare = mount(AppResult, { props: { kind: 'failed', title: 'x' }, global })
    expect(bare.find('.el-result__subtitle').exists()).toBe(false)
    expect(bare.find('.el-result__extra').exists()).toBe(false)
  })
})
