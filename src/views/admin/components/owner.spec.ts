import { describe, expect, it } from 'vitest'
import { ownerBlocker, suspendedBy } from './owner'

const person = { id: 'p1', kind: 'human', status: 'active', platform_role: null }

describe('ownerBlocker', () => {
  it('takes an active person', () => {
    expect(ownerBlocker(person, { id: 'admin', isRoot: false })).toBeNull()
  })
  it('refuses agents, the system and the suspended', () => {
    expect(ownerBlocker({ ...person, kind: 'agent' }, { isRoot: true })).toBe('notHuman')
    expect(ownerBlocker({ ...person, kind: 'system' }, { isRoot: true })).toBe('notHuman')
    expect(ownerBlocker({ ...person, status: 'suspended' }, { isRoot: true })).toBe('suspended')
  })
  it('lets only root choose a holder of a platform role, other than oneself', () => {
    const admin = { ...person, id: 'a2', platform_role: 'admin' }
    expect(ownerBlocker(admin, { id: 'a1', isRoot: false })).toBe('role')
    expect(ownerBlocker(admin, { id: 'root', isRoot: true })).toBeNull()
    expect(ownerBlocker(admin, { id: 'A2', isRoot: false })).toBeNull()
  })
})

describe('suspendedBy', () => {
  it('is null for an active actor', () => {
    expect(suspendedBy({ status: 'active', owner_actor_id: 'o', suspended_by_actor_id: 'o' })).toBeNull()
  })
  it('tells the owner’s suspension from an administrator’s', () => {
    expect(suspendedBy({ status: 'suspended', owner_actor_id: 'O1', suspended_by_actor_id: 'o1' })).toBe('owner')
    expect(suspendedBy({ status: 'suspended', owner_actor_id: 'o1', suspended_by_actor_id: 'admin' })).toBe('admin')
    expect(suspendedBy({ status: 'suspended', owner_actor_id: null, suspended_by_actor_id: 'admin' })).toBe('admin')
  })
  it('counts an unrecorded suspension as nobody’s in particular', () => {
    expect(suspendedBy({ status: 'suspended', owner_actor_id: 'o1', suspended_by_actor_id: null })).toBe('unrecorded')
  })
})
