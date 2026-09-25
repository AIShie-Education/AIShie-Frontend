// Exact arithmetic on the decimal strings a grading form holds. Scores are
// typed as text and sent as text; adding them up as floats would turn 0.1 and
// 0.2 into 0.30000000000000004.
import { isDecimal } from '@/utils/format'

function parts(s: string): { neg: boolean; int: string; frac: string } {
  const t = s.trim()
  const neg = t.startsWith('-')
  const [int = '', frac = ''] = t.replace(/^[-+]/, '').split('.')
  return { neg, int: int || '0', frac }
}

/** The exact sum of decimal strings, or null when one of them is not a decimal. */
export function sumDecimals(values: string[]): string | null {
  if (values.some((v) => !isDecimal(v))) return null
  const ps = values.map(parts)
  const scale = Math.max(0, ...ps.map((p) => p.frac.length))
  let total = 0n
  for (const p of ps) {
    const n = BigInt(p.int + p.frac.padEnd(scale, '0'))
    total += p.neg ? -n : n
  }
  const neg = total < 0n
  const digits = (neg ? -total : total).toString().padStart(scale + 1, '0')
  const int = digits.slice(0, digits.length - scale)
  const frac = digits.slice(digits.length - scale).replace(/0+$/, '')
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`
}

/** Is s a decimal of 0 or more? */
export function isNonNegativeDecimal(s: string | null | undefined): boolean {
  return isDecimal(s) && (!/^\s*-/.test(String(s)) || Number(s) === 0)
}

/** a > b, for decimals that fit a float closely enough to compare (scores do). */
export function decimalAbove(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a === 'string' && !isDecimal(a)) return false
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x > y
}
