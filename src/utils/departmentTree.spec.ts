import { describe, expect, it } from 'vitest'
import type { DepartmentNode } from '@/api/types'
import {
  TOP,
  administeredList,
  administeredRoots,
  courseDestinations,
  deptActions,
  destinationsFor,
  indexTree,
  pathLabel,
  roomBeneath,
  subtreeHeight,
  subtreeIds,
  treeRows,
  type Destination,
} from './departmentTree'

// University ─┬─ Engineering ─┬─ Computing ── AI
//             │               └─ Design
//             └─ Humanities ── History
function node(id: string, name: string, parent: string | null, depth: number, over: Partial<DepartmentNode> = {}) {
  return {
    id,
    name,
    parent_id: parent,
    depth,
    administers: false,
    manages: false,
    appointed: false,
    ...over,
  } as DepartmentNode
}

/** The tree as Core gives it to someone appointed at `at` (and so administering what is beneath it). */
function world(at: string | 'platform') {
  const raw: [string, string, string | null, number][] = [
    ['U', 'University', null, 1],
    ['F', 'Engineering', 'U', 2],
    ['S', 'Computing', 'F', 3],
    ['D', 'AI', 'S', 4],
    ['S2', 'Design', 'F', 3],
    ['F2', 'Humanities', 'U', 2],
    ['S3', 'History', 'F2', 3],
  ]
  const parents = new Map(raw.map(([id, , p]) => [id, p]))
  const above = (id: string, anc: string) => {
    for (let p = parents.get(id); p; p = parents.get(p)) if (p === anc) return true
    return false
  }
  return indexTree(
    raw.map(([id, name, parent, depth]) =>
      at === 'platform'
        ? node(id, name, parent, depth, { administers: true, manages: true })
        : node(id, name, parent, depth, {
            administers: id === at || above(id, at),
            manages: above(id, at),
            appointed: id === at,
          }),
    ),
  )
}

const values = (ds: Destination[]): string[] => ds.flatMap((d) => [d.value, ...values(d.children ?? [])])
const find = (ds: Destination[], v: string): Destination | undefined => {
  for (const d of ds) {
    if (d.value === v) return d
    const c = find(d.children ?? [], v)
    if (c) return c
  }
  return undefined
}

describe('the department tree', () => {
  it('says where a department is, from the top', () => {
    const t = world('F')
    expect(pathLabel(t, 'D')).toBe('University › Engineering › Computing › AI')
    expect(pathLabel(t, 'U')).toBe('University')
    expect(pathLabel(t, 'nope')).toBe('')
  })

  it('knows what is beneath a department, and how many levels that takes', () => {
    const t = world('F')
    expect([...subtreeIds(t, 'F')].sort()).toEqual(['D', 'F', 'S', 'S2'])
    expect(subtreeHeight(t, 'F')).toBe(3)
    expect(subtreeHeight(t, 'D')).toBe(1)
  })

  it('begins what an administrator sees at their appointments', () => {
    expect(administeredRoots(world('F')).map((n) => n.id)).toEqual(['F'])
    expect(administeredRoots(world('S')).map((n) => n.id)).toEqual(['S'])
    expect(administeredRoots(world('platform')).map((n) => n.id)).toEqual(['U'])
    // Rows for a table: the appointment's subtree, and nothing above or beside it.
    const rows = treeRows(world('F'), administeredRoots(world('F')))
    expect(rows.map((r) => r.id)).toEqual(['F'])
    expect(rows[0]!.children!.map((r) => r.id)).toEqual(['S', 'S2'])
    expect(rows[0]!.children![0]!.children!.map((r) => r.id)).toEqual(['D'])
  })

  it('lists what an administrator may choose, indented beneath their appointment', () => {
    expect(administeredList(world('F')).map(({ node, indent }) => `${indent}:${node.id}`)).toEqual([
      '0:F',
      '1:S',
      '2:D',
      '1:S2',
    ])
  })

  it('has room beneath a department until the tree is as deep as it may be', () => {
    expect(roomBeneath(node('x', 'x', null, 7))).toBe(true)
    expect(roomBeneath(node('x', 'x', null, 8))).toBe(false)
  })
})

describe('where a department may be moved', () => {
  it('never under itself or beneath itself, and to the top only for a platform administrator', () => {
    const ada = destinationsFor(world('F'), 'S', { platform: false, topLabel: 'Top' })
    // What Ada administers outside Computing: Engineering and Design, not AI (beneath it).
    expect(values(ada)).toEqual(['F', 'S2'])
    expect(values(ada)).not.toContain(TOP)
    // Where it is already is shown, not offered.
    expect(find(ada, 'F')).toMatchObject({ disabled: true, reason: 'here' })
    expect(find(ada, 'S2')).toMatchObject({ disabled: false })

    const root = destinationsFor(world('platform'), 'S', { platform: true, topLabel: 'Top' })
    expect(values(root)[0]).toBe(TOP)
    expect(find(root, TOP)).toMatchObject({ label: 'Top', disabled: false })
    expect(values(root)).not.toContain('S')
    expect(values(root)).not.toContain('D')
    expect(values(root)).toEqual(expect.arrayContaining(['U', 'F', 'S2', 'F2', 'S3']))
  })

  it('not where a department of that name is already, in any case', () => {
    const t = world('platform')
    // Another "design" under Humanities: Design cannot go there.
    const withTwin = indexTree([...t.nodes, node('X', 'DESIGN', 'F2', 3, { administers: true, manages: true })])
    const ds = destinationsFor(withTwin, 'S2', { platform: true, topLabel: 'Top' })
    expect(find(ds, 'F2')).toMatchObject({ disabled: true, reason: 'nameTaken' })
    expect(find(ds, 'U')).toMatchObject({ disabled: false })
  })

  it('not so deep that what moves with it would pass the limit', () => {
    // A chain of eight under the top, and a department with one beneath it.
    const chain = Array.from({ length: 8 }, (_, i) =>
      node(`c${i + 1}`, `Level ${i + 1}`, i ? `c${i}` : null, i + 1, { administers: true, manages: true }),
    )
    const t = indexTree([
      ...chain,
      node('m', 'Moving', null, 1, { administers: true, manages: true }),
      node('mk', 'Beneath', 'm', 2, { administers: true, manages: true }),
    ])
    const ds = destinationsFor(t, 'm', { platform: true, topLabel: 'Top' })
    // Two levels move: under level 6 they reach 8, under level 7 they would reach 9.
    expect(find(ds, 'c6')).toMatchObject({ disabled: false })
    expect(find(ds, 'c7')).toMatchObject({ disabled: true, reason: 'tooDeep' })
    expect(find(ds, 'c8')).toMatchObject({ disabled: true, reason: 'tooDeep' })
    expect(find(ds, TOP)).toMatchObject({ disabled: true, reason: 'here' })
  })

  it('a course goes to any department its administrator administers, but the one it is in', () => {
    const ds = courseDestinations(world('S'), 'D')
    expect(values(ds)).toEqual(['S', 'D'])
    expect(find(ds, 'D')).toMatchObject({ disabled: true, reason: 'here' })
    expect(values(courseDestinations(world('F'), 'D'))).toEqual(['F', 'S', 'D', 'S2'])
  })
})

describe('what may be done with a department', () => {
  it('follows the flags Core gives it', () => {
    const t = world('F')
    const acts = (id: string) => deptActions(t.byId.get(id)!)
    // Her own appointment's department: make departments beneath it and see who administers it, but not reshape or staff it.
    expect(acts('F')).toEqual(['newChild', 'admins'])
    // Beneath her appointment: all of it.
    expect(acts('S')).toEqual(['newChild', 'rename', 'move', 'admins'])
    // Above or beside it: nothing.
    expect(acts('U')).toEqual([])
    expect(acts('F2')).toEqual([])
    // A platform administrator: everything, everywhere.
    expect(deptActions(world('platform').byId.get('U')!)).toEqual(['newChild', 'rename', 'move', 'admins'])
  })
})
