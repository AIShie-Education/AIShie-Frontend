import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampWidth,
  isMac,
  isPanelShortcut,
  loadFrame,
  PAGE_MIN,
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
  it('is 380 px until dragged, never narrower than 320, and a whole number of pixels', () => {
    expect(PANEL_DEFAULT).toBe(380)
    expect(PANEL_MIN).toBe(320)
    expect(clampWidth(100, 800)).toBe(PANEL_MIN)
    expect(clampWidth(500, 800)).toBe(500)
    expect(clampWidth(412.6, 800)).toBe(413)
    expect(clampWidth(Number.NaN, 800)).toBe(PANEL_DEFAULT)
    expect(clampWidth(1200, 800)).toBe(800)
  })

  it('docked, is at most half the window, and never so wide that the page is left less than 420 px', () => {
    expect(PAGE_MIN).toBe(420)
    // Nothing known of the page: half the window.
    expect(panelMax(1600)).toBe(800)
    // A page and panel sharing 1244 px (1600, less the side bar and the rail): 824 for the panel.
    expect(panelMax(1600, { room: 1244 })).toBe(800)
    expect(panelMax(1280, { room: 924 })).toBe(504)
    expect(panelMax(1280, { room: 1184 })).toBe(640)
    // Never narrower than the least, however little is left.
    expect(panelMax(1200, { room: 600 })).toBe(PANEL_MIN)
    expect(panelMax(500)).toBe(PANEL_MIN)
  })

  it('floating over the page, is at most 70 % of the window', () => {
    expect(panelMax(1100, { floating: true, room: 700 })).toBe(770)
    expect(panelMax(900, { floating: true })).toBe(630)
  })

  it('moves with the arrow keys on its edge, and goes to either end with Home and End', () => {
    expect(widthForKey('ArrowLeft', 400, 800)).toBe(416)
    expect(widthForKey('ArrowRight', 400, 800)).toBe(384)
    expect(widthForKey('ArrowLeft', 400, 800, { shift: true })).toBe(464)
    expect(widthForKey('ArrowRight', 330, 800)).toBe(PANEL_MIN)
    expect(widthForKey('ArrowLeft', 795, 800)).toBe(800)
    expect(widthForKey('Home', 600, 800)).toBe(PANEL_MIN)
    expect(widthForKey('End', 400, 800)).toBe(800)
    expect(widthForKey('Enter', 400, 800)).toBeNull()
    expect(widthForKey('a', 400, 800)).toBeNull()
  })
})

describe('what this browser remembers of it', () => {
  it('keeps whether it is open and how wide', () => {
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
    saveFrame({ open: true, width: 512.4 })
    expect(JSON.parse(localStorage.getItem('aishiteru.chatPanel')!)).toEqual({ open: true, width: 512 })
    expect(loadFrame()).toEqual({ open: true, width: 512 })
  })

  it('opens at the default width where a version that kept no width left the frame', () => {
    localStorage.setItem('aishiteru.chatPanel', JSON.stringify({ open: true }))
    expect(loadFrame()).toEqual({ open: true, width: PANEL_DEFAULT })
  })

  it('starts as new from anything it cannot read', () => {
    localStorage.setItem('aishiteru.chatPanel', '{not json')
    expect(loadFrame()).toEqual({ open: false, width: PANEL_DEFAULT })
    localStorage.setItem('aishiteru.chatPanel', 'null')
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
