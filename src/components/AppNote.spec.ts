import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import AppNote from './AppNote.vue'

const global = { plugins: [i18n, ElementPlus] }

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

  it('puts a title, given or in its slot, above the words', () => {
    const w = mount(AppNote, { props: { title: 'An agent never outranks its owner' }, slots: { default: 'Body' }, global })
    expect(w.find('.app-note__title').text()).toBe('An agent never outranks its owner')
    const s = mount(AppNote, { slots: { title: '<b>Rules</b>', default: 'Body' }, global })
    expect(s.find('.app-note__title b').text()).toBe('Rules')
  })

  it('can be closed by a button named for it, where it says what was just done', async () => {
    const w = mount(AppNote, { props: { closable: true }, slots: { default: 'Proposed.' }, global })
    const close = w.find('button.app-note__close')
    expect(close.attributes('aria-label')).toBe('Close')
    await close.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(mount(AppNote, { slots: { default: 'x' }, global }).find('button').exists()).toBe(false)
  })
})
