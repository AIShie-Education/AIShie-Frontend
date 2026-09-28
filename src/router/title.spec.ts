import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { documentTitle, installTitle, titleKey } from './title'

const View = { render: () => null }

/** A view whose code is still loading, until the test lets it fail. */
function failingView() {
  let started: () => void = () => undefined
  let reject: (err: Error) => void = () => undefined
  const loading = new Promise<void>((r) => (started = r))
  const component = () => {
    started()
    return new Promise<typeof View>((_resolve, r) => (reject = r))
  }
  return { component, loading, fail: (err: Error) => reject(err) }
}

function makeRouter(lazy: () => Promise<typeof View> = () => Promise.reject(new Error('x'))) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View, meta: { title: 'common.nav.home' } },
      {
        path: '/admin',
        meta: { title: 'admin.courses.title' },
        children: [
          { path: 'actors', name: 'actors', component: View, meta: { title: 'admin.actors.title' } },
          { path: 'other', name: 'other', component: View },
        ],
      },
      { path: '/plain', name: 'plain', component: View },
      { path: '/slow', name: 'slow', component: View, meta: { title: 'auth.title' } },
      // A view whose code does not load, as after a deploy removed it.
      { path: '/broken', name: 'broken', component: lazy, meta: { title: 'auth.title' } },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: View, meta: { title: 'layout.notFound' } },
    ],
  })
}

afterEach(() => {
  i18n.global.locale.value = 'en'
})

describe('page titles', () => {
  it('takes the innermost title, and the app name alone without one', () => {
    const router = makeRouter()
    expect(titleKey(router.resolve('/admin/actors'))).toBe('admin.actors.title')
    expect(titleKey(router.resolve('/admin/other'))).toBe('admin.courses.title')
    expect(titleKey(router.resolve('/plain'))).toBeUndefined()
    expect(documentTitle(undefined)).toBe('AIshie')
    expect(documentTitle('x', (k) => `<${k}>`)).toBe('<x> · AIshie')
  })

  it('names the tab before later guards have answered, and follows the language', async () => {
    i18n.global.locale.value = 'en'
    const router = makeRouter()
    installTitle(router)
    // A guard that waits, as the sign-in check waits for Core.
    let release: () => void = () => undefined
    let entered: () => void = () => undefined
    const waiting = new Promise<void>((r) => (entered = r))
    router.beforeEach((to) => {
      if (to.name !== 'slow') return
      entered()
      return new Promise<void>((r) => (release = r))
    })
    await router.push('/admin/actors')
    expect(document.title).toBe('People & agents · AIshie')

    const going = router.push('/slow')
    await waiting
    // Still waiting on the guard, and the tab already says where it is going.
    expect(document.title).toBe('Sign in · AIshie')
    release()
    await going

    i18n.global.locale.value = 'zh-Hant'
    await Promise.resolve()
    expect(document.title).toBe('登入 · AIshie')
  })

  it('names the tab after where the page stayed when a navigation does not happen', async () => {
    i18n.global.locale.value = 'en'
    const router = makeRouter()
    installTitle(router)
    router.beforeEach((to) => to.name !== 'plain')
    await router.push('/')
    await router.push('/plain')
    expect(router.currentRoute.value.name).toBe('home')
    expect(document.title).toBe('My courses · AIshie')
  })

  it('names the tab after where the page stayed when a navigation fails', async () => {
    i18n.global.locale.value = 'en'
    const router = makeRouter()
    installTitle(router)
    router.onError(() => undefined)
    await router.push('/')
    await router.push('/broken').catch(() => undefined)
    expect(router.currentRoute.value.name).toBe('home')
    expect(document.title).toBe('My courses · AIshie')

    // A guard that throws fails the same way.
    router.beforeEach((to) => {
      if (to.name === 'plain') throw new Error('guard')
    })
    await router.push('/plain').catch(() => undefined)
    expect(router.currentRoute.value.name).toBe('home')
    expect(document.title).toBe('My courses · AIshie')
  })

  it('leaves the tab to a newer navigation when an older one fails', async () => {
    i18n.global.locale.value = 'en'
    const broken = failingView()
    const router = makeRouter(broken.component)
    installTitle(router)
    router.onError(() => undefined)
    let release: () => void = () => undefined
    let entered: () => void = () => undefined
    const waiting = new Promise<void>((r) => (entered = r))
    router.beforeEach((to) => {
      if (to.name !== 'slow') return
      entered()
      return new Promise<void>((r) => (release = r))
    })
    await router.push('/')

    const failing = router.push('/broken').catch(() => undefined)
    await broken.loading
    const going = router.push('/slow')
    await waiting
    broken.fail(new Error('Failed to fetch dynamically imported module'))
    await failing
    // The older navigation failed while the newer one waits: the tab still says where that one goes.
    expect(document.title).toBe('Sign in · AIshie')
    release()
    await going
    expect(router.currentRoute.value.name).toBe('slow')
    expect(document.title).toBe('Sign in · AIshie')
  })

  it('names a page that does not exist', async () => {
    i18n.global.locale.value = 'en'
    const router = makeRouter()
    installTitle(router)
    await router.push('/no-such-page')
    expect(router.currentRoute.value.name).toBe('not-found')
    expect(document.title).toBe('Page not found · AIshie')
    i18n.global.locale.value = 'zh-Hant'
    await Promise.resolve()
    expect(document.title).toBe('找不到頁面 · AIshie')
  })
})
