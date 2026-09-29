import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, read } from '@/api/http'
import { migrateStorage } from '@/utils/storageMigration'

// Who me.get says is signed in, and what taking up an invitation answers.
let me: { id: string; display_name: string; platform_role?: string | null; administers?: unknown[] | null } | null =
  null
let invite: () => Promise<{ actor_id: string; email?: string | null; login_id?: string | null; expires_at: string }>
/** Signed in with a password someone else set: me.get is refused until they set their own. */
let mustChange = false
let signIn: () => Promise<{ actor_id: string; expires_at: string; password_change_required?: boolean }>
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string) => {
      if (tool === 'me.get' && mustChange) {
        return Promise.reject(
          new ApiError({
            status: 403,
            code: 'forbidden',
            message: 'not permitted',
            details: { reason: 'password_change_required' },
          }),
        )
      }
      if (tool === 'me.get') {
        return me
          ? Promise.resolve(me)
          : Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'no' }))
      }
      if (tool === 'me.memberships') return Promise.resolve({ memberships: [] })
      return Promise.reject(new Error(`no answer for ${tool}`))
    }),
    acceptInvite: vi.fn(() => invite()),
    login: vi.fn(() => signIn()),
  }
})

// The assertion the agent runtime is called with, which the store drops.
const forgetRuntimeAssertion = vi.fn()
vi.mock('@/api/runtime', () => ({ forgetRuntimeAssertion: () => forgetRuntimeAssertion() }))

const { useSessionStore } = await import('./session')

beforeEach(() => {
  setActivePinia(createPinia())
  me = null
  mustChange = false
  forgetRuntimeAssertion.mockClear()
})

describe('a tab an earlier version of the page signed in with a pasted API token', () => {
  it('starts signed out, forgets the token, and asks Core nothing with it', async () => {
    // The browser may be signed in all the same, with a session cookie from another tab.
    me = { id: 'p1', display_name: 'Chan Tai Man' }
    sessionStorage.setItem('aishie.bearer', 'ais_abcdefghijkl_pasted-in-an-earlier-version')
    vi.mocked(read).mockClear()
    const session = useSessionStore()
    await session.ensure()
    expect(session.status).toBe('signedOut')
    expect(session.me).toBeNull()
    expect(sessionStorage.getItem('aishie.bearer')).toBeNull()
    expect(read).not.toHaveBeenCalled()

    // Loaded again, nothing of it is left: the tab is whoever the browser is signed in as.
    setActivePinia(createPinia())
    const again = useSessionStore()
    await again.ensure()
    expect(again.status).toBe('signedIn')
    expect(again.me?.id).toBe('p1')
  })

  it('is a way in no more: the store signs in with no token', () => {
    const session = useSessionStore()
    expect('signInWithToken' in session).toBe(false)
    expect('usingToken' in session).toBe(false)
  })
})

describe('signInWithInvite', () => {
  it('signs this browser in as the invited person, and says which email they use', async () => {
    const session = useSessionStore()
    await session.ensure()
    expect(session.status).toBe('signedOut')
    invite = async () => {
      me = { id: 'p1', display_name: 'Chan Tai Man' }
      return { actor_id: 'p1', email: 'chan@example.edu', expires_at: '2026-09-26T00:00:00Z' }
    }
    await expect(session.signInWithInvite('aisinv_x', 'a long enough password')).resolves.toEqual({
      email: 'chan@example.edu',
      loginId: null,
    })
    expect(session.status).toBe('signedIn')
    expect(session.me?.id).toBe('p1')
    // Nobody was signed in here before: no need to load the page again.
    expect(session.startsAfresh()).toBe(false)
  })

  it('leaves whoever was signed in signed in when the invitation is refused', async () => {
    me = { id: 'admin', display_name: 'Root' }
    const session = useSessionStore()
    await session.ensure()
    invite = () => Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'not valid' }))
    await expect(session.signInWithInvite('aisinv_x', 'a long enough password')).rejects.toMatchObject({ status: 401 })
    expect(session.status).toBe('signedIn')
    expect(session.me?.id).toBe('admin')
    expect(session.startsAfresh()).toBe(false)
  })

  it('drops what earlier versions kept in this browser for the caller it replaces', async () => {
    me = { id: 'admin', display_name: 'Root' }
    const session = useSessionStore()
    await session.ensure()
    localStorage.setItem('aishie.admin.recentActors.admin', '[]')
    localStorage.setItem('aishie.chat.admin', '{"since":"2026-09-01T00:00:00Z","seen":{},"pending":{}}')
    localStorage.setItem('aishie.chatCourse.admin', 'k1')
    localStorage.setItem('aishie.locale', 'en')
    invite = () => Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'not valid' }))
    await session.signInWithInvite('aisinv_x', 'a long enough password').catch(() => undefined)
    // Refused: nobody changed.
    expect(localStorage.getItem('aishie.admin.recentActors.admin')).toBe('[]')
    invite = async () => {
      me = { id: 'p1', display_name: 'Chan Tai Man' }
      return { actor_id: 'p1', email: 'chan@example.edu', expires_at: '2026-09-26T00:00:00Z' }
    }
    await session.signInWithInvite('aisinv_y', 'a long enough password')
    expect(localStorage.getItem('aishie.admin.recentActors.admin')).toBeNull()
    // What the chat once kept of what they had read goes; the course they last asked in, not memory of reading, stays.
    expect(localStorage.getItem('aishie.chat.admin')).toBeNull()
    expect(localStorage.getItem('aishie.chatCourse.admin')).toBe('k1')
    expect(localStorage.getItem('aishie.locale')).toBe('en')
    localStorage.clear()
  })

  it('drops on going what versions from before the name AIshie kept for the caller, once moved at start', async () => {
    // Their keys, as they left them; migrateStorage moves them before anything reads one.
    localStorage.setItem('aishiteru.admin.recentActors.admin', '[]')
    localStorage.setItem('aishiteru.chat.admin', '{"since":"2026-09-01T00:00:00Z","seen":{},"pending":{}}')
    localStorage.setItem('aishiteru.chatCourse.admin', 'k1')
    migrateStorage()
    me = { id: 'admin', display_name: 'Root' }
    const session = useSessionStore()
    await session.ensure()
    session.clear()
    expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))).toEqual(['aishie.chatCourse.admin'])
    localStorage.clear()
  })

  it('replaces whoever was signed in, and asks for a fresh page', async () => {
    me = { id: 'admin', display_name: 'Root' }
    const session = useSessionStore()
    await session.ensure()
    invite = async () => {
      me = { id: 'p1', display_name: 'Chan Tai Man' }
      return { actor_id: 'p1', email: 'chan@example.edu', expires_at: '2026-09-26T00:00:00Z' }
    }
    await session.signInWithInvite('aisinv_x', 'a long enough password')
    expect(session.me?.id).toBe('p1')
    expect(session.startsAfresh()).toBe(true)
  })
})

describe('the runtime’s assertion', () => {
  it('is dropped when the caller goes, and when someone else signs in', async () => {
    me = { id: 'p1', display_name: 'Chan Tai Man' }
    const session = useSessionStore()
    await session.ensure()
    expect(forgetRuntimeAssertion).not.toHaveBeenCalled()

    // Core says the session is over.
    session.clear()
    expect(forgetRuntimeAssertion).toHaveBeenCalledTimes(1)

    // Someone else signs in here.
    invite = async () => {
      me = { id: 'p2', display_name: 'Wong Siu Ming' }
      return { actor_id: 'p2', email: 'wong@example.edu', expires_at: '2026-09-26T00:00:00Z' }
    }
    await session.signInWithInvite('aisinv_x', 'a long enough password')
    expect(forgetRuntimeAssertion).toHaveBeenCalledTimes(2)
  })

  it('is kept when an invitation is refused and nobody changed', async () => {
    me = { id: 'p1', display_name: 'Chan Tai Man' }
    const session = useSessionStore()
    await session.ensure()
    invite = () => Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'not valid' }))
    await session.signInWithInvite('aisinv_x', 'a long enough password').catch(() => undefined)
    expect(forgetRuntimeAssertion).not.toHaveBeenCalled()
  })
})

describe('who administers', () => {
  const appointment = { dept_id: 'd1', name: 'Engineering', appointment_id: 'ap1', appointed_at: '2026-09-01T00:00:00Z' }

  it('a department administrator sees the administration pages, without a platform role', async () => {
    me = { id: 'ada', display_name: 'Ada', administers: [appointment] }
    const session = useSessionStore()
    await session.ensure()
    expect(session.administers).toEqual([appointment])
    expect(session.isDeptAdmin).toBe(true)
    expect(session.isAdmin).toBe(false)
    expect(session.canAdminister).toBe(true)
  })

  it('a platform administrator does, appointed or not', async () => {
    me = { id: 'root', display_name: 'Root', platform_role: 'root' }
    const session = useSessionStore()
    await session.ensure()
    expect(session.administers).toEqual([])
    expect(session.isDeptAdmin).toBe(false)
    expect(session.canAdminister).toBe(true)
  })

  it('nobody else does, whether Core sends the field empty, as null, or not at all (an older Core)', async () => {
    for (const administers of [[], null, undefined]) {
      setActivePinia(createPinia())
      me = { id: 'yuki', display_name: 'Yuki', ...(administers === undefined ? {} : { administers }) }
      const session = useSessionStore()
      await session.ensure()
      expect(session.administers).toEqual([])
      expect(session.isDeptAdmin).toBe(false)
      expect(session.canAdminister).toBe(false)
    }
  })

  it('is forgotten with the caller', async () => {
    me = { id: 'ada', display_name: 'Ada', administers: [appointment] }
    const session = useSessionStore()
    await session.ensure()
    session.clear()
    expect(session.isDeptAdmin).toBe(false)
    expect(session.canAdminister).toBe(false)
  })
})

describe('a password someone else set', () => {
  it('is said by the sign-in, and nothing about the caller is asked until they set their own', async () => {
    const session = useSessionStore()
    await session.ensure()
    signIn = async () => ({ actor_id: 's1', expires_at: '2026-10-01T00:00:00Z', password_change_required: true })
    await expect(session.signInWithPassword('S2023001', 'temporary', { asLogin: true })).resolves.toEqual({
      passwordChangeRequired: true,
    })
    expect(session.status).toBe('mustChangePassword')
    expect(session.me).toBeNull()
    // Set, who they are is asked again.
    me = { id: 's1', display_name: 'Sam' }
    await session.passwordChanged()
    expect(session.status).toBe('signedIn')
    expect(session.me?.id).toBe('s1')
  })

  it('is found when the page loads again, by Core refusing who they are', async () => {
    mustChange = true
    const session = useSessionStore()
    await session.ensure()
    expect(session.status).toBe('mustChangePassword')
  })

  it('says which login ID an invited person signs in with', async () => {
    const session = useSessionStore()
    await session.ensure()
    invite = async () => {
      me = { id: 'p2', display_name: 'Lee' }
      return { actor_id: 'p2', login_id: 'S2023002', expires_at: '2026-09-26T00:00:00Z' }
    }
    await expect(session.signInWithInvite('aisinv_y', 'a long enough password')).resolves.toEqual({
      email: null,
      loginId: 'S2023002',
    })
  })
})
