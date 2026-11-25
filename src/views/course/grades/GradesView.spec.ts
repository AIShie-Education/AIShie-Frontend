import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import { ApiError } from '@/api/http'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import GradesView from './GradesView.vue'

// The grades page of a seat that enters grades without reading them: what it
// says, and where its ways on start. jsdom lays nothing out: AppEmpty's rule,
// read as written, is matched against what the page puts in its slot.

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
vi.mock('@/api/http', async (orig) => ({
  ...(await orig<typeof import('@/api/http')>()),
  read: vi.fn(async () => {
    throw new ApiError({ status: 403, code: 'forbidden', message: 'permission denied' })
  }),
  write: vi.fn(),
}))

/** AppEmpty's rule for a button of words that starts its slot's line, by its selector. */
const takeBack = (() => {
  const raw = Object.values(
    import.meta.glob<string>('@/components/AppEmpty.vue', { query: '?raw', import: 'default', eager: true }),
  )[0]!
  const shared = raw.replace(/^[\s\S]*<style>/, '')
  return shared
    .slice(0, shared.indexOf('{'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
})()

const mounted: VueWrapper[] = []
beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  setLocale('en')
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The page, for a teaching assistant's seat that may not do what `denied` names. */
async function mountGrades(denied: string[]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().$patch({ me: { id: 'actor-ta', kind: 'human', display_name: 'Lee' } } as never)
  useCourseStore().$patch({
    courseId: COURSE,
    course: { id: COURSE, code: 'CS101', section: 'A', title: 'Programming', status: 'active' } as never,
    membership: { member_id: 'm-ta', role: 'ta', assignment_scope: 'all', student_scope: 'all' } as never,
    perms: new Proxy({}, { get: (_, p) => (denied.includes(String(p)) ? 'denied' : 'autonomous') }) as never,
    permsSource: 'exact',
  } as never)
  const stub = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', name: 'any', component: stub }],
  })
  for (const name of ['course-submissions', 'course-my-actions', 'course-grade', 'course-gradebook'])
    router.addRoute({ path: `/${name}/:a?/:b?`, name, component: stub })
  await router.push('/grades')
  const w = mount(GradesView, {
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

describe('the grades page of a seat that enters grades without reading them', () => {
  it('says so as an empty page does, its title over its words, and its first way on under those words', async () => {
    const w = await mountGrades(['grade_read'])
    const empty = w.find('.app-empty--page')
    expect(empty.find('.app-empty__title').text()).toBe('This seat does not read grades')
    expect(empty.find('.app-empty__text').text()).toBe(
      'It enters grades from each submission. What it has entered, or proposed for approval, is listed in My actions.',
    )
    // The ways on are the slot's own line, no box of the page's around them, nothing centred.
    const ways = empty.findAll('.app-empty__more > a')
    expect(ways.map((a) => a.text())).toEqual(['Submissions', 'My actions'])
    // Submissions, a button of words, takes back its room so that its icon starts under the words; the solid
    // My actions keeps its edge.
    const [submissions, actions] = ways.map((a) => a.find('.el-button').element)
    expect(submissions!.matches(takeBack)).toBe(true)
    expect(actions!.matches(takeBack)).toBe(false)
    expect(w.find('.app-form-hint').exists()).toBe(false)
  })

  it('leads with My actions, solid, where the seat may not read submissions', async () => {
    const w = await mountGrades(['grade_read', 'submission_read'])
    const ways = w.findAll('.app-empty__more > a')
    expect(ways.map((a) => a.text())).toEqual(['My actions'])
    expect(ways[0]!.find('.el-button').element.matches(takeBack)).toBe(false)
  })

  it('says only that it does not read grades, with no way on, where the seat neither enters nor posts them', async () => {
    const w = await mountGrades(['grade_read', 'grade_submit', 'grade_post'])
    const empty = w.find('.app-empty--page')
    expect(empty.find('.app-empty__title').exists()).toBe(false)
    expect(empty.find('.app-empty__text').text()).toBe('This seat does not read grades')
    expect(empty.find('.app-empty__more').exists()).toBe(false)
  })
})
