// The runtime administrators' page's component tests: what each mounts with.
// For *.spec.ts only.
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'

const View = { render: () => null }

/** Plugins and components as the app has them, with the routes the page links to. */
export async function mountGlobal(path = '/admin/runtime') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/admin/runtime', name: 'admin-runtime', component: View },
      { path: '/admin/actors/:actorId', name: 'admin-actor', component: View },
      { path: '/courses/:courseId/documents/:documentId', name: 'course-document', component: View },
    ],
  })
  await router.push(path)
  return { router, global: { plugins: [pinia, router, i18n, ElementPlus], components: icons } }
}

const realSetTimeout = globalThis.setTimeout

/**
 * Element Plus shows a field's error 100 ms after it is set. Where a test has
 * made setTimeout fake (to move the clock past the waits before a call is
 * sent again), the clock is moved on instead of waited for.
 */
export async function settle() {
  const { flushPromises } = await import('@vue/test-utils')
  await flushPromises()
  if (globalThis.setTimeout !== realSetTimeout) await vi.advanceTimersByTimeAsync(120)
  else await new Promise((r) => realSetTimeout(r, 120))
  await flushPromises()
}
