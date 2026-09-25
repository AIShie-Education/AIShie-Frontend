// Small shared pieces for the platform set-up pages (terms, departments,
// permission presets).
import { AUTONOMY_LEVELS, PERMS, type AutonomyLevel, type PermLevels, type Preset, type Role, type Scope } from '@/api/types'

/** A dialog as wide as the conventions ask, and no wider than a phone. */
export const DIALOG_WIDTH = 'min(560px, calc(100vw - 32px))'
/** A side drawer, the whole width on a phone. */
export const DRAWER_SIZE = 'min(560px, 100vw)'

export function isBuiltin(p: Preset): boolean {
  return !p.dept_id
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

/** Built-ins first, then a department's own; by name within each. */
export function sortPresets(list: Preset[]): Preset[] {
  return [...list].sort(
    (a, b) => Number(isBuiltin(b)) - Number(isBuiltin(a)) || a.name.localeCompare(b.name),
  )
}
