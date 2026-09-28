import { describe, expect, it } from 'vitest'
import { resetPasswordOffer, roleChangeBlock, roleChangeEffect, ROSTER_ROLES } from './roles'

const person = { id: 's1', kind: 'human', principal_member_id: null }
const caller = { memberId: 'me', principalMemberId: null }

describe('roleChangeEffect', () => {
  it('says a student made anything else leaves the roster, keeping their work', () => {
    expect(roleChangeEffect('student', 'ta')).toBe('leavesRoster')
    expect(roleChangeEffect('student', 'instructor')).toBe('leavesRoster')
  })
  it('says anyone made a student joins it', () => {
    expect(roleChangeEffect('ta', 'student')).toBe('joinsRoster')
    expect(roleChangeEffect('observer', 'student')).toBe('joinsRoster')
  })
  it('says only the name changes between staff roles, and nothing for the same role', () => {
    expect(roleChangeEffect('ta', 'instructor')).toBe('nameOnly')
    expect(roleChangeEffect('ta', 'ta')).toBeNull()
  })
  it('offers student, TA and instructor, in that order', () => {
    expect(ROSTER_ROLES).toEqual(['student', 'ta', 'instructor'])
  })
})

describe('roleChangeBlock', () => {
  it('offers a change of a person’s seat', () => {
    expect(roleChangeBlock(person, caller, true)).toBeNull()
  })
  it('never offers it on one’s own seat', () => {
    expect(roleChangeBlock({ ...person, id: 'me' }, caller, true)).toBe('self')
  })
  it('never offers it on a delegate’s seat, nor any agent’s', () => {
    expect(roleChangeBlock({ ...person, kind: 'agent', principal_member_id: 'p1' }, caller, true)).toBe('delegateSeat')
    expect(roleChangeBlock({ ...person, kind: 'agent' }, caller, true)).toBe('agent')
  })
  it('keeps a delegate off the seat of the person it acts for', () => {
    expect(roleChangeBlock({ ...person, id: 'p1' }, { memberId: 'me', principalMemberId: 'p1' }, true)).toBe(
      'notYourPrincipal',
    )
  })
  it('offers nothing on a seat removed or ended', () => {
    expect(roleChangeBlock(person, caller, false)).toBe('gone')
  })
})

describe('resetPasswordOffer', () => {
  const student = { id: 's1', kind: 'human', role: 'student', status: 'active', principal_member_id: null }
  const instructor = { memberId: 'me', isPerson: true, level: 'autonomous' }

  it('offers it on a person’s active student seat, to a person who manages members without approval', () => {
    expect(resetPasswordOffer(student, instructor, true)).toBe('offer')
    // Levels not known yet: offered, and Core decides.
    expect(resetPasswordOffer(student, { ...instructor, level: null }, true)).toBe('offer')
  })
  it('hides it on an agent’s seat, anyone but a student’s, and one’s own', () => {
    expect(resetPasswordOffer({ ...student, kind: 'agent' }, instructor, true)).toBe('hide')
    expect(resetPasswordOffer({ ...student, principal_member_id: 'p1' }, instructor, true)).toBe('hide')
    expect(resetPasswordOffer({ ...student, role: 'ta' }, instructor, true)).toBe('hide')
    expect(resetPasswordOffer({ ...student, id: 'me' }, instructor, true)).toBe('hide')
    expect(resetPasswordOffer(student, instructor, false)).toBe('hide')
  })
  it('hides it from an agent, and from a seat that does not manage members', () => {
    expect(resetPasswordOffer(student, { ...instructor, isPerson: false }, true)).toBe('hide')
    expect(resetPasswordOffer(student, { ...instructor, level: 'denied' }, true)).toBe('hide')
  })
  it('greys it out, with why, for a caller who manages members only with approval, or a paused seat', () => {
    expect(resetPasswordOffer(student, { ...instructor, level: 'confirm_required' }, true)).toBe('notAutonomous')
    expect(resetPasswordOffer(student, { ...instructor, level: 'pending_review' }, true)).toBe('notAutonomous')
    expect(resetPasswordOffer({ ...student, status: 'paused' }, instructor, true)).toBe('seatNotActive')
  })
})
