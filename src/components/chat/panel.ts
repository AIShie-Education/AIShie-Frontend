// The chat panel's frame, apart from what it shows: how wide it may be, what
// this browser remembers of it (open or not, its width), and the key that
// opens and closes it.

/** The narrowest the panel may be, in pixels. */
export const PANEL_MIN = 320
/** Its width until someone changes it. */
export const PANEL_DEFAULT = 400
/** The widest, as a share of the window's width. */
export const PANEL_MAX_SHARE = 0.5
/** How far one press of an arrow key moves its edge; with Shift, four times as far. */
export const PANEL_STEP = 16
/** At this width and below, the panel is a sheet over the whole screen instead. */
export const PANEL_SHEET_MAX_WIDTH = 899
/** How often the caller's conversations waiting for an answer are looked at, open or not. */
export const PENDING_POLL_MS = 30_000
/** At most this many of them are looked at each time. */
export const PENDING_PER_POLL = 10

/** The widest the panel may be in a window this wide (never narrower than the narrowest). */
export function panelMax(viewport: number): number {
  return Math.max(PANEL_MIN, Math.floor(viewport * PANEL_MAX_SHARE))
}

/** A width within the bounds for a window this wide, in whole pixels. */
export function clampWidth(width: number, viewport: number): number {
  const w = Number.isFinite(width) ? Math.round(width) : PANEL_DEFAULT
  return Math.min(panelMax(viewport), Math.max(PANEL_MIN, w))
}

/**
 * The width a key press on the panel's edge asks for, or null for a key that
 * does nothing there. The edge is the panel's left one: the arrow towards
 * the page (left) widens it, the other narrows it; Home and End go to the
 * narrowest and the widest.
 */
export function widthForKey(
  key: string,
  width: number,
  viewport: number,
  opts: { shift?: boolean } = {},
): number | null {
  const step = PANEL_STEP * (opts.shift ? 4 : 1)
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(width + step, viewport)
    case 'ArrowRight':
      return clampWidth(width - step, viewport)
    case 'Home':
      return PANEL_MIN
    case 'End':
      return panelMax(viewport)
  }
  return null
}

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
      const v = JSON.parse(raw) as Partial<PanelFrame>
      return {
        open: v.open === true,
        width: typeof v.width === 'number' && Number.isFinite(v.width) ? Math.round(v.width) : PANEL_DEFAULT,
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
