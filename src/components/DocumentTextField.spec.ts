import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import DocumentTextField from './DocumentTextField.vue'

beforeEach(() => setLocale('en'))
enableAutoUnmount(afterEach)

function field(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const w = mount(DocumentTextField, {
    props: {
      modelValue: '',
      'onUpdate:modelValue': (v: string) => w.setProps({ modelValue: v }),
      open: false,
      'onUpdate:open': (v: boolean) => w.setProps({ open: v }),
      ...props,
    },
    slots: slots as never,
    global: { plugins: [i18n, ElementPlus], components: icons },
  })
  return w
}

describe('DocumentTextField', () => {
  it('is one line to open, until the text is wanted', async () => {
    const w = field()
    const toggle = w.find('.doc-text__toggle')
    expect(toggle.text()).toBe('Add a text note (optional)')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    const shown = () => (w.find('.doc-text__editor').element as HTMLElement).style.display !== 'none'
    expect(shown()).toBe(false)
    expect(w.find(`#${toggle.attributes('aria-controls')}`).exists()).toBe(true)

    await toggle.trigger('click')
    expect(w.props('open')).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(shown()).toBe(true)
    await w.find('textarea').setValue('## Reading guide')
    expect(w.props('modelValue')).toBe('## Reading guide')
  })

  it('says what the text is once there is some, in the caller’s words where it has them', async () => {
    const w = field({ modelValue: 'Read chapter 4.' })
    expect(w.find('.doc-text__toggle').text()).toBe('Text note (15 characters)')
    await w.setProps({ summary: 'Text: version 2’s, as it is (15 characters).' })
    expect(w.find('.doc-text__toggle').text()).toBe('Text: version 2’s, as it is (15 characters).')
  })

  it('puts the caller’s actions on its line, and opens nothing while disabled', async () => {
    const w = field({ disabled: true }, { actions: () => h('button', { class: 'leave-out' }, 'Leave the text out') })
    expect(w.find('.doc-text__line .leave-out').exists()).toBe(true)
    expect(w.find('.doc-text__toggle').attributes('disabled')).toBeDefined()
  })
})
