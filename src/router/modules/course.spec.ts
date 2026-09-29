import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import courseRoutes from './course'

const View = { render: () => null }
const COURSE = 'k1'

/** The app's shape around the old conversations address: the frame, a course in it, and the sign-in page outside it. */
function makeRouter() {
  const old = courseRoutes.find((r) => r.name === 'course-conversations') as RouteRecordRaw
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: View },
      {
        path: '/',
        component: View,
        children: [
          { path: '', name: 'home', component: View },
          {
            path: 'courses/:courseId',
            component: View,
            children: [
              { path: '', name: 'course-overview', component: View },
              { path: 'grades', name: 'course-grades', component: View },
              old,
            ],
          },
        ],
      },
    ],
  })
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  const session = useSessionStore()
  session.me = { id: 'ada', kind: 'human', display_name: 'Ada' } as never
  session.memberships = [
    {
      member_id: 'm1',
      course_id: COURSE,
      code: 'CS101',
      section: '',
      title: 'Programming',
      role: 'student',
      status: 'active',
      course_status: 'active',
      perms: { conversation_ask: 'autonomous' },
    } as never,
  ]
})

describe('the old conversations address', () => {
  it('lands on the course’s overview, with the chat panel open on the conversation it names', async () => {
    const router = makeRouter()
    await router.push(`/courses/${COURSE}/conversations/c9`)
    expect(router.currentRoute.value.name).toBe('course-overview')
    expect(router.currentRoute.value.params.courseId).toBe(COURSE)
    const chat = useChatStore()
    expect(chat.open).toBe(true)
    expect(chat.screen).toBe('conversation')
    expect(chat.conversation).toEqual({ courseId: COURSE, id: 'c9' })
  })

  it('opens the panel on the course when it names no conversation, as its route name does', async () => {
    const router = makeRouter()
    await router.push({ name: 'course-conversations', params: { courseId: COURSE } })
    expect(router.currentRoute.value.name).toBe('course-overview')
    const chat = useChatStore()
    expect(chat.open).toBe(true)
    expect(chat.screen).toBe('new')
    expect(chat.courseId).toBe(COURSE)
  })

  it('leaves the page where it is when followed from inside the app', async () => {
    const router = makeRouter()
    await router.push(`/courses/${COURSE}/grades`)
    await router.push({ name: 'course-conversations', params: { courseId: COURSE, conversationId: 'c9' } })
    expect(router.currentRoute.value.name).toBe('course-grades')
    expect(useChatStore().conversation).toEqual({ courseId: COURSE, id: 'c9' })
    expect(useChatStore().open).toBe(true)
  })

  it('lands on the overview after signing in, which came from outside the app', async () => {
    const router = makeRouter()
    await router.push('/login')
    await router.replace(`/courses/${COURSE}/conversations/c9`)
    expect(router.currentRoute.value.name).toBe('course-overview')
    expect(useChatStore().conversation?.id).toBe('c9')
  })

  it('still has an address of its own, for links to it', () => {
    const router = makeRouter()
    expect(
      router.resolve({ name: 'course-conversations', params: { courseId: COURSE, conversationId: 'c9' } }).href,
    ).toBe(`/courses/${COURSE}/conversations/c9`)
  })
})
