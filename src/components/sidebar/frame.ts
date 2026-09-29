// The side bar on the window's left edge, apart from what it shows. As in an
// editor, an activity bar runs along the edge with a button for each view
// (the caller's courses, their agents, the administration pages), and the
// primary side bar beside it shows one of them, at a fixed width. This is
// which views there are and whose each is, which one a page belongs to, and
// what this browser remembers of the side bar: open or not, and the view.

export type SideView = 'courses' | 'agents' | 'admin'

/** Every view, in the order the activity bar lists them. */
export const SIDE_VIEWS: readonly SideView[] = ['courses', 'agents', 'admin']

/** Each view's icon (registered globally by its component's name) and its name's message. */
export const VIEW_META: Record<SideView, { icon: string; label: string }> = {
  courses: { icon: 'Collection', label: 'layout.courses' },
  agents: { icon: 'Cpu', label: 'layout.agents' },
  admin: { icon: 'Setting', label: 'common.nav.admin' },
}

/** The side bar's width, in pixels: fixed, as the rail's and the activity bar's are. */
export const SIDEBAR_WIDTH = 260
/** At this width and below there is no activity bar: the header's menu button opens the views in a drawer. */
export const SIDEBAR_DRAWER_MAX_WIDTH = 899

export interface SideCaller {
  /** 'human' or 'agent'; unknown until me.get has answered. */
  kind?: string | null
  /** A platform administrator, or a department's (session.canAdminister). */
  canAdminister: boolean
}

/**
 * The views a caller is offered: their courses, always; their agents, for a
 * person (an agent owns none); administration, for whoever may open its
 * pages, as the router decides (router/access.ts).
 */
export function viewsFor(caller: SideCaller): SideView[] {
  return SIDE_VIEWS.filter((v) => {
    if (v === 'agents') return caller.kind === 'human'
    if (v === 'admin') return caller.canAdminister
    return true
  })
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

/**
 * The view a page belongs to, or null for a page of none (home, the
 * account): a course's pages are the courses', My agents and each agent's
 * page are the agents', and the administration pages administration's.
 */
export function viewForPath(path: string): SideView | null {
  if (path.startsWith('/courses/')) return 'courses'
  if (under(path, '/account/agents')) return 'agents'
  if (under(path, '/admin')) return 'admin'
  return null
}

const STORAGE_KEY = 'aishie.sideBar'

export interface SideFrame {
  open: boolean
  view: SideView
}

/** What this browser remembers of the side bar, or open on the courses. */
export function loadFrame(): SideFrame {
  const frame: SideFrame = { open: true, view: 'courses' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<SideFrame> | null
      if (typeof v?.open === 'boolean') frame.open = v.open
      if (SIDE_VIEWS.includes(v?.view as SideView)) frame.view = v!.view as SideView
    }
  } catch {
    /* no storage, or something unreadable in it: as new */
  }
  return frame
}

export function saveFrame(f: SideFrame) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: f.open, view: f.view }))
  } catch {
    /* no storage: it lasts for this page only */
  }
}
