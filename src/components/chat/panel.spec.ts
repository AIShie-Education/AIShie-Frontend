import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampWidth,
  isMac,
  isPanelShortcut,
  loadFrame,
  PANEL_DEFAULT,
  PANEL_MIN,
  panelMax,
  saveFrame,
  shortcutLabel,
  widthForKey,
} from './panel'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the panel’s width', () => {
  it('is never narrower than the least, nor wider than half the window', () => {
    expect(clampWidth(100, 1600)).toBe(PANEL_MIN)
    expect(clampWidth(500, 1600)).toBe(500)
    expect(clampWidth(1200, 1600)).toBe(800)
    expect(clampWidth(700, 1000)).toBe(500)
    expect(clampWidth(412.6, 1600)).toBe(413)
    expect(clampWidth(Number.NaN, 1600)).toBe(PANEL_DEFAULT)
    // A window too narrow for half of it to hold the least: the least.
    expect(panelMax(500)).toBe(PANEL_MIN)
    expect(clampWidth(900, 500)).toBe(PANEL_MIN)
  })

  it('moves with the arrow keys on its edge, and goes to either end with Home and End', () => {
    expect(widthForKey('ArrowLeft', 400, 1600)).toBe(416)
    expect(widthForKey('ArrowRight', 400, 1600)).toBe(384)
    expect(widthForKey('ArrowLeft', 400, 1600, { shift: true })).toBe(464)
    expect(widthForKey('ArrowRight', 330, 1600)).toBe(PANEL_MIN)
    expect(widthForKey('ArrowLeft', 795, 1600)).toBe(800)
    expect(widthForKey('Home', 600, 1600)).toBe(PANEL_MIN)
    expect(widthForKey('End', 400, 1600)).toBe(800)
    expect(widthForKey('Enter', 400, 1600)).toBeNull()
    expect(widthForKey('a', 400, 1600)).toBeNull()
  })
})

describe('what this browser remembers of it', () => {
  it('keeps whether it is open and how wide', () => {
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
    saveFrame({ open: true, width: 512.4 })
    expect(JSON.parse(localStorage.getItem('aishiteru.chatPanel')!)).toEqual({ open: true, width: 512 })
    expect(loadFrame()).toEqual({ open: true, width: 512 })
  })

  it('starts as new from anything it cannot read', () => {
    localStorage.setItem('aishiteru.chatPanel', '{not json')
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: 'yes', width: 'wide' }))
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
  })

  it('does without storage where the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveFrame({ open: true, width: 450 })).not.toThrow()
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
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
