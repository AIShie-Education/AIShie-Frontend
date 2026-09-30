import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import adminRoutes from './modules/admin'
import { adminNeed, mayOpen } from './access'

// The real administration routes, under a stand-in for the app's frame.
const View = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: View },
    { path: '/', component: View, children: adminRoutes },
  ],
})

const callers = {
  platform: { isAdmin: true, canAdminister: true },
  department: { isAdmin: false, canAdminister: true },
  student: { isAdmin: false, canAdminister: false },
}
const opens = (name: string, params: Record<string, string> = {}) => {
  const need = adminNeed(router.resolve({ name, params }))
  return Object.fromEntries(Object.entries(callers).map(([who, c]) => [who, mayOpen(need, c)]))
}
const ID = '01a0d79f-13c6-70da-a7cc-f009b1efe423'

describe('who opens which administration page', () => {
  it('courses and departments: platform and department administrators', () => {
    for (const [name, params] of [
      ['admin-courses', {}],
      ['admin-course', { courseId: ID }],
      ['admin-departments', {}],
    ] as const) {
      expect(opens(name, params), name).toEqual({ platform: true, department: true, student: false })
    }
  })

  it('people, terms, presets and the agent runtime’s settings: platform administrators alone', () => {
    for (const [name, params] of [
      ['admin-actors', {}],
      ['admin-actor', { actorId: ID }],
      ['admin-terms', {}],
      ['admin-presets', {}],
      ['admin-runtime', {}],
    ] as const) {
      expect(opens(name, params), name).toEqual({ platform: true, department: false, student: false })
    }
  })

  it('a page outside administration needs nothing', () => {
    expect(adminNeed(router.resolve({ name: 'home' }))).toBeNull()
    expect(opens('home')).toEqual({ platform: true, department: true, student: true })
  })
})
