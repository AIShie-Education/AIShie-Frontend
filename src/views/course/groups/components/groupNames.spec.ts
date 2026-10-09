import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { ensureGroupNames, forgetGroupNames, groupName, groupSetName, MAX_AGE_MS } from './groupNames'

const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

const T0 = '2026-10-05T09:00:00Z'
/** The course's sets as group_set.list gives them: each [set id, set name, [group id, group name][]]. */
function sets(...list: [string, string, [string, string][]][]) {
  return {
    sets: list.map(([id, name, groups]) => ({
      id,
      name,
      signup: { open: false, joinable: false },
      created_at: T0,
      updated_at: T0,
      assignments: [],
      groups: groups.map(([gid, gname]) => ({ id: gid, name: gname, size: 0, full: false, created_at: T0 })),
    })),
  }
}

let course = 0
/** A course of its own for each test: what one read is not another's. */
let C = ''
beforeEach(() => {
  C = `course-${++course}`
  read.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('the names of a course’s sets and groups, for the feed and its actions', () => {
  it('are read once for everything on the page', async () => {
    read.mockResolvedValue(sets(['s1', 'Project groups', [['g1', 'Group 1']]]))
    await Promise.all([ensureGroupNames(C, ['s1']), ensureGroupNames(C, ['g1']), ensureGroupNames(C)])
    await ensureGroupNames(C, ['g1', 's1'])
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('group_set.list', { course_id: C, include_archived: true })
    expect(groupSetName('s1')).toBe('Project groups')
    expect(groupName('g1')).toEqual({ name: 'Group 1', set: 'Project groups', setId: 's1' })
  })

  it('are read again for a set or a group made since, and only once for one the caller cannot see', async () => {
    read.mockResolvedValueOnce(sets())
    await ensureGroupNames(C)
    // A set and a group are made in this tab; the feed then shows an event about them.
    read.mockResolvedValue(sets(['s2', 'Lab groups', [['g2', 'Lab 2']]]))
    await ensureGroupNames(C, ['s2', 'g2'])
    expect(read).toHaveBeenCalledTimes(2)
    expect(groupSetName('s2')).toBe('Lab groups')
    expect(groupName('g2')?.name).toBe('Lab 2')
    // One that a read begun since it was asked about did not find is not asked about again.
    await ensureGroupNames(C, ['g-unseen'])
    expect(read).toHaveBeenCalledTimes(3)
    await ensureGroupNames(C, ['g-unseen'])
    await ensureGroupNames(C, ['g-unseen', 'g2'])
    expect(read).toHaveBeenCalledTimes(3)
    expect(groupName('g-unseen')).toBeUndefined()
  })

  it('asked about while a read is on its way, are read again once it is back where it did not have them', async () => {
    let answer: (v: unknown) => void = () => undefined
    read.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    const first = ensureGroupNames(C)
    read.mockResolvedValue(sets(['s3', 'Late set', [['g3', 'Late group']]]))
    const second = ensureGroupNames(C, ['g3'])
    answer(sets())
    await Promise.all([first, second])
    expect(read).toHaveBeenCalledTimes(2)
    expect(groupName('g3')?.name).toBe('Late group')
  })

  it('are read again after the caller changes the groups, and once they are old', async () => {
    vi.useFakeTimers()
    read.mockResolvedValue(sets(['s4', 'Old name', []]))
    await ensureGroupNames(C, ['s4'])
    read.mockResolvedValue(sets(['s4', 'New name', []]))
    // Renamed here: the pages forget what was read.
    forgetGroupNames(C)
    await ensureGroupNames(C, ['s4'])
    expect(groupSetName('s4')).toBe('New name')
    expect(read).toHaveBeenCalledTimes(2)
    // Renamed by someone else: read again once what was read is old.
    read.mockResolvedValue(sets(['s4', 'Their name', []]))
    await ensureGroupNames(C, ['s4'])
    expect(read).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(MAX_AGE_MS + 1)
    await ensureGroupNames(C, ['s4'])
    expect(read).toHaveBeenCalledTimes(3)
    expect(groupSetName('s4')).toBe('Their name')
  })

  it('keep a refusal, and try again after anything else', async () => {
    read.mockRejectedValueOnce(new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' }))
    await ensureGroupNames(C, ['s5'])
    await ensureGroupNames(C, ['s5'])
    expect(read).toHaveBeenCalledTimes(1)
    const D = `${C}-b`
    read.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network', message: 'offline' }))
    await ensureGroupNames(D, ['s6'])
    read.mockResolvedValueOnce(sets(['s6', 'Back online', []]))
    await ensureGroupNames(D, ['s6'])
    expect(groupSetName('s6')).toBe('Back online')
  })
})
