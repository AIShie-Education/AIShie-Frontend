import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import MembersView from './MembersView.vue'

// The members' list says a seat's state only where it varies (docs/CONVENTIONS.md, "Tags"): a Status column
// only while some row shown is not active, or is past its end; with every seat active, none.

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

function seat(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    actor_id: `actor-${id}`,
    kind: 'human',
    display_name: name,
    role: 'student',
    status: 'active',
    student_scope: 'own',
    assignment_scope: 'all',
    expires_at: null,
    created_at: '2026-09-01T08:00:00Z',
    preset_id: null,
    ...extra,
  }
}

/** Core's answer: the seats given, each listed in one page. */
function members(list: ReturnType<typeof seat>[]) {
  read.mockImplementation(async (tool: string) => {
    if (tool === 'member.list') return { members: list, next: null }
    if (tool === 'preset.list') return { presets: [] }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
}

const mounted: { unmount: () => void }[] = []
beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  read.mockReset()
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function mountAsInstructor() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-chan', kind: 'human', display_name: 'Ms Chan' } } as never)
  useCourseStore().$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-chan', role: 'instructor' } as never,
    perms: { member_read: 'autonomous' },
    permsSource: 'exact',
  } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/courses/:courseId/members', name: 'course-members', component: stub },
      { path: '/courses/:courseId/members/:memberId', name: 'course-member', component: stub },
      { path: '/courses/:courseId/agents', name: 'course-agents', component: stub },
    ],
  })
  await router.push(`/courses/${COURSE}/members`)
  const w = mount(MembersView, {
    props: { courseId: COURSE },
    attachTo: document.body,
    global: {
      plugins: [
        pinia,
        i18n,
        ElementPlus,
        router,
        { install: (app) => Object.entries(Icons).forEach(([n, c]) => app.component(n, c)) },
      ],
    },
  })
  mounted.push(w)
  await flushPromises()
  return w
}

const heads = () =>
  [...document.body.querySelectorAll('.members__table thead th')].map((th) => th.textContent?.trim()).filter(Boolean)
const rows = () => [...document.body.querySelectorAll<HTMLElement>('.members__table .el-table__body tr')]

describe('the members’ Status column', () => {
  it('is not shown while every seat listed is active', async () => {
    members([seat('m-mei', 'Mei'), seat('m-ken', 'Ken')])
    await mountAsInstructor()
    expect(rows()).toHaveLength(2)
    expect(heads()).not.toContain('Status')
    expect(document.body.querySelector('.members__table tbody')!.textContent).not.toContain('Active')
  })

  it('is shown once a seat listed is paused, saying which', async () => {
    members([seat('m-mei', 'Mei'), seat('m-ken', 'Ken', { status: 'paused' })])
    await mountAsInstructor()
    expect(rows()).toHaveLength(2)
    expect(heads()).toContain('Status')
    const ken = rows().find((r) => r.textContent?.includes('Ken'))!
    expect(ken.textContent).toContain('Paused')
  })

  it('is shown once a seat listed is past its end, though its status is active', async () => {
    members([seat('m-mei', 'Mei'), seat('m-ken', 'Ken', { expires_at: '2026-01-01T00:00:00Z' })])
    await mountAsInstructor()
    expect(heads()).toContain('Status')
  })

  it.each([
    ['zh-Hant', '狀態', '已暫停'],
    ['zh-Hans', '状态', '已暂停'],
  ] as const)('is said in %s', async (locale, column, paused) => {
    setLocale(locale)
    members([seat('m-mei', 'Mei'), seat('m-ken', 'Ken', { status: 'paused' })])
    await mountAsInstructor()
    expect(heads()).toContain(column)
    expect(rows().find((r) => r.textContent?.includes('Ken'))!.textContent).toContain(paused)
  })
})
