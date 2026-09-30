// The chat's frame, apart from what it shows: the window it floats in over
// the page, where it sits and how big it is, what this browser remembers of
// it (open or not, where and how big, and for each caller the course they
// last asked in), and the key that opens and closes it.
//
// The window is placed from the viewport's bottom right corner, as the chat's
// button is: how far its right and bottom edges are from the viewport's, and
// its size. Moved, it keeps that distance as the viewport changes; resized,
// its top and left edges move and its right and bottom ones stay.

/** Its size until someone resizes it, in pixels, and what a double click on its title bar goes back to. */
export const WINDOW_WIDTH = 400
export const WINDOW_HEIGHT = 600
/** The smallest it may be made. */
export const WINDOW_MIN_WIDTH = 320
export const WINDOW_MIN_HEIGHT = 360
/** How far it keeps from the viewport's edges in its corner, as the chat's button does. */
export const WINDOW_INSET = 16
/** The page's header, which the window in its corner leaves clear where the viewport is tall enough. */
export const HEADER_HEIGHT = 56
/** How far one press of an arrow key moves one of its edges; with Shift, four times as far. */
export const PANEL_STEP = 16
/** At this width and below, the chat is a sheet over the whole screen instead of a window. */
export const PANEL_SHEET_MAX_WIDTH = 899

/** The viewport's width and height, less any scroll bar. */
export interface Viewport {
  width: number
  height: number
}

/** The window: its size, and how far its right and bottom edges are from the viewport's. */
export interface WindowBox {
  width: number
  height: number
  right: number
  bottom: number
}

const bound = (v: number, lo: number, hi: number) => Math.round(Math.min(Math.max(v, lo), hi))

/**
 * A window within the viewport: its size from the smallest it may be up to
 * the viewport's (where the viewport is smaller than that, the viewport's),
 * then its place, so that it lies wholly on screen.
 */
export function clampBox(box: WindowBox, vp: Viewport): WindowBox {
  const width = bound(box.width, WINDOW_MIN_WIDTH, vp.width)
  const height = bound(box.height, WINDOW_MIN_HEIGHT, vp.height)
  return {
    width,
    height,
    right: bound(box.right, 0, Math.max(0, vp.width - width)),
    bottom: bound(box.bottom, 0, Math.max(0, vp.height - height)),
  }
}

/** In its corner at the bottom right, at its size until resized, or as much of it as fits below the header. */
export function defaultBox(vp: Viewport): WindowBox {
  return clampBox(
    {
      width: Math.min(WINDOW_WIDTH, vp.width - 2 * WINDOW_INSET),
      height: Math.min(WINDOW_HEIGHT, vp.height - HEADER_HEIGHT - 2 * WINDOW_INSET),
      right: WINDOW_INSET,
      bottom: WINDOW_INSET,
    },
    vp,
  )
}

/** Whether a window lies wholly within the viewport. */
export function fitsIn(box: WindowBox, vp: Viewport): boolean {
  return box.right >= 0 && box.bottom >= 0 && box.right + box.width <= vp.width && box.bottom + box.height <= vp.height
}

/** The window moved by its title bar from where it was, the pointer having moved dx to the right and dy down: within the viewport. */
export function moveBox(from: WindowBox, dx: number, dy: number, vp: Viewport): WindowBox {
  return clampBox({ ...from, right: from.right - dx, bottom: from.bottom - dy }, vp)
}

/**
 * The window resized from its top left, its left edge moved dx to the right
 * and its top dy down (either may be 0): its right and bottom edges stay, and
 * it is never smaller than the smallest nor reaches past the viewport's
 * left or top.
 */
export function resizeBox(from: WindowBox, dx: number, dy: number, vp: Viewport): WindowBox {
  return {
    ...from,
    width: bound(from.width - dx, WINDOW_MIN_WIDTH, vp.width - from.right),
    height: bound(from.height - dy, WINDOW_MIN_HEIGHT, vp.height - from.bottom),
  }
}

/** The widest and tallest the window may be made from its top left, where it is: up to the viewport's left and top. */
export function largestBox(box: WindowBox, vp: Viewport): { width: number; height: number } {
  return { width: vp.width - box.right, height: vp.height - box.bottom }
}

/**
 * The window a key press on one of its edges asks for, or null for a key
 * that does nothing there. On its left edge the arrow away from it (left)
 * widens it and the other narrows it; on its top edge, up makes it taller
 * and down shorter. Home and End go to the smallest and the largest.
 */
export function boxForKey(
  edge: 'left' | 'top',
  key: string,
  box: WindowBox,
  vp: Viewport,
  opts: { shift?: boolean } = {},
): WindowBox | null {
  const step = PANEL_STEP * (opts.shift ? 4 : 1)
  const far = vp.width + vp.height
  const moves: Record<string, number> =
    edge === 'left'
      ? { ArrowLeft: -step, ArrowRight: step, Home: box.width - WINDOW_MIN_WIDTH, End: -far }
      : { ArrowUp: -step, ArrowDown: step, Home: box.height - WINDOW_MIN_HEIGHT, End: -far }
  const by = moves[key]
  if (by === undefined) return null
  return edge === 'left' ? resizeBox(box, by, 0, vp) : resizeBox(box, 0, by, vp)
}
/** How often the newest of the caller's conversations are read again for what is unread, open or not. */
export const UNREAD_POLL_MS = 30_000

const STORAGE_KEY = 'aishie.chatPanel'

export interface PanelFrame {
  open: boolean
  /** Where the window was left and how big, or null for its corner at its size until resized. */
  box: WindowBox | null
}

function isBox(v: unknown): v is WindowBox {
  if (!v || typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return ['width', 'height', 'right', 'bottom'].every((k) => typeof b[k] === 'number' && Number.isFinite(b[k]))
}

const rounded = (b: WindowBox): WindowBox => ({
  width: Math.round(b.width),
  height: Math.round(b.height),
  right: Math.round(b.right),
  bottom: Math.round(b.bottom),
})

/**
 * What this browser remembers of the chat, or closed in its corner. The
 * width an earlier version kept for the panel docked beside the page is not
 * the window's, and is let go.
 */
export function loadFrame(): PanelFrame {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<PanelFrame> | null
      return { open: v?.open === true, box: isBox(v?.box) ? rounded(v.box) : null }
    }
  } catch {
    /* no storage, or something unreadable in it: as new */
  }
  return { open: false, box: null }
}

export function saveFrame(f: PanelFrame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: f.open, box: f.box ? rounded(f.box) : null }))
  } catch {
    /* no storage: it lasts for this page only */
  }
}

const LAST_COURSE_PREFIX = 'aishie.chatCourse.'
/**
 * Where earlier versions kept, for each caller, what they had read and the
 * course they last asked in: Core keeps what they have read now. Its course
 * is taken once, and the rest dropped when a course is next kept.
 */
const LEGACY_PREFIX = 'aishie.chat.'

/** The course a caller last asked in, in this browser, or null: none kept, or no storage. */
export function loadLastCourse(actorId: string): string | null {
  try {
    const kept = localStorage.getItem(LAST_COURSE_PREFIX + actorId)
    if (kept) return kept
    const legacy = localStorage.getItem(LEGACY_PREFIX + actorId)
    if (!legacy) return null
    const course = (JSON.parse(legacy) as { course?: unknown } | null)?.course
    return typeof course === 'string' && course ? course : null
  } catch {
    return null
  }
}

export function saveLastCourse(actorId: string, courseId: string) {
  try {
    localStorage.setItem(LAST_COURSE_PREFIX + actorId, courseId)
    localStorage.removeItem(LEGACY_PREFIX + actorId)
  } catch {
    /* no storage: it lasts for this page only */
  }
}

export interface ShortcutEvent {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  repeat?: boolean
}

/**
 * Whether a key press is the panel's shortcut: Ctrl+J, or ⌘J on a Mac
 * (either is taken on any system). Browsers on Windows and Linux open their
 * downloads with Ctrl+J, but let a page that handles the key keep it, as
 * editors on the web do. Never while an input method composes, nor with Alt
 * or Shift, nor held down.
 */
export function isPanelShortcut(e: ShortcutEvent): boolean {
  if (e.isComposing || e.repeat || e.altKey || e.shiftKey) return false
  if (!(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey)) return false
  return e.key === 'j' || e.key === 'J' || e.code === 'KeyJ'
}

/** Whether this is a Mac (or an iPad with a keyboard), whose shortcut is written ⌘J. */
export function isMac(nav: { platform?: string; userAgent?: string } | undefined = globalThis.navigator): boolean {
  const p = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`
  return /Mac|iPhone|iPad|iPod/.test(p)
}

/** The shortcut as the reader's keyboard writes it. */
export function shortcutLabel(mac = isMac()): string {
  return mac ? '⌘J' : 'Ctrl+J'
}
