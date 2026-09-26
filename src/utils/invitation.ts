// An invitation (actor.invite) travels as a link to this front end's welcome
// page, with the token in the fragment: #token=aisinv_…. A fragment is never
// sent to a server, so the token reaches no access log and no Referer; the
// welcome page reads it and takes it out of the address at once.

const PARAM = 'token'

/**
 * The link an invited person opens: `page` is the welcome page's full
 * address (origin and path), e.g. https://lms.example.edu/welcome.
 */
export function invitationLink(page: string, token: string): string {
  const base = page.replace(/#.*$/, '')
  return `${base}#${PARAM}=${encodeURIComponent(token)}`
}

/**
 * The token in a location's fragment ('#token=aisinv_…'), or null when
 * there is none. Whatever else the fragment holds is ignored.
 */
export function tokenFromHash(hash: string | null | undefined): string | null {
  const h = (hash ?? '').replace(/^#/, '')
  if (!h) return null
  let token: string | null
  try {
    token = new URLSearchParams(h).get(PARAM)
  } catch {
    return null
  }
  token = token?.trim() ?? ''
  return token || null
}
