import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isMac, isPanelShortcut, loadFrame, saveFrame, shortcutLabel } from './panel'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('what this browser remembers of it', () => {
  it('keeps whether it is open, and nothing of its width, which is fixed', () => {
    expect(loadFrame()).toEqual({ open: false })
    saveFrame({ open: true })
    expect(JSON.parse(localStorage.getItem('aishiteru.chatPanel')!)).toEqual({ open: true })
    expect(loadFrame()).toEqual({ open: true })
  })

  it('reads no width an earlier version kept, and drops it when it next keeps the frame', () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true, width: 512 }))
    expect(loadFrame()).toEqual({ open: true })
    saveFrame({ open: false })
    expect(JSON.parse(localStorage.getItem('aishiteru.chatPanel')!)).toEqual({ open: false })
  })

  it('starts as new from anything it cannot read', () => {
    localStorage.setItem('aishiteru.chatPanel', '{not json')
    expect(loadFrame()).toEqual({ open: false })
    localStorage.setItem('aishiteru.chatPanel', 'null')
    expect(loadFrame()).toEqual({ open: false })
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: 'yes' }))
    expect(loadFrame()).toEqual({ open: false })
  })

  it('does without storage where the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveFrame({ open: true })).not.toThrow()
    expect(loadFrame()).toEqual({ open: false })
  })
})

describe('the shortcut', () => {
  it('is Ctrl+J, or ⌘J', () => {
    expect(isPanelShortcut({ key: 'j', ctrlKey: true })).toBe(true)
    expect(isPanelShortcut({ key: 'j', metaKey: true })).toBe(true)
    expect(isPanelShortcut({ key: 'J', ctrlKey: true })).toBe(true)
    // Another layout's letter on the same key.
    expect(isPanelShortcut({ key: 'о', code: 'KeyJ', ctrlKey: true })).toBe(true)
  })

  it('is nothing else: no modifier, Alt, Shift, both, held down, or while composing', () => {
    expect(isPanelShortcut({ key: 'j' })).toBe(false)
    expect(isPanelShortcut({ key: 'k', ctrlKey: true })).toBe(false)
    expect(isPanelShortcut({ key: 'j', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(isPanelShortcut({ key: 'j', ctrlKey: true, altKey: true })).toBe(false)
    expect(isPanelShortcut({ key: 'j', ctrlKey: true, metaKey: true })).toBe(false)
    expect(isPanelShortcut({ key: 'j', ctrlKey: true, repeat: true })).toBe(false)
    expect(isPanelShortcut({ key: 'j', ctrlKey: true, isComposing: true })).toBe(false)
  })

  it('is written as the reader’s keyboard writes it', () => {
    expect(isMac({ platform: 'MacIntel' })).toBe(true)
    expect(isMac({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(false)
    expect(shortcutLabel(true)).toBe('⌘J')
    expect(shortcutLabel(false)).toBe('Ctrl+J')
  })
})
