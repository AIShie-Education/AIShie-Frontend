import { describe, expect, it } from 'vitest'
import type { Actor } from '@/api/types'
import { editBlocker, inviteBlocker, inviteMode, signInState } from './signIn'

const NOW = Date.parse('2026-09-25T12:00:00Z')

function person(over: Partial<Actor> = {}): Actor {
  return {
    id: 'p1',
    kind: 'human',
    display_name: 'Chan Tai Man',
    email: 'chan@example.edu',
    status: 'active',
    created_at: '2026-09-01T00:00:00Z',
    has_password: false,
    has_sso: false,
    email_verified: true,
    login_id_verified: true,
    ...over,
  }
}

describe('signInState', () => {
  it('says a person registered and never invited cannot sign in yet', () => {
    expect(signInState(person(), NOW)).toEqual({
      password: false,
      sso: false,
      invite: 'none',
      inviteExpiresAt: null,
      canSignIn: false,
    })
  })

  it('tells a waiting invitation from one that has expired', () => {
    const pending = signInState(person({ invite_expires_at: '2026-10-02T12:00:00Z' }), NOW)!
    expect(pending.invite).toBe('pending')
    expect(pending.inviteExpiresAt).toBe('2026-10-02T12:00:00Z')
    expect(pending.canSignIn).toBe(false)
    expect(signInState(person({ invite_expires_at: '2026-09-25T11:59:59Z' }), NOW)!.invite).toBe('expired')
    expect(signInState(person({ invite_expires_at: '2026-09-25T12:00:00Z' }), NOW)!.invite).toBe('expired')
    expect(signInState(person({ invite_expires_at: null }), NOW)!.invite).toBe('none')
  })

  it('counts a password or single sign-on as a way in', () => {
    expect(signInState(person({ has_password: true }), NOW)).toMatchObject({ password: true, canSignIn: true })
    expect(signInState(person({ has_sso: true }), NOW)).toMatchObject({ sso: true, password: false, canSignIn: true })
    const both = signInState(person({ has_password: true, invite_expires_at: '2026-10-01T00:00:00Z' }), NOW)!
    expect(both).toMatchObject({ password: true, invite: 'pending', canSignIn: true })
  })

  it('does not count a password without an email or a login ID it is entered with', () => {
    expect(signInState(person({ has_password: true, email: null }), NOW)).toMatchObject({
      password: false,
      canSignIn: false,
    })
  })

  it('counts a password entered with a student or staff number', () => {
    expect(signInState(person({ has_password: true, email: null, login_id: 'S2023001' }), NOW)).toMatchObject({
      password: true,
      canSignIn: true,
    })
  })

  it('has nothing to say of agents and the system actor', () => {
    expect(signInState(person({ kind: 'agent', email: null }), NOW)).toBeNull()
    expect(signInState(person({ kind: 'system', email: null }), NOW)).toBeNull()
  })
})

describe('editBlocker', () => {
  const admin = { id: 'me', isRoot: false }
  const root = { id: 'me', isRoot: true }

  it('lets an administrator correct anyone without a platform role, and themselves', () => {
    expect(editBlocker(person(), admin)).toBeNull()
    expect(editBlocker(person({ id: 'me', platform_role: 'admin' }), admin)).toBeNull()
  })

  it('leaves holders of a platform role to root', () => {
    expect(editBlocker(person({ platform_role: 'admin' }), admin)).toBe('role')
    expect(editBlocker(person({ platform_role: 'admin' }), root)).toBeNull()
  })

  it('never changes the system actor', () => {
    expect(editBlocker(person({ kind: 'system', email: null }), root)).toBe('system')
  })
})

describe('inviteBlocker', () => {
  const admin = { id: 'me', isRoot: false }
  const root = { id: 'me', isRoot: true }

  it('invites an active person with an email', () => {
    expect(inviteBlocker(person(), admin)).toBeNull()
  })

  it('refuses in the order Core checks', () => {
    expect(inviteBlocker(person({ id: 'me' }), root)).toBe('self')
    expect(inviteBlocker(person({ kind: 'system', email: null }), root)).toBe('system')
    expect(inviteBlocker(person({ platform_role: 'admin' }), admin)).toBe('role')
    expect(inviteBlocker(person({ platform_role: 'admin' }), root)).toBeNull()
    expect(inviteBlocker(person({ kind: 'agent', email: null }), admin)).toBe('agent')
    expect(inviteBlocker(person({ email: null, status: 'suspended' }), admin)).toBe('noEmail')
    // A login ID is something to sign in with, as an email is.
    expect(inviteBlocker(person({ email: null, login_id: 'S2023001' }), admin)).toBeNull()
    expect(inviteBlocker(person({ status: 'suspended' }), admin)).toBe('suspended')
  })
})

describe('inviteMode', () => {
  it('is a first invitation, a new link, or a password reset', () => {
    expect(inviteMode(person(), NOW)).toBe('first')
    expect(inviteMode(person({ invite_expires_at: '2026-09-20T00:00:00Z' }), NOW)).toBe('first')
    expect(inviteMode(person({ invite_expires_at: '2026-10-01T00:00:00Z' }), NOW)).toBe('renew')
    expect(inviteMode(person({ has_password: true }), NOW)).toBe('reset')
    expect(inviteMode(person({ has_password: true, invite_expires_at: '2026-10-01T00:00:00Z' }), NOW)).toBe('renew')
  })
})
