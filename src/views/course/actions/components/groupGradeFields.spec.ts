import { describe, expect, it } from 'vitest'
import { groupGradeField } from './groupGradeFields'

describe('which fields are a group grading’s own', () => {
  it('are each member’s adjustment and grade, one adjustment, and grade.adjust’s kind', () => {
    expect(groupGradeField('adjustments', [], 'grade.submit')).toBe('adjustments')
    expect(groupGradeField('member_grades', [], undefined)).toBe('memberGrades')
    expect(groupGradeField('adjustment', { kind: 'delta', points: 1 }, undefined)).toBe('adjustment')
    expect(groupGradeField('kind', 'replace', 'grade.adjust')).toBe('adjustKind')
    // A document's kind is not an adjustment.
    expect(groupGradeField('kind', 'material', 'document.create')).toBeNull()
  })

  it('names whose work it is only for the tools that say so', () => {
    expect(groupGradeField('members', ['m1'], 'grade.submit')).toBe('memberList')
    expect(groupGradeField('add', ['m1'], 'submission.set_members')).toBe('memberList')
    expect(groupGradeField('remove', ['m1'], 'submission.set_members')).toBe('memberList')
    expect(groupGradeField('add', ['m1'], 'member.add')).toBeNull()
    expect(groupGradeField('members', 3, 'grade.submit')).toBeNull()
  })
})
