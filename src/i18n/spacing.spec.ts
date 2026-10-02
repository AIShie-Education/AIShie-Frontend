import { describe, expect, it } from 'vitest'

// The Chinese messages put no space between a placeholder and the Han
// characters beside it: "{owner}的代理", never "{owner} 的代理", which
// shows as 「林老師 的代理」. The page puts the room between Han and a Latin
// name or a figure itself (text-autospace, styles/main.css).
const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/zh-*/*.ts', { eager: true })

const SPACED = /\}\s+\p{Script=Han}|\p{Script=Han}\s+\{/u

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

  it('a message that does is caught', () => {
    expect(SPACED.test('{owner} 的代理')).toBe(true)
    expect(SPACED.test('代表 {owner} 行事')).toBe(true)
    expect(SPACED.test('{owner}的代理')).toBe(false)
    expect(SPACED.test('輸入{input} · 輸出{output}')).toBe(false)
  })
})
