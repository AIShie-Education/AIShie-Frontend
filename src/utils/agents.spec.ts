import { describe, expect, it } from 'vitest'
import { presetForPurpose, seatPurpose } from './agents'

describe('seatPurpose', () => {
  it('tells a course agent from a personal assistant by its preset', () => {
    expect(seatPurpose({ preset: 'course_tutor' })).toBe('course')
    expect(seatPurpose({ preset: 'delegate' })).toBe('personal')
  })
  it('does not guess for any other preset', () => {
    expect(seatPurpose({ preset: 'tutor' })).toBeNull()
    expect(seatPurpose({ preset: null })).toBeNull()
    expect(seatPurpose({})).toBeNull()
  })
  it('round-trips with presetForPurpose', () => {
    expect(seatPurpose({ preset: presetForPurpose('course') })).toBe('course')
    expect(seatPurpose({ preset: presetForPurpose('personal') })).toBe('personal')
  })
})
