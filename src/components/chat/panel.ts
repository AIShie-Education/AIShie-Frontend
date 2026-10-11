// The chat's frame, apart from what it shows: the pane it is docked in at
// the window's right edge, beside the page, and how wide it is; what this
// browser remembers of it (open or not, its width, and for each caller the
// course they last asked in); and the key that opens and closes it.
//
// The pane takes its width from the page, as the side bar does on the left:
// the page column narrows by the pane's width while it is open, and lays
// itself out by its own width. It is resized from its left edge alone, from
// PANEL_MIN up to PANEL_MAX, and never so wide that the page beside it is
// left less than PAGE_MIN where the window has room for both.

/** Its width until someone drags its edge, in pixels, and what a double click on the edge goes back to. */
export const PANEL_DEFAULT = 400
/** The narrowest it may be. */
export const PANEL_MIN = 320
/** The widest it may be, however wide the window. */
export const PANEL_MAX = 640
/** The least the page beside it is left, where the window has room for it and the narrowest pane. */
export const PAGE_MIN = 420
/** How far one press of an arrow key moves its edge; with Shift, four times as far. */
export const PANEL_STEP = 16
/** At this width and below, the chat is a sheet over the whole screen instead of a pane beside the page. */
export const PANEL_SHEET_MAX_WIDTH = 899

/**
 * The widest the pane may be, where `room` is the width the page and the
 * pane share (the window's, less the activity bar and the side bar): up to
 * PANEL_MAX, less where the page would be left less than PAGE_MIN, and never
 * narrower than PANEL_MIN. Where the room is not known, PANEL_MAX.
 */
export function panelMax(room?: number | null): number {
  const cap = room == null || !Number.isFinite(room) ? PANEL_MAX : Math.min(PANEL_MAX, Math.floor(room - PAGE_MIN))
  return Math.max(PANEL_MIN, cap)
}

/** A width within the bounds, up to max, in whole pixels; anything not a number is the default. */
export function clampWidth(width: number, max: number = PANEL_MAX): number {
  const w = Number.isFinite(width) ? Math.round(width) : PANEL_DEFAULT
  return Math.min(Math.max(PANEL_MIN, max), Math.max(PANEL_MIN, w))
}

/**
 * The width a key press on the pane's left edge asks for, or null for a key
 * that does nothing there: the arrow towards the page (left) widens it and
 * the other narrows it; Home and End go to the narrowest and the widest.
 */
export function widthForKey(
  key: string,
  width: number,
  max: number = PANEL_MAX,
  opts: { shift?: boolean } = {},
): number | null {
  const step = PANEL_STEP * (opts.shift ? 4 : 1)
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(width + step, max)
    case 'ArrowRight':
      return clampWidth(width - step, max)
    case 'Home':
      return PANEL_MIN
    case 'End':
      return clampWidth(max, max)
  }
  return null
}
/** How often the newest of the caller's conversations are read again for what is unread, open or not. */
export const UNREAD_POLL_MS = 30_000

const STORAGE_KEY = 'aishie.chatPanel'

export interface PanelFrame {
  open: boolean
  /** Its width, or null for PANEL_DEFAULT until someone drags its edge. */
  width: number | null
}

const widthOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? clampWidth(v) : null

/**
 * What this browser remembers of the chat, or closed at its default width.
 * The box an earlier version kept for the window it floated in over the page
 * is read for its width alone.
 */
export function loadFrame(): PanelFrame {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as { open?: unknown; width?: unknown; box?: { width?: unknown } | null } | null
      return { open: v?.open === true, width: widthOf(v?.width) ?? widthOf(v?.box?.width) }
    }
  } catch {
    /* no storage, or something unreadable in it: as new */
  }
  return { open: false, width: null }
}

export function saveFrame(f: PanelFrame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: f.open, width: f.width == null ? null : Math.round(f.width) }))
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
