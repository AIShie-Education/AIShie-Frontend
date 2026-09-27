import { describe, expect, it } from 'vitest'
import { delegateArgsFor, presetForPurpose, seatPurpose } from './agents'

describe('seatPurpose', () => {
  it('reads what the seat records first', () => {
    expect(seatPurpose({ answers_course: true })).toBe('course')
    expect(seatPurpose({ answers_course: false })).toBe('personal')
    // The record wins over the preset: a course_tutor seat can answer its owner alone.
    expect(seatPurpose({ answers_course: false, preset: 'course_tutor' })).toBe('personal')
    expect(seatPurpose({ answers_course: true, preset: 'tutor' })).toBe('course')
  })
  it('tells a course agent from a personal assistant by its preset where nothing is recorded', () => {
    expect(seatPurpose({ preset: 'course_tutor' })).toBe('course')
    expect(seatPurpose({ answers_course: null, preset: 'delegate' })).toBe('personal')
  })
  it('does not guess for any other preset', () => {
    expect(seatPurpose({ preset: 'tutor' })).toBeNull()
    expect(seatPurpose({ preset: null })).toBeNull()
    expect(seatPurpose({})).toBeNull()
  })
  it('round-trips with presetForPurpose and delegateArgsFor', () => {
    expect(seatPurpose({ preset: presetForPurpose('course') })).toBe('course')
    expect(seatPurpose({ preset: presetForPurpose('personal') })).toBe('personal')
    expect(delegateArgsFor('course')).toEqual({ preset: 'course_tutor', answers_course: true })
    expect(delegateArgsFor('personal')).toEqual({ preset: 'delegate', answers_course: false })
    expect(seatPurpose(delegateArgsFor('course'))).toBe('course')
  })
})
