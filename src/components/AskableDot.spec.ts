import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import AskableDot from './AskableDot.vue'
import source from './AskableDot.vue?raw'

const global = { plugins: [i18n, ElementPlus] }
const dot = (props: InstanceType<typeof AskableDot>['$props']) =>
  mount(AskableDot, { props, global }).find('.askable-dot')

/** The declarations of every rule of the dot's style whose selector names `state`. */
function declarationsFor(state: string): string {
  const css = source.slice(source.indexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector!.split(',').some((s) => s.trim() === `.askable-dot.is-${state}`))
    .map(([, , body]) => body)
    .join('\n')
}

beforeEach(() => setLocale('en'))

describe('AskableDot', () => {
  it('says, to those who manage an agent hosted on AIshie, whether it can be asked, in words a screen reader reads', () => {
    const on = dot({ hosting: 'runtime', siteChat: true })
    expect(on.classes()).toContain('is-on')
    expect(on.attributes('aria-label')).toBe('Can be asked on the site')
    const off = dot({ hosting: 'runtime', siteChat: false })
    expect(off.classes()).toContain('is-off')
    expect(off.attributes('aria-label')).toBe('Not running')
  })

  it('says nothing of an agent with MCP access, nor of one whose state is not known', () => {
    expect(dot({ hosting: 'mcp', siteChat: false }).exists()).toBe(false)
    expect(dot({ hosting: 'runtime', siteChat: null }).exists()).toBe(false)
  })

  it('tells whether it can be asked by its shape, never by its hue alone: a dot while it can, a ring while it cannot', () => {
    // A filled dot in the ink.
    expect(declarationsFor('on')).toBe('')
    expect(source).toMatch(/\.askable-dot \{[^}]*background: var\(--app-ink-2\)/)
    // Paused, and not running (which wants its owner, in amber): rings, their ground left empty.
    for (const state of ['paused', 'off']) expect(declarationsFor(state), state).toMatch(/background: transparent/)
    expect(declarationsFor('off')).toMatch(/border-color: var\(--app-wait-fg\)/)
  })

  it('is out of the tab order inside a control, its words in a hidden element for the control to name', () => {
    const w = mount(AskableDot, { props: { hosting: 'runtime', siteChat: false, hintId: 'row-1-ask' }, global })
    expect(w.find('.askable-dot').attributes('tabindex')).toBeUndefined()
    expect(w.find('#row-1-ask').text()).toBe('AIshie is not running it just now, so nobody can ask it on the site.')
  })
})
