import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { Monitor } from '@element-plus/icons-vue'
import AppTag from './AppTag.vue'

const global = { plugins: [ElementPlus] }
const tag = (props: Record<string, unknown> = {}, slot = 'Words') =>
  mount(AppTag, { props, slots: { default: slot }, global })

// The component's own style, as written (docs/CONVENTIONS.md, "Tags"): every tag is a rectangle.
const style = Object.values(
  import.meta.glob<string>('./AppTag.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')

describe('AppTag', () => {
  it('draws a state, the default, on its tone’s tint', () => {
    for (const [tone, type] of [
      ['done', 'success'],
      ['danger', 'danger'],
      ['wait', 'warning'],
      ['neutral', 'info'],
      ['indigo', 'primary'],
    ] as const) {
      const t = tag({ tone }).find('.el-tag')
      expect(t.classes()).toEqual(
        expect.arrayContaining(['app-tag', 'app-tag--state', `is-${tone}`, `el-tag--${type}`]),
      )
      expect(t.classes()).toContain('el-tag--light')
    }
  })

  it('sets no corner of its own: every tag’s is element.css’s, the app’s 2 px', () => {
    // As the browser draws them, every tag's corners are measured in e2e/components-style.spec.ts.
    expect(style).not.toMatch(/radius/)
  })

  it('draws an identity or an attribute as an outline with its icon, in no tone', () => {
    const t = tag({ variant: 'outline', tone: 'done', icon: Monitor }).find('.el-tag')
    expect(t.classes()).toEqual(expect.arrayContaining(['app-tag--outline', 'el-tag--plain', 'el-tag--info']))
    expect(t.classes()).not.toContain('is-done')
    expect(t.find('.app-tag__icon svg').exists()).toBe(true)
    expect(t.find('.app-tag__icon').attributes('aria-hidden')).toBe('true')
  })

  it('is solid only as a count, and a count is the indigo whatever tone it is given', () => {
    for (const tone of ['indigo', 'danger', 'neutral'] as const) {
      const t = tag({ variant: 'count', tone }, '3').find('.el-tag')
      expect(t.classes()).toEqual(expect.arrayContaining(['app-tag--count', 'el-tag--dark', 'el-tag--primary']))
      expect(t.classes()).not.toContain(`is-${tone}`)
    }
    for (const variant of ['state', 'outline'])
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
