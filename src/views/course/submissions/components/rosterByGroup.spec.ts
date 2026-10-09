import { describe, expect, it } from 'vitest'
import {
  byGroupName,
  groupProposalKey,
  groupRosterView,
  groupsFor,
  mayMarkGroupMissing,
  NO_GROUP,
  reachesWholeGroup,
  unreachedMembers,
  workGroupIfOther,
  workMembersIfOthers,
} from './rosterByGroup'
import type { RosterEntry } from './roster'

const alpha = {
  group_id: 'g-alpha',
  name: 'Alpha',
  members: [{ member_id: 'm-yuki' }, { member_id: 'm-ken' }],
  state: 'submitted',
  submission_id: 's-1',
  attempt: 1,
}
const beta = { group_id: 'g-beta', name: 'Beta', members: [{ member_id: 'm-mei' }], state: 'not_started' }
const empty = { group_id: 'g-empty', name: 'Gamma', members: [], state: 'not_started' }
const groups = [alpha, beta, empty]
const rows: RosterEntry[] = [
  { student_member_id: 'm-yuki', group_id: 'g-alpha', state: 'submitted' },
  { student_member_id: 'm-ken', group_id: 'g-alpha', state: 'submitted' },
  { student_member_id: 'm-mei', group_id: 'g-beta', state: 'not_started' },
  { student_member_id: 'm-sam', state: NO_GROUP },
]
const ctx = { canGrade: true, writable: true, published: true }

describe('the roster by group', () => {
  it('shows every group, counted by state, and the students in no group', () => {
    const v = groupRosterView(groups, rows, undefined, '')
    expect(v.visible.map((g) => g.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(v.summary).toEqual({
      total: 3,
      counts: [
        { state: 'not_started', count: 2 },
        { state: 'submitted', count: 1 },
      ],
    })
    expect(v.noGroup.map((r) => r.student_member_id)).toEqual(['m-sam'])
  })

  it('filters the groups by state, counting all of them still', () => {
    const v = groupRosterView(groups, rows, undefined, 'not_started')
    expect(v.visible.map((g) => g.name)).toEqual(['Beta', 'Gamma'])
    expect(v.summary?.total).toBe(3)
  })

  it('shows, for one student, their group alone, or that they are in none, with nothing left to count', () => {
    expect(groupsFor(groups, 'm-ken').map((g) => g.name)).toEqual(['Alpha'])
    const ken = groupRosterView(groups, rows, 'm-ken', 'submitted')
    expect(ken).toEqual({ summary: null, visible: [alpha], noGroup: [] })
    const sam = groupRosterView(groups, rows, 'm-sam', '')
    expect(sam.visible).toEqual([])
    expect(sam.noGroup.map((r) => r.student_member_id)).toEqual(['m-sam'])
  })

  it('offers recording a group missing only where it has no work and someone in it', () => {
    expect(mayMarkGroupMissing(beta, ctx)).toBe(true)
    expect(mayMarkGroupMissing(alpha, ctx)).toBe(false)
    expect(mayMarkGroupMissing({ ...beta, state: 'draft' }, ctx)).toBe(false)
    // Core refuses a group with nobody to record it for (group_empty).
    expect(mayMarkGroupMissing(empty, ctx)).toBe(false)
  })

  it('offers it to whoever may enter grades, in a course that still changes, on a published assignment, once', () => {
    expect(mayMarkGroupMissing(beta, { ...ctx, canGrade: false })).toBe(false)
    expect(mayMarkGroupMissing(beta, { ...ctx, writable: false })).toBe(false)
    expect(mayMarkGroupMissing(beta, { ...ctx, published: false })).toBe(false)
    expect(mayMarkGroupMissing(beta, { ...ctx, published: null })).toBe(true)
    expect(mayMarkGroupMissing(beta, { ...ctx, proposed: true })).toBe(false)
  })

  it('offers it to a seat listed to some students only where it reaches every member, which the group’s size says', () => {
    // A tutor listed for Mei: the roster names Mei alone of Beta, which has Mei and Ken now.
    const sizes = new Map([['g-beta', 2]])
    expect(mayMarkGroupMissing(beta, { ...ctx, reach: sizes })).toBe(false)
    expect(unreachedMembers(beta, sizes)).toBe(1)
    // Listed for both: the roster names both.
    const both = { ...beta, members: [{ member_id: 'm-mei' }, { member_id: 'm-ken' }] }
    expect(mayMarkGroupMissing(both, { ...ctx, reach: sizes })).toBe(true)
    expect(unreachedMembers(both, sizes)).toBe(0)
    // The size not known yet: not offered, and nothing said of others.
    expect(reachesWholeGroup(beta, new Map())).toBe(false)
    expect(unreachedMembers(beta, new Map())).toBe(0)
    // A seat that reaches every student is named every member.
    expect(reachesWholeGroup(beta, null)).toBe(true)
    expect(mayMarkGroupMissing(beta, { ...ctx, reach: null })).toBe(true)
  })

  it('keeps a group’s proposal apart from a student’s, and sorts groups by their numbers', () => {
    expect(groupProposalKey('c', 'a', 'g-1')).toBe('c:a:group:g-1')
    const names = ['Group 10', 'Group 2', 'Group 1'].map((name) => ({ name }))
    expect(names.sort(byGroupName).map((g) => g.name)).toEqual(['Group 1', 'Group 2', 'Group 10'])
  })
})

describe('whose a group’s work is, once someone has moved', () => {
  // Ken was part of Alpha's work, and is in Beta now; Beta handed in without him.
  const moved = [
    {
      group_id: 'g-alpha',
      name: 'Alpha',
      members: [{ member_id: 'm-yuki' }],
      state: 'submitted',
      submission_id: 's-a',
    },
    {
      group_id: 'g-beta',
      name: 'Beta',
      members: [{ member_id: 'm-ken' }, { member_id: 'm-mei' }],
      state: 'submitted',
      submission_id: 's-b',
    },
    { group_id: 'g-gamma', name: 'Gamma', members: [{ member_id: 'm-fay' }], state: 'draft', submission_id: 's-g' },
  ]
  const movedRows: RosterEntry[] = [
    {
      student_member_id: 'm-yuki',
      group_id: 'g-alpha',
      state: 'submitted',
      submission_id: 's-a',
      display_name: 'Yuki',
    },
    { student_member_id: 'm-ken', group_id: 'g-beta', state: 'submitted', submission_id: 's-a', display_name: 'Ken' },
    { student_member_id: 'm-mei', group_id: 'g-beta', state: 'submitted', submission_id: 's-b', display_name: 'Mei' },
    { student_member_id: 'm-fay', group_id: 'g-gamma', state: 'draft', submission_id: 's-g' },
  ]

  it('names the students a group’s work is of where they are not its members now', () => {
    expect(workMembersIfOthers(moved[0]!, movedRows)).toEqual([
      { member_id: 'm-yuki', display_name: 'Yuki' },
      { member_id: 'm-ken', display_name: 'Ken' },
    ])
    expect(workMembersIfOthers(moved[1]!, movedRows)).toEqual([{ member_id: 'm-mei', display_name: 'Mei' }])
  })

  it('says nothing of a draft, of work that is its members’ now, or where the roster does not say', () => {
    expect(workMembersIfOthers(moved[2]!, movedRows)).toBeNull()
    const own = rows.map((r) => ({ ...r, submission_id: r.group_id === 'g-alpha' ? 's-1' : undefined }))
    expect(workMembersIfOthers(alpha, own)).toBeNull()
    expect(workMembersIfOthers(moved[0]!, [])).toBeNull()
  })

  it('names, on a student’s row, the group whose work it is where it is not theirs now', () => {
    expect(workGroupIfOther(movedRows[1]!, moved)?.name).toBe('Alpha')
    expect(workGroupIfOther(movedRows[0]!, moved)).toBeNull()
    expect(workGroupIfOther({ group_id: 'g-beta' }, moved)).toBeNull()
  })
})
