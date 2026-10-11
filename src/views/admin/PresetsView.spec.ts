import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import PresetsView from './PresetsView.vue'

// The presets say which are built in only where a department's own are listed beside them
// (docs/CONVENTIONS.md, "Tags"): Built-in on every one, with no department chosen, says nothing.

const read = vi.fn()
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: (...a: unknown[]) => read(...a),
}))

const DEPT = '01a0d79f-0000-70da-a7cc-0000000000d1'

function preset(name: string, role: string, dept_id: string | null = null) {
  return {
    id: `preset-${name}`,
    name,
    dept_id,
    role,
    student_scope: 'own',
    assignment_scope: 'all',
    perms: { document_read: 'autonomous' },
    description: dept_id ? 'A department’s own.' : null,
  }
}
const BUILTINS = [preset('student', 'student'), preset('instructor', 'instructor')]

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  read.mockReset()
  // Core's presets: the built-ins, and with a department asked for, its own beside them.
  read.mockImplementation(async (tool: string, args: { dept_id?: string }) => {
    if (tool === 'department.list') return { departments: [{ id: DEPT, name: 'Computing' }] }
    if (tool === 'preset.list')
      return { presets: args.dept_id === DEPT ? [...BUILTINS, preset('lab-tutor', 'ta', DEPT)] : BUILTINS }
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  })
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function presets(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/presets', name: 'admin-presets', component: { render: () => null } }],
  })
  await router.push(path)
  const w = mount(PresetsView, {
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

/** Each preset's tags in the list, as words. */
const tags = (w: Awaited<ReturnType<typeof presets>>) =>
  w.findAll('.preset-card').map((c) =>
    c
      .find('.preset-card__head')
      .findAll('.app-tag')
      .map((t) => t.text()),
  )
/** What each of the matrix's columns says of where its preset is from. */
const where = () =>
  [...document.body.querySelectorAll('.preset-matrix .matrix-head')].map(
    (h) => h.querySelector('.matrix-head__where')?.textContent?.trim() ?? '',
  )

describe('the presets’ Built-in', () => {
  it('is not said while the built-ins are listed alone', async () => {
    const w = await presets('/admin/presets')
    expect(tags(w)).toEqual([[], []])
    expect(where().some((s) => s.includes('Built-in'))).toBe(false)
  })

  it('is said of each built-in once a department’s own are listed beside them, and the department’s say whose', async () => {
    const w = await presets(`/admin/presets?dept=${DEPT}`)
    expect(read).toHaveBeenCalledWith('preset.list', { dept_id: DEPT })
    expect(tags(w)).toEqual([['Built-in'], ['Built-in'], ['Computing']])
    const heads = where()
    expect(heads).toHaveLength(3)
    expect(heads.slice(0, 2).every((s) => s.startsWith('Built-in'))).toBe(true)
    expect(heads[2]).toContain('Computing')
  })

  it.each([
    ['zh-Hant', '內建'],
    ['zh-Hans', '内置'],
  ] as const)('is said in %s', async (locale, builtin) => {
    setLocale(locale)
    const alone = await presets('/admin/presets')
    expect(tags(alone).flat()).not.toContain(builtin)
    alone.unmount()
    const beside = await presets(`/admin/presets?dept=${DEPT}`)
    expect(tags(beside)).toEqual([[builtin], [builtin], ['Computing']])
  })
})
