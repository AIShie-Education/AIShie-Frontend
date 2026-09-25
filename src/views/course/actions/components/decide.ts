// What deciding or reviewing came to, as the panels report it to the page.
import type { ToolOut } from '@/api/types'

export type DecideResult = ToolOut<'action.decide'>

export type Done =
  /** The decision was made; `out.outcome` is what became of the proposal. */
  | { kind: 'decided'; decision: 'approve' | 'reject'; out: DecideResult }
  /** The caller's decision is itself a proposal now (their action_decide needs approval). */
  | { kind: 'proposed'; decision: 'approve' | 'reject' | 'reviewed' | 'escalated'; actionId: string }
  /** Reviewed or escalated. */
  | { kind: 'reviewed'; state: 'reviewed' | 'escalated' }
  /** Somebody else got there first; the page should reload. */
  | { kind: 'stale' }
