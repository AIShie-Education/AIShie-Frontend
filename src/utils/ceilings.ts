// A seat's ceilings: the most it may hold of each permission at all, whoever
// grants it (docs/schema.md §2.2, Ceilings). Core works them out by one rule
// and says them on every view of a seat (member.get, member.list,
// me.memberships, member.delegate_defaults): perm_ceilings, every
// permission's, and perm_ceiling_reasons, a code for each below autonomous.
// A refusal to go above one gives the same code as its reason, with the
// permission and the ceiling. Nothing here works a ceiling out: what Core
// says is offered, and what it did not say is not held against anyone.
import { AUTONOMY_LEVELS, PERMS, type AutonomyLevel, type Perm, type PermLevels } from '@/api/types'
import { i18n } from '@/i18n'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})
const te = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

/** Why a ceiling is below autonomous, in Core's codes. */
export type CeilingReason =
  'agent_never' | 'agent_decides_by_proposal' | 'student_agent_by_proposal' | 'principal_level'
export const CEILING_REASONS: readonly CeilingReason[] = [
  'agent_never',
  'agent_decides_by_proposal',
  'student_agent_by_proposal',
  'principal_level',
]

export function isCeilingReason(v: unknown): v is CeilingReason {
  return typeof v === 'string' && (CEILING_REASONS as readonly string[]).includes(v)
}

/** What a seat may hold at most, and why, as Core said it. */
export interface Ceilings {
  /** Each permission Core gave a ceiling for. */
  levels: PermLevels
  /** Core's reason code, for each permission whose ceiling is below autonomous. */
  reasons: Partial<Record<Perm, string>>
}

type Levels = Record<string, string | undefined> | null | undefined

function isLevel(v: unknown): v is AutonomyLevel {
  return typeof v === 'string' && (AUTONOMY_LEVELS as string[]).includes(v)
}

/** Where a level sits on the ladder: denied 0 … autonomous 3; anything else counts as denied. */
function rank(l: string | null | undefined): number {
  const i = AUTONOMY_LEVELS.indexOf(l as AutonomyLevel)
  return i < 0 ? 0 : i
}

/**
 * The ceilings of a seat as a view of it gives them, or null when it gives
 * none (a Core from before them). A permission it leaves out, or names a
 * level for that is not one, has no ceiling here.
 */
export function ceilingsOf(
  seat: { perm_ceilings?: Levels; perm_ceiling_reasons?: Levels } | null | undefined,
): Ceilings | null {
  const raw = seat?.perm_ceilings
  if (!raw || typeof raw !== 'object') return null
  const levels: PermLevels = {}
  const reasons: Partial<Record<Perm, string>> = {}
  for (const p of PERMS) {
    const l = raw[p]
    if (!isLevel(l)) continue
    levels[p] = l
    const why = seat?.perm_ceiling_reasons?.[p]
    if (l !== 'autonomous' && typeof why === 'string' && why) reasons[p] = why
  }
  return { levels, reasons }
}

/** The ceiling of p, when there is one below autonomous. */
export function ceilingOf(c: Ceilings | null | undefined, p: Perm): AutonomyLevel | null {
  const l = c?.levels[p]
  return l && l !== 'autonomous' ? l : null
}

/** Whether level l is more than a seat with these ceilings may hold of p. */
export function aboveCeiling(c: Ceilings | null | undefined, p: Perm, l: string | null | undefined): boolean {
  const max = ceilingOf(c, p)
  return !!max && !!l && rank(l) > rank(max)
}

/** Levels brought down to the ceilings, as Core cuts a preset's down when it seats someone with it. */
export function capToCeilings(perms: PermLevels, c: Ceilings | null | undefined): PermLevels {
  if (!c) return { ...perms }
  const out: PermLevels = { ...perms }
  for (const [p, l] of Object.entries(perms) as [Perm, AutonomyLevel][]) {
    if (aboveCeiling(c, p, l)) out[p] = c.levels[p]
  }
  return out
}

/**
 * A reason code in the reader's words, as a clause that follows "because".
 * An agent's answers are capped by what the person it acts for may ask,
 * which is said for conversation_answer. A code this app does not know is
 * given as Core named it.
 */
export function ceilingReasonText(reason: string | null | undefined, p?: Perm | string | null): string {
  if (!reason) return ''
  const special = `enums.ceilingReason.${reason}_${p}`
  if (p && /^[a-z_]+$/.test(reason) && /^[a-z_]+$/.test(p) && te(special)) return t(special)
  const key = `enums.ceilingReason.${reason}`
  return /^[a-z_]+$/.test(reason) && te(key) ? t(key) : reason
}

function levelName(l: string): string {
  return te(`enums.level.${l}`) ? t(`enums.level.${l}`) : l
}

function permName(p: string): string {
  return te(`enums.perm.${p}`) ? t(`enums.perm.${p}`) : p
}

/**
 * What a permission editor says of a capped row, and on each level it greys
 * out: how far the seat may go, and why. Null where nothing caps it.
 */
export function ceilingNote(c: Ceilings | null | undefined, p: Perm): string | null {
  const max = ceilingOf(c, p)
  if (!max) return null
  const why = ceilingReasonText(c?.reasons[p], p)
  if (max === 'denied') return why ? t('common.ceiling.never', { why }) : t('common.ceiling.neverBare')
  return why
    ? t('common.ceiling.atMost', { level: levelName(max), why })
    : t('common.ceiling.atMostBare', { level: levelName(max) })
}

/**
 * Core's refusal of a level above a ceiling, in the reader's words: "{permission}
 * can be at most {ceiling} here, because …". Null for any other refusal.
 */
export function ceilingRefusalText(details: Record<string, unknown> | null | undefined): string | null {
  const reason = details?.reason
  const permission = details?.permission
  const ceiling = details?.ceiling
  if (!isCeilingReason(reason) || typeof permission !== 'string' || typeof ceiling !== 'string') return null
  const why = ceilingReasonText(reason, permission)
  const args = { permission: permName(permission), ceiling: levelName(ceiling), why }
  return ceiling === 'denied' ? t('common.ceiling.refusedNever', args) : t('common.ceiling.refused', args)
}

/**
 * The ceilings of the seat member.add would make for an actor of this kind,
 * for the dialog that makes it, where there is no seat yet for Core to say
 * them of. member.add says the one rule that applies there: an agent decides
 * and reviews only by proposal, a preset's action_decide cut down to
 * confirm_required and a level named above it refused. (An agent someone
 * owns is not seated with member.add at all, and a person's seat has no
 * ceiling below autonomous.) Core decides; this only keeps the form from
 * offering what it would refuse.
 */
export function newSeatCeilings(kind: string | null | undefined): Ceilings | null {
  if (kind !== 'agent') return null
  return { levels: { action_decide: 'confirm_required' }, reasons: { action_decide: 'agent_decides_by_proposal' } }
}
