import { describe, expect, it } from 'vitest'
import { isLoginId, loginIdProblem, MAX_LOGIN_ID } from './loginId'

describe('loginIdProblem', () => {
  it('takes 1 to 64 letters, digits, dots, hyphens and underscores, trimmed', () => {
    expect(loginIdProblem('20231234')).toBeNull()
    expect(loginIdProblem('  s-2023.x_1  ')).toBeNull()
    expect(loginIdProblem('A'.repeat(MAX_LOGIN_ID))).toBeNull()
  })
  it('says what is wrong', () => {
    expect(loginIdProblem('')).toBe('empty')
    expect(loginIdProblem('   ')).toBe('empty')
    expect(loginIdProblem('a'.repeat(MAX_LOGIN_ID + 1))).toBe('long')
    expect(loginIdProblem('chan@example.edu')).toBe('email')
    expect(loginIdProblem('2023 1234')).toBe('chars')
    expect(loginIdProblem('學號123')).toBe('chars')
  })
  it('tells a login ID from what is not one', () => {
    expect(isLoginId(' S2023001 ')).toBe(true)
    expect(isLoginId('chan@example.edu')).toBe(false)
    expect(isLoginId('two words')).toBe(false)
  })
})
