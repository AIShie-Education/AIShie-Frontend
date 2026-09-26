import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { documentTitle, installTitle, titleKey } from './title'

const View = { render: () => null }

function makeRouter() {
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
    expect(documentTitle(undefined)).toBe('AIShiteru')
    expect(documentTitle('x', (k) => `<${k}>`)).toBe('<x> · AIShiteru')
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
    expect(document.title).toBe('People & agents · AIShiteru')

    const going = router.push('/slow')
    await waiting
    // Still waiting on the guard, and the tab already says where it is going.
    expect(document.title).toBe('Sign in · AIShiteru')
    release()
    await going

    i18n.global.locale.value = 'zh-Hant'
    await Promise.resolve()
    expect(document.title).toBe('登入 · AIShiteru')
  })

  it('names the tab after where the page stayed when a navigation does not happen', async () => {
    i18n.global.locale.value = 'en'
    const router = makeRouter()
    installTitle(router)
    router.beforeEach((to) => to.name !== 'plain')
    await router.push('/')
    await router.push('/plain')
    expect(router.currentRoute.value.name).toBe('home')
    expect(document.title).toBe('My courses · AIShiteru')
  })
})
