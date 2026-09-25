// Grades proposed for one submission and still waiting for approval. Such a
// proposal is not a grade: nothing exists until someone approves it, and it
// then becomes a draft dated when it was proposed. Core refuses to approve
// it over a draft entered after that (grade.go, noNewerDraft), so a grader
// needs to know about it before entering one.
import { ApiError, read } from '@/api/http'
import type { ActionSummary, Decimal, GradeSummary } from '@/api/types'

const PAGE = 200

type Page = { actions: ActionSummary[] | null; next?: string | null }

async function collect(
  fetchPage: (after: string | undefined) => Promise<Page>,
  keep: (a: ActionSummary) => boolean,
): Promise<ActionSummary[]> {
  const out: ActionSummary[] = []
  let after: string | undefined
  for (;;) {
    const page = await fetchPage(after)
    out.push(...(page.actions ?? []).filter(keep))
    if (!page.next) return out
    after = page.next
  }
}

/**
 * The proposed grades for a submission that wait for a decision, oldest
 * first. Someone who decides proposals reads the approval queue, which holds
 * everyone's; anyone else can only read their own actions, and only a seat
 * whose grading waits for approval (or whose level is not known) has any to
 * find there.
 */
export async function loadPendingGradeProposals(
  courseId: string,
  submissionId: string,
  reach: { decides: boolean; mightPropose: boolean },
): Promise<ActionSummary[]> {
  const forThis = (a: ActionSummary) =>
    a.status === 'proposed' &&
    a.action_type === 'grade.submit' &&
    a.target_type === 'submission' &&
    a.target_id === submissionId
  if (reach.decides) {
    try {
      return await collect(
        (after) => read('action.list_proposed', { course_id: courseId, limit: PAGE, after }),
        forThis,
      )
    } catch (e) {
      // A guess that the seat decides, refused: its own are still readable.
      if (!(e instanceof ApiError && e.isForbidden)) throw e
    }
  }
  if (!reach.mightPropose) return []
  return collect((after) => read('action.list_mine', { course_id: courseId, limit: PAGE, after }), forThis)
}

function field(a: ActionSummary, key: string): unknown {
  const p = a.payload
  return p && typeof p === 'object' ? (p as Record<string, unknown>)[key] : undefined
}

function decimalField(a: ActionSummary, key: string): Decimal | undefined {
  const v = field(a, key)
  return typeof v === 'number' || typeof v === 'string' ? v : undefined
}

/** The score a grade.submit proposal would give. */
export function proposedScore(a: ActionSummary): Decimal | undefined {
  return decimalField(a, 'score')
}

/** What the proposed score is out of, as recorded when it was proposed. */
export function proposedOutOf(a: ActionSummary): Decimal | undefined {
  return decimalField(a, 'out_of')
}

/**
 * What approving a proposal would come to, as far as the grades that can be
 * read show: refused over a newer draft; replacing an older one; or a draft
 * that can never be posted, beside a posted grade.
 */
export type ProposalFate = 'newerDraft' | 'replacesDraft' | 'posted' | null

export function proposalFate(a: ActionSummary, liveDraft?: GradeSummary, livePosted?: GradeSummary): ProposalFate {
  if (livePosted) return 'posted'
  if (!liveDraft) return null
  return Date.parse(liveDraft.created_at) > Date.parse(a.created_at) ? 'newerDraft' : 'replacesDraft'
}
