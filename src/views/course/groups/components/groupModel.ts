// What the group pages share: the shapes of a course's group sets as the
// server shows them, the random split worked out over a set as it is (to
// preview it), what a student may do in a set's sign-up, and a set's groups
// as CSV. Nothing here decides who may do what: the server does, and its
// refusals are put in words by the pages (groups.refusal).
import dayjs from 'dayjs'
import type { ListItem, ToolOut } from '@/api/types'
import { csvText } from '@/views/course/grades/components/classMatrix'
import { deal, NoRoom, newGroups, type DealGroup, type Placement, type SplitBy, type SplitFrom } from './split'

/** One set, as group_set.get shows it: with the students in no group and each group's work. */
export type GroupSet = ToolOut<'group_set.get'>
/** One set as the list shows it. */
export type GroupSetSummary = ListItem<'group_set.list', 'sets'>
export type Group = NonNullable<GroupSet['groups']>[number]
export type GroupMember = NonNullable<Group['members']>[number]
export type GroupWork = NonNullable<Group['work']>[number]
export type Stay = NonNullable<GroupSet['history']>[number]

/** Where the group pages keep words for the server's refusals, by reason. */
export const GROUP_REFUSALS = 'groups.refusal'

/**
 * What the server calls a split's new groups, before their number, when the
 * split gives no prefix (an agent's, say): AIShie-Core's defaultSplitPrefix,
 * in no reader's language but the server's.
 */
export const SERVER_SPLIT_PREFIX = 'Group '

/** The groups of a set that are not archived, in the order the server lists them. */
export function liveGroups(set: Pick<GroupSet, 'groups'>): Group[] {
  return (set.groups ?? []).filter((g) => !g.archived_at)
}

/** The groups of a set that are archived. */
export function archivedGroups(set: Pick<GroupSet, 'groups'>): Group[] {
  return (set.groups ?? []).filter((g) => !!g.archived_at)
}

/** The part of the reader's seat that says which students it reaches (the course store's membership and seat). */
export interface ReaderScope {
  /** all or listed; unknown where the seat was not read. */
  student_scope?: string | null
  /** Whom a listed scope lists, where the seat itself was read (member.get). */
  listed_students?: readonly string[] | null
  /** The seat is someone's delegate: it reaches no student its principal's does not, which cannot be read here. */
  delegate?: boolean
}

/**
 * Whether the reader's student scope reaches a student: what the server
 * shows of a student's groups (their group's members, their history) is what
 * it reaches. Null where that cannot be told here: a listed seat whose list
 * was not read, or a delegate, whose principal's reach caps its own.
 */
export function scopeReaches(seat: ReaderScope | null | undefined, memberId: string): boolean | null {
  if (!seat?.student_scope) return null
  if (seat.student_scope === 'listed') {
    if (!seat.listed_students) return null
    if (!seat.listed_students.includes(memberId)) return false
  } else if (seat.student_scope !== 'all') return null
  return seat.delegate ? null : true
}

/** Whether the reader's student scope surely reaches every student: then every group's work is shown them. */
export function reachesEveryStudent(seat: ReaderScope | null | undefined): boolean {
  return seat?.student_scope === 'all' && !seat.delegate
}

/** Whether a group has work for an assignment of its set, as far as the reader is shown. */
export function hasWork(g: Pick<Group, 'work'>): boolean {
  return (g.work?.length ?? 0) > 0
}

/** A person's name as the server gives it, or what to call one it does not name. */
export function nameOf(m: { display_name?: string | null }, unnamed: string): string {
  const n = m.display_name?.trim()
  return n ? n : unnamed
}

/** Students by name, in the reader's language's order. */
export function byName<T extends { display_name?: string | null }>(list: readonly T[], locale: string): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...list].sort((a, b) => collator.compare(a.display_name ?? '', b.display_name ?? ''))
}

/** Every student shown in a set, in a group or in none, by id. */
export function studentsOf(set: Pick<GroupSet, 'groups' | 'unassigned'>): Map<string, GroupMember> {
  const out = new Map<string, GroupMember>()
  for (const g of set.groups ?? []) for (const m of g.members ?? []) out.set(m.member_id, m)
  for (const m of set.unassigned ?? []) out.set(m.member_id, m)
  return out
}

/** The group a student is in now, among those shown. */
export function groupOf(set: Pick<GroupSet, 'groups'>, memberId: string): Group | undefined {
  return (set.groups ?? []).find((g) => g.members?.some((m) => m.member_id === memberId))
}

/**
 * Items as a list in the page's language, as formatList writes them ("a, b,
 * and c", 「甲、乙和丙」), in parts: each item where it goes, to be drawn as
 * a link, say, and the words between them.
 */
export function listParts<T>(
  items: readonly T[],
  label: (item: T) => string,
  locale: string,
): ({ item: T; key: number } | { text: string; key: number })[] {
  try {
    let k = 0
    return new Intl.ListFormat(locale, { type: 'conjunction' })
      .formatToParts(items.map(label))
      .map((p, i) => (p.type === 'element' ? { item: items[k++], key: i } : { text: p.value, key: i }))
  } catch {
    return items.map((item, i) => ({ item, key: i }))
  }
}

// ---------------------------------------------------------------------------
// The random split, previewed
// ---------------------------------------------------------------------------

export interface SplitOptions {
  by: SplitBy
  n: number
  from: SplitFrom
  seed: string
  /** What new groups are called before their number; the server's default is "Group ". */
  namePrefix: string
  /** The capacity of the groups it makes; none for no limit. */
  capacity: number | null
}

/** A group as the split leaves it. */
export interface SplitGroup {
  id: string
  name: string
  /** Made by the split. */
  made: boolean
  /** Left alone: it has work for an assignment of the set. */
  kept: boolean
  /** Its members before. */
  before: string[]
  /** Its members after, those it kept first, then those dealt to it in the deal's order. */
  after: string[]
  /** Those dealt to it. */
  dealt: string[]
  capacity: number | null
}

export interface SplitPlan {
  groups: SplitGroup[]
  /** Every student dealt, in the deal's order. */
  placements: Placement[]
  /** How many stays it ends to deal again (from everyone). */
  emptied: number
  /** Groups it makes. */
  made: { id: string; name: string }[]
  /** Groups it leaves alone, having work. */
  kept: Group[]
}

/** A split nobody can be dealt in: everyone has nowhere to go. */
export class SplitNoRoom extends Error {
  constructor(public readonly students: number) {
    super('no_room')
  }
}

/**
 * The split worked out over the set as it is shown, as the server will
 * work it out (AIShie-Core group.split): groups with work are kept whole
 * and take nobody; from everyone, every other group is emptied and its
 * members dealt again with the students in no group; new groups are made,
 * named the prefix and the lowest number not in use, until there are as
 * many as asked for; then the deal. Throws SplitNoRoom where a student
 * would have nowhere to go.
 */
export function planSplit(set: Pick<GroupSet, 'groups' | 'unassigned'>, opts: SplitOptions): SplitPlan {
  const groups = set.groups ?? []
  const kept: Group[] = []
  const eligible: DealGroup[] = []
  const names = new Set<string>()
  let notArchived = 0
  for (const g of groups) {
    if (g.archived_at) continue
    notArchived++
    names.add(g.name.toLowerCase())
    if (hasWork(g)) {
      kept.push(g)
      continue
    }
    eligible.push({
      id: g.id,
      createdAt: g.created_at,
      members: opts.from === 'all' ? 0 : (g.members?.length ?? g.size),
      capacity: g.capacity ?? 0,
    })
  }
  const isEligible = new Set(eligible.map((g) => g.id))
  const toDeal: string[] = (set.unassigned ?? []).map((m) => m.member_id)
  let emptied = 0
  if (opts.from === 'all') {
    for (const g of groups) {
      if (!isEligible.has(g.id)) continue
      for (const m of g.members ?? []) {
        toDeal.push(m.member_id)
        emptied++
      }
    }
  }
  const keptMembers = eligible.reduce((sum, g) => sum + g.members, 0)
  const n = newGroups(opts.by, opts.n, notArchived, eligible.length, keptMembers, toDeal.length)
  const made: { id: string; name: string }[] = []
  for (let k = 1; made.length < n; k++) {
    const name = `${opts.namePrefix}${k}`.trim()
    if (names.has(name.toLowerCase())) continue
    names.add(name.toLowerCase())
    const id = `new-${made.length + 1}`
    made.push({ id, name })
    eligible.push({ id, createdAt: '', made: made.length, members: 0, capacity: opts.capacity ?? 0 })
  }
  let placements: Placement[]
  try {
    placements = deal(toDeal, eligible, opts.by === 'size' ? opts.n : 0, opts.seed)
  } catch (e) {
    if (e instanceof NoRoom) throw new SplitNoRoom(toDeal.length)
    throw e
  }
  const dealtTo = new Map<string, string[]>()
  for (const p of placements) dealtTo.set(p.group, [...(dealtTo.get(p.group) ?? []), p.student])
  const out: SplitGroup[] = []
  for (const g of groups) {
    if (g.archived_at) continue
    const before = (g.members ?? []).map((m) => m.member_id)
    const isKept = !isEligible.has(g.id)
    const dealt = dealtTo.get(g.id) ?? []
    const stays = isKept || opts.from === 'unassigned' ? before : []
    out.push({
      id: g.id,
      name: g.name,
      made: false,
      kept: isKept,
      before,
      after: [...stays, ...dealt],
      dealt,
      capacity: g.capacity ?? null,
    })
  }
  for (const m of made) {
    const dealt = dealtTo.get(m.id) ?? []
    out.push({
      id: m.id,
      name: m.name,
      made: true,
      kept: false,
      before: [],
      after: dealt,
      dealt,
      capacity: opts.capacity,
    })
  }
  return { groups: out, placements, emptied, made, kept }
}

// ---------------------------------------------------------------------------
// Sign-up, as a student sees it
// ---------------------------------------------------------------------------

/** What a student may ask of a group in a set's sign-up: to join it, to switch to it, or to leave it. */
export type SignupMove = 'join' | 'switch' | 'leave'

/** The move a group offers the reader: leave their own, switch to another, or join one while in none. */
export function signupMove(set: Pick<GroupSet, 'my_group_id'>, group: Pick<Group, 'id'>): SignupMove {
  if (set.my_group_id === group.id) return 'leave'
  return set.my_group_id ? 'switch' : 'join'
}

/**
 * Why that move cannot be asked for now, as far as the page knows: sign-up
 * not open (its reason: signup_closed, set_archived, course_archived), or
 * the group full. Anything else (work handed in) only the server knows, and
 * says when asked.
 */
export function signupBlocked(
  set: Pick<GroupSet, 'my_group_id' | 'signup'>,
  group: Pick<Group, 'id' | 'full' | 'archived_at'>,
): string | null {
  if (!set.signup.joinable) return set.signup.reason ?? 'signup_closed'
  if (group.archived_at) return 'group_archived'
  if (signupMove(set, group) !== 'leave' && group.full) return 'group_full'
  return null
}

// ---------------------------------------------------------------------------
// A set's groups as CSV
// ---------------------------------------------------------------------------

export interface GroupsCsvWords {
  set: string
  group: string
  member: string
  loginId: string
  joinedAt: string
  /** The group column of a student in no group. */
  noGroup: string
  unnamed: string
}

/**
 * A set's groups as a spreadsheet opens them, by the class gradebook's rules
 * (matrixCsv): UTF-8 with a byte-order mark, CRLF lines, no text a
 * spreadsheet would run as a formula. One row a member of each group not
 * archived, in the order shown, then one a student in no group; the login ID
 * where the reader is shown it (loginIdOf), and when they joined, on the
 * reader's clock.
 */
export function groupsCsv(
  set: Pick<GroupSet, 'name' | 'groups' | 'unassigned'>,
  words: GroupsCsvWords,
  loginIdOf: (memberId: string) => string | null | undefined,
  locale: string,
): string {
  const lines = [[words.set, words.group, words.member, words.loginId, words.joinedAt].map(csvText).join(',')]
  const row = (group: string, m: GroupMember) =>
    [
      csvText(set.name),
      csvText(group),
      csvText(nameOf(m, words.unnamed)),
      csvText(loginIdOf(m.member_id) ?? ''),
      m.joined_at ? dayjs(m.joined_at).format('YYYY-MM-DD HH:mm') : '',
    ].join(',')
  for (const g of liveGroups(set)) for (const m of byName(g.members ?? [], locale)) lines.push(row(g.name, m))
  for (const m of byName(set.unassigned ?? [], locale)) lines.push(row(words.noGroup, m))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** A file's name for a set's CSV: the course's code, the set's name and the day, with nothing a file system refuses. */
export function csvFileName(parts: (string | null | undefined)[]): string {
  return `${parts.filter(Boolean).join('-')}.csv`.replace(/[\\/:*?"<>|\s]+/g, '_')
}

/** Saves text as a file the browser downloads, made here: nothing is fetched. */
export function saveText(text: string, name: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
