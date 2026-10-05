// Peer evaluation within a group (組員互評): the shapes its views pass around,
// taken from the generated tool types, and what they work out alike.
//
// A group assignment may have a peer form: the members of each group's
// circle evaluate each other's contribution (rating each on criteria, or
// splitting 100 points among them) while its window is open. Those who grade
// read every evaluation with who wrote it; a student reads only their own,
// and, where the form shares it, their own average once it closes. Counted
// at the form's weight, what a member received moves their grade from the
// group's: the fair-share factor, what they received against an even share
// from the same raters (1 is even), moves it by weight × (factor − 1) of the
// group's score. A grader's own adjustment wins over it.
import type { Decimal, ListItem, ToolIn, ToolOut } from '@/api/types'

export type PeerFormView = NonNullable<ToolOut<'peer_form.get'>['form']>
export type PeerTask = NonNullable<ToolOut<'peer_form.get'>['task']>
export type PeerCriterion = NonNullable<PeerFormView['criteria']>[number]
export type PeerResults = ToolOut<'peer_review.results'>
export type PeerGroupResult = ListItem<'peer_review.results', 'groups'>
export type PeerMemberResult = NonNullable<PeerGroupResult['members']>[number]
export type PeerSheet = NonNullable<PeerGroupResult['sheets']>[number]
export type PeerEntry = NonNullable<PeerSheet['entries']>[number]
export type PeerWindow = PeerTask['window']
export type PeerFormSetIn = ToolIn<'peer_form.set'>

export type PeerKind = 'rating' | 'share'
export type WindowState = 'not_open' | 'open' | 'closed'
export type PeerOpens = 'on_hand_in' | 'at'
export type PeerSharing = 'none' | 'own_average'

/**
 * A form as every reading of it has it: peer_form.get's, the results', the
 * one peer_form.set answers with, and a proposal of peer_form.set's payload
 * (whose switches may be absent, as they are left as they were).
 */
export interface FormLike {
  kind: string
  criteria?: PeerCriterion[] | null
  scale_min?: number | null
  scale_max?: number | null
  self_evaluation?: boolean | null
  opens: string
  opens_at?: string | null
  closes_at: string
  weight: number
  share_with_students?: string | null
  enabled?: boolean | null
  visible_to?: string[] | null
  students_see?: string[] | null
  in_use?: boolean | null
}

/** Core's flags on a member: low, high, self_above_peers; as a rater, uniform and missing. */
export const MEMBER_FLAGS = ['low', 'high', 'self_above_peers', 'uniform', 'missing'] as const
export type MemberFlag = (typeof MEMBER_FLAGS)[number]

export function isRating(f: Pick<FormLike, 'kind'>): boolean {
  return f.kind === 'rating'
}

export function criteriaOf(f: Pick<FormLike, 'criteria'> | null | undefined): PeerCriterion[] {
  return f?.criteria ?? []
}

/** The form moves grades: switched on, with a weight above 0. */
export function formCounts(f: Pick<FormLike, 'enabled' | 'weight'> | null | undefined): boolean {
  return !!f && f.enabled !== false && Number(f.weight) > 0
}

/** A decimal as a number; NaN for none. */
export function num(v: Decimal | null | undefined): number {
  if (v === null || v === undefined || v === '') return NaN
  return typeof v === 'number' ? v : Number(v)
}

/** Rounds half away from zero to two places, as Core rounds a score worked out from a factor. */
export function round2(n: number): number {
  const r = Math.round(Math.abs(n) * 100 + 1e-9) / 100
  return n < 0 ? -r : r
}

/**
 * What a factor gives a member at a weight (a percentage) from group score
 * g: g × (1 − w + w × factor), held to zero and to the points possible
 * unless the group grade allows extra. For explaining it with figures; the
 * scores themselves are Core's.
 */
export function peerScore(g: number, weight: number, factor: number, points?: number, allowExtra = false): number {
  const w = weight / 100
  let s = round2(g * (1 - w + w * factor))
  if (s < 0) s = 0
  if (!allowExtra && points !== undefined && Number.isFinite(points) && s > points) s = points
  return s
}

/** A grade's adjustment that a grader made: replace or delta, which peer evaluation leaves as it is. */
export function isOwnAdjustment(kind: string | null | undefined): boolean {
  return kind === 'replace' || kind === 'delta'
}

/** The time a window opens, or null where it opens once the group hands in. */
export function opensAtOf(w: Pick<PeerWindow, 'opens' | 'opens_at'>): string | null {
  return w.opens === 'at' ? (w.opens_at ?? null) : null
}

/** Whether a window state is one Core names. */
export function windowState(s: string | null | undefined): WindowState {
  return s === 'open' || s === 'closed' ? s : 'not_open'
}

/**
 * The actions about peer evaluation whose page, and whose card in a queue,
 * show what they propose in words (PeerProposal): counting it in grades, a
 * form, and a student's evaluation sent where their handing in waits for
 * approval.
 */
export const PEER_ACTIONS = ['grade.apply_peer', 'peer_form.set', 'peer_review.submit'] as const
export type PeerAction = (typeof PEER_ACTIONS)[number]

export function isPeerAction(type: string | null | undefined): type is PeerAction {
  return (PEER_ACTIONS as readonly string[]).includes(type ?? '')
}

/** The heading of what such an action proposes, under peer.proposal.title. */
export function peerActionTitle(type: PeerAction): 'apply' | 'form' | 'sheet' {
  return type === 'grade.apply_peer' ? 'apply' : type === 'peer_form.set' ? 'form' : 'sheet'
}

/** The fields of such an action's payload that PeerProposal says, which the page's list of fields leaves out. */
export function peerFieldsShown(type: string | null | undefined): string[] {
  if (type === 'grade.apply_peer') return ['grades', 'form_version']
  if (type === 'peer_review.submit') return ['entries', 'comment']
  if (type === 'peer_form.set')
    return [
      'kind',
      'criteria',
      'scale_min',
      'scale_max',
      'self_evaluation',
      'opens',
      'opens_at',
      'closes_at',
      'weight',
      'share_with_students',
      'enabled',
      'version',
    ]
  return []
}
