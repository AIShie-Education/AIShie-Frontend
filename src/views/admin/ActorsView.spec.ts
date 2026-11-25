import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import ActorsView from './ActorsView.vue'

// The people list says someone's standing only where it varies (docs/CONVENTIONS.md, "Tags"): a Status
// column only while someone listed is suspended and the status filter does not say so already.

const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

function actor(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: `01a0d79f-0000-70da-a7cc-00000000000${n}`,
    kind: 'human',
    display_name: `Person ${n}`,
    email: `person${n}@example.test`,
    status: 'active',
    created_at: '2026-09-01T08:00:00Z',
    ...extra,
  }
}

/** Core's directory: the actors given, each listed in one page; with a status asked for, those of it alone. */
function directory(list: ReturnType<typeof actor>[]) {
  read.mockImplementation(async (tool: string, args: { status?: string }) => {
    if (tool === 'actor.list') return { actors: list.filter((a) => !args.status || a.status === args.status) }
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

async function mountAsRoot(path = '/admin/actors') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-root', kind: 'human', display_name: 'Root' } } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/actors', name: 'admin-actors', component: stub },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: stub },
      { path: '/admin/courses', name: 'admin-courses', component: stub },
    ],
  })
  await router.push(path)
  const w = mount(ActorsView, {
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
  [...document.body.querySelectorAll('.actors__table thead th')].map((th) => th.textContent?.trim()).filter(Boolean)
const rows = () => [...document.body.querySelectorAll<HTMLElement>('.actors__table .el-table__body tr')]

describe('the people list’s Status column', () => {
  it('is not shown while everyone listed is active', async () => {
    directory([actor(1), actor(2), actor(3)])
    await mountAsRoot()
    expect(rows()).toHaveLength(3)
    expect(heads()).not.toContain('Status')
    expect(document.body.querySelector('.actors__table tbody')!.textContent).not.toContain('Active')
  })

  it('is shown once someone listed is suspended, saying who', async () => {
    directory([actor(1), actor(2, { status: 'suspended' }), actor(3)])
    await mountAsRoot()
    expect(rows()).toHaveLength(3)
    expect(heads()).toContain('Status')
    const suspended = rows().find((r) => r.textContent?.includes('Person 2'))!
    expect(suspended.textContent).toContain('Suspended')
  })

  it('is not shown where the filter keeps the suspended alone, and says so already', async () => {
    directory([actor(1), actor(2, { status: 'suspended' }), actor(3, { status: 'suspended' })])
    await mountAsRoot('/admin/actors?status=suspended')
    expect(read).toHaveBeenCalledWith('actor.list', expect.objectContaining({ status: 'suspended' }))
    expect(rows()).toHaveLength(2)
    expect(heads()).not.toContain('Status')
  })

  it.each([
    ['zh-Hant', '狀態', '已停用'],
    ['zh-Hans', '状态', '已停用'],
  ] as const)('is said in %s', async (locale, column, suspended) => {
    setLocale(locale)
    directory([actor(1), actor(2, { status: 'suspended' })])
    await mountAsRoot()
    expect(heads()).toContain(column)
    expect(rows().find((r) => r.textContent?.includes('Person 2'))!.textContent).toContain(suspended)
  })
})
