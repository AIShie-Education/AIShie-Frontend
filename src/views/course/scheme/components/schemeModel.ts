// The grading scheme as a tree, and what the scheme's rules (Core's
// internal/gradecalc and internal/tools/component.go) say about each node.
//
// component.tree answers a flat list, parents before children, each with its
// parent_id; the root has none and is the course total. Assignments hang from
// a component through their component_id. Nothing here decides anything: Core
// does. These helpers say what to show and what to offer, and name the rules
// Core would refuse a change by, so the person can see them before trying.
import type { AssignmentSummary, Component, GradeSummary } from '@/api/types'

/**
 * How a node is worked out, as gradecalc sees it:
 * - direct: points_possible on the component itself (an exam): its one grade over its points;
 * - group: it has sub-components, weight-averaged;
 * - bucket: it holds assignments, points-weighted;
 * - empty: none of these yet;
 * - unseen: rolled up, with no sub-components and no assignment the caller
 *   can see, while not every assignment is shown to the caller: it may be a
 *   bucket of assignments outside their reach, or empty. Core's rules for a
 *   component that holds assignments may apply to it.
 */
export type NodeKind = 'group' | 'bucket' | 'direct' | 'empty' | 'unseen'

/**
 * How much of the course's assignments the list the scheme is built from
 * holds. assignment.list answers only those within the caller's assignment
 * scope, and unpublished ones only to those who may write assignments.
 */
export interface AssignmentsSeen {
  /** Every assignment that counts (every published one) is there, so shares within a bucket can be worked out. */
  counted: boolean
  /** Every assignment, published or not, is there, so a leaf with none is known to be empty. */
  all: boolean
}

export interface SchemeAssignment {
  a: AssignmentSummary
  points: number
  /**
   * Its part of the bucket: points over the bucket's points. Null when it counts toward nothing, or when
   * not every assignment that counts is known.
   */
  share: number | null
  /** Its nominal part of the course total. */
  ofTotal: number | null
}

export interface SchemeNode {
  c: Component
  id: string
  parentId: string | null
  isRoot: boolean
  depth: number
  kind: NodeKind
  weight: number
  children: SchemeNode[]
  assignments: SchemeAssignment[]
  /** weight / Σ weights of it and its siblings; null for the root, or when the siblings weigh nothing. */
  share: number | null
  /** The product of shares from the root down: its nominal part of the course total. */
  ofTotal: number | null
  /** Ancestor ids, root first. */
  path: string[]
}

export interface Scheme {
  root: SchemeNode | null
  /** Every node, in tree order (parents before children, siblings in sort order). */
  nodes: SchemeNode[]
  byId: Map<string, SchemeNode>
  /** Assignments that count toward nothing: practice work, or hung from a component not in the tree. */
  uncounted: AssignmentSummary[]
}

/** The name Core gives the root it makes with every course: the course total. */
export const CORE_ROOT_NAME = 'Total'

/**
 * A node's name as the page shows it. The root still called what Core named
 * it is shown in the reader's language (`rootName`, "Course total"); any
 * other name, the root's too once someone has renamed it, as it was written.
 */
export function nodeName(n: Pick<SchemeNode, 'c' | 'isRoot'>, rootName: string): string {
  return namedByCore(n) ? rootName : n.c.name
}

/** Whether this is the root, still under the name Core gave it. */
export function namedByCore(n: Pick<SchemeNode, 'c' | 'isRoot'>): boolean {
  return n.isRoot && n.c.name === CORE_ROOT_NAME
}

/**
 * A component from a flat list (component.tree) as the page shows it: the
 * root, while still called what Core named it, in the reader's language.
 */
export function componentLabel(c: { name: string; parent_id?: string | null }, rootName: string): string {
  return !c.parent_id && c.name === CORE_ROOT_NAME ? rootName : c.name
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function byDueThenTitle(x: AssignmentSummary, y: AssignmentSummary): number {
  const dx = x.due_at ? Date.parse(x.due_at) : Infinity
  const dy = y.due_at ? Date.parse(y.due_at) : Infinity
  if (dx !== dy) return dx < dy ? -1 : 1
  return x.title.localeCompare(y.title)
}

export function buildScheme(
  components: Component[] | null | undefined,
  assignments: AssignmentSummary[],
  seen: AssignmentsSeen,
): Scheme {
  const list = components ?? []
  const byId = new Map<string, SchemeNode>()
  for (const c of list) {
    byId.set(c.id, {
      c,
      id: c.id,
      parentId: c.parent_id ?? null,
      isRoot: !c.parent_id,
      depth: 0,
      kind: 'empty',
      weight: num(c.weight),
      children: [],
      assignments: [],
      share: null,
      ofTotal: null,
      path: [],
    })
  }
  let root: SchemeNode | null = null
  for (const c of list) {
    const n = byId.get(c.id)!
    if (!n.parentId) {
      root ??= n
      continue
    }
    byId.get(n.parentId)?.children.push(n)
  }
  // Core already answers siblings in sort order; keep that, and be sure of it.
  for (const n of byId.values()) n.children.sort((x, y) => x.c.sort_order - y.c.sort_order)

  const uncounted: AssignmentSummary[] = []
  for (const a of [...assignments].sort(byDueThenTitle)) {
    const host = a.component_id ? byId.get(a.component_id) : undefined
    if (!host) {
      uncounted.push(a)
      continue
    }
    host.assignments.push({ a, points: num(a.points_possible), share: null, ofTotal: null })
  }

  const nodes: SchemeNode[] = []
  const walk = (n: SchemeNode, depth: number, path: string[]) => {
    n.depth = depth
    n.path = path
    n.kind =
      n.c.points_possible !== null && n.c.points_possible !== undefined
        ? 'direct'
        : n.children.length
          ? 'group'
          : n.assignments.length
            ? 'bucket'
            : seen.all
              ? 'empty'
              : 'unseen'
    nodes.push(n)
    const sum = n.children.reduce((s, ch) => s + Math.max(ch.weight, 0), 0)
    for (const ch of n.children) {
      ch.share = sum > 0 ? Math.max(ch.weight, 0) / sum : null
      ch.ofTotal = ch.share !== null && n.ofTotal !== null ? ch.share * n.ofTotal : null
    }
    // Only a bucket counts its assignments (a group's own would be ignored),
    // and only those published: Core leaves an unpublished one out of every
    // total rather than show it as scored nothing (ListGradedAssignments).
    // Their shares are worked out only when every one that counts is known.
    const counts = n.kind === 'bucket' && seen.counted
    const counted = (x: SchemeAssignment) => counts && !!x.a.published_at
    const pts = n.assignments.reduce((s, x) => s + (counted(x) ? Math.max(x.points, 0) : 0), 0)
    for (const x of n.assignments) {
      x.share = counted(x) && pts > 0 ? Math.max(x.points, 0) / pts : null
      x.ofTotal = x.share !== null && n.ofTotal !== null ? x.share * n.ofTotal : null
    }
    for (const ch of n.children) walk(ch, depth + 1, [...path, n.id])
  }
  if (root) {
    root.ofTotal = 1
    walk(root, 0, [])
  }
  return { root, nodes, byId, uncounted }
}

/** The node and everything beneath it. */
export function subtree(n: SchemeNode): SchemeNode[] {
  const out: SchemeNode[] = []
  const walk = (x: SchemeNode) => {
    out.push(x)
    x.children.forEach(walk)
  }
  walk(n)
  return out
}

/**
 * Why a node cannot take sub-components (component.go canHaveChildren), or
 * null. An 'unseen' node is not blocked: whether it holds assignments cannot
 * be told, and Core refuses if it does.
 */
export function childBlock(n: SchemeNode): 'direct' | 'assignments' | null {
  if (n.kind === 'direct') return 'direct'
  if (n.assignments.length) return 'assignments'
  return null
}

/** Why a node cannot be the new parent of `moving`, or null. */
export function moveBlock(moving: SchemeNode, to: SchemeNode): 'self' | 'current' | 'direct' | 'assignments' | null {
  if (to.id === moving.id || to.path.includes(moving.id)) return 'self'
  if (to.id === moving.parentId) return 'current'
  return childBlock(to)
}

/**
 * What the grades entered so far freeze. Read from grade.list, which to a
 * member who grades shows drafts and superseded grades too. `complete` is
 * false when not every page was read; a fact missing from an incomplete read
 * proves nothing, so the view only ever says "frozen", never "free".
 */
export interface GradeFacts {
  complete: boolean
  /** Components with a live (not superseded) entered grade on them. */
  liveEnteredOnComponent: Set<string>
  /** Components with any entered grade on them, superseded ones included. */
  enteredOnComponent: Set<string>
  /** Components with a live posted grade of any origin (a total written down when grades were posted). */
  livePostedOnComponent: Set<string>
  /** Assignments with a live entered grade on a submission to them. */
  liveEnteredOnAssignment: Set<string>
}

export function emptyFacts(): GradeFacts {
  return {
    complete: false,
    liveEnteredOnComponent: new Set(),
    enteredOnComponent: new Set(),
    livePostedOnComponent: new Set(),
    liveEnteredOnAssignment: new Set(),
  }
}

export function addGrades(f: GradeFacts, grades: GradeSummary[] | null | undefined) {
  for (const g of grades ?? []) {
    const live = g.state !== 'superseded' && !g.superseded_by
    const entered = g.origin === 'entered'
    if (g.component_id) {
      if (entered) f.enteredOnComponent.add(g.component_id)
      if (entered && live) f.liveEnteredOnComponent.add(g.component_id)
      if (live && g.state === 'posted') f.livePostedOnComponent.add(g.component_id)
    } else if (g.assignment_id && entered && live) {
      f.liveEnteredOnAssignment.add(g.assignment_id)
    }
  }
}

/** component.update: a directly graded component's points no longer change. */
export function pointsFrozen(n: SchemeNode, f: GradeFacts | null): boolean {
  return !!f && n.kind === 'direct' && f.liveEnteredOnComponent.has(n.id)
}

/** component.update clear_points_possible: it cannot stop being graded directly. */
export function clearFrozen(n: SchemeNode, f: GradeFacts | null): boolean {
  return !!f && n.kind === 'direct' && f.enteredOnComponent.has(n.id)
}

/** component.update points_possible on a rolled-up leaf: it carries posted totals. */
export function directBlocked(n: SchemeNode, f: GradeFacts | null): boolean {
  return !!f && n.kind !== 'direct' && f.livePostedOnComponent.has(n.id)
}

/** component.move: a grade has been entered somewhere beneath it. */
export function placementFrozen(n: SchemeNode, f: GradeFacts | null): boolean {
  if (!f) return false
  return subtree(n).some(
    (x) => f.liveEnteredOnComponent.has(x.id) || x.assignments.some((a) => f.liveEnteredOnAssignment.has(a.a.id)),
  )
}

/** A share in [0, 1] as a percentage, or "—". */
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${(v * 100).toLocaleString(undefined, { maximumFractionDigits: digits })}%`
}

/** Its share among siblings were its weight `w` (and the rest as they are). */
export function shareWith(siblings: SchemeNode[], selfId: string | null, w: number): number | null {
  const others = siblings.filter((s) => s.id !== selfId).reduce((s, x) => s + Math.max(x.weight, 0), 0)
  const total = others + Math.max(w, 0)
  return total > 0 ? Math.max(w, 0) / total : null
}

/** Colours for the top-level components, from Element Plus's palette so that they follow the theme. */
export const SEGMENT_COLORS = [
  'var(--el-color-primary)',
  'var(--el-color-success)',
  'var(--el-color-warning)',
  'var(--el-color-danger)',
  'var(--el-color-info)',
  'var(--el-color-primary-light-5)',
  'var(--el-color-success-light-5)',
  'var(--el-color-warning-light-5)',
  'var(--el-color-danger-light-5)',
]
