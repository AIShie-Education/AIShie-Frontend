import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import MarkdownView from './MarkdownView.vue'

const global = { plugins: [i18n] }

describe('MarkdownView with nothing written', () => {
  it('says so as every empty place does (AppEmpty), in its size and ink, not a paragraph of its own', () => {
    const w = mount(MarkdownView, { props: { source: '  ', empty: 'No description has been written yet.' }, global })
    expect(w.find('.markdown-body').exists()).toBe(false)
    const empty = w.find('.app-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.classes()).toContain('app-empty--inline')
    expect(empty.find('.app-empty__text').text()).toBe('No description has been written yet.')
    w.unmount()
  })

  it('draws nothing where it was given nothing to say', () => {
    const w = mount(MarkdownView, { props: { source: '' }, global })
    expect(w.find('.app-empty').exists()).toBe(false)
    expect(w.text()).toBe('')
    w.unmount()
  })

  it('renders what is written', () => {
    const w = mount(MarkdownView, { props: { source: '**Hi**', empty: 'Nothing' }, global })
    expect(w.find('.markdown-body strong').text()).toBe('Hi')
    expect(w.find('.app-empty').exists()).toBe(false)
    w.unmount()
  })
})
