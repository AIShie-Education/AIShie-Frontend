import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampWidth,
  isMac,
  isPanelShortcut,
  loadFrame,
  PAGE_MIN,
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  panelMax,
  saveFrame,
  shortcutLabel,
  widthForKey,
} from './panel'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the chat’s pane', () => {
  it('opens 400 px wide, and may be made from 320 to 640 px', () => {
    expect([PANEL_DEFAULT, PANEL_MIN, PANEL_MAX]).toEqual([400, 320, 640])
    expect(clampWidth(400)).toBe(400)
    expect(clampWidth(100)).toBe(320)
    expect(clampWidth(5000)).toBe(640)
    expect(clampWidth(450.6)).toBe(451)
    expect(clampWidth(Number.NaN)).toBe(400)
  })

  it('leaves the page beside it 420 px where the window has room for both, and is never narrower than 320', () => {
    expect(PAGE_MIN).toBe(420)
    // 1280 px less the activity bar and the side bar: 972 px for the page and the pane.
    expect(panelMax(1280 - 48 - 260)).toBe(552)
    // The side bar collapsed: room for the widest.
    expect(panelMax(1920 - 48)).toBe(640)
    // Too little for both: the narrowest pane, the page what is left.
    expect(panelMax(592)).toBe(320)
    expect(panelMax(null)).toBe(640)
    expect(clampWidth(600, panelMax(1280 - 48 - 260))).toBe(552)
  })

  it('is resized with the arrow keys on its left edge, and goes to the narrowest and the widest with Home and End', () => {
    const max = panelMax(1280 - 48)
    expect(widthForKey('ArrowLeft', 400, max)).toBe(416)
    expect(widthForKey('ArrowRight', 400, max)).toBe(384)
    expect(widthForKey('ArrowLeft', 400, max, { shift: true })).toBe(464)
    expect(widthForKey('ArrowLeft', 636, max)).toBe(640)
    expect(widthForKey('ArrowRight', 330, max)).toBe(320)
    expect(widthForKey('Home', 400, max)).toBe(320)
    expect(widthForKey('End', 400, max)).toBe(640)
    expect(widthForKey('End', 400, panelMax(800))).toBe(380)
    expect(widthForKey('ArrowUp', 400, max)).toBeNull()
    expect(widthForKey('Enter', 400, max)).toBeNull()
  })
})

describe('what this browser remembers of it', () => {
  it('keeps whether it is open, and how wide', () => {
    expect(loadFrame()).toEqual({ open: false, width: null })
    saveFrame({ open: true, width: 512.4 })
    expect(JSON.parse(localStorage.getItem('aishie.chatPanel')!)).toEqual({ open: true, width: 512 })
    expect(loadFrame()).toEqual({ open: true, width: 512 })
    saveFrame({ open: false, width: null })
    expect(loadFrame()).toEqual({ open: false, width: null })
  })

  it('takes the width alone of the window an earlier version floated over the page', () => {
    localStorage.setItem(
      'aishie.chatPanel',
      JSON.stringify({ open: true, box: { width: 480, height: 600, right: 16, bottom: 16 } }),
    )
    expect(loadFrame()).toEqual({ open: true, width: 480 })
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: false, box: { width: 1200, height: 600 } }))
    expect(loadFrame()).toEqual({ open: false, width: 640 })
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true, box: null }))
    expect(loadFrame()).toEqual({ open: true, width: null })
  })

  it('starts as new from anything it cannot read', () => {
    localStorage.setItem('aishie.chatPanel', '{not json')
    expect(loadFrame()).toEqual({ open: false, width: null })
    localStorage.setItem('aishie.chatPanel', 'null')
    expect(loadFrame()).toEqual({ open: false, width: null })
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: 'yes', width: 'wide', box: { width: 'wide' } }))
    expect(loadFrame()).toEqual({ open: false, width: null })
  })

  it('does without storage where the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveFrame({ open: true, width: null })).not.toThrow()
    expect(loadFrame()).toEqual({ open: false, width: null })
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
