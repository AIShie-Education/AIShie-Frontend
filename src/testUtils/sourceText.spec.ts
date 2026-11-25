import { describe, expect, it } from 'vitest'

/** Blank comments outside strings, regular expressions and template literals, preserving every line and column. */
export function withoutComments(text: string): string {
  const out = text.split('')
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (text[i] !== '\n') out[i] = ' '
  }
  const regexBefore = new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'new', 'yield', 'await', 'else', 'do'])

  function quoted(from: number, quote: string): number {
    for (let i = from + 1; i < text.length; i++) {
      if (text[i] === '\\') i++
      else if (text[i] === quote) return i + 1
    }
    return text.length
  }

  function regexp(from: number): number {
    let inClass = false
    for (let i = from + 1; i < text.length; i++) {
      const c = text[i]!
      if (c === '\\') i++
      else if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) {
        while (/[a-z]/i.test(text[i + 1] ?? '')) i++
        return i + 1
      } else if (c === '\n') return i
    }
    return text.length
  }

  function template(from: number): number {
    for (let i = from + 1; i < text.length; i++) {
      const c = text[i]!
      if (c === '\\') i++
      else if (c === '`') return i + 1
      else if (c === '$' && text[i + 1] === '{') i = code(i + 2, true)
    }
    return text.length
  }

  function code(from: number, inTemplate = false): number {
    let previous = 'start'
    let braces = 0
    for (let i = from; i < text.length; i++) {
      const c = text[i]!
      const next = text[i + 1]
      if (/\s/.test(c)) continue
      if (text.startsWith('<!--', i)) {
        const close = text.indexOf('-->', i + 4)
        const end = close < 0 ? text.length : close + 3
        blank(i, end)
        i = end - 1
        continue
      }
      if (c === '/' && (next === '/' || next === '*')) {
        const line = next === '/'
        const close = text.indexOf(line ? '\n' : '*/', i + 2)
        const end = close < 0 ? text.length : line ? close : close + 2
        blank(i, end)
        i = end - 1
        continue
      }
      if (c === "'" || c === '"') {
        i = quoted(i, c) - 1
        previous = 'operand'
        continue
      }
      if (c === '`') {
        i = template(i) - 1
        previous = 'operand'
        continue
      }
      if (c === '}' && inTemplate && braces === 0) return i
      if (c === '{') braces++
      else if (c === '}' && braces > 0) braces--
      if (/[A-Za-z0-9_$]/.test(c)) {
        let end = i + 1
        while (/[\w$]/.test(text[end] ?? '')) end++
        const word = text.slice(i, end)
        previous = regexBefore.has(word) ? 'operator' : 'operand'
        i = end - 1
        continue
      }
      if (c === '/' && (previous === 'start' || previous === 'operator')) {
        i = regexp(i) - 1
        previous = 'operand'
        continue
      }
      previous = c === ')' || c === ']' || c === '}' ? 'operand' : 'operator'
    }
    return text.length
  }

  code(0)
  return out.join('')
}

describe('the source comment lexer used by the guards', () => {
  it('does not treat comment markers in strings or regular expressions as comments', () => {
    const source = "const glob = './messages/*/*.ts'; const slashOrStar = /[/*]/; const label = `${n}%`"
    const out = withoutComments(source)
    expect(out).toContain('./messages/*/*.ts')
    expect(out).toContain('/[/*]/')
    expect(out).toContain('${n}%')
  })

  it('strips real comments inside nested template expressions and keeps nested literals', () => {
    const source = 'const label = `${ok ? /* comment */ `${n}%` : "/*"} /assets/*\n${m}%`'
    const out = withoutComments(source)
    expect(out).not.toContain('comment')
    expect(out).toContain('`${n}%`')
    expect(out).toContain('${m}%')
  })

  it('strips block and line comments while keeping their lines', () => {
    const out = withoutComments('const a = 1 /* gone */ // too\nconst b = 2')
    expect(out).not.toContain('gone')
    expect(out).not.toContain('too')
    expect(out.split('\n')).toHaveLength(2)
    expect(out).toContain('const b = 2')
  })
})
