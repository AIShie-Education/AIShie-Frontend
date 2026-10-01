// What the views say about agents and the seats they hold as someone's
// delegate. Only for display: who may do what is Core's to decide.
import { AGENT_HOSTINGS, type AgentHosting, type DelegatePreset } from '@/api/types'

/**
 * An agent's hosting as Core says it (agent.get, member.list, the
 * respondents…), or null where it says none this app knows: a person's
 * seat, or a Core from before agents were hosted one way.
 */
export function hostingOf(v: unknown): AgentHosting | null {
  return typeof v === 'string' && (AGENT_HOSTINGS as readonly string[]).includes(v) ? (v as AgentHosting) : null
}

/**
 * What an agent's delegate seat is for: a course agent, which students may
 * ask about the course, or a personal assistant, which answers only its
 * owner.
 */
export type SeatPurpose = 'personal' | 'course'

/**
 * The purpose of a delegate seat. Core records it on the seat as
 * answers_course (chosen at member.add_delegate; only someone who manages
 * the course's members may make it true): true is a course agent, false a
 * personal assistant. Where a record has no such field (a proposal made
 * before Core had it), the built-in preset it names is told instead
 * (course_tutor: a course agent; delegate: a personal assistant); null when
 * neither says.
 */
export function seatPurpose(seat: { answers_course?: boolean | null; preset?: string | null }): SeatPurpose | null {
  if (typeof seat.answers_course === 'boolean') return seat.answers_course ? 'course' : 'personal'
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

/** What member.add_delegate is sent for a purpose: the preset, and whom the agent answers, said outright. */
export function delegateArgsFor(p: SeatPurpose): { preset: DelegatePreset; answers_course: boolean } {
  return { preset: presetForPurpose(p), answers_course: p === 'course' }
}
