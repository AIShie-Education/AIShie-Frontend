// Element Plus's look where the app draws it otherwise (styles/element.css, styles/overlays.css), read as written:
// jsdom computes none of it, and e2e/shapes.spec.ts and e2e/components-style.spec.ts measure it as drawn.
import { describe, expect, it } from 'vitest'

const sheets = import.meta.glob<string>(
  ['./element.css', './overlays.css', './main.css', './chat-prose.css', '../components/sidebar/AccountMenu.vue'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)
const elementCss = sheets['./element.css']!
const overlaysCss = sheets['./overlays.css']!
const accountMenu = sheets['../components/sidebar/AccountMenu.vue']!

/** The declarations of every rule with this selector, as written at the start of a line. */
function ruleIn(css: string, selector: string) {
  const out: string[] = []
  for (let at = css.indexOf(`\n${selector} {`); at >= 0; at = css.indexOf(`\n${selector} {`, at + 1))
    out.push(css.slice(at + selector.length + 3, css.indexOf('}', at)))
  expect(out.length, selector).toBeGreaterThan(0)
  return out.join('\n')
}
const rule = (selector: string) => ruleIn(elementCss, selector)

describe('a field focused (styles/element.css)', () => {
  it('turns its edge navy and doubles it with an outline, a date range’s too', () => {
    const focus = rule(
      '.el-input__wrapper.is-focus,\n.el-textarea__inner:focus,\n.el-select__wrapper.is-focused,\n.el-range-editor.is-active',
    )
    expect(focus).toMatch(/box-shadow: 0 0 0 1px var\(--app-focus\) inset;/)
    expect(focus).toMatch(/outline: 1px solid var\(--app-focus\);/)
  })

  it('in error, doubles the danger’s edge in the danger’s red, never in the navy beside it', () => {
    const at = elementCss.indexOf('\n.el-form-item.is-error\n  :is(')
    expect(at).toBeGreaterThanOrEqual(0)
    const error = elementCss.slice(at, elementCss.indexOf('}', at))
    for (const field of [
      '.el-input__wrapper.is-focus',
      '.el-textarea__inner:focus',
      '.el-select__wrapper.is-focused',
      '.el-range-editor.is-active',
    ])
      expect(error).toContain(field)
    expect(error).toMatch(/outline-color: var\(--el-color-danger\);/)
  })
})

describe('what floats over the page', () => {
  it('is framed in a control’s edge, 3:1, not in the line: a popper and its arrow', () => {
    const popper = rule('.el-popper.is-light,\n.el-popper.is-light > .el-popper__arrow::before')
    expect(popper).toMatch(/border-color: var\(--app-control-border\);/)
  })

  it('is framed so as a dialog, a message box, a notification and the account’s menu (styles/overlays.css)', () => {
    expect(ruleIn(overlaysCss, '.el-dialog,\n.el-message-box')).toMatch(/box-shadow: 0 0 0 1px var\(--app-control-border\);/)
    expect(ruleIn(overlaysCss, '.el-notification')).toMatch(/--el-notification-border-color: var\(--app-control-border\);/)
    expect(overlaysCss).not.toMatch(/0 0 0 1px var\(--app-line\)/)
    const menu = accountMenu.replace(/^[\s\S]*<style scoped>/, '')
    expect(ruleIn(menu, '.account-menu')).toMatch(/border: 1px solid var\(--app-control-border\);/)
    expect(ruleIn(menu, '.account-menu__sub')).toMatch(/border: 1px solid var\(--app-control-border\);/)
  })
})

describe('Element Plus’s small round shapes, squared', () => {
  it('gives a closable tag’s close button the app’s corner, not a disc', () => {
    expect(rule('.el-tag .el-tag__close')).toMatch(/border-radius: var\(--app-radius\);/)
  })
})

describe('a quotation in rendered Markdown (main.css, chat-prose.css)', () => {
  it('is set apart by a rule in a control’s edge, 3:1 or more, not the indigo’s faint line', () => {
    expect(ruleIn(sheets['./main.css']!, '.markdown-body blockquote')).toMatch(
      /border-left: 2px solid var\(--app-control-border\);/,
    )
    expect(ruleIn(sheets['./chat-prose.css']!, '.markdown-body.chat-prose blockquote')).toMatch(
      /border-left: 3px solid var\(--app-control-border\);/,
    )
    for (const css of [sheets['./main.css']!, sheets['./chat-prose.css']!])
      expect(css).not.toMatch(/blockquote \{[^}]*--app-indigo-line/)
  })
})
