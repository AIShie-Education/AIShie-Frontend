import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/http'
import {
  emptyDraft,
  groupIn,
  groupSetPath,
  groupSetRoute,
  handedInFor,
  isGroupAssignment,
  isGroupWork,
  keepMine,
  leftOutMembers,
  loadTheirs,
  memberLabel,
  notInDraftsGroup,
  orderedMembers,
  partOfOtherWork,
  readDraft,
  refusedAsChanged,
  sameFiles,
  savedDraft,
  seenDraft,
  draftChange,
  type SharedDraft,
} from './groupWork'

const C = 'course-1'
const View = { render: () => null }

describe('what is group work', () => {
  it('is an assignment naming a group set, and a submission naming a group', () => {
    expect(isGroupAssignment({ group_set_id: 'set-1' })).toBe(true)
    expect(isGroupAssignment({ group_set_id: null })).toBe(false)
    expect(isGroupAssignment(undefined)).toBe(false)
    expect(isGroupWork({ group_id: 'g-1' })).toBe(true)
    expect(isGroupWork({ group_id: null })).toBe(false)
  })
})

describe('the link to a group set’s page', () => {
  it('is its address under the course', () => {
    expect(groupSetPath(C)).toBe('/courses/course-1/groups')
    expect(groupSetPath(C, 'set-1')).toBe('/courses/course-1/groups/set-1')
  })

  it('is given only where the app has a page there', () => {
    const without = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/courses/:courseId', component: View },
        { path: '/:pathMatch(.*)*', name: 'not-found', component: View },
      ],
    })
    expect(groupSetRoute(without, C, 'set-1')).toBeNull()
    expect(groupSetRoute(null, C, 'set-1')).toBeNull()

    const withPage = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/courses/:courseId/groups', component: View },
        { path: '/courses/:courseId/groups/:setId', component: View },
        { path: '/:pathMatch(.*)*', name: 'not-found', component: View },
      ],
    })
    expect(groupSetRoute(withPage, C, 'set-1')).toBe('/courses/course-1/groups/set-1')
    expect(groupSetRoute(withPage, C)).toBe('/courses/course-1/groups')
  })
})

describe('the members of a group’s work', () => {
  const members = [
    { member_id: 'm-ken', display_name: 'Ken Wong' },
    { member_id: 'm-me', display_name: 'Yuki Tanaka' },
    { member_id: 'm-ana', display_name: 'Ana Li' },
    { member_id: 'm-ken', display_name: 'Ken Wong' },
  ]

  it('are the reader first, then by name, each once', () => {
    expect(orderedMembers(members, 'm-me').map((m) => m.member_id)).toEqual(['m-me', 'm-ana', 'm-ken'])
    expect(orderedMembers(null, 'm-me')).toEqual([])
  })

  it('are named as Core named them, else as the page knows them, else not at all', () => {
    expect(memberLabel({ member_id: 'm-1', display_name: 'Ana' }, () => 'Other')).toBe('Ana')
    expect(memberLabel({ member_id: 'm-1' }, () => 'From the list')).toBe('From the list')
    expect(memberLabel({ member_id: 'm-1' }, () => null)).toBeNull()
  })

  it('name whom a hand-in was for, and whom it left out, from the draft’s members', () => {
    const result = { members: ['m-me', 'm-ana'], left_out: [{ member_id: 'm-ken' }, { member_id: 'm-gone' }] }
    expect(handedInFor(result, members)).toEqual([
      { member_id: 'm-me', display_name: 'Yuki Tanaka' },
      { member_id: 'm-ana', display_name: 'Ana Li' },
    ])
    expect(leftOutMembers(result, members)).toEqual([
      { member_id: 'm-ken', display_name: 'Ken Wong' },
      { member_id: 'm-gone' },
    ])
    expect(leftOutMembers({ left_out: null }, members)).toEqual([])
  })

  it('finds the reader in another group’s work handed in for the assignment, which their hand-in would leave them out of', () => {
    const attempts = [
      { group_id: 'g-beta', group_name: 'Beta', state: 'draft', members: [{ member_id: 'm-me' }] },
      { group_id: 'g-alpha', group_name: 'Alpha', state: 'submitted', members: [{ member_id: 'm-me' }] },
    ]
    expect(partOfOtherWork(attempts, 'g-beta', 'm-me')?.group_name).toBe('Alpha')
    // Their own group's work, and drafts, do not count.
    expect(partOfOtherWork(attempts, 'g-alpha', 'm-me')).toBeNull()
    expect(partOfOtherWork(attempts.slice(0, 1), 'g-gamma', 'm-me')).toBeNull()
    expect(partOfOtherWork(attempts, 'g-beta', null)).toBeNull()
  })

  it('finds the reader’s group in its set', () => {
    const set = { groups: [{ id: 'g-1', name: 'Alpha' }] } as never
    expect(groupIn(set, 'g-1')?.name).toBe('Alpha')
    expect(groupIn(set, 'g-2')).toBeUndefined()
    expect(groupIn(null, 'g-1')).toBeUndefined()
  })
})

describe('a draft its group writes together', () => {
  const read = (revision: number, body: string, by = 'm-ken') => ({
    revision,
    body,
    revisedAt: '2026-10-05T12:00:00Z',
    revisedBy: by,
  })
  const opened = (): SharedDraft => readDraft(emptyDraft(), read(3, 'Our answer'), { fresh: true, shared: true })

  it('starts from the draft as read, at its revision', () => {
    expect(opened()).toEqual({ text: 'Our answer', serverBody: 'Our answer', baseRevision: 3, conflict: null })
  })

  it('takes what the others wrote while the reader has nothing unsaved', () => {
    expect(readDraft(opened(), read(4, 'Their answer'), { fresh: false, shared: true })).toEqual({
      text: 'Their answer',
      serverBody: 'Their answer',
      baseRevision: 4,
      conflict: null,
    })
  })

  it('pays no heed to a read older than what it holds, answered after a save', () => {
    const saved = savedDraft({ ...opened(), text: 'Newer' }, 'Newer', 4)
    expect(readDraft(saved, read(3, 'Our answer'), { fresh: false, shared: true })).toBe(saved)
  })

  it('keeps unsaved text read again at the same revision', () => {
    const typing = { ...opened(), text: 'Our answer, longer' }
    expect(readDraft(typing, read(3, 'Our answer'), { fresh: false, shared: true })).toEqual(typing)
  })

  it('is a conflict when someone else changed it under unsaved text, and nothing typed is lost', () => {
    const typing = { ...opened(), text: 'Our answer, mine' }
    const next = readDraft(typing, read(4, 'Their answer'), { fresh: false, shared: true })
    expect(next.text).toBe('Our answer, mine')
    expect(next.serverBody).toBe('Our answer')
    expect(next.baseRevision).toBe(3)
    expect(next.conflict).toEqual(read(4, 'Their answer'))
  })

  it('is no conflict where the reader wrote what the draft now says', () => {
    const typing = { ...opened(), text: 'Same' }
    expect(readDraft(typing, read(4, 'Same'), { fresh: false, shared: true }).conflict).toBeNull()
  })

  it('on one’s own draft keeps unsaved text over what is read, as it always did', () => {
    const own = readDraft(emptyDraft(), read(1, 'v1'), { fresh: true, shared: false })
    const typing = { ...own, text: 'v1 and more' }
    expect(readDraft(typing, read(2, 'v2'), { fresh: false, shared: false })).toEqual({
      text: 'v1 and more',
      serverBody: 'v2',
      baseRevision: 2,
      conflict: null,
    })
  })

  it('a different draft starts from its own text, whatever was typed', () => {
    const typing = { ...opened(), text: 'Typed' }
    expect(readDraft(typing, read(1, 'New attempt'), { fresh: true, shared: true }).text).toBe('New attempt')
  })

  it('an edit refused as changed is a conflict whose text is still to be read', () => {
    const typing = { ...opened(), text: 'Mine' }
    const refused = refusedAsChanged(typing, {
      current_revision: 5,
      revised_at: '2026-10-05T12:05:00Z',
      revised_by_member_id: 'm-ana',
    })
    expect(refused.conflict).toEqual({
      revision: 5,
      body: null,
      revisedAt: '2026-10-05T12:05:00Z',
      revisedBy: 'm-ana',
    })
    // Neither choice is made before the draft as it is now is read.
    expect(loadTheirs(refused)).toBe(refused)
    expect(keepMine(refused)).toBe(refused)
    // Read, it has its text.
    const known = readDraft(refused, read(5, 'Ana’s answer', 'm-ana'), { fresh: false, shared: true })
    expect(known.conflict?.body).toBe('Ana’s answer')
    // Details that say no revision change nothing.
    expect(refusedAsChanged(typing, {})).toBe(typing)
  })

  it('loading theirs drops what was typed; keeping mine saves it over the revision read', () => {
    const conflicted = readDraft({ ...opened(), text: 'Mine' }, read(4, 'Theirs'), { fresh: false, shared: true })
    expect(loadTheirs(conflicted)).toEqual({ text: 'Theirs', serverBody: 'Theirs', baseRevision: 4, conflict: null })
    const kept = keepMine(conflicted)
    expect(kept).toEqual({ text: 'Mine', serverBody: 'Theirs', baseRevision: 4, conflict: null })
    // Still unsaved: the next save names revision 4, and replaces theirs.
    expect(kept.text).not.toBe(kept.serverBody)
    expect(savedDraft(kept, 'Mine', 5)).toEqual({ text: 'Mine', serverBody: 'Mine', baseRevision: 5, conflict: null })
  })
})

describe('a draft that is not the reader’s group’s now', () => {
  const refusal = (code: string, reason?: string) =>
    new ApiError({ status: 403, code, message: 'not permitted', details: reason ? { reason } : undefined })

  it('is what Core’s refusal for a student outside its group says', () => {
    expect(notInDraftsGroup(refusal('forbidden', 'student_out_of_scope'))).toBe(true)
  })

  it('is not any other refusal, nor anything else that fails', () => {
    expect(notInDraftsGroup(refusal('forbidden', 'permission_denied'))).toBe(false)
    expect(notInDraftsGroup(refusal('forbidden', 'membership_not_active'))).toBe(false)
    expect(notInDraftsGroup(refusal('conflict', 'draft_changed'))).toBe(false)
    expect(notInDraftsGroup(new Error('offline'))).toBe(false)
    expect(notInDraftsGroup(null)).toBe(false)
  })
})

describe('what a hand-in names: the draft as the student saw it', () => {
  const seen = seenDraft('Our text.', [{ document_id: 'd-1' }, { document_id: 'd-2' }], 5)

  it('keeps its text, its files by id and its revision', () => {
    expect(seen).toEqual({ body: 'Our text.', files: ['d-1', 'd-2'], revision: 5 })
    expect(seenDraft('', null, null)).toEqual({ body: '', files: [], revision: null })
  })

  it('finds the draft read again unchanged where its revision and its files are the same, in any order', () => {
    expect(draftChange(seen, { revision: 5, files: [{ document_id: 'd-2' }, { document_id: 'd-1' }] })).toBeNull()
    expect(sameFiles(['a', 'b'], ['b', 'a'])).toBe(true)
  })

  it('finds its text changed by its revision, and its files changed though the revision is the same', () => {
    expect(draftChange(seen, { revision: 6, files: [{ document_id: 'd-1' }, { document_id: 'd-2' }] })).toBe('text')
    // A groupmate attached a file: Core counts no revision for it.
    expect(
      draftChange(seen, {
        revision: 5,
        files: [{ document_id: 'd-1' }, { document_id: 'd-2' }, { document_id: 'd-3' }],
      }),
    ).toBe('files')
    // Or took one off.
    expect(draftChange(seen, { revision: 5, files: [{ document_id: 'd-1' }] })).toBe('files')
    expect(draftChange(seen, { revision: 5, files: null })).toBe('files')
    expect(sameFiles(['a'], ['b'])).toBe(false)
  })
})
