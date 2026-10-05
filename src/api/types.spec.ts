import { describe, expect, it } from 'vitest'
import { workOf } from './types'

describe('workOf', () => {
  it('is the student whose own work it is', () => {
    expect(workOf({ student_member_id: 'm1', members: null })).toEqual(['m1'])
  })

  it('is each member a group’s work is of', () => {
    expect(
      workOf({ student_member_id: null, members: [{ member_id: 'm1' }, { member_id: 'm2', display_name: 'B' }] }),
    ).toEqual(['m1', 'm2'])
  })

  it('is nobody where a group’s work names no member', () => {
    expect(workOf({ student_member_id: null })).toEqual([])
  })
})
