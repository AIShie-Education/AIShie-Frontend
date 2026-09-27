// What the views say about agents and the seats they hold as someone's
// delegate. Only for display: who may do what is Core's to decide.
import type { DelegatePreset } from '@/api/types'

/**
 * What an agent's delegate seat is for: a course agent, which students may
 * ask about the course, or a personal assistant, which answers only its
 * owner.
 */
export type SeatPurpose = 'personal' | 'course'

/**
 * The purpose of a delegate seat, told for now from the built-in preset it
 * was seated with (course_tutor: a course agent; delegate: a personal
 * assistant). Null for a seat seated otherwise, whose purpose cannot be told.
 *
 * TODO(answers_course): Core is to record the purpose on the seat itself, a
 * boolean chosen at member.add_delegate (true: a course agent students may
 * ask). Once the catalogue has it, read it here first and keep the preset as
 * the fallback for seats made before it; member.add_delegate's dialog then
 * sends it.
 */
export function seatPurpose(seat: { preset?: string | null }): SeatPurpose | null {
  switch (seat.preset) {
    case 'course_tutor':
      return 'course'
    case 'delegate':
      return 'personal'
  }
  return null
}

/** The preset member.add_delegate is given for a purpose. */
export function presetForPurpose(p: SeatPurpose): DelegatePreset {
  return p === 'course' ? 'course_tutor' : 'delegate'
}
