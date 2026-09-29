// What becomes of the grades already entered on a piece of work when what it
// is worth changes (existing_grades on assignment.update and component.update):
// rescale writes each score again in proportion, and keep_scores leaves each as
// it was, out of the new points. Core refuses keep_scores when a score within
// the old points would be above the new ones (score_above_points), and rescale
// when the work was worth nothing (nothing_to_rescale). This works out, from
// the scores the caller can read, which choice Core would refuse and an
// example of each in the actual numbers; Core decides.
import { read } from '@/api/http'
import type { Decimal, GradeSummary } from '@/api/types'
import { compareDecimals, rescaleScore } from './grading'

export type ExistingGrades = 'rescale' | 'keep_scores'

/** One way of carrying the grades across, with the example the form shows and why it is refused, if it is. */
export interface PointsChoice {
  /** The score the example is about, and what it becomes (out of `to`). */
  example: { score: string; becomes: string }
  /** Why Core would refuse it; null when it would not. */
  blocked: null | { reason: 'nothing_to_rescale' } | { reason: 'score_above_points'; count: number }
}

export interface PointsPlan {
  from: string
  to: string
  /** How many live entered grades there are, where the caller could read them; null when not known. */
  count: number | null
  rescale: PointsChoice
  keep_scores: PointsChoice
}

function plain(v: Decimal): string {
  return String(v).trim()
}

function highest(scores: string[]): string | null {
  return scores.reduce<string | null>((m, s) => (m === null || compareDecimals(s, m) === 1 ? s : m), null)
}

/**
 * The plan for changing what the work is worth from `from` to `to`, given
 * the live entered scores on it (null when they could not be read: the
 * example is then full marks). The example is the highest score, or for a
 * refused keep_scores the highest score it is refused for.
 */
export function pointsPlan(scores: readonly Decimal[] | null, from: Decimal, to: Decimal): PointsPlan {
  const f = plain(from)
  const tt = plain(to)
  const list = (scores ?? []).map(plain)
  const sample = highest(list) ?? f
  // keep_scores: refused for a score above the new points that was within the old.
  const above = list.filter((s) => compareDecimals(s, tt) === 1 && compareDecimals(s, f) !== 1)
  const keepSample = highest(above) ?? sample
  const zero = compareDecimals(f, 0) === 0
  return {
    from: f,
    to: tt,
    count: scores ? list.length : null,
    rescale: {
      example: { score: sample, becomes: zero ? sample : (rescaleScore(sample, f, tt) ?? sample) },
      blocked: zero ? { reason: 'nothing_to_rescale' } : null,
    },
    keep_scores: {
      example: { score: keepSample, becomes: keepSample },
      blocked: above.length ? { reason: 'score_above_points', count: above.length } : null,
    },
  }
}

/** A grade entered by a grader that stands now: a draft, or posted and not replaced. */
export function isLiveEntered(g: Pick<GradeSummary, 'origin' | 'state' | 'superseded_by'>): boolean {
  return g.origin === 'entered' && g.state !== 'superseded' && !g.superseded_by
}

/**
 * The scores of the grades entered on an assignment, or on a directly graded
 * component, that stand now, as far as the caller may read them
 * (grade.list); rejects as the read does. At most `pages` pages are read.
 */
export async function enteredScores(
  courseId: string,
  on: { assignmentId: string } | { componentId: string },
  pages = 20,
): Promise<string[]> {
  const out: string[] = []
  let after: string | undefined
  for (let i = 0; i < pages; i++) {
    const page = await read('grade.list', {
      course_id: courseId,
      assignment_id: 'assignmentId' in on ? on.assignmentId : undefined,
      limit: 200,
      after,
    })
    for (const g of page.grades ?? []) {
      if (!isLiveEntered(g)) continue
      if ('assignmentId' in on ? g.assignment_id === on.assignmentId : g.component_id === on.componentId) {
        out.push(String(g.score))
      }
    }
    if (!page.next) break
    after = page.next
  }
  return out
}
