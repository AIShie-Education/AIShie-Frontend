import { describe, expect, it } from 'vitest'
import { byteLength, passwordProblem } from './password'

describe('passwordProblem', () => {
  it('takes 10 to 1024 bytes', () => {
    expect(passwordProblem('')).toBe('short')
    expect(passwordProblem('123456789')).toBe('short')
    expect(passwordProblem('1234567890')).toBeNull()
    expect(passwordProblem('x'.repeat(1024))).toBeNull()
    expect(passwordProblem('x'.repeat(1025))).toBe('long')
  })

  it('counts bytes, as Core does: four Chinese characters are twelve', () => {
    expect(byteLength('密碼安全')).toBe(12)
    expect(passwordProblem('密碼安全')).toBeNull()
    expect(passwordProblem('密碼')).toBe('short')
  })
})
