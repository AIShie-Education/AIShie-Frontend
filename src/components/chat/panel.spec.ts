import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  boxForKey,
  clampBox,
  defaultBox,
  fitsIn,
  isMac,
  isPanelShortcut,
  largestBox,
  loadFrame,
  moveBox,
  resizeBox,
  saveFrame,
  shortcutLabel,
  WINDOW_HEIGHT,
  WINDOW_INSET,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_WIDTH,
} from './panel'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const desk = { width: 1440, height: 900 }

describe('the chat’s window', () => {
  it('opens 400 × 600 px in the bottom right corner, 16 px from the edges, as the chat’s button is', () => {
    expect([WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_INSET]).toEqual([400, 600, 16])
    expect(defaultBox(desk)).toEqual({ width: 400, height: 600, right: 16, bottom: 16 })
  })

  it('opens smaller where the viewport is: clear of the header, and never smaller than 320 × 360 while there is room', () => {
    expect([WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT]).toEqual([320, 360])
    // 600 high less the 56 px header and 16 px above and below it.
    expect(defaultBox({ width: 1000, height: 600 })).toEqual({ width: 400, height: 512, right: 16, bottom: 16 })
    expect(defaultBox({ width: 1000, height: 420 })).toEqual({ width: 400, height: 360, right: 16, bottom: 16 })
    // Smaller than the smallest window: the viewport's size.
    expect(defaultBox({ width: 300, height: 300 })).toEqual({ width: 300, height: 300, right: 0, bottom: 0 })
  })

  it('lies wholly within the viewport, in whole pixels', () => {
    expect(clampBox({ width: 2000, height: 100, right: -40, bottom: 5000 }, desk)).toEqual({
      width: 1440,
      height: 360,
      right: 0,
      bottom: 540,
    })
    expect(clampBox({ width: 450.4, height: 500.6, right: 20.2, bottom: 30.7 }, desk)).toEqual({
      width: 450,
      height: 501,
      right: 20,
      bottom: 31,
    })
    expect(fitsIn({ width: 400, height: 600, right: 16, bottom: 16 }, desk)).toBe(true)
    expect(fitsIn({ width: 400, height: 600, right: 16, bottom: 16 }, { width: 400, height: 900 })).toBe(false)
    expect(fitsIn({ width: 400, height: 600, right: 16, bottom: 300 }, desk)).toBe(true)
    expect(fitsIn({ width: 400, height: 600, right: 16, bottom: 301 }, desk)).toBe(false)
    expect(fitsIn({ width: 400, height: 600, right: -1, bottom: 16 }, desk)).toBe(false)
  })

  it('moves by its title bar within the viewport, its size as it was', () => {
    const at = { width: 400, height: 600, right: 16, bottom: 16 }
    // The pointer 300 px to the left and 100 px up.
    expect(moveBox(at, -300, -100, desk)).toEqual({ width: 400, height: 600, right: 316, bottom: 116 })
    // Past the viewport's edges: against them.
    expect(moveBox(at, -5000, -5000, desk)).toEqual({ width: 400, height: 600, right: 1040, bottom: 300 })
    expect(moveBox(at, 500, 500, desk)).toEqual({ width: 400, height: 600, right: 0, bottom: 0 })
  })

  it('resizes from its top left, its right and bottom edges staying, from the smallest up to the viewport’s edges', () => {
    const at = { width: 400, height: 600, right: 16, bottom: 16 }
    expect(resizeBox(at, -100, 0, desk)).toEqual({ width: 500, height: 600, right: 16, bottom: 16 })
    expect(resizeBox(at, 0, -150, desk)).toEqual({ width: 400, height: 750, right: 16, bottom: 16 })
    expect(resizeBox(at, -100, -150, desk)).toEqual({ width: 500, height: 750, right: 16, bottom: 16 })
    expect(resizeBox(at, 300, 400, desk)).toEqual({ width: 320, height: 360, right: 16, bottom: 16 })
    expect(resizeBox(at, -5000, -5000, desk)).toEqual({ width: 1424, height: 884, right: 16, bottom: 16 })
    expect(largestBox(at, desk)).toEqual({ width: 1424, height: 884 })
  })

  it('resizes with the arrow keys on its edges, and goes to the smallest and the largest with Home and End', () => {
    const at = { width: 400, height: 600, right: 16, bottom: 16 }
    expect(boxForKey('left', 'ArrowLeft', at, desk)?.width).toBe(416)
    expect(boxForKey('left', 'ArrowRight', at, desk)?.width).toBe(384)
    expect(boxForKey('left', 'ArrowLeft', at, desk, { shift: true })?.width).toBe(464)
    expect(boxForKey('left', 'Home', at, desk)?.width).toBe(320)
    expect(boxForKey('left', 'End', at, desk)?.width).toBe(1424)
    expect(boxForKey('left', 'ArrowUp', at, desk)).toBeNull()
    expect(boxForKey('top', 'ArrowUp', at, desk)).toEqual({ ...at, height: 616 })
    expect(boxForKey('top', 'ArrowDown', at, desk, { shift: true })).toEqual({ ...at, height: 536 })
    expect(boxForKey('top', 'Home', at, desk)?.height).toBe(360)
    expect(boxForKey('top', 'End', at, desk)?.height).toBe(884)
    expect(boxForKey('top', 'ArrowLeft', at, desk)).toBeNull()
    expect(boxForKey('top', 'Enter', at, desk)).toBeNull()
  })
})

describe('what this browser remembers of it', () => {
  it('keeps whether it is open, and where it was left and how big', () => {
    expect(loadFrame()).toEqual({ open: false, box: null })
    saveFrame({ open: true, box: { width: 512.4, height: 480, right: 40, bottom: 20.6 } })
    expect(JSON.parse(localStorage.getItem('aishie.chatPanel')!)).toEqual({
      open: true,
      box: { width: 512, height: 480, right: 40, bottom: 21 },
    })
    expect(loadFrame()).toEqual({ open: true, box: { width: 512, height: 480, right: 40, bottom: 21 } })
    saveFrame({ open: false, box: null })
    expect(loadFrame()).toEqual({ open: false, box: null })
  })

  it('opens in its corner where a version that docked it beside the page kept its width', () => {
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: true, width: 480 }))
    expect(loadFrame()).toEqual({ open: true, box: null })
  })

  it('starts as new from anything it cannot read', () => {
    localStorage.setItem('aishie.chatPanel', '{not json')
    expect(loadFrame()).toEqual({ open: false, box: null })
    localStorage.setItem('aishie.chatPanel', 'null')
    expect(loadFrame()).toEqual({ open: false, box: null })
    localStorage.setItem('aishie.chatPanel', JSON.stringify({ open: 'yes', box: { width: 'wide' } }))
    expect(loadFrame()).toEqual({ open: false, box: null })
    localStorage.setItem(
      'aishie.chatPanel',
      JSON.stringify({ open: true, box: { width: 400, height: 600, right: 16 } }),
    )
    expect(loadFrame()).toEqual({ open: true, box: null })
  })

  it('does without storage where the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveFrame({ open: true, box: null })).not.toThrow()
    expect(loadFrame()).toEqual({ open: false, box: null })
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
