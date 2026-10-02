// What deciding or reviewing came to, as the panels report it to the page.
import type { ToolOut } from '@/api/types'

export type DecideResult = ToolOut<'action.decide'>

/** action.decide's decisions: request_changes sends the proposal back to its proposer, with a note. */
export type Decision = 'approve' | 'reject' | 'request_changes'

export type Done =
  /** The decision was made; `out.outcome` is what became of the proposal. */
  | { kind: 'decided'; decision: Decision; out: DecideResult }
  /** The caller's decision is itself a proposal now (their action_decide needs approval). */
  | { kind: 'proposed'; decision: Decision | 'reviewed' | 'escalated'; actionId: string }
  /** Reviewed or escalated; byOwner when as the owner of the agent that did it. */
  | { kind: 'reviewed'; state: 'reviewed' | 'escalated'; byOwner?: boolean }
  /** Taken back while it waited (action.withdraw): the caller's own, or their agent's as its owner. */
  | { kind: 'withdrawn'; byOwner: boolean }
  /** Somebody else got there first; the page should reload. */
  | { kind: 'stale' }
