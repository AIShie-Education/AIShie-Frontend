import { describe, expect, it } from 'vitest'
import { roleChangeBlock, roleChangeEffect, ROSTER_ROLES } from './roles'

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
