import { describe, expect, it } from 'vitest'
import {
  groupsCsv,
  listParts,
  planSplit,
  signupBlocked,
  signupMove,
  SplitNoRoom,
  type Group,
  type GroupSet,
} from './groupModel'
import { order } from './split'

const seat = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const T0 = '2026-10-05T09:00:00Z'
const member = (n: number, name = `Student ${n}`) => ({ member_id: seat(n), display_name: name })

function group(id: string, over: Partial<Group> = {}): Group {
  return { id, name: id, size: over.members?.length ?? 0, full: false, created_at: T0, members: [], ...over } as Group
}
function set(over: Partial<GroupSet> = {}): GroupSet {
  return {
    id: 'set-1',
    name: 'Project groups',
    signup: { open: false, joinable: false, reason: 'signup_closed' },
    created_at: T0,
    updated_at: T0,
    groups: [],
    assignments: [],
    unassigned: [],
    ...over,
  } as GroupSet
}

describe('the split, worked out over a set as the server works it out', () => {
  it('makes groups of a size for everyone in none, named the prefix and the lowest numbers free', () => {
    const s = set({
      groups: [group(seat(901), { name: 'Group 1' }), group(seat(902), { name: 'Archived', archived_at: T0 })],
      unassigned: [1, 2, 3, 4, 5, 6, 7].map((n) => member(n)),
    })
    const plan = planSplit(s, {
      by: 'size',
      n: 3,
      from: 'unassigned',
      seed: 'lab-2026',
      namePrefix: 'Group ',
      capacity: null,
    })
    // ⌈7 / 3⌉ = 3 groups: the one there and two made, named past the one taken.
    expect(plan.made.map((g) => g.name)).toEqual(['Group 2', 'Group 3'])
    expect(plan.placements.map((p) => p.student)).toEqual(
      order(
        s.unassigned!.map((m) => m.member_id),
        'lab-2026',
      ),
    )
    const sizes = plan.groups.map((g) => g.after.length)
    expect(sizes).toEqual([3, 2, 2])
    // The archived group takes nobody and is not shown.
    expect(plan.groups.map((g) => g.name)).toEqual(['Group 1', 'Group 2', 'Group 3'])
  })

  it('leaves a group with work alone, its members kept, and deals nobody into it', () => {
    const s = set({
      groups: [
        group(seat(901), {
          name: 'With work',
          members: [member(1), member(2)],
          work: [{ assignment_id: 'a1', title: 'Report', submission_id: 's1', attempt: 1, state: 'draft' }],
        }),
        group(seat(902), { name: 'Empty' }),
      ],
      unassigned: [member(3), member(4)],
    })
    const plan = planSplit(s, { by: 'count', n: 2, from: 'all', seed: 'x', namePrefix: 'G', capacity: null })
    expect(plan.kept.map((g) => g.name)).toEqual(['With work'])
    expect(plan.made).toEqual([])
    const kept = plan.groups.find((g) => g.name === 'With work')!
    expect(kept.kept).toBe(true)
    expect(kept.after).toEqual([seat(1), seat(2)])
    expect(kept.dealt).toEqual([])
    expect(plan.groups.find((g) => g.name === 'Empty')!.after.sort()).toEqual([seat(3), seat(4)])
  })

  it('from everyone, empties the groups without work and deals their members again with the rest', () => {
    const s = set({
      groups: [
        group(seat(901), { name: 'A', members: [member(1), member(2), member(3)] }),
        group(seat(902), { name: 'B' }),
      ],
      unassigned: [member(4)],
    })
    const plan = planSplit(s, { by: 'count', n: 2, from: 'all', seed: 'QK3M7ZP2VX9D', namePrefix: 'G', capacity: null })
    expect(plan.emptied).toBe(3)
    expect(plan.placements).toHaveLength(4)
    expect(plan.groups.map((g) => g.after.length)).toEqual([2, 2])
    // Only the student in no group is dealt from the students in no group: A keeps its three.
    const only = planSplit(s, {
      by: 'count',
      n: 2,
      from: 'unassigned',
      seed: 'QK3M7ZP2VX9D',
      namePrefix: 'G',
      capacity: null,
    })
    expect(only.emptied).toBe(0)
    expect(only.groups.map((g) => g.after.length)).toEqual([3, 1])
  })

  it('gives the groups it makes the capacity asked for, and refuses a deal with nowhere to go', () => {
    const s = set({ groups: [group(seat(901), { capacity: 1 })], unassigned: [member(1), member(2), member(3)] })
    expect(() =>
      planSplit(s, { by: 'count', n: 1, from: 'unassigned', seed: 'x', namePrefix: 'G', capacity: null }),
    ).toThrow(SplitNoRoom)
    const plan = planSplit(s, { by: 'count', n: 2, from: 'unassigned', seed: 'x', namePrefix: 'G', capacity: 2 })
    expect(plan.made).toEqual([{ id: 'new-1', name: 'G1' }])
    expect(plan.groups.map((g) => [g.after.length, g.capacity])).toEqual([
      [1, 1],
      [2, 2],
    ])
  })
})

describe('sign-up, as a student sees it', () => {
  const open = { open: true, joinable: true }
  it('offers leaving one’s own group, switching to another, or joining one while in none', () => {
    expect(signupMove({ my_group_id: 'g1' }, { id: 'g1' })).toBe('leave')
    expect(signupMove({ my_group_id: 'g1' }, { id: 'g2' })).toBe('switch')
    expect(signupMove({ my_group_id: null }, { id: 'g2' })).toBe('join')
  })
  it('says why a move cannot be asked for: sign-up closed, or the group full; leaving a full group is no trouble', () => {
    const g = { id: 'g2', full: true, archived_at: null }
    expect(
      signupBlocked({ my_group_id: null, signup: { open: false, joinable: false, reason: 'signup_closed' } }, g),
    ).toBe('signup_closed')
    expect(signupBlocked({ my_group_id: null, signup: { ...open } }, g)).toBe('group_full')
    expect(signupBlocked({ my_group_id: 'g2', signup: { ...open } }, g)).toBeNull()
    expect(
      signupBlocked({ my_group_id: null, signup: { open: true, joinable: false, reason: 'course_archived' } }, g),
    ).toBe('course_archived')
  })
})

describe('a set’s groups as CSV', () => {
  const words = {
    set: 'Group set',
    group: 'Group',
    member: 'Student',
    loginId: 'Login ID',
    joinedAt: 'Joined',
    noGroup: '(no group)',
    unnamed: 'Someone',
  }
  it('is one row a member, then those in none, with a byte-order mark, CRLF lines and no formula run', () => {
    const s = set({
      name: 'Labs, term 1',
      groups: [
        group('g1', {
          name: '=Group 1',
          members: [
            { member_id: 'm2', display_name: 'Zoe', joined_at: '2026-10-05T09:30:00Z' },
            { member_id: 'm1', display_name: 'Ada "A" Lee', joined_at: '2026-10-05T09:30:00Z' },
          ],
        }),
        group('g2', { name: 'Old', archived_at: T0 }),
      ],
      unassigned: [{ member_id: 'm3', display_name: '陳小明' }],
    })
    const csv = groupsCsv(s, words, (id) => (id === 'm1' ? 's1234' : null), 'en')
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Group set,Group,Student,Login ID,Joined')
    expect(lines[1]).toMatch(/^"Labs, term 1",'=Group 1,"Ada ""A"" Lee",s1234,2026-10-05 \d\d:30$/)
    expect(lines[2]).toMatch(/^"Labs, term 1",'=Group 1,Zoe,,2026-10-05 \d\d:30$/)
    expect(lines[3]).toBe('"Labs, term 1",(no group),陳小明,,')
    expect(lines[4]).toBe('')
    expect(lines).toHaveLength(5)
  })
})

describe('a list in the reader’s language, in parts', () => {
  it('puts the language’s words between the items, each item where it goes', () => {
    const parts = listParts(['A', 'B', 'C'], (x) => x, 'en')
    expect(parts.map((p) => ('item' in p ? `[${p.item}]` : p.text)).join('')).toBe('[A], [B], and [C]')
    const zh = listParts(['甲', '乙'], (x) => x, 'zh-TW')
    expect(zh.map((p) => ('item' in p ? `[${p.item}]` : p.text)).join('')).toBe('[甲]和[乙]')
  })
})
