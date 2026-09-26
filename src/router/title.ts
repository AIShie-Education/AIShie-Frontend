// The page's name in the browser's tab. It is set as soon as a navigation
// knows where it is going, from its route's meta.title, before the sign-in
// check or any of the page's own data is waited for; again once the
// navigation has settled (a redirect, or one that did not happen, leaves the
// tab named after where the page is); and again when the language changes.
import { watch } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { i18n } from '@/i18n'

export const APP_NAME = 'AIShiteru'

/** The i18n key of a route's title: that of the innermost matched route that has one. */
export function titleKey(route: Pick<RouteLocationNormalized, 'matched'>): string | undefined {
  return [...route.matched].reverse().find((r) => r.meta.title)?.meta.title
}

/** What the tab says for a page titled by `key`: "Assignments · AIShiteru", or the app's name alone. */
export function documentTitle(key: string | undefined, t: (key: string) => string = (k) => i18n.global.t(k)): string {
  return key ? `${t(key)} · ${APP_NAME}` : APP_NAME
}

/**
 * Keeps document.title in step with the router. Installed before any other
 * guard, so that the tab is named before those guards wait for anything.
 */
export function installTitle(router: Router): () => void {
  const name = (route: Pick<RouteLocationNormalized, 'matched'>) => {
    if (typeof document !== 'undefined') document.title = documentTitle(titleKey(route))
  }
  const removers = [
    router.beforeEach((to) => {
      name(to)
    }),
    router.afterEach(() => name(router.currentRoute.value)),
  ]
  const stop = watch(
    () => i18n.global.locale.value,
    () => name(router.currentRoute.value),
  )
  return () => {
    removers.forEach((remove) => remove())
    stop()
  }
}
