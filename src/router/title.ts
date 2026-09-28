// The page's name in the browser's tab. It is set as soon as a navigation
// knows where it is going, from its route's meta.title, before the sign-in
// check or any of the page's own data is waited for; again once the
// navigation has settled (a redirect, one that did not happen, or one that
// failed leaves the tab named after where the page is); and again when the
// language changes. A page shown may name itself otherwise while it is
// (usePageTitle): one route may be a different page for different callers.
import { onBeforeUnmount, shallowRef, toValue, watch, watchEffect, type MaybeRefOrGetter } from 'vue'
import type { RouteLocationNormalized, RouteRecordNameGeneric, Router } from 'vue-router'
import { i18n } from '@/i18n'

export const APP_NAME = 'AIshie'

interface PageTitle {
  owner: symbol
  /** The route the page is shown at; the title is its only there. */
  route: RouteRecordNameGeneric
  key: string
}
/** The title the page shown now has given itself, if any. */
export const pageTitle = shallowRef<PageTitle | null>(null)

/**
 * The i18n key of a route's title: the one the page shown at it gave itself,
 * or else that of the innermost matched route that has one.
 */
export function titleKey(
  route: Pick<RouteLocationNormalized, 'matched'> & { name?: RouteRecordNameGeneric | null },
): string | undefined {
  const own = pageTitle.value
  if (own && route.name && own.route === route.name) return own.key
  return [...route.matched].reverse().find((r) => r.meta.title)?.meta.title
}

/**
 * Names the page shown at the route `routeName` by the i18n key `key`, in the
 * app's header and the browser's tab, while the calling component is
 * mounted: the approval queue, for someone who decides nothing there, is
 * their agents' proposals. Null or undefined leaves it to the route.
 */
export function usePageTitle(routeName: string, key: MaybeRefOrGetter<string | null | undefined>): void {
  const owner = Symbol('page-title')
  const release = () => {
    if (pageTitle.value?.owner === owner) pageTitle.value = null
  }
  const stop = watchEffect(() => {
    const k = toValue(key)
    if (k) pageTitle.value = { owner, route: routeName, key: k }
    else release()
  })
  onBeforeUnmount(() => {
    stop()
    release()
  })
}

/** What the tab says for a page titled by `key`: "Assignments · AIshie", or the app's name alone. */
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
  // The latest navigation to have started.
  let pending: RouteLocationNormalized | undefined
  const removers = [
    router.beforeEach((to) => {
      pending = to
      name(to)
    }),
    router.afterEach(() => name(router.currentRoute.value)),
    // A navigation that failed with an error (a view's code that did not
    // load, a guard that threw) runs no afterEach, so the tab is put back
    // here. A failure a newer navigation has overtaken is left to that one.
    router.onError((_err, to) => {
      if (to === pending) name(router.currentRoute.value)
    }),
  ]
  const stop = watch(
    () => [i18n.global.locale.value, pageTitle.value],
    () => name(router.currentRoute.value),
  )
  return () => {
    removers.forEach((remove) => remove())
    stop()
  }
}
