// The chat panel's frame, apart from what it shows: how wide it may be and
// where it docks, what this browser remembers of it (open or not, its width,
// and for each caller the course they last asked in), and the key that opens
// and closes it.

/** Its width until someone drags its edge, in pixels, and what a double click on the edge goes back to. */
export const PANEL_DEFAULT = 380
/** The narrowest it may be. */
export const PANEL_MIN = 320
/** Docked, the widest it may be is this share of the window… */
export const PANEL_MAX_SHARE = 0.5
/** …and never so wide that the page beside it is left less than this. */
export const PAGE_MIN = 420
/** Floating over the page, the widest it may be is this share of the window. */
export const PANEL_FLOAT_MAX_SHARE = 0.7
/** How far one press of an arrow key moves its edge; with Shift, four times as far. */
export const PANEL_STEP = 16
/**
 * The narrowest window the panel is docked in, taking its width from the
 * page. Below it (but above a phone's), the page would be left too little,
 * beside the activity bar, the side bar and the rail: the panel floats over
 * the page instead.
 */
export const PANEL_DOCKED_MIN_WIDTH = 1200
/** At this width and below, the panel is a sheet over the whole screen instead. */
export const PANEL_SHEET_MAX_WIDTH = 899

/**
 * The widest the panel may be in a window this wide. Docked, half the window,
 * and less where the page would be left less than PAGE_MIN: room is the
 * width shared by the page and the panel (the page's row, less the rail),
 * when it is known. Floating, PANEL_FLOAT_MAX_SHARE of the window. Never
 * narrower than the narrowest.
 */
export function panelMax(viewport: number, opts: { room?: number | null; floating?: boolean } = {}): number {
  const cap = opts.floating
    ? Math.floor(viewport * PANEL_FLOAT_MAX_SHARE)
    : Math.min(Math.floor(viewport * PANEL_MAX_SHARE), opts.room == null ? Infinity : opts.room - PAGE_MIN)
  return Math.max(PANEL_MIN, cap)
}

/** A width within the bounds, up to max, in whole pixels; anything not a number is the default. */
export function clampWidth(width: number, max: number): number {
  const w = Number.isFinite(width) ? Math.round(width) : PANEL_DEFAULT
  return Math.min(Math.max(PANEL_MIN, max), Math.max(PANEL_MIN, w))
}

/**
 * The width a key press on the panel's edge asks for, or null for a key that
 * does nothing there. The edge is the panel's left one: the arrow towards
 * the page (left) widens it, the other narrows it; Home and End go to the
 * narrowest and the widest.
 */
export function widthForKey(key: string, width: number, max: number, opts: { shift?: boolean } = {}): number | null {
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

const STORAGE_KEY = 'aishiteru.chatPanel'

export interface PanelFrame {
  open: boolean
  width: number
}

/** What this browser remembers of the panel, or closed at its default width. */
export function loadFrame(): PanelFrame {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<PanelFrame> | null
      return {
        open: v?.open === true,
        width: typeof v?.width === 'number' && Number.isFinite(v.width) ? Math.round(v.width) : PANEL_DEFAULT,
      }
    }
  } catch {
    /* no storage, or something unreadable in it: as new */
  }
  return { open: false, width: PANEL_DEFAULT }
}

export function saveFrame(f: PanelFrame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: f.open, width: Math.round(f.width) }))
  } catch {
    /* no storage: it lasts for this page only */
  }
}

const LAST_COURSE_PREFIX = 'aishiteru.chatCourse.'
/**
 * Where earlier versions kept, for each caller, what they had read and the
 * course they last asked in: Core keeps what they have read now. Its course
 * is taken once, and the rest dropped when a course is next kept.
 */
const LEGACY_PREFIX = 'aishiteru.chat.'

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
