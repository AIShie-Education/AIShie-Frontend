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
import { acceptInvite, ApiError, bearer, login, logout as apiLogout, read } from '@/api/http'
import type { Me, Membership } from '@/api/types'
import { useCourseStore } from './course'

export type SessionStatus = 'unknown' | 'signedIn' | 'signedOut'

/**
 * Where earlier versions of the administration pages kept, in this browser,
 * each administrator's actors seen recently, before Core had a list of
 * actors. Nothing writes there now; what those versions left is still
 * deleted when the caller goes.
 */
const RECENT_ACTORS_PREFIX = 'aishiteru.admin.recentActors.'

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

  /**
   * Takes up an invitation: sets the invited person's password and signs this
   * browser in as them. Nothing is dropped until Core has said yes, so that
   * whoever was signed in here still is when the invitation is refused. The
   * email they sign in with from now on comes back. Once Core has said yes
   * the invitation is used up, so failing to read who they are afterwards is
   * not a failure here: the next page asks again.
   */
  async function signInWithInvite(token: string, password: string): Promise<{ email: string }> {
    const out = await acceptInvite(token, password)
    forgetCaller()
    bearer.set(null)
    usingToken.value = false
    status.value = 'unknown'
    await ensure().catch(() => undefined)
    return { email: out.email }
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

  /**
   * Drops the lists kept in this browser for one caller, so that none
   * outlives them: the actors seen recently that earlier versions of the
   * administration pages kept (RECENT_ACTORS_PREFIX).
   */
  function forgetStoredLists() {
    try {
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(RECENT_ACTORS_PREFIX)) doomed.push(key)
      }
      for (const key of doomed) localStorage.removeItem(key)
    } catch {
      /* no storage: nothing was kept */
    }
  }

  /**
   * Drops what this store, the course store and this browser hold for the
   * caller: on signing out, when the session ends, and whenever someone else
   * signs in here, by any way in.
   */
  function forgetCaller() {
    if (me.value) heldCaller = true
    me.value = null
    memberships.value = []
    useCourseStore().close()
    forgetStoredLists()
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
    signInWithInvite,
    signInWithToken,
    signOut,
    clear,
    startsAfresh,
  }
})
