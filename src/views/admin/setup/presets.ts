// Small shared pieces for the platform set-up pages (terms, departments,
// permission presets).
import {
  AUTONOMY_LEVELS,
  PERMS,
  type AutonomyLevel,
  type PermLevels,
  type Preset,
  type Role,
  type Scope,
} from '@/api/types'
import { i18n } from '@/i18n'

const g = i18n.global as unknown as { t: (key: string) => string; te: (key: string) => boolean }

/** A side drawer, the whole width on a phone. */
export const DRAWER_SIZE = 'min(560px, 100vw)'

export function isBuiltin(p: Pick<Preset, 'dept_id'>): boolean {
  return !p.dept_id
}

/**
 * A preset's name as a reader should see it: a built-in's in the reader's
 * language (as the course's member pages show it), a department's own as its
 * author wrote it. Core's name, the identifier, is p.name.
 */
export function presetLabel(p: Pick<Preset, 'name' | 'dept_id'>): string {
  const key = `adminSetup.presets.builtinNames.${p.name}`
  return isBuiltin(p) && g.te(key) ? g.t(key) : p.name
}

/** Whether presetLabel says something other than Core's name, which is then worth showing beside it. */
export function hasOwnLabel(p: Pick<Preset, 'name' | 'dept_id'>): boolean {
  return presetLabel(p) !== p.name
}

/** A built-in's description in the reader's language; a department's own as its author wrote it. */
export function presetDescription(p: Pick<Preset, 'name' | 'dept_id' | 'description'>): string {
  const key = `adminSetup.presets.builtinDescriptions.${p.name}`
  if (isBuiltin(p) && g.te(key)) return g.t(key)
  return p.description ?? ''
}

function asLevel(v: string | undefined): AutonomyLevel {
  return (AUTONOMY_LEVELS as string[]).includes(v ?? '') ? (v as AutonomyLevel) : 'denied'
}

/** All thirteen, each at a level: what Core means by a preset's perms. */
export function fullPerms(perms: Record<string, string | undefined> | null | undefined): Record<string, AutonomyLevel> {
  const out: Record<string, AutonomyLevel> = {}
  for (const p of PERMS) out[p] = asLevel(perms?.[p])
  return out
}

export function permLevels(p: Preset): PermLevels {
  return fullPerms(p.perms) as PermLevels
}

export function allowedCount(p: Preset): number {
  return PERMS.filter((k) => asLevel(p.perms?.[k]) !== 'denied').length
}

/** The editable body of a preset, as preset.create and preset.update take it. */
export interface PresetBody {
  description: string
  role: Role
  student_scope: Scope
  assignment_scope: Scope
  perms: PermLevels
}

export function bodyOf(p: Preset | null | undefined): PresetBody {
  return {
    description: p?.description ?? '',
    role: (p?.role as Role) ?? 'assistant',
    student_scope: (p?.student_scope as Scope) ?? 'listed',
    assignment_scope: (p?.assignment_scope as Scope) ?? 'all',
    perms: p ? permLevels(p) : (fullPerms({}) as PermLevels),
  }
}

// The built-ins in the order Core ships them: people from least to most, then agents.
const BUILTIN_ORDER = ['student', 'observer', 'ta', 'instructor', 'tutor', 'grader']
function builtinRank(p: Preset): number {
  const i = BUILTIN_ORDER.indexOf(p.name)
  return i < 0 ? BUILTIN_ORDER.length : i
}

/** Built-ins first, in the order they ship; then a department's own, by name. */
export function sortPresets(list: Preset[]): Preset[] {
  return [...list].sort(
    (a, b) =>
      Number(isBuiltin(b)) - Number(isBuiltin(a)) ||
      (isBuiltin(a) ? builtinRank(a) - builtinRank(b) : 0) ||
      a.name.localeCompare(b.name),
  )
}
