// Group work (小組作業, AIShie-Core #74) as the assignment and submission
// pages meet it. An assignment is group work when it names a group set
// (group_set_id): each group of the set hands in one piece of work, for its
// members, and a student in no group of it hands nothing in (no_group). A
// group's submission has no student_member_id: it names its group (group_id,
// group_name) and whose work it is (members), its group's members now while
// it is a draft, and those it was handed in or recorded missing for after.
//
// The group sets' own pages (the course's Groups page, a set's page, signing
// up) are another part of the app's: this one links to a set's page only
// where the app has one at its address (groupSetRoute).
import type { RouteLocationRaw, Router } from 'vue-router'
import { ApiError } from '@/api/http'
import type { Assignment, AssignmentSummary, ListItem, SubmissionSummary, ToolOut } from '@/api/types'

/** A group set as group_set.get gives it. */
export type GroupSet = ToolOut<'group_set.get'>
/** One group of a set, as group_set.get gives it. */
export type GroupOfSet = ListItem<'group_set.get', 'groups'>
/** One of the students a group's work is the work of (submission.get, .list). */
export type WorkMember = NonNullable<SubmissionSummary['members']>[number]
/** One group on an assignment's roster (submission.roster, first page). */
export type RosterGroup = ListItem<'submission.roster', 'groups'>
/** What submission.submit says it handed a group's draft in for, and whom it left out. */
export type HandInResult = ToolOut<'submission.submit'>

/** Whether an assignment is group work: it names the group set whose groups hand it in. */
export function isGroupAssignment(a: Pick<Assignment | AssignmentSummary, 'group_set_id'> | null | undefined): boolean {
  return !!a?.group_set_id
}

/** Whether a submission is a group's work, not a student's own. */
export function isGroupWork(s: Pick<SubmissionSummary, 'group_id'> | null | undefined): boolean {
  return !!s?.group_id
}

/** The address of a course's group sets, or of one set: the Groups page's, as the course's tabs give it. */
export function groupSetPath(courseId: string, setId?: string | null): string {
  return `/courses/${courseId}/groups${setId ? `/${setId}` : ''}`
}

/**
 * A link to a group set's page (or the course's Groups page), where the app
 * has a page at that address; null where it has none, so that the words
 * stand without a link rather than leading nowhere.
 */
export function groupSetRoute(
  router: Pick<Router, 'resolve'> | null | undefined,
  courseId: string,
  setId?: string | null,
): RouteLocationRaw | null {
  if (!router) return null
  const path = groupSetPath(courseId, setId)
  try {
    const to = router.resolve(path)
    return to.matched.length && to.name !== 'not-found' ? path : null
  } catch {
    return null
  }
}

/** The group of a set a student is in, by the group's id; undefined for none. */
export function groupIn(set: Pick<GroupSet, 'groups'> | null | undefined, groupId: string | null | undefined) {
  if (!set || !groupId) return undefined
  return (set.groups ?? []).find((g) => g.id === groupId)
}

/**
 * A member's name as the page can say it: the name Core gave with the work,
 * else what the page knows of the member (the caller's own seat, the member
 * list), else null (said as "someone in the course").
 */
export function memberLabel(
  m: { member_id: string; display_name?: string | null },
  known: (memberId: string) => string | null | undefined,
): string | null {
  return m.display_name || known(m.member_id) || null
}

/** The members of a work, the caller first, then by name; each once. */
export function orderedMembers<T extends { member_id: string; display_name?: string | null }>(
  members: readonly T[] | null | undefined,
  me: string | null | undefined,
): T[] {
  const byId = new Map<string, T>()
  for (const m of members ?? []) if (!byId.has(m.member_id)) byId.set(m.member_id, m)
  return [...byId.values()].sort((a, b) => {
    if (a.member_id === me) return -1
    if (b.member_id === me) return 1
    return (a.display_name ?? '').localeCompare(b.display_name ?? '')
  })
}

/**
 * Whether the caller is part of another group's work for the assignment,
 * handed in or recorded missing: a hand-in of their group's draft then
 * leaves them out (a student is part of one group's work an assignment).
 */
export function partOfOtherWork<T extends Pick<SubmissionSummary, 'group_id' | 'state' | 'members'>>(
  attempts: readonly T[],
  groupId: string | null | undefined,
  me: string | null | undefined,
): T | null {
  if (!me || !groupId) return null
  return (
    attempts.find(
      (s) =>
        s.state !== 'draft' &&
        !!s.group_id &&
        s.group_id !== groupId &&
        (s.members ?? []).some((m) => m.member_id === me),
    ) ?? null
  )
}

/** The members a hand-in left out, named from the draft's members where the page knows them. */
export function leftOutMembers(
  result: Pick<HandInResult, 'left_out'> | null | undefined,
  members: readonly WorkMember[] | null | undefined,
): WorkMember[] {
  const known = new Map((members ?? []).map((m) => [m.member_id, m]))
  return (result?.left_out ?? []).map((l) => known.get(l.member_id) ?? { member_id: l.member_id })
}

/** The members a hand-in was for, by id, named from the draft's members. */
export function handedInFor(
  result: Pick<HandInResult, 'members'> | null | undefined,
  members: readonly WorkMember[] | null | undefined,
): WorkMember[] {
  const known = new Map((members ?? []).map((m) => [m.member_id, m]))
  return (result?.members ?? []).map((id) => known.get(id) ?? { member_id: id })
}

// --- A draft its group writes together -----------------------------------------------------
//
// Several people write one draft, and nobody holds a lock: each edit names
// the revision it was written over (base_revision), and Core refuses one
// made over a revision that is no longer the draft's (draft_changed). The
// page keeps what the person's text was written over (serverBody, its
// revision), and a read of the draft that finds another revision while the
// person has unsaved text is a conflict, which they settle: load the draft
// as it is now, or keep their text, which is then saved over the revision
// read, replacing it. Nobody's text is lost without their say.

/**
 * Whether Core refused something on a group's draft because the caller is
 * not one of its group now (moved to another group, or out of the set): a
 * group's draft is read and written by its members now, and a student's own
 * seat reaches only their own work. Their group is then another, or none.
 */
export function notInDraftsGroup(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'forbidden' && e.details?.reason === 'student_out_of_scope'
}

/** The draft as read, for the page. */
export interface DraftRead {
  revision: number
  body: string
  revisedAt?: string | null
  revisedBy?: string | null
}

export interface SharedDraft {
  /** What the person is writing. */
  text: string
  /** The text their writing is over: the draft as last read or saved, before any conflict. */
  serverBody: string
  /** That text's revision: what an edit names as base_revision. */
  baseRevision: number | null
  /** The draft as read since, changed by someone else while the person had unsaved text; body null until read. */
  conflict: (Omit<DraftRead, 'body'> & { body: string | null }) | null
}

export function emptyDraft(): SharedDraft {
  return { text: '', serverBody: '', baseRevision: null, conflict: null }
}

/**
 * The draft read again. A different draft, or none typed over what was read,
 * takes the text read; unsaved text over another revision is a conflict on a
 * draft written together (shared), and on one's own draft is kept, as it
 * always was, the text read becoming what it is over.
 */
export function readDraft(state: SharedDraft, read: DraftRead, opts: { fresh: boolean; shared: boolean }): SharedDraft {
  // A read sent before a save and answered after it is older than what the
  // page holds: revisions only go up.
  if (!opts.fresh && state.baseRevision !== null && read.revision < state.baseRevision) return state
  const unsaved = state.text !== state.serverBody
  if (opts.fresh || !unsaved || read.body === state.text) {
    return { text: read.body, serverBody: read.body, baseRevision: read.revision, conflict: null }
  }
  if (opts.shared && state.baseRevision !== null && read.revision !== state.baseRevision) {
    return { ...state, conflict: { ...read } }
  }
  return { ...state, serverBody: read.body, baseRevision: read.revision, conflict: null }
}

/** An edit was refused: the draft is at another revision now, whose text is not read yet. */
export function refusedAsChanged(
  state: SharedDraft,
  details: { current_revision?: unknown; revised_at?: unknown; revised_by_member_id?: unknown } | undefined,
): SharedDraft {
  const revision = typeof details?.current_revision === 'number' ? details.current_revision : null
  if (revision === null) return state
  return {
    ...state,
    conflict: {
      revision,
      body: state.conflict?.revision === revision ? state.conflict.body : null,
      revisedAt: typeof details?.revised_at === 'string' ? details.revised_at : null,
      revisedBy: typeof details?.revised_by_member_id === 'string' ? details.revised_by_member_id : null,
    },
  }
}

/** The person's text was saved, at this revision. */
export function savedDraft(state: SharedDraft, body: string, revision: number | null): SharedDraft {
  return { ...state, serverBody: body, baseRevision: revision ?? state.baseRevision, conflict: null }
}

/** Load the draft as it is now: what the person typed gives way to it. */
export function loadTheirs(state: SharedDraft): SharedDraft {
  const c = state.conflict
  if (!c || c.body === null) return state
  return { text: c.body, serverBody: c.body, baseRevision: c.revision, conflict: null }
}

/** Keep the person's text, to be saved over the draft as it is now. */
export function keepMine(state: SharedDraft): SharedDraft {
  const c = state.conflict
  if (!c || c.body === null) return state
  return { text: state.text, serverBody: c.body, baseRevision: c.revision, conflict: null }
}

// --- Handing in what the student saw ---------------------------------------------------------
//
// A hand-in names what it hands in (the draft's text and its files), and
// Core refuses it if the draft holds anything else by then. What it names is
// what the student saw when they pressed Hand in, kept before anything is
// read again: the draft read just before it is handed in, or a reading that
// lands while its confirmation is open, may hold what a groupmate has done
// since. Core counts a change of the text (revision), and not one of the
// files, which a groupmate attaches or removes without one: the files are
// compared too.

/** What the student saw of the draft when they pressed Hand in. */
export interface SeenDraft {
  body: string
  /** The draft's files, by document id. */
  files: string[]
  /** The revision of the text: null where it is not known. */
  revision: number | null
}

export function seenDraft(
  body: string,
  files: readonly { document_id: string }[] | null | undefined,
  revision: number | null,
): SeenDraft {
  return { body, files: (files ?? []).map((f) => f.document_id), revision }
}

/** The same files, in any order. */
export function sameFiles(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((id, i) => id === y[i])
}

/**
 * How the draft read again differs from what the student saw: its text (a
 * revision other than theirs), its files (others, though its revision is
 * theirs), or not at all (null).
 */
export function draftChange(
  seen: SeenDraft,
  now: { revision: number; files?: readonly { document_id: string }[] | null },
): 'text' | 'files' | null {
  if (seen.revision !== null && now.revision !== seen.revision) return 'text'
  if (
    !sameFiles(
      seen.files,
      (now.files ?? []).map((f) => f.document_id),
    )
  )
    return 'files'
  return null
}
