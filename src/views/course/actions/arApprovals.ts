// AR owns these proposals and review records. An AR approval id is never a
// Core action id: every read and write in this feature stays on runtimeChat.
import { ApiError } from '@/api/http'
import { runtimeChat, type ChatApproval, type ChatMessage, type ChatSnapshot } from '@/api/runtimeChat'

export interface ArApprovalDetail {
  approval: ChatApproval
  snapshot: ChatSnapshot
}

export type ArApprovalResult = ArApprovalDetail
export type ArApprovalMode = 'decision' | 'review'

/** The message a proposal or post-review record is about. */
export function arApprovalTarget(detail: ArApprovalDetail): ChatMessage | null {
  return detail.snapshot.messages.find((m) => m.id === detail.approval.message_id) ?? null
}

/**
 * AR deliberately keeps its internal approval mode out of browser JSON. A
 * pending target has not happened yet; a posted target is awaiting review
 * after the fact. Other states are stale and are not offered for action.
 */
export function arApprovalMode(detail: ArApprovalDetail): ArApprovalMode | null {
  switch (arApprovalTarget(detail)?.status) {
    case 'pending':
      return 'decision'
    case 'posted':
      return 'review'
    default:
      return null
  }
}

/** The question itself, or the latest question before the answer being judged. */
export function arApprovalQuestion(detail: ArApprovalDetail): ChatMessage | null {
  const target = arApprovalTarget(detail)
  if (!target) return null
  if (target.role === 'user') return target
  let found: ChatMessage | null = null
  for (const message of detail.snapshot.messages) {
    if (message.seq >= target.seq) break
    if (message.role === 'user') found = message
  }
  return found
}

/**
 * The reviewer detail route adds the authorized conversation snapshot to the
 * original approval envelope. Keep the additive field checked at the boundary
 * so an older runtime cannot make the page invent or display partial detail.
 */
export async function readArApproval(
  listed: ChatApproval,
  opts: { signal?: AbortSignal } = {},
): Promise<ArApprovalDetail> {
  const out = (await runtimeChat.approval(listed.id, opts)) as { approval: ChatApproval; snapshot?: ChatSnapshot }
  if (!out.snapshot) throw new Error('approval detail has no snapshot')
  const { approval, snapshot } = out
  if (
    approval.id !== listed.id ||
    approval.course_id !== listed.course_id ||
    approval.conversation_id !== listed.conversation_id ||
    snapshot.conversation.id !== approval.conversation_id ||
    snapshot.conversation.course_id !== approval.course_id ||
    !arApprovalTarget({ approval, snapshot })
  ) {
    throw new Error('approval detail does not match its list entry')
  }
  return { approval, snapshot }
}

/** AR uses not_found for both an unknown id and one the caller may not see. */
export function arApprovalInvisible(e: unknown): boolean {
  return e instanceof ApiError && (e.isForbidden || e.isNotFound)
}

/** Someone else settled it, or its live conversation changed, meanwhile. */
export function arApprovalStale(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 409 || e.code === 'conflict')
}

/** A safe, explicit refusal for a judge whose own decisions need confirmation. */
export function arReviewerConfirmationRequired(e: unknown): boolean {
  return e instanceof ApiError && e.details?.reason === 'reviewer_confirmation_required'
}
