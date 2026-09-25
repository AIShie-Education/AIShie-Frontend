// Who is signed in, and the courses they are seated in.
//
// A browser signs in with a session cookie it cannot read, so "am I signed
// in" is answered by asking Core who the caller is (me.get). A pasted API
// token is the other way in, for seeing the system as an agent sees it.
//
// Everything else the page holds (the open course, the seat's permissions,
// names and look-ups cached by the views) belongs to one caller. When the
// caller goes, the course store is dropped here; and since views keep caches
// of their own, the next sign-in in this tab starts the page again from
// nothing (see startsAfresh and LoginView).
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, bearer, login, logout as apiLogout, read } from '@/api/http'
import type { Me, Membership } from '@/api/types'
import { useCourseStore } from './course'

export type SessionStatus = 'unknown' | 'signedIn' | 'signedOut'

export const useSessionStore = defineStore('session', () => {
  const me = ref<Me | null>(null)
  const memberships = ref<Membership[]>([])
  const status = ref<SessionStatus>('unknown')
  const usingToken = ref(!!bearer.get())
  let loading: Promise<void> | null = null
  /** Whether this page has held a caller who has since gone. */
  let heldCaller = false

  const isRoot = computed(() => me.value?.platform_role === 'root')
  const isAdmin = computed(() => me.value?.platform_role === 'root' || me.value?.platform_role === 'admin')
  const liveMemberships = computed(() => memberships.value.filter((m) => m.status !== 'removed'))

  async function load(): Promise<void> {
    try {
      me.value = await read('me.get', {})
      status.value = 'signedIn'
      await loadMemberships()
    } catch (e) {
      if (e instanceof ApiError && e.isUnauthenticated) {
        clear()
        return
      }
      throw e
    }
  }

  /** Establishes the session once; later calls wait for the same answer. */
  function ensure(): Promise<void> {
    if (status.value !== 'unknown') return Promise.resolve()
    if (!loading) loading = load().finally(() => (loading = null))
    return loading
  }

  async function loadMemberships() {
    const out = await read('me.memberships', {})
    memberships.value = out.memberships ?? []
  }

  function membershipFor(courseId: string): Membership | undefined {
    return memberships.value.find((m) => m.course_id === courseId && m.status !== 'removed')
  }

  async function signInWithPassword(email: string, password: string) {
    forgetCaller()
    bearer.set(null)
    usingToken.value = false
    await login(email, password)
    status.value = 'unknown'
    await ensure()
  }

  async function signInWithToken(token: string) {
    forgetCaller()
    bearer.set(token.trim())
    usingToken.value = true
    status.value = 'unknown'
    await ensure().catch(() => undefined)
    if (!signedIn()) {
      bearer.set(null)
      usingToken.value = false
      status.value = 'signedOut'
      throw new ApiError({ status: 401, code: 'unauthenticated', message: 'the token was not accepted' })
    }
  }

  function signedIn(): boolean {
    return status.value === 'signedIn'
  }

  async function signOut() {
    try {
      if (usingToken.value) bearer.set(null)
      else await apiLogout()
    } finally {
      clear()
    }
  }

  /** Forgets everything about the caller, as when Core says the session is over. */
  function clear() {
    forgetCaller()
    status.value = 'signedOut'
    if (usingToken.value) {
      bearer.set(null)
      usingToken.value = false
    }
  }

  /** Drops what this store and the course store hold for the caller. */
  function forgetCaller() {
    if (me.value) heldCaller = true
    me.value = null
    memberships.value = []
    useCourseStore().close()
  }

  /**
   * Whether the page should be loaded again once someone signs in: it has
   * held another caller, and views keep caches (names, look-ups, the event
   * feed's) that only a fresh page is sure to be rid of.
   */
  function startsAfresh(): boolean {
    return heldCaller
  }

  return {
    me,
    memberships,
    liveMemberships,
    status,
    usingToken,
    isRoot,
    isAdmin,
    ensure,
    load,
    loadMemberships,
    membershipFor,
    signInWithPassword,
    signInWithToken,
    signOut,
    clear,
    startsAfresh,
  }
})
