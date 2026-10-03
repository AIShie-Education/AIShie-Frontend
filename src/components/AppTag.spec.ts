import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { Monitor } from '@element-plus/icons-vue'
import AppTag from './AppTag.vue'

const global = { plugins: [ElementPlus] }
const tag = (props: Record<string, unknown> = {}, slot = 'Words') =>
  mount(AppTag, { props, slots: { default: slot }, global })

describe('AppTag', () => {
  it('draws a state as a tinted solid pill in its tone’s colours', () => {
    for (const [tone, type] of [
      ['done', 'success'],
      ['danger', 'danger'],
      ['wait', 'warning'],
      ['neutral', 'info'],
      ['indigo', 'primary'],
    ] as const) {
      const t = tag({ tone }).find('.el-tag')
      expect(t.classes()).toEqual(expect.arrayContaining(['app-tag', 'app-tag--pill', `is-${tone}`, `el-tag--${type}`]))
      expect(t.classes()).toContain('el-tag--light')
    }
  })

  it('draws an identity or an attribute as an outline with its icon, in no tone', () => {
    const t = tag({ variant: 'outline', tone: 'done', icon: Monitor }).find('.el-tag')
    expect(t.classes()).toEqual(expect.arrayContaining(['app-tag--outline', 'el-tag--plain', 'el-tag--info']))
    expect(t.classes()).not.toContain('is-done')
    expect(t.find('.app-tag__icon svg').exists()).toBe(true)
    expect(t.find('.app-tag__icon').attributes('aria-hidden')).toBe('true')
  })

  it('is dark only as a count', () => {
    expect(tag({ variant: 'count', tone: 'indigo' }, '3').find('.el-tag').classes()).toContain('el-tag--dark')
    for (const variant of ['pill', 'outline'])
      expect(tag({ variant }).find('.el-tag').classes()).not.toContain('el-tag--dark')
  })

  it('says the usual state quietly, as plain text and no tag', () => {
    const w = tag({ variant: 'quiet' }, 'Published')
    expect(w.find('.el-tag').exists()).toBe(false)
    expect(w.find('.app-tag--quiet').text()).toBe('Published')
  })

  it('can be closed, as a filter shown as a tag is', async () => {
    const w = tag({ variant: 'outline', closable: true })
    await w.find('.el-tag__close').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
