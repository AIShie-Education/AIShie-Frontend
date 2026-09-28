// The departments as a tree (department.list_tree), and the questions the
// administration pages ask of it: where a department is, what is beneath it,
// which of them the caller administers, and where one may be moved.
//
// Core answers with every department, each before those beneath it and
// siblings by name, with what the caller may do with each: `administers` (an
// appointment of theirs is at it or above it, or they are a platform
// administrator), `manages` (one is strictly above it: they may rename it,
// move it and staff it) and `appointed` (they are appointed at it). What is
// offered here follows those flags; Core decides what is allowed.
import type { DepartmentNode } from '@/api/types'

/** How deep the tree may be, when Core has not said (domain.MaxDepartmentDepth). */
export const DEFAULT_MAX_DEPTH = 8

/** The value that stands for the top of the tree where a department is chosen. */
export const TOP = '__top__'

export interface DeptTree {
  /** Every department, in Core's order: each before those beneath it, siblings by name. */
  nodes: DepartmentNode[]
  byId: Map<string, DepartmentNode>
  /** Each department's children, and under '' those at the top. */
  children: Map<string, DepartmentNode[]>
}

/** A department as el-table and el-tree-select take a tree: with its children. */
export type DeptTreeRow = DepartmentNode & { children?: DeptTreeRow[] }

export function indexTree(nodes: DepartmentNode[] | null | undefined): DeptTree {
  const list = nodes ?? []
  const byId = new Map(list.map((n) => [n.id, n]))
  const children = new Map<string, DepartmentNode[]>()
  for (const n of list) {
    // A parent that is not in the list (a tree cut at root_id) makes this a root.
    const key = n.parent_id && byId.has(n.parent_id) ? n.parent_id : ''
    const sibs = children.get(key)
    if (sibs) sibs.push(n)
    else children.set(key, [n])
  }
  return { nodes: list, byId, children }
}

export function childrenOf(tree: DeptTree, id: string | null): DepartmentNode[] {
  return tree.children.get(id ?? '') ?? []
}

/** The department and those above it, from the top of the tree down to it. */
export function pathOf(tree: DeptTree, id: string): DepartmentNode[] {
  const out: DepartmentNode[] = []
  const seen = new Set<string>()
  let cur = tree.byId.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parent_id ? tree.byId.get(cur.parent_id) : undefined
  }
  return out
}

/** Its names from the top, for showing where it is: "Engineering › Computing". */
export function pathLabel(tree: DeptTree, id: string, sep = ' › '): string {
  return pathOf(tree, id)
    .map((n) => n.name)
    .join(sep)
}

/** The department and every department beneath it. */
export function subtreeIds(tree: DeptTree, id: string): Set<string> {
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    if (out.has(cur)) continue
    out.add(cur)
    for (const c of childrenOf(tree, cur)) stack.push(c.id)
  }
  return out
}

/** How many levels the department and what is beneath it take: 1 for one with nothing beneath it. */
export function subtreeHeight(tree: DeptTree, id: string): number {
  const walk = (cur: string, seen: Set<string>): number => {
    if (seen.has(cur)) return 0
    seen.add(cur)
    let h = 0
    for (const c of childrenOf(tree, cur)) h = Math.max(h, walk(c.id, seen))
    return h + 1
  }
  return walk(id, new Set())
}

/**
 * Where what the caller administers begins: the departments they administer
 * that are not beneath another they administer. For a platform administrator
 * these are the departments at the top.
 */
export function administeredRoots(tree: DeptTree): DepartmentNode[] {
  return tree.nodes.filter((n) => {
    if (!n.administers) return false
    const parent = n.parent_id ? tree.byId.get(n.parent_id) : undefined
    return !parent?.administers
  })
}

/** The rows of a tree from the given roots down, each with its children, for el-table and el-tree-select. */
export function treeRows(
  tree: DeptTree,
  roots: DepartmentNode[],
  keep: (n: DepartmentNode) => boolean = () => true,
): DeptTreeRow[] {
  const build = (n: DepartmentNode, seen: Set<string>): DeptTreeRow | null => {
    if (seen.has(n.id)) return null
    seen.add(n.id)
    const kids = childrenOf(tree, n.id)
      .map((c) => build(c, seen))
      .filter((c): c is DeptTreeRow => !!c)
    if (!keep(n) && !kids.length) return null
    return kids.length ? { ...n, children: kids } : { ...n }
  }
  const seen = new Set<string>()
  return roots.map((r) => build(r, seen)).filter((r): r is DeptTreeRow => !!r)
}

/**
 * The departments the caller administers, in the tree's order, each with how
 * far to indent it beneath the others: for a list to choose one from.
 */
export function administeredList(tree: DeptTree): { node: DepartmentNode; indent: number }[] {
  const out: { node: DepartmentNode; indent: number }[] = []
  const walk = (n: DepartmentNode, indent: number) => {
    out.push({ node: n, indent })
    for (const c of childrenOf(tree, n.id)) if (c.administers) walk(c, indent + 1)
  }
  for (const r of administeredRoots(tree)) walk(r, 0)
  return out
}

/** Why a department cannot be chosen as where another goes. */
export type NotHereReason = 'here' | 'tooDeep' | 'nameTaken'

export interface Destination {
  /** A department's id, or TOP. */
  value: string
  label: string
  disabled: boolean
  reason?: NotHereReason
  children?: Destination[]
}

function nameClash(siblings: DepartmentNode[], name: string, except: string): boolean {
  const n = name.trim().toLowerCase()
  return siblings.some((s) => s.id !== except && s.name.trim().toLowerCase() === n)
}

/**
 * Where department `deptId` may be moved, as a tree to choose from: the
 * departments the caller administers outside its own subtree, and the top of
 * the tree for a platform administrator (department.move). Each that Core
 * would refuse is there but disabled, saying why: where it is already, too
 * deep for what moves with it, or with a department of that name already
 * beneath it.
 */
export function destinationsFor(
  tree: DeptTree,
  deptId: string,
  opts: { platform: boolean; maxDepth?: number; topLabel: string },
): Destination[] {
  const dept = tree.byId.get(deptId)
  if (!dept) return []
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const inside = subtreeIds(tree, deptId)
  const height = subtreeHeight(tree, deptId)
  const parent = dept.parent_id ?? null

  const judge = (n: DepartmentNode): NotHereReason | undefined => {
    if (n.id === parent) return 'here'
    if (n.depth + height > maxDepth) return 'tooDeep'
    if (nameClash(childrenOf(tree, n.id), dept.name, dept.id)) return 'nameTaken'
    return undefined
  }
  const build = (n: DepartmentNode): Destination | null => {
    if (inside.has(n.id) || !n.administers) return null
    const kids = childrenOf(tree, n.id)
      .map(build)
      .filter((d): d is Destination => !!d)
    const reason = judge(n)
    const d: Destination = { value: n.id, label: n.name, disabled: !!reason, reason }
    if (kids.length) d.children = kids
    return d
  }
  const out = administeredRoots(tree)
    .map(build)
    .filter((d): d is Destination => !!d)
  if (opts.platform) {
    const reason: NotHereReason | undefined =
      parent === null ? 'here' : nameClash(childrenOf(tree, null), dept.name, dept.id) ? 'nameTaken' : undefined
    out.unshift({ value: TOP, label: opts.topLabel, disabled: !!reason, reason })
  }
  return out
}

/**
 * Where a course in department `deptId` may be moved (course.move): any
 * department the caller administers but the one it is in.
 */
export function courseDestinations(tree: DeptTree, deptId: string): Destination[] {
  const build = (n: DepartmentNode): Destination => {
    const kids = childrenOf(tree, n.id)
      .filter((c) => c.administers)
      .map(build)
    const d: Destination = {
      value: n.id,
      label: n.name,
      disabled: n.id === deptId,
      reason: n.id === deptId ? 'here' : undefined,
    }
    if (kids.length) d.children = kids
    return d
  }
  return administeredRoots(tree).map(build)
}

/** Whether a department may have another made beneath it: the tree is not already as deep as it may be there. */
export function roomBeneath(node: DepartmentNode, maxDepth = DEFAULT_MAX_DEPTH): boolean {
  return node.depth < maxDepth
}
