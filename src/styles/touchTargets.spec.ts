import { describe, expect, it } from 'vitest'

const css = Object.values(
  import.meta.glob<string>('./element.css', { query: '?raw', import: 'default', eager: true }),
)[0]!
const start = css.indexOf('@media (pointer: coarse) {')
expect(start).toBeGreaterThanOrEqual(0)
// The next top-level closing brace ends this media block; nested rules close with two spaces.
const touch = css.slice(start, css.indexOf('\n}', start))

function rule(selector: string): string {
  const at = touch.indexOf(`  ${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return touch.slice(at, touch.indexOf('}', at))
}

describe('touch targets (styles/element.css, pointer: coarse only)', () => {
  it('centres segmented-control labels in 44 px targets, 40 small and 48 large', () => {
    expect(touch).toContain('--el-component-size: 44px')
    expect(touch).toContain('--el-component-size-small: 40px')
    expect(touch).toContain('--el-component-size-large: 48px')
    const normal = rule('.el-radio-button__inner')
    expect(normal).toContain('min-height: var(--el-component-size)')
    expect(normal).toContain('align-items: center')
    expect(normal).toContain('justify-content: center')
    expect(rule('.el-radio-button--small .el-radio-button__inner')).toContain(
      'min-height: var(--el-component-size-small)',
    )
    expect(rule('.el-radio-button--large .el-radio-button__inner')).toContain(
      'min-height: var(--el-component-size-large)',
    )
  })

  it('makes every pager button and number at least 40 by 40', () => {
    const pager = rule('.el-pagination .btn-prev,\n  .el-pagination .btn-next,\n  .el-pagination .el-pager li')
    expect(pager).toContain('min-width: 40px')
    expect(pager).toContain('height: 40px')
    expect(pager).toContain('min-height: 40px')
  })

  it('makes every select option at least 44 px tall without clipping wrapped text', () => {
    const option = rule('.el-select-dropdown__item')
    expect(option).toContain('height: auto')
    expect(option).toContain('min-height: 44px')
    expect(option).toContain('align-items: center')
  })
})
