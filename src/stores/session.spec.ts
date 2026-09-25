import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { forgetRetiredLists, useSessionStore } from './session'

// The administration pages once kept actors seen recently in this browser.
// actor.list replaced that list; what a browser still holds of it goes.
describe('the retired list of actors seen recently', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is removed, for every administrator, and nothing else is', () => {
    localStorage.setItem(
      'aishiteru.admin.recentActors.01a0d79f-13c6-70da-a7cc-f009b1efe423',
      '[{"display_name":"HUANG Xiao"}]',
    )
    localStorage.setItem('aishiteru.admin.recentActors.anonymous', '[]')
    localStorage.setItem('aishiteru.locale', 'zh-Hant')
    localStorage.setItem('aishiteru.theme', 'dark')
    forgetRetiredLists()
    expect(Object.keys(localStorage).sort()).toEqual(['aishiteru.locale', 'aishiteru.theme'])
  })

  it('is removed when the page starts, before anyone signs in', () => {
    localStorage.setItem('aishiteru.admin.recentActors.someone', '[{"display_name":"Sato Hiroshi"}]')
    setActivePinia(createPinia())
    useSessionStore()
    expect(localStorage.getItem('aishiteru.admin.recentActors.someone')).toBeNull()
  })

  it('is no trouble where storage is refused', () => {
    const refusing = {
      get length(): number {
        throw new DOMException('denied', 'SecurityError')
      },
    } as unknown as Storage
    expect(() => forgetRetiredLists(refusing)).not.toThrow()
  })
})
