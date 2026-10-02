import { describe, expect, it } from 'vitest'

// The Chinese messages put no space between a placeholder, or a figure, and
// the Han characters beside it: "{owner}的代理", never "{owner} 的代理",
// which shows as 「林老師 的代理」; 「1個學期」 as 「{n}個學期」 is, never
// 「1 個學期」. The page puts the room between Han and a Latin name or a
// figure itself (text-autospace, styles/main.css).
const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/zh-*/*.ts', { eager: true })

const SPACED = /\}\s+\p{Script=Han}|\p{Script=Han}\s+\{/u
/** Nor around a figure written in the message, so that 「1個學期」 and 「{n}個學期」 read alike. */
const SPACED_FIGURE = /\p{Script=Han}\s+\d|\d\s+\p{Script=Han}/u

function leaves(tree: unknown, path: string, out: [string, string][]) {
  if (typeof tree === 'string') out.push([path, tree])
  else if (tree && typeof tree === 'object')
    for (const [k, v] of Object.entries(tree)) leaves(v, path ? `${path}.${k}` : k, out)
  return out
}

describe('the Chinese messages', () => {
  const files = Object.entries(modules)

  it('are all read', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it.each(files.map(([p, m]) => [p.replace('./messages/', ''), m.default] as const))(
    '%s puts no space between a placeholder and the Han characters beside it',
    (_, tree) => {
      const spaced = leaves(tree, '', []).filter(([, text]) => SPACED.test(text))
      expect(spaced).toEqual([])
    },
  )

  it.each(files.map(([p, m]) => [p.replace('./messages/', ''), m.default] as const))(
    '%s puts no space between a figure and the Han characters beside it',
    (_, tree) => {
      const spaced = leaves(tree, '', []).filter(([, text]) => SPACED_FIGURE.test(text))
      expect(spaced).toEqual([])
    },
  )

  it('a message that does is caught', () => {
    expect(SPACED_FIGURE.test('沒有學期 | 1 個學期 | {n}個學期')).toBe(true)
    expect(SPACED_FIGURE.test('最多 64 個字元')).toBe(true)
    expect(SPACED_FIGURE.test('沒有學期 | 1個學期 | {n}個學期')).toBe(false)
    expect(SPACED_FIGURE.test('Keycloak 17之前')).toBe(false)
    expect(SPACED.test('{owner} 的代理')).toBe(true)
    expect(SPACED.test('代表 {owner} 行事')).toBe(true)
    expect(SPACED.test('{owner}的代理')).toBe(false)
    expect(SPACED.test('輸入{input} · 輸出{output}')).toBe(false)
  })
})
