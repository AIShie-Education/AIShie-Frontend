// The submissions page's lists on a phone: rows between rules, the first under the section's own rule, never a
// second rule of the list's own 16 px under it (docs/CONVENTIONS.md, "Building a view"). Read as written: jsdom
// lays nothing out; e2e/screens-style.spec.ts photographs the page at a phone's width.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(
  ['./SubmissionsView.vue', './components/RosterTable.vue', './components/GroupRoster.vue'],
  { query: '?raw', import: 'default', eager: true },
)
const styleOf = (file: string) => sources[file]!.replace(/^[\s\S]*<style scoped>/, '')
function rule(file: string, selector: string) {
  const css = styleOf(file)
  const at = css.indexOf(`\n${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}

describe('the submissions page’s lists on a phone', () => {
  it('lays the work handed in under the section’s rule, with none of its own over the first row', () => {
    expect(rule('./SubmissionsView.vue', '.submission-cards')).not.toMatch(/border-top/)
    expect(rule('./SubmissionsView.vue', '.submission-cards > li')).toMatch(/border-bottom: var\(--app-rule\);/)
  })

  it('keeps a rule over the roster’s first row under its chips, and none where nothing is over the rows', () => {
    const file = './components/RosterTable.vue'
    expect(rule(file, '.roster-cards')).toMatch(/border-top: var\(--app-rule\);/)
    expect(rule(file, '.roster-summary:empty')).toMatch(/padding: 0;/)
    const css = styleOf(file)
    const at = css.indexOf('\n.roster:not(')
    expect(at).toBeGreaterThanOrEqual(0)
    const selector = css.slice(at + 1, css.indexOf('{', at)).trim()
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/border-top: none;/)

    // The selector, tried on the three ways the list is laid: alone, after a note, and under the group roster.
    const lay = (html: string) => {
      const box = document.createElement('div')
      box.innerHTML = html
      return box.querySelector('.roster-cards')!.matches(selector)
    }
    const list = '<div class="roster-summary"><!--v-if--></div><ul class="roster-cards"></ul>'
    expect(lay(`<div class="roster"><div class="async-state">${list}</div></div>`)).toBe(true)
    expect(lay(`<div class="roster"><div class="app-note roster__notice"></div><div class="async-state">${list}</div></div>`)).toBe(
      false,
    )
    expect(lay(`<div class="group-roster"><div class="roster"><div class="async-state">${list}</div></div></div>`)).toBe(false)
    expect(
      lay('<div class="roster"><div class="roster-summary"><span>All 3</span></div><ul class="roster-cards"></ul></div>'),
    ).toBe(false)
  })

  it('keeps the group roster’s rule over its first row, under its choice of view', () => {
    expect(rule('./components/GroupRoster.vue', '.group-cards')).toMatch(/border-top: var\(--app-rule\);/)
  })
})
