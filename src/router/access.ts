// Who may open the administration pages. A route says what it needs in its
// meta (admin: true for a platform administrator only; 'departments' for a
// platform administrator or anyone who administers a department), and the
// strictest need of the routes it is matched through decides.
//
// This only decides what is offered: Core decides what is allowed, and a
// department administrator's pages show only what Core gives them.
import type { RouteLocationNormalized } from 'vue-router'

export type AdminNeed = 'platform' | 'departments' | null

/** What a route needs of the caller, from its own meta and its parents'. */
export function adminNeed(to: Pick<RouteLocationNormalized, 'matched'>): AdminNeed {
  if (to.matched.some((r) => r.meta.admin === true)) return 'platform'
  if (to.matched.some((r) => r.meta.admin === 'departments')) return 'departments'
  return null
}

/** Whether a caller with these standings may open a page that needs `need`. */
export function mayOpen(need: AdminNeed, caller: { isAdmin: boolean; canAdminister: boolean }): boolean {
  if (need === 'platform') return caller.isAdmin
  if (need === 'departments') return caller.canAdminister
  return true
}
