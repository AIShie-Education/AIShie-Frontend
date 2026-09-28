import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useSessionStore } from '@/stores/session'

let calls = 0
let answer: () => Promise<unknown>
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string) => {
      if (tool !== 'department.list_tree') return Promise.reject(new Error(`no answer for ${tool}`))
      calls++
      return answer()
    }),
  }
})

const { useDepartmentTree, forgetDepartmentTree } = await import('./useDepartmentTree')

const tree = (name: string) => ({
  max_depth: 8,
  departments: [
    { id: 'F', name, depth: 1, administers: true, manages: false, appointed: true, course_count: 2, admin_count: 1 },
    { id: 'S', name: 'Computing', parent_id: 'F', depth: 2, administers: true, manages: true, appointed: false },
  ],
})

beforeEach(() => {
  setActivePinia(createPinia())
  forgetDepartmentTree()
  calls = 0
  answer = async () => tree('Engineering')
})

function signIn(id: string, platform = false) {
  const session = useSessionStore()
  session.me = { id, display_name: id, kind: 'human', status: 'active', platform_role: platform ? 'admin' : null } as never
  return session
}

describe('useDepartmentTree', () => {
  it('reads the tree once for every page that asks', async () => {
    signIn('ada')
    const a = useDepartmentTree()
    const b = useDepartmentTree()
    await flushPromises()
    expect(calls).toBe(1)
    expect(a.nodes.value.map((n) => n.id)).toEqual(['F', 'S'])
    expect(b.pathLabel('S')).toBe('Engineering › Computing')
    expect(a.administered.value).toHaveLength(2)
    expect(a.manageable.value.map((n) => n.id)).toEqual(['S'])
    useDepartmentTree()
    await flushPromises()
    expect(calls).toBe(1)
  })

  it('reads it again when asked to, after a change', async () => {
    signIn('ada')
    const a = useDepartmentTree()
    await flushPromises()
    answer = async () => tree('Faculty of Engineering')
    await a.reload()
    expect(calls).toBe(2)
    expect(a.byId.value.get('F')?.name).toBe('Faculty of Engineering')
  })

  it('gives nobody else what it read for one caller', async () => {
    const session = signIn('ada')
    const a = useDepartmentTree()
    await flushPromises()
    expect(a.loaded.value).toBe(true)
    session.me = { ...session.me!, id: 'bob' }
    expect(a.loaded.value).toBe(false)
    expect(a.nodes.value).toEqual([])
    await a.ensure()
    expect(calls).toBe(2)
  })

  it('offers the top of the tree as a destination only to a platform administrator', async () => {
    signIn('ada')
    const a = useDepartmentTree()
    await flushPromises()
    expect(a.destinationsFor('S', 'Top').map((d) => d.value)).not.toContain('__top__')
    setActivePinia(createPinia())
    signIn('root', true)
    const r = useDepartmentTree()
    await flushPromises()
    expect(r.destinationsFor('S', 'Top')[0]).toMatchObject({ value: '__top__', label: 'Top' })
  })

  it('keeps the error when the tree cannot be read', async () => {
    signIn('ada')
    answer = () => Promise.reject(new Error('down'))
    const a = useDepartmentTree()
    await flushPromises()
    expect(a.error.value?.message).toBe('down')
    expect(a.loaded.value).toBe(false)
  })
})
