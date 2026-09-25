import { describe, expect, it } from 'vitest'
import { invitedBy, linkedBy, sessionOrigin } from './credentials'

describe('sessionOrigin', () => {
  it('reads how a session was begun from the label Core gives it', () => {
    expect(sessionOrigin('password login')).toEqual({ via: 'password' })
    expect(sessionOrigin('invitation accepted')).toEqual({ via: 'invite' })
    expect(sessionOrigin('sso: polyu-adfs')).toEqual({ via: 'sso', provider: 'polyu-adfs' })
    expect(sessionOrigin('something else')).toBeNull()
    expect(sessionOrigin(null)).toBeNull()
  })
})

describe('invitedBy and linkedBy', () => {
  it('read who made an invitation or linked an identity', () => {
    expect(invitedBy('invited by Chan Tai Man')).toBe('Chan Tai Man')
    expect(invitedBy('linked by Root')).toBeNull()
    expect(invitedBy(undefined)).toBeNull()
    expect(linkedBy('linked by Root')).toBe('Root')
  })
})
