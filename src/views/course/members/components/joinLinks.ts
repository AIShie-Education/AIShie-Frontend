// A course's invite links (course.join_link_*), as the members page shows and
// makes them. Every link works for ten minutes from when it is made — long
// enough for a class to scan it off a projector — for as many people as its
// maker allows and, if they say so, only for emails at some domains. Core
// decides all of it; this only says it before Core does.

/** How long a link works, in minutes, from when it is made: Core's rule, said on the form. */
export const JOIN_LINK_MINUTES = 10

/** The most people a link may be limited to (Core refuses more). */
export const MAX_JOIN_LINK_USES = 10000

/** What a link can be: working, or why not. */
export const JOIN_LINK_STATUSES = ['live', 'expired', 'used_up', 'revoked'] as const
export type JoinLinkStatus = (typeof JOIN_LINK_STATUSES)[number]

/** An el-tag type for each state. */
export const JOIN_LINK_STATUS_TAG: Record<JoinLinkStatus, 'success' | 'info' | 'warning' | 'danger'> = {
  live: 'success',
  expired: 'info',
  used_up: 'warning',
  revoked: 'danger',
}

/** What the list says of a link, enough to tell its state. */
export interface JoinLinkFacts {
  status?: string | null
  expires_at: string
  uses: number
  max_uses?: number | null
  revoked_at?: string | null
}

/**
 * A link's state now (on Core's clock). Core's word for it stands when it
 * has stopped the link for good (revoked, used up, expired); a link Core
 * called live when the list was read expires here when its time comes, as
 * the list is watched. Without Core's word, it is worked out as Core does:
 * revoked before used up before expired.
 */
export function joinLinkStatus(l: JoinLinkFacts, now: number): JoinLinkStatus {
  const known = l.status && (JOIN_LINK_STATUSES as readonly string[]).includes(l.status) ? (l.status as JoinLinkStatus) : null
  if (known && known !== 'live') return known
  if (!known) {
    if (l.revoked_at) return 'revoked'
    if (l.max_uses != null && l.uses >= l.max_uses) return 'used_up'
  }
  const end = Date.parse(l.expires_at)
  return Number.isFinite(end) && end <= now ? 'expired' : 'live'
}

/**
 * The order the list shows links in: those still working first, the one
 * that ends last at the top (the newest), then the rest, newest first.
 */
export function compareJoinLinks(
  a: { status: JoinLinkStatus; created_at: string },
  b: { status: JoinLinkStatus; created_at: string },
): number {
  return Number(b.status === 'live') - Number(a.status === 'live') || b.created_at.localeCompare(a.created_at)
}

// ---------------------------------------------------------------------------
// A new link, as the form holds it
// ---------------------------------------------------------------------------

export interface JoinLinkDraft {
  /** The most who may join through it; undefined (or null, once cleared) for no limit. */
  maxUses: number | null | undefined
  /** The email domains it is kept to, as normalizeDomain gives them; none for anyone. */
  domains: string[]
}

export function newDraft(): JoinLinkDraft {
  return { maxUses: undefined, domains: [] }
}

/**
 * What course.join_link_create is asked for, besides the course: a limit and
 * domains only when there are any. Its end is Core's to set.
 */
export function draftArgs(d: JoinLinkDraft): { max_uses?: number; allowed_email_domains?: string[] } {
  return {
    ...(d.maxUses !== undefined && d.maxUses !== null ? { max_uses: d.maxUses } : {}),
    ...(d.domains.length ? { allowed_email_domains: [...d.domains] } : {}),
  }
}
