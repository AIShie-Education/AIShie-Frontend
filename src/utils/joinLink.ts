// A course's invite link (course.join_link_create) is this front end's join
// page with the link's token in the path: https://<site>/join/aisjoin_…. It
// is meant to travel — a QR code on a slide, a message to a class — and
// anyone who holds it may join the course as a student, so it is a path, as
// easy to type as to scan. The page reads the token from its route.

/**
 * The link a student opens: `origin` is this site's (window.location.origin)
 * and `href` the join page's own address for the token, as the router gives
 * it (router.resolve({ name: 'join', params: { token } }).href), which keeps
 * the app's base path.
 */
export function joinLinkUrl(origin: string, href: string): string {
  return new URL(href, origin.replace(/\/+$/, '') + '/').toString()
}

/**
 * The token a join page was opened with, as far as it can be told from the
 * route: trimmed, and without what often clings to a link pasted from a
 * message (a closing bracket or a full stop). Null when nothing is left.
 */
export function tokenFromRoute(param: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(param) ? param[0] : param
  const token = (raw ?? '').trim().replace(/[)\].,;:!?'"»」』）】。，；：！？]+$/u, '')
  return token || null
}

/** The name the QR code's image is saved under: the course's code and section, and never anything of the token. */
export function qrFileName(code: string | null | undefined, section?: string | null): string {
  const name = [code, section]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('-')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${name ? `${name}-` : ''}invite-qr.png`
}

// A link may be kept to people whose email is at one of a few domains (a
// school's own, say): the form that makes one and the page that opens it say
// so before Core does.

/** How many domains a link may be kept to (Core refuses more). */
export const MAX_DOMAINS = 20

const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/

/**
 * A domain as typed (" @HainanU.edu.cn "), as a link keeps it
 * ("hainanu.edu.cn"): trimmed, lower case, without an @ or a trailing dot
 * before it. Null when what is left is not a domain.
 */
export function normalizeDomain(text: string): string | null {
  const d = text.trim().toLowerCase().replace(/^@+/, '').replace(/\.$/, '')
  return DOMAIN.test(d) ? d : null
}

/** The domain of an email address, lower case; null when it has none. */
export function emailDomain(email: string | null | undefined): string | null {
  const s = (email ?? '').trim().toLowerCase()
  const at = s.lastIndexOf('@')
  return at > 0 && at < s.length - 1 ? s.slice(at + 1) : null
}

/**
 * Whether an email is one a link kept to these domains lets in: its domain is
 * one of them. Every email is, when the link names none.
 */
export function emailDomainAllowed(email: string | null | undefined, domains: readonly string[] | null | undefined): boolean {
  if (!domains?.length) return true
  const d = emailDomain(email)
  return !!d && domains.some((x) => x.toLowerCase() === d)
}
