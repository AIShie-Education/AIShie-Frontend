import { describe, expect, it } from 'vitest'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import { elementLocale } from './elementPlus'

/** A group of Element Plus's messages, as the strings they are. */
const group = (l: { el: Record<string, unknown> }, name: string) => l.el[name] as Record<string, string>

describe('elementLocale', () => {
  it('gives Element Plus its zh-TW, with the table labels it leaves in English translated', () => {
    const l = elementLocale('zh-Hant')
    expect(l.name).toBe(zhTw.name)
    expect(group(l, 'table').sortLabel).toBe('按「{column}」排序')
    expect(group(l, 'table').selectAllLabel).not.toMatch(/[A-Za-z]/)
    // What zh-TW already has is kept.
    expect(group(l, 'table').emptyText).toBe(group(zhTw, 'table').emptyText)
    expect(l.el.pagination).toEqual(zhTw.el.pagination)
  })

  it('gives English in English, leaving {column} for Element Plus to fill in', () => {
    const l = elementLocale('en')
    expect(l.name).toBe('en')
    expect(group(l, 'table').sortLabel).toBe('Sort by {column}')
    expect(group(l, 'table').filterLabel).toBe('Filter by {column}')
  })
})
