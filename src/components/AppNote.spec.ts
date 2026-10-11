import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import AppNote from './AppNote.vue'

const global = { plugins: [i18n, ElementPlus] }

// Its style as written, and one rule of it by its selector.
const style = Object.values(
  import.meta.glob<string>('./AppNote.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')
const rule = (selector: string) => {
  const at = style.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return style.slice(at, style.indexOf('}', at))
}

beforeEach(() => setLocale('en'))

describe('AppNote', () => {
  it('explains with no icon, a note to a screen reader, never an alert', () => {
    const w = mount(AppNote, { slots: { default: 'Students see only what is published.' }, global })
    expect(w.attributes('role')).toBe('note')
    expect(w.find('svg').exists()).toBe(false)
    expect(w.find('.el-alert').exists()).toBe(false)
    expect(w.find('.app-note__body').text()).toBe('Students see only what is published.')
    expect(w.find('.app-note__title').exists()).toBe(false)
    expect(w.classes()).not.toContain('is-plain')
  })

  it('is a rule at its left and words at the measure, with no ground in either form and no corners', () => {
    const note = rule('.app-note')
    expect(note).toMatch(/border-left:\s*2px solid var\(--app-indigo-line\);/)
    expect(note).toMatch(/max-width:\s*var\(--app-measure\);/)
    expect(note).toMatch(/line-height:\s*var\(--app-lh-text\);/)
    expect(note).not.toMatch(/background|border-radius/)
    // plain, kept for the places that ask for it, draws nothing of its own.
    expect(style).not.toMatch(/is-plain/)
    expect(mount(AppNote, { props: { plain: true }, slots: { default: 'x' }, global }).classes()).toContain('is-plain')
  })

  it('puts a title, given or in its slot, above the words', () => {
    const w = mount(AppNote, { props: { title: 'An agent never outranks its owner' }, slots: { default: 'Body' }, global })
    expect(w.find('.app-note__title').text()).toBe('An agent never outranks its owner')
    const s = mount(AppNote, { slots: { title: '<b>Rules</b>', default: 'Body' }, global })
    expect(s.find('.app-note__title b').text()).toBe('Rules')
  })

  it('can be closed by a square button named for it, where it says what was just done', async () => {
    const square = rule('.app-note__close')
    expect(square).toMatch(/width:\s*28px;/)
    expect(square).toMatch(/height:\s*28px;/)
    expect(square).toMatch(/border-radius:\s*var\(--app-radius\);/)
    const w = mount(AppNote, { props: { closable: true }, slots: { default: 'Proposed.' }, global })
    const close = w.find('button.app-note__close')
    expect(close.attributes('aria-label')).toBe('Close')
    await close.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(mount(AppNote, { slots: { default: 'x' }, global }).find('button').exists()).toBe(false)
  })
})
