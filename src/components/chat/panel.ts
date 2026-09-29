// The chat panel's frame, apart from what it shows: how wide it is and where
// it docks, what this browser remembers of it (open or not, and for each
// caller the course they last asked in), and the key that opens and closes
// it.

/** The panel's width, docked or floating, in pixels: fixed, not resized. */
export const PANEL_WIDTH = 380
/**
 * The narrowest window the panel is docked in, taking its width from the
 * page. Below it (but above a phone's), the page would be left too little,
 * beside the activity bar, the side bar and the rail: the panel floats over
 * the page instead.
 */
export const PANEL_DOCKED_MIN_WIDTH = 1200
/** At this width and below, the panel is a sheet over the whole screen instead. */
export const PANEL_SHEET_MAX_WIDTH = 899
/** How often the newest of the caller's conversations are read again for what is unread, open or not. */
export const UNREAD_POLL_MS = 30_000

const STORAGE_KEY = 'aishiteru.chatPanel'

export interface PanelFrame {
  open: boolean
}

/**
 * What this browser remembers of the panel, or closed. A width earlier
 * versions kept, when it could be resized, is not read, and goes when the
 * frame is next kept.
 */
export function loadFrame(): PanelFrame {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { open: (JSON.parse(raw) as Partial<PanelFrame> | null)?.open === true }
  } catch {
    /* no storage, or something unreadable in it: as new */
  }
  return { open: false }
}

export function saveFrame(f: PanelFrame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: f.open }))
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
