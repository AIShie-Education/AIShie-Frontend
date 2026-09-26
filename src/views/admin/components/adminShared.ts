// What the administration pages share: finding one course by id, reading an
// id from the address in Core's form, and what registering someone gives.
import { computed, watch, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, read } from '@/api/http'
import type { ListItem } from '@/api/types'
import { isUuid, uuidPredecessor } from '@/utils/format'

// Kept here for the pages that import it from the administration's helpers.
export { uuidPredecessor }

/** A course as course.list gives it: the same shape as course.get. */
export type CourseRow = ListItem<'course.list', 'courses'>

/** The default identity provider name, as Core records it (OIDC_PROVIDER_NAME). */
export const DEFAULT_SSO_PROVIDER = 'polyu-adfs'

/**
 * One course, read as an administrator. course.get needs a seat in the
 * course; course.list does not, and pages in id order after a cursor, so
 * asking for the one course after the id just before this one finds it in a
 * single call.
 */
export async function findCourse(id: string, notFoundMessage: string): Promise<CourseRow> {
  const want = id.trim().toLowerCase()
  const after = isUuid(want) ? uuidPredecessor(want) : null
  if (after) {
    const out = await read('course.list', { after, limit: 1 })
    const c = (out.courses ?? [])[0]
    if (c && c.id.toLowerCase() === want) return c
  }
  throw new ApiError({ status: 404, code: 'not_found', message: notFoundMessage })
}

/**
 * The id in route param `param`, the way Core writes ids (lower case), for
 * asking Core and comparing with what it returns. An id pasted in capitals
 * names the same thing, so the address is corrected in place.
 */
export function useCanonicalId(raw: () => string, param: string): ComputedRef<string> {
  const route = useRoute()
  const router = useRouter()
  const id = computed(() => raw().trim().toLowerCase())
  watch(
    raw,
    (v) => {
      if (!isUuid(v) || v === id.value || !route.name) return
      void router.replace({
        name: route.name,
        params: { ...route.params, [param]: id.value },
        query: route.query,
        hash: route.hash,
      })
    },
    { immediate: true },
  )
  return id
}

/** An actor as actor.list gives them: the same shape as actor.get. */
export type ActorRow = ListItem<'actor.list', 'actors'>

/** What actor.register was given, with the id it returned. */
export interface RegisteredActor {
  id: string
  kind: 'human' | 'agent'
  display_name: string
  email: string | null
  platform_role: string | null
}

/** An email address as the forms take one; Core has the last word. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
