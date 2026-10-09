// The peer form as a teacher edits it (PeerFormDialog): a draft made from
// the form read, or a new one; what is wrong with it before anything is
// sent; and what peer_form.set is sent, over the version read.
import dayjs from 'dayjs'
import { isDecimal } from '@/utils/format'
import {
  criteriaOf,
  isRating,
  type FormLike,
  type PeerFormSetIn,
  type PeerKind,
  type PeerOpens,
  type PeerSharing,
} from './peer'

export const MAX_CRITERIA = 10
export const MAX_LABEL = 200
export const MAX_DESCRIPTION = 1000
export const SCALE_MAX = 10
export const KEY_RE = /^[a-z0-9_]{1,32}$/

export interface CriterionDraft {
  /** The key the ratings name it by: kept as read, made from the label for a new one (keyFor). */
  key: string
  label: string
  description: string
  /** 0.1 to 10, as typed; empty for 1. */
  weight: string
}

export interface PeerFormDraft {
  enabled: boolean
  kind: PeerKind
  criteria: CriterionDraft[]
  scaleMin: number
  scaleMax: number
  selfEvaluation: boolean
  opens: PeerOpens
  /** RFC 3339, or '' for none. */
  opensAt: string
  closesAt: string
  /** 0 to 100: the percentage of each member's grade it moves. */
  weight: number
  shareWithStudents: PeerSharing
}

/** A new criterion's place, before its words are typed. */
export function blankCriterion(): CriterionDraft {
  return { key: '', label: '', description: '', weight: '' }
}

/**
 * A new form: members split 100 points, nobody evaluates themselves, it
 * opens for each group once the group hands its work in and closes a week
 * after the due date (or two weeks from now), at 23:59 on the teacher's
 * clock, for reference only (a weight of 0), and students see nothing but
 * their own evaluation. starters are the criteria a rating form begins with.
 */
export function newDraft(opts: { dueAt?: string | null; now?: number; starters: CriterionDraft[] }): PeerFormDraft {
  const now = dayjs(opts.now ?? Date.now())
  const due = opts.dueAt ? dayjs(opts.dueAt) : null
  const base = due && due.isAfter(now) ? due.add(7, 'day') : now.add(14, 'day')
  return {
    enabled: true,
    kind: 'share',
    criteria: opts.starters.map((c) => ({ ...c })),
    scaleMin: 1,
    scaleMax: 5,
    selfEvaluation: false,
    opens: 'on_hand_in',
    opensAt: '',
    closesAt: base.hour(23).minute(59).second(0).millisecond(0).toISOString(),
    weight: 0,
    shareWithStudents: 'none',
  }
}

/** The draft of a form read. starters fill a share form's criteria, should the teacher switch it to rating. */
export function draftFrom(f: FormLike, starters: CriterionDraft[] = []): PeerFormDraft {
  const rating = isRating(f)
  return {
    enabled: f.enabled !== false,
    kind: rating ? 'rating' : 'share',
    criteria: rating
      ? criteriaOf(f).map((c) => ({
          key: c.key,
          label: c.label,
          description: c.description ?? '',
          weight: c.weight === null || c.weight === undefined ? '' : String(c.weight),
        }))
      : starters.map((c) => ({ ...c })),
    scaleMin: f.scale_min ?? 1,
    scaleMax: f.scale_max ?? 5,
    selfEvaluation: !!f.self_evaluation,
    opens: f.opens === 'at' ? 'at' : 'on_hand_in',
    opensAt: f.opens_at ?? '',
    closesAt: f.closes_at,
    weight: Number(f.weight) || 0,
    shareWithStudents: f.share_with_students === 'own_average' ? 'own_average' : 'none',
  }
}

/**
 * A key for a criterion labelled so: its Latin letters and figures, lower
 * case, words joined by _, at most 32; one with none (a label in Chinese)
 * is c1, c2, …; never one taken.
 */
export function keyFor(label: string, taken: ReadonlySet<string>): string {
  const slug = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
    .replace(/_+$/g, '')
  if (slug && !taken.has(slug)) return slug
  for (let n = slug ? 2 : 1; ; n++) {
    const tail = slug ? `_${n}` : `c${n}`
    const k = slug ? `${slug.slice(0, 32 - tail.length).replace(/_+$/g, '')}${tail}` : tail
    if (!taken.has(k)) return k
  }
}

/** The criteria with a key each: kept where they have one, made from the label where not. */
export function withKeys(criteria: readonly CriterionDraft[]): CriterionDraft[] {
  const taken = new Set(criteria.map((c) => c.key).filter((k) => KEY_RE.test(k)))
  return criteria.map((c) => {
    if (KEY_RE.test(c.key)) return c
    const key = keyFor(c.label, taken)
    taken.add(key)
    return { ...c, key }
  })
}

export type FormField =
  'criteria' | 'label' | 'description' | 'criterionWeight' | 'scale' | 'opensAt' | 'closesAt' | 'weight'

/** What is wrong with a draft: the field, which criterion where it is one's, and the words' key under peer.form.problem. */
export interface FormProblem {
  field: FormField
  index?: number
  key: string
}

/** Everything that keeps a draft from being sent; nothing for one Core would take. */
export function formProblems(d: PeerFormDraft): FormProblem[] {
  const out: FormProblem[] = []
  if (d.kind === 'rating') {
    if (!d.criteria.length) out.push({ field: 'criteria', key: 'noCriteria' })
    if (d.criteria.length > MAX_CRITERIA) out.push({ field: 'criteria', key: 'tooManyCriteria' })
    d.criteria.forEach((c, index) => {
      const label = c.label.trim()
      if (!label) out.push({ field: 'label', index, key: 'labelRequired' })
      else if ([...label].length > MAX_LABEL) out.push({ field: 'label', index, key: 'labelTooLong' })
      if ([...c.description].length > MAX_DESCRIPTION)
        out.push({ field: 'description', index, key: 'descriptionTooLong' })
      const w = c.weight.trim()
      if (w && (!isDecimal(w) || Number(w) < 0.1 || Number(w) > 10))
        out.push({ field: 'criterionWeight', index, key: 'criterionWeight' })
    })
    const labels = d.criteria.map((c) => c.label.trim().toLowerCase()).filter(Boolean)
    if (new Set(labels).size !== labels.length) out.push({ field: 'criteria', key: 'sameLabel' })
    if (![0, 1].includes(d.scaleMin) || d.scaleMax <= d.scaleMin || d.scaleMax > SCALE_MAX)
      out.push({ field: 'scale', key: 'scale' })
  }
  if (!d.closesAt || !dayjs(d.closesAt).isValid()) out.push({ field: 'closesAt', key: 'closesRequired' })
  if (d.opens === 'at') {
    if (!d.opensAt || !dayjs(d.opensAt).isValid()) out.push({ field: 'opensAt', key: 'opensRequired' })
    else if (d.closesAt && !dayjs(d.opensAt).isBefore(dayjs(d.closesAt)))
      out.push({ field: 'opensAt', key: 'opensBeforeCloses' })
  }
  if (!Number.isInteger(d.weight) || d.weight < 0 || d.weight > 100) out.push({ field: 'weight', key: 'weight' })
  return out
}

/** What peer_form.set is sent for a draft, over the version read (0 for a new form). */
export function setArgs(courseId: string, assignmentId: string, d: PeerFormDraft, version: number): PeerFormSetIn {
  const rating = d.kind === 'rating'
  const args: PeerFormSetIn = {
    course_id: courseId,
    assignment_id: assignmentId,
    enabled: d.enabled,
    kind: d.kind,
    self_evaluation: d.selfEvaluation,
    opens: d.opens,
    closes_at: dayjs(d.closesAt).toISOString(),
    weight: d.weight,
    share_with_students: d.shareWithStudents,
    version,
  }
  if (d.opens === 'at') args.opens_at = dayjs(d.opensAt).toISOString()
  if (rating) {
    args.criteria = withKeys(d.criteria).map((c) => {
      const out: NonNullable<PeerFormSetIn['criteria']>[number] = { key: c.key, label: c.label.trim() }
      if (c.description.trim()) out.description = c.description.trim()
      if (c.weight.trim()) out.weight = c.weight.trim()
      return out
    })
    args.scale_min = d.scaleMin
    args.scale_max = d.scaleMax
  }
  return args
}

/** What a criterion is, as compared: its key, words and weight (1 when none is said). */
function criterionSig(c: { key: string; label: string; description?: string | null; weight?: unknown }): string {
  const w = c.weight === null || c.weight === undefined || c.weight === '' ? 1 : Number(c.weight)
  return JSON.stringify([c.key, c.label.trim(), (c.description ?? '').trim(), w])
}

/**
 * Whether the draft changes what is evaluated (kind, criteria, scale,
 * self-evaluation), which no longer changes once an evaluation has been
 * written (form_in_use); its dates, weight and sharing still do.
 */
export function shapeChanged(f: FormLike, d: PeerFormDraft): boolean {
  if (f.kind !== d.kind || !!f.self_evaluation !== d.selfEvaluation) return true
  if (d.kind !== 'rating') return false
  if ((f.scale_min ?? null) !== d.scaleMin || (f.scale_max ?? null) !== d.scaleMax) return true
  const was = criteriaOf(f).map(criterionSig)
  const now = withKeys(d.criteria).map(criterionSig)
  return was.length !== now.length || was.some((s, i) => s !== now[i])
}

/**
 * Who reads what, by the words' keys under peer.sees: those who grade read
 * every evaluation, with who wrote it, as those who decide actions do in
 * the action log; a student their own evaluation, and their own average
 * once it closes where the form shares it, and how it moved their grade
 * where it counts. As the form says (visible_to, students_see), or as a
 * draft will.
 */
export function whoSees(f: FormLike | PeerFormDraft): { staff: string[]; students: string[] } {
  if ('closes_at' in f) {
    const staff = (f.visible_to ?? ['graders', 'action_record']).filter((v) => v === 'graders' || v === 'action_record')
    const counts = f.enabled !== false && Number(f.weight) > 0
    const students = f.students_see ?? [
      'own_sheet',
      ...(f.share_with_students === 'own_average' ? ['own_average'] : []),
      ...(counts ? ['own_adjustment'] : []),
    ]
    return { staff, students: students.filter((v) => ['own_sheet', 'own_average', 'own_adjustment'].includes(v)) }
  }
  const students = ['own_sheet']
  if (f.shareWithStudents === 'own_average') students.push('own_average')
  if (f.enabled && f.weight > 0) students.push('own_adjustment')
  return { staff: ['graders', 'action_record'], students }
}
