// An answer in the making, as Core will show it while a hosted agent works
// (the draft contract shared by Core, the runtime and this front end): what
// it is doing, step by step, and, where its answer needs nobody's
// confirmation, the text so far. conversation.messages and conversation.get
// will carry it as `draft`, null when there is none; the posted message then
// takes its place.
//
// Not in Core's catalogue yet: useConversation holds `draft` as null until it
// is, and the pane shows it only when it is not (ChatDraft).

/** What a step of the agent's work is, as the runtime names it; anything else reads as "tool". */
export const DRAFT_STEP_KINDS = [
  'thinking',
  'reading_document',
  'listing_documents',
  'reading_assignment',
  'reading_submission',
  'searching_memory',
  'writing',
  'tool',
] as const
export type DraftStepKind = (typeof DRAFT_STEP_KINDS)[number]

export interface DraftStep {
  kind: string
  /** What it works on (a document's title), as plain text. */
  target?: string | null
  state: 'running' | 'done' | string
}

export interface ConversationDraft {
  /** The runtime's id of this attempt at an answer. */
  attempt: string
  /** Newer with each write of the attempt. */
  version: number
  updated_at: string
  steps?: DraftStep[] | null
  /** The whole answer so far, where the caller may see it. */
  text?: string | null
  /** The answer needs someone's confirmation before it shows: the steps only. */
  text_hidden?: boolean | null
}

/** A step's kind as one the app has words for. */
export function stepKind(step: Pick<DraftStep, 'kind'>): DraftStepKind {
  return (DRAFT_STEP_KINDS as readonly string[]).includes(step.kind) ? (step.kind as DraftStepKind) : 'tool'
}

/** Whether a step is done (anything but running is taken as done). */
export const stepDone = (step: Pick<DraftStep, 'state'>) => step.state !== 'running'

/**
 * The message that says a step, running or done, with its target or
 * without: chat.draft.steps.<kind>.<running|done>[Target].
 */
export function stepMessage(step: DraftStep): { key: string; target?: string } {
  const kind = stepKind(step)
  const target = step.target?.trim() || undefined
  const key = `chat.draft.steps.${kind}.${stepDone(step) ? 'done' : 'running'}${target ? 'Target' : ''}`
  return target ? { key, target } : { key }
}

/**
 * What the agent looked at: done steps other than thinking and writing,
 * which the step list sums up as "consulted N" once the answer's text begins.
 */
export function consulted(steps: readonly DraftStep[] | null | undefined): DraftStep[] {
  return (steps ?? []).filter((s) => stepDone(s) && !['thinking', 'writing'].includes(stepKind(s)))
}
