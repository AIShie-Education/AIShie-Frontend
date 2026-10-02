import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import type { DepartmentNode } from '@/api/types'
import { fakeContainerWidths } from '@/composables/containerWidthFakes'
import { forgetDepartmentTree } from '@/composables/useDepartmentTree'
import { useSessionStore } from '@/stores/session'
import DepartmentsView from '../DepartmentsView.vue'
import AdminsDrawer from './AdminsDrawer.vue'

// What Core answers each read with, and every call made.
let answers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
let asked: { tool: string; args: Record<string, unknown> }[] = []
const writes = vi.fn()
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, args })
      const a = answers[tool]
      return a ? a(args) : Promise.reject(new Error(`no answer for ${tool}`))
    }),
    write: vi.fn((tool: string, args: Record<string, unknown>) => writes(tool, args)),
  }
})
const confirm = vi.fn(() => Promise.resolve('confirm'))
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessageBox: { ...real.ElMessageBox, confirm: (...a: unknown[]) => confirm(...(a as [])) } }
})

const node = (id: string, name: string, parent: string | null, depth: number, over: Partial<DepartmentNode> = {}) =>
  ({ id, name, parent_id: parent, depth, administers: false, manages: false, appointed: false, ...over }) as DepartmentNode

// University ─┬─ Engineering (Ada) ─┬─ Computing ── AI
//             │                     └─ Design
//             └─ Humanities ── History
function tree(platform: boolean) {
  const mine = (appointed = false) =>
    platform
      ? { administers: true, manages: true, course_count: 1, admin_count: 0 }
      : { administers: true, manages: !appointed, appointed, course_count: 1, admin_count: appointed ? 1 : 0 }
  const theirs = platform ? mine() : {}
  return {
    max_depth: 8,
    departments: [
      node('U', 'University', null, 1, theirs),
      node('F', 'Engineering', 'U', 2, mine(true)),
      node('S', 'Computing', 'F', 3, mine()),
      node('D', 'AI', 'S', 4, mine()),
      node('S2', 'Design', 'F', 3, mine()),
      node('F2', 'Humanities', 'U', 2, theirs),
      node('S3', 'History', 'F2', 3, theirs),
    ],
  }
}

const ADA = 'ada-id'
function signIn(platform: boolean) {
  const session = useSessionStore()
  session.me = {
    id: ADA,
    kind: 'human',
    display_name: 'Ada Lovelace',
    status: 'active',
    platform_role: platform ? 'admin' : null,
    administers: platform ? null : [{ dept_id: 'F', name: 'Engineering', appointment_id: 'ap', appointed_at: '2026-09-01T00:00:00Z' }],
  } as never
  return session
}

function plugins() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/admin/courses', name: 'admin-courses', component: blank },
      { path: '/admin/presets', name: 'admin-presets', component: blank },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: blank },
    ],
  })
  return { pinia, router }
}

const executed = (result: unknown) => ({ status: 'executed', actionId: 'act', reviewState: 'none', result, replayed: false })
const body = () => document.body.textContent ?? ''
const buttons = (text: string) => [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  forgetDepartmentTree()
  asked = []
  writes.mockReset()
  confirm.mockClear()
  answers = { 'preset.list': async () => ({ presets: [] }) }
})
// vi.waitFor gives up after a second of the clock; what it waits for here
// is a render, whose CPU a busy machine stretches past that. It waits for as
// long as the test may, nearly (vite.config.ts).
const rendered = { timeout: 20_000 }

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('DepartmentsView', () => {
  async function mountView(platform: boolean, departments = tree(platform)) {
    const { pinia, router } = plugins()
    signIn(platform)
    answers['department.list_tree'] = async () => departments
    const wrapper = mount(DepartmentsView, { attachTo: document.body, global: { plugins: [pinia, router, i18n, ElementPlus], components: icons } })
    await flushPromises()
    return wrapper
  }

  it('shows a department administrator what they administer, where it is, and nothing platform-only', async () => {
    const w = await mountView(false)
    const text = w.text()
    expect(text).toContain('Engineering')
    expect(text).toContain('You administer this')
    expect(text).toContain('in University')
    for (const name of ['Computing', 'AI', 'Design']) expect(text).toContain(name)
    for (const name of ['Humanities', 'History']) expect(text).not.toContain(name)
    expect(text).not.toContain('New top-level department')
    expect(w.findAll('th').map((th) => th.text())).not.toContain('Presets')
    // One per department it administers, each with its menu.
    expect(w.findAll('button[aria-label^="What you can do with"]')).toHaveLength(4)
    // The tree is read afresh on coming to the page, and presets are not counted for them.
    expect(asked.filter((a) => a.tool === 'department.list_tree')).toHaveLength(1)
    expect(asked.some((a) => a.tool === 'preset.list')).toBe(false)
    w.unmount()
  })

  it('shows a platform administrator the whole tree, with the top and the presets', async () => {
    const w = await mountView(true)
    const text = w.text()
    for (const name of ['University', 'Humanities', 'History', 'Engineering']) expect(text).toContain(name)
    expect(text).toContain('New top-level department')
    expect(text).not.toContain('You administer this')
    expect(w.findAll('th').map((th) => th.text())).toContain('Presets')
    w.unmount()
  })

  it('closes its columns up where its card has no room for them all, whatever the window, presets under the name', async () => {
    // The window is wide (matchMedia says nothing matches); the card is what decides, measured by its toolbar. A platform
    // administrator's tree wants 946 px, the presets with it. One department is enough to show it, and lays out quickly.
    const sizes = fakeContainerWidths({ '.app-toolbar': 946 })
    answers['preset.list'] = async () => ({ presets: [{ id: 'p1', dept_id: 'U' }] })
    const university = node('U', 'University', null, 1, { administers: true, manages: true, course_count: 1, admin_count: 0 })
    const w = await mountView(true, { max_depth: 8, departments: [university] })
    const heads = () => w.findAll('th').map((th) => th.text())
    expect(heads()).toContain('Presets')
    expect(heads()).toContain('ID')
    expect(w.find('.dept-name__presets').exists()).toBe(false)
    await sizes.resize('.app-toolbar', 945)
    await flushPromises()
    expect(heads()).not.toContain('Presets')
    expect(heads()).not.toContain('ID')
    expect(heads()).toContain('Courses')
    // Where the presets are is still a click away, with how many there are.
    const presets = w.find('.dept-name__presets')
    expect(presets.text()).toBe('Presets: built-ins + 1 own')
    expect(presets.attributes('href')).toBe('/admin/presets?dept=U')
    w.unmount()
  })

  it('closes its columns up further where its card is as narrow as on a phone, its toolbar 542 px or less', async () => {
    // 542 px is the toolbar a window of 640 px leaves without the side bar: there, as before, the administrators'
    // count and the menu take less, so that a row's courses stay in sight beside its menu.
    const sizes = fakeContainerWidths({ '.app-toolbar': 543 })
    const engineering = node('F', 'Engineering', 'U', 2, { administers: true, appointed: true, course_count: 1, admin_count: 1 })
    const w = await mountView(false, { max_depth: 8, departments: [engineering] })
    const widths = () => w.findAll('.el-table__header colgroup col').map((c) => c.attributes('width'))
    // Narrow already (under 746), not yet a phone's: Courses 80, Administrators 130, the menu 64.
    expect(widths()).toEqual(expect.arrayContaining(['80', '130', '64']))
    await sizes.resize('.app-toolbar', 542)
    await flushPromises()
    expect(widths()).toEqual(expect.arrayContaining(['80', '110', '56']))
    expect(widths()).not.toContain('130')
    w.unmount()
  })

  it('closes a department administrator’s up where its card has no room for them, with no presets among them', async () => {
    // Theirs want 746 px. The department they administer alone is enough to show it.
    const sizes = fakeContainerWidths({ '.app-toolbar': 746 })
    const engineering = node('F', 'Engineering', 'U', 2, { administers: true, appointed: true, course_count: 1, admin_count: 1 })
    const w = await mountView(false, { max_depth: 8, departments: [engineering] })
    const heads = () => w.findAll('th').map((th) => th.text())
    expect(heads()).toContain('ID')
    await sizes.resize('.app-toolbar', 745)
    await flushPromises()
    expect(heads()).not.toContain('ID')
    expect(heads()).toContain('Courses')
    w.unmount()
  })

  it('says why Core refused a name, in words of its own', async () => {
    const w = await mountView(false)
    writes.mockRejectedValue(
      new ApiError({ status: 409, code: 'conflict', message: 'x', details: { reason: 'name_taken' }, actionId: 'a1', actionStatus: 'failed' }),
    )
    // "New department here" under Computing, with a name no sibling has here but Core refuses anyway (someone was quicker).
    await w.find('button[aria-label="What you can do with Computing"]').trigger('click')
    // Every row's menu is in the page; the one just opened is the one shown.
    // It is shown on a timer (Element Plus opens a menu with setTimeout, even
    // at no delay), which flushPromises (setImmediate) does not wait for.
    const item = await vi.waitFor(() => {
      const shown = [...document.body.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(
        (i) => i.textContent?.includes('New department here') && (i.closest('.el-popper') as HTMLElement | null)?.style.display !== 'none',
      )
      if (!shown) throw new Error('the menu of Computing is not shown yet')
      return shown
    }, rendered)
    item.click()
    await flushPromises()
    const input = document.body.querySelector<HTMLInputElement>('input[name=department-name]')!
    input.value = 'Robotics'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    buttons('Create')[0]!.click()
    await flushPromises()
    expect(writes).toHaveBeenCalledWith('department.create', { name: 'Robotics', parent_id: 'S' })
    expect(body()).toContain('Another department there already has that name.')
    w.unmount()
  })
})

describe('AdminsDrawer', () => {
  const appointment = (id: string, dept: [string, string], actor: [string, string], over = {}) => ({
    id,
    dept_id: dept[0],
    dept_name: dept[1],
    actor_id: actor[0],
    display_name: actor[1],
    appointed_by_actor_id: 'root',
    appointed_by_name: 'Root',
    appointed_at: '2026-09-01T00:00:00Z',
    ...over,
  })

  async function mountDrawer(dept: DepartmentNode) {
    const { pinia, router } = plugins()
    signIn(false)
    answers['department.list_admins'] = async () => ({
      admins: [
        appointment('a1', ['S', 'Computing'], ['chan', 'Chan Siu Ming']),
        appointment('a2', ['F', 'Engineering'], [ADA, 'Ada Lovelace']),
      ],
    })
    const wrapper = mount(AdminsDrawer, {
      props: { modelValue: true, dept },
      attachTo: document.body,
      global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
    })
    await flushPromises()
    return wrapper
  }
  const computing = node('S', 'Computing', 'F', 3, { administers: true, manages: true })

  it('lists those appointed here, and those above by the department they are appointed at', async () => {
    const w = await mountDrawer(computing)
    expect(asked.find((a) => a.tool === 'department.list_admins')?.args).toMatchObject({ dept_id: 'S', inherited: true })
    const groups = [...document.body.querySelectorAll('.admins-drawer__group')].map((g) => g.textContent ?? '')
    expect(groups[0]).toContain('Appointed here')
    expect(groups[0]).toContain('Chan Siu Ming')
    expect(groups[1]).toContain('Through Engineering')
    expect(groups[1]).toContain('Ada Lovelace')
    expect(groups[1]).not.toContain('End appointment')
    w.unmount()
  })

  it('ends an appointment once it is confirmed', async () => {
    const w = await mountDrawer(computing)
    writes.mockResolvedValue(executed({ ok: true }))
    buttons('End appointment')[0]!.click()
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(writes).toHaveBeenCalledWith('department.remove_admin', { dept_id: 'S', actor_id: 'chan' })
    expect(w.emitted('changed')).toHaveLength(1)
    w.unmount()
  })

  async function find(email: string) {
    const input = document.body.querySelector<HTMLInputElement>('input[name=lookup-email]')!
    input.value = email
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    input.closest('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
  }

  it('finds a person by their whole email and appoints them', async () => {
    const w = await mountDrawer(computing)
    answers['actor.lookup_by_email'] = async () => ({
      actor_id: 'bob',
      display_name: 'Bob Chan',
      kind: 'human',
      status: 'active',
      can_sign_in: true,
      invitable: false,
    })
    await find(' bob@example.edu ')
    expect(asked.find((a) => a.tool === 'actor.lookup_by_email')?.args).toEqual({ email: 'bob@example.edu' })
    writes.mockResolvedValue(executed({ appointment_id: 'ap2', covered_above: false }))
    buttons('Appoint Bob Chan')[0]!.click()
    await flushPromises()
    expect(writes).toHaveBeenCalledWith('department.add_admin', { dept_id: 'S', actor_id: 'bob' })
    expect(w.emitted('changed')).toHaveLength(1)
    // Nothing platform-only was asked for.
    expect(asked.map((a) => a.tool)).not.toContain('actor.get')
    expect(asked.map((a) => a.tool)).not.toContain('actor.list')
    w.unmount()
  })

  it('says, before asking Core, who cannot be appointed', async () => {
    const w = await mountDrawer(computing)
    answers['actor.lookup_by_email'] = async () => ({
      actor_id: 'robo',
      display_name: 'Robo',
      kind: 'agent',
      status: 'active',
      can_sign_in: false,
      invitable: false,
    })
    await find('robo@example.edu')
    expect(body()).toContain('Only a person can administer a department, never an agent.')
    expect((buttons('Appoint Robo')[0] as HTMLButtonElement).disabled).toBe(true)

    answers['actor.lookup_by_email'] = async () => ({
      actor_id: 'chan',
      display_name: 'Chan Siu Ming',
      kind: 'human',
      status: 'active',
      can_sign_in: true,
      invitable: false,
    })
    await find('chan@example.edu')
    expect(body()).toContain('They administer this department already.')
    w.unmount()
  })

  it('offers no appointing where the caller does not administer the department above', async () => {
    const w = await mountDrawer(node('F', 'Engineering', 'U', 2, { administers: true, appointed: true }))
    expect(body()).toContain('Administrators of this department are appointed by whoever administers the department above it.')
    expect(document.body.querySelector('input[name=lookup-email]')).toBeNull()
    expect(buttons('End appointment')).toHaveLength(0)
    w.unmount()
  })
})
