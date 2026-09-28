import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import AppLayout from '@/layouts/AppLayout.vue'
import CourseLayout from '@/layouts/CourseLayout.vue'
import accountRoutes from './modules/account'
import adminRoutes from './modules/admin'
import courseRoutes from './modules/course'
import { installTitle } from './title'
import { adminNeed, mayOpen } from './access'

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean
    /**
     * The administration pages: true needs platform_role root or admin;
     * 'departments' needs that, or an appointment as a department's
     * administrator. A child's own meta may ask for more than its parent's.
     */
    admin?: true | 'departments'
    /** i18n key for the page title. */
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true, title: 'auth.title' },
  },
  {
    // Where an invitation link lands (actor.invite): the token is in the
    // fragment, #token=aisinv_…, which no server sees.
    path: '/welcome',
    name: 'welcome',
    component: () => import('@/views/auth/WelcomeView.vue'),
    meta: { public: true, title: 'auth.invite.title' },
  },
  {
    path: '/',
    component: AppLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/home/HomeView.vue'),
        meta: { title: 'common.nav.home' },
      },
      ...accountRoutes,
      ...adminRoutes,
      {
        path: 'courses/:courseId',
        component: CourseLayout,
        props: true,
        children: courseRoutes,
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true, title: 'layout.notFound' },
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

// First, so that the tab is named before the sign-in check waits for Core.
installTitle(router)

router.beforeEach(async (to) => {
  const session = useSessionStore()
  try {
    await session.ensure()
  } catch {
    // Core could not be reached. Public pages still show; others show the
    // layout's own error state once they ask for something.
  }
  if (to.meta.public) {
    // Signed in, the sign-in page has nothing to offer; the welcome page
    // still does: an invitation opened in a browser someone is signed in to
    // signs it in as the invited person instead, and says so first.
    if (to.name === 'login' && session.status === 'signedIn') {
      const next = typeof to.query.next === 'string' && to.query.next.startsWith('/') ? to.query.next : '/'
      return next
    }
    return true
  }
  if (session.status === 'signedOut') {
    return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
  }
  if (!mayOpen(adminNeed(to), session)) {
    return { name: 'home' }
  }
  return true
})
