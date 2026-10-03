// What the chat tells the one asking about who else reads a conversation and
// where an agent sends what is written in it (AIShie-Frontend#79): a short
// line under the composer, the same points on a new conversation the first
// time the person opens one, and the whole notice behind "More". Each
// statement is one Core or the runtime makes true today:
//
// - Who reads it is Core's visible_to (chat.ts, visibleToLines): its two
//   participants, course staff who decide actions for the opener, anyone who
//   decides actions in the course (through each message's action), the
//   respondent's other askers where it answers others, and, of every
//   conversation, the site's administrators and the course's department's,
//   who may export it for audit (docs/schema.md §2.8). Whoever decides
//   actions in the course may be an agent (a seat may hold action_decide at
//   confirm_required, §2.2), so the short line and the points name such
//   agents among the readers, and the notice says where they send it.
// - Nothing in a conversation is deleted: no conversation is, messages are
//   append-only, and a withdrawn message keeps its text, in the action that
//   wrote it and in an export for audit, and its files, which an export
//   describes but holds none of the bytes of (§2.8).
// - An agent hosted on AIshie answers through the runtime, which sends the
//   conversation's messages (a withdrawn one as "[message retracted]"), the
//   files it reads and what it reads in the course to the agent's model:
//   the school's plan's, with the owner's own model as its fallback, or the
//   owner's own (the runtime's design, §6 and D8); on the school's plan the
//   fallback answers too when the school's model cannot (§5.3), so the line
//   names both providers where they differ. The text the runtime reads by
//   OCR from an attached image or scan it keeps 180 days, withdrawn or not
//   (§4, OCR; §8). Which model that is the
//   runtime tells the agent's owner alone (GET /agents), so a provider is
//   named only to the owner; anyone else is told that a model's provider
//   receives it, never which.
// - An agent with MCP access is used from its owner's own tools; where they
//   send what they read is nothing the site knows.
//
// The words are the reader's language's (chat.privacy); this says which.
import type { HostedAgent, ModelsAnswer } from '@/api/runtime-types'
import { visibleToLines, type VisibleToLine } from './chat'

/** How the agent answering is run, as far as the page knows: by AIshie's runtime, from its owner's tools (MCP), or not known. */
export type AnswerHosting = 'runtime' | 'mcp' | null

/** A model a hosted agent answers with: who provides it, and its name. */
export interface AnswerModel {
  provider: string
  model: string
}

/** The models a hosted agent answers with, as the runtime tells its owner. */
export interface AnswerModels {
  /** school: the school's plan, the school's key; own: the owner's own key. */
  plan: 'school' | 'own'
  model: AnswerModel
  /** The owner's own model behind the school's, which answers when the school's cannot. */
  fallback: AnswerModel | null
}

/**
 * The models a hosted agent answers with, from the runtime's row: on the
 * school's plan while the school still offers it, with the owner's own model
 * behind it where there is one; otherwise the owner's own; null for none
 * (it runs on nothing yet, and answers nothing).
 */
export function answerModelsOf(agent: Pick<HostedAgent, 'model'>): AnswerModels | null {
  const own = agent.model?.own
  const ownModel = own?.provider && own.model ? { provider: own.provider, model: own.model } : null
  const school = agent.model?.school
  if (school?.offered && school.provider && school.model) {
    return {
      plan: 'school',
      model: { provider: school.provider, model: school.model },
      fallback: school.fallback ? ownModel : null,
    }
  }
  return ownModel ? { plan: 'own', model: ownModel, fallback: null } : null
}

/**
 * The caller's own hosted agent answering in a course, among those the
 * runtime hosts for them: the one seated in the course under the name the
 * conversation shows. Only when exactly one is (nothing else ties a seat to
 * the runtime's row): else null, and no provider is named.
 */
export function ownHostedIn(
  agents: readonly HostedAgent[] | null | undefined,
  courseId: string,
  name: string,
): HostedAgent | null {
  const found = (agents ?? []).filter(
    (a) => a.display_name === name && (a.seats ?? []).some((s) => s.course_id === courseId),
  )
  return found.length === 1 ? found[0]! : null
}

/** A provider by the name the runtime gives it (GET /models), or by its id where it gives none. */
export function providerName(provider: string, models: Pick<ModelsAnswer, 'own_key'> | null | undefined): string {
  return models?.own_key?.providers?.find((p) => p.provider === provider)?.label || provider
}

/** Where what is written goes, by what the page knows of the agent. */
export type RouteKind = 'model' | 'runtime' | 'mcp' | 'unknown'

/** A sentence of the notice: its key under chat.privacy and what fills it. */
export interface Said {
  key: string
  params: Record<string, string>
}

export interface PrivacyNotice {
  kind: RouteKind
  /** The short line, under the composer. */
  line: Said
  /** Who can read it, as the chat words Core's visible_to. */
  readers: VisibleToLine[]
  /** Under the readers: where an agent among them sends what it reads; null where none may be. */
  readersNote: Said | null
  /** Where it goes to be answered: none where the respondent is a person (a conversation from before agents alone). */
  route: Said[]
  /** What is kept of it. */
  kept: Said[]
  /** The three points of the first time: who reads it, where it goes, what is kept. */
  points: Said[]
}

export interface PrivacyFacts {
  /** The agent's name. */
  name: string
  /** The respondent is an agent (the default); false for a person, of a conversation from before. */
  agent?: boolean
  /** Core's visible_to, once read; null before (a new conversation). */
  visibleTo?: readonly string[] | null
  /** The respondent answers others too (Core says so of any but the opener's own agent). */
  answersOthers?: boolean
  hosting: AnswerHosting
  /** The models it answers with, where the runtime told the caller (their own agent). */
  models?: AnswerModels | null
  /** A provider's name to show (providerName); its id where none is given. */
  providerName?: (provider: string) => string
}

/** The notice for a conversation with an agent: every sentence as a key and its parameters. */
export function privacyNotice(f: PrivacyFacts): PrivacyNotice {
  const name = f.name
  const label = f.providerName ?? ((p: string) => p)
  const readers = visibleToLines(f.visibleTo, { answersOthers: f.answersOthers })
  const agent = f.agent ?? true
  const readersNote = readers.some((l) => 'key' in l && (l.key === 'overseers' || l.key === 'actionRecord'))
    ? { key: 'agentReaders', params: {} }
    : null
  const kind: RouteKind = !agent
    ? 'unknown'
    : f.hosting === 'mcp'
      ? 'mcp'
      : f.hosting === 'runtime'
        ? f.models
          ? 'model'
          : 'runtime'
        : 'unknown'

  const route: Said[] = []
  const kept: Said[] = [
    { key: 'kept.notDeleted', params: {} },
    { key: 'kept.withdrawn', params: {} },
  ]
  let line: Said
  let goes: Said
  switch (kind) {
    case 'model': {
      const m = f.models!
      const provider = label(m.model.provider)
      // The fallback's provider too, where it is another: it answers when the school's model cannot.
      const fallbackProvider = m.fallback ? label(m.fallback.provider) : null
      if (fallbackProvider && m.fallback!.provider !== m.model.provider) {
        line = { key: 'line.modelFallback', params: { name, provider, fallbackProvider } }
        goes = { key: 'points.modelFallback', params: { name, provider, fallbackProvider } }
      } else {
        line = { key: 'line.model', params: { name, provider } }
        goes = { key: 'points.model', params: { name, provider } }
      }
      route.push({ key: 'route.hosted', params: { name } })
      route.push({
        key: m.plan === 'school' ? 'route.school' : 'route.own',
        params: { name, provider, model: m.model.model },
      })
      if (m.fallback)
        route.push({
          key: 'route.fallback',
          params: { name, provider: label(m.fallback.provider), model: m.fallback.model },
        })
      break
    }
    case 'runtime':
      line = { key: 'line.runtime', params: { name } }
      goes = { key: 'points.runtime', params: { name } }
      route.push({ key: 'route.hosted', params: { name } })
      route.push({ key: 'route.unknownModel', params: { name } })
      break
    case 'mcp':
      line = { key: 'line.mcp', params: { name } }
      goes = { key: 'points.mcp', params: { name } }
      route.push({ key: 'route.mcp', params: { name } })
      break
    default:
      line = { key: 'line.unknown', params: { name } }
      goes = { key: 'points.unknown', params: { name } }
      if (agent) route.push({ key: 'route.unknown', params: { name } })
  }
  // The runtime sends a withdrawn message to the model no more; what it sent before stays sent. What
  // it read by OCR of an attached image or scan it keeps, withdrawn or not.
  if (kind === 'model' || kind === 'runtime') {
    kept.push({ key: 'kept.withdrawnModel', params: { name } })
    kept.push({ key: 'kept.ocr', params: {} })
  }

  return {
    kind,
    line,
    readers,
    readersNote,
    route,
    kept,
    points: [{ key: 'points.readers', params: {} }, goes, { key: 'points.kept', params: {} }],
  }
}

// --- The first time ------------------------------------------------------------------
// The points are shown on a new conversation until the person has seen them
// (Got it, or sending its first question), once in this browser for each
// person: aishie.chatPrivacySeen.<actorId>. Where the browser refuses
// storage, once a page load.

const SEEN_PREFIX = 'aishie.chatPrivacySeen.'
const seenHere = new Set<string>()

/** Whether this person has seen the points, in this browser or on this page. */
export function privacySeen(actorId: string | null | undefined): boolean {
  if (!actorId) return true
  if (seenHere.has(actorId)) return true
  try {
    return localStorage.getItem(SEEN_PREFIX + actorId) === '1'
  } catch {
    return false
  }
}

/** Remembers that this person has seen the points. */
export function notePrivacySeen(actorId: string | null | undefined): void {
  if (!actorId) return
  seenHere.add(actorId)
  try {
    localStorage.setItem(SEEN_PREFIX + actorId, '1')
  } catch {
    // Storage refused: remembered for this page alone.
  }
}

/** Forgets what this page remembers (for tests). */
export function forgetPrivacySeen(): void {
  seenHere.clear()
}
