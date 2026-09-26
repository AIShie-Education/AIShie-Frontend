import { describe, expect, it } from 'vitest'
import type { Component } from '@/api/types'
import { buildScheme, namedByCore, nodeName } from './schemeModel'

function component(id: string, name: string, parent_id: string | null): Component {
  return { id, name, parent_id, weight: 1, sort_order: 0, drop_lowest: 0 } as unknown as Component
}

describe('names in the scheme', () => {
  const scheme = buildScheme(
    [component('r', 'Total', null), component('a', 'Total', 'r'), component('b', 'Quizzes', 'r')],
    [],
    { counted: true, all: true },
  )

  it('shows the root Core named "Total" in the reader\'s words, and every other name as written', () => {
    expect(namedByCore(scheme.byId.get('r')!)).toBe(true)
    expect(nodeName(scheme.byId.get('r')!, 'Course total')).toBe('Course total')
    // A component under the root that someone called "Total" is theirs.
    expect(namedByCore(scheme.byId.get('a')!)).toBe(false)
    expect(nodeName(scheme.byId.get('a')!, 'Course total')).toBe('Total')
    expect(nodeName(scheme.byId.get('b')!, 'Course total')).toBe('Quizzes')
  })

  it('shows a root that has been renamed as it was named', () => {
    const renamed = buildScheme([component('r', 'Overall', null)], [], { counted: true, all: true })
    expect(nodeName(renamed.root!, 'Course total')).toBe('Overall')
  })
})
