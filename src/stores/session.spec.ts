import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/http'

// Who me.get says is signed in, and what taking up an invitation answers.
let me: { id: string; display_name: string } | null = null
let invite: () => Promise<{ actor_id: string; email: string; expires_at: string }>
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string) => {
      if (tool === 'me.get') {
        return me
          ? Promise.resolve(me)
          : Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'no' }))
      }
      if (tool === 'me.memberships') return Promise.resolve({ memberships: [] })
      return Promise.reject(new Error(`no answer for ${tool}`))
    }),
    acceptInvite: vi.fn(() => invite()),
  }
})

const { useSessionStore } = await import('./session')

beforeEach(() => {
  setActivePinia(createPinia())
  me = null
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
    localStorage.setItem('aishiteru.admin.recentActors.admin', '[]')
    localStorage.setItem('aishiteru.locale', 'en')
    invite = () => Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'not valid' }))
    await session.signInWithInvite('aisinv_x', 'a long enough password').catch(() => undefined)
    // Refused: nobody changed.
    expect(localStorage.getItem('aishiteru.admin.recentActors.admin')).toBe('[]')
    invite = async () => {
      me = { id: 'p1', display_name: 'Chan Tai Man' }
      return { actor_id: 'p1', email: 'chan@example.edu', expires_at: '2026-09-26T00:00:00Z' }
    }
    await session.signInWithInvite('aisinv_y', 'a long enough password')
    expect(localStorage.getItem('aishiteru.admin.recentActors.admin')).toBeNull()
    expect(localStorage.getItem('aishiteru.locale')).toBe('en')
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
