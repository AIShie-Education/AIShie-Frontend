// What the account page needs to know about a credential beyond what Core
// says of it: whether it still works, whether it is the one this tab is
// using, and what Core's own labels on the credentials it makes mean.
import { bearer } from '@/api/http'
import type { Credential } from '@/api/types'

export type CredentialState = 'active' | 'revoked' | 'expired'

export function credentialState(c: Credential, now = Date.now()): CredentialState {
  if (c.revoked_at) return 'revoked'
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return 'expired'
  return 'active'
}

/**
 * The public prefix of the token this tab signs in with, if it signs in with
 * one. A token reads ais_<12-character prefix>_<secret>; the prefix is what
 * credential.list shows. A browser session lives in a cookie scripts cannot
 * read: see thisBrowserSession for when it can be told all the same.
 */
export function currentTokenPrefix(): string | null {
  const tok = bearer.get()
  if (!tok) return null
  const parts = tok.split('_')
  if (parts.length < 3 || parts[0] !== 'ais' || parts[1].length !== 12) return null
  return parts[1]
}

export function isCurrentToken(c: Credential): boolean {
  const prefix = currentTokenPrefix()
  return !!prefix && c.kind === 'api_token' && c.token_prefix === prefix
}

/**
 * How long before the list was asked for this browser's own session may have
 * last been used. Core notes a credential's use on every call but writes it at
 * most once a minute (auth.Authenticate → TouchCredential), and the session
 * that asked for the list was used for that very call: its last use is within
 * the minute before. The rest is room for this computer's clock to differ
 * from Core's.
 */
const THIS_SESSION_WINDOW_MS = 3 * 60 * 1000

/**
 * The id of the browser session this page is signed in with, when it can be
 * told. Core does not say which one it is and the cookie cannot be read, but
 * it has just been used: when it is the only live session used in the last
 * few minutes, it is this one. When another was used as well (a second
 * browser signed in at the same time), or none was (a clock far off), nothing
 * is claimed. A tab signed in with a token uses no session at all.
 */
export function thisBrowserSession(list: Credential[], listedAt: number | undefined): string | null {
  if (bearer.get() || listedAt === undefined) return null
  const since = listedAt - THIS_SESSION_WINDOW_MS
  const recent = list.filter(
    (c) =>
      c.kind === 'session' &&
      credentialState(c, listedAt) === 'active' &&
      !!c.last_used_at &&
      new Date(c.last_used_at).getTime() >= since,
  )
  return recent.length === 1 ? recent[0].id : null
}

/**
 * How a browser session was begun, read from the label Core gives it: "password
 * login" (auth.Login) or "sso: <provider>" (auth.SignInWithIdentity). Null for
 * anything else.
 */
export function sessionOrigin(
  label: string | null | undefined,
): { via: 'password' } | { via: 'sso'; provider: string } | null {
  if (!label) return null
  if (label === 'password login') return { via: 'password' }
  const m = /^sso: (.+)$/.exec(label)
  return m ? { via: 'sso', provider: m[1] } : null
}

/** Who linked a single sign-on identity, from the label Core gives the link: "linked by <name>" (actor.link_sso). */
export function linkedBy(label: string | null | undefined): string | null {
  const m = /^linked by (.+)$/.exec(label ?? '')
  return m ? m[1] : null
}

/** A token as it may be shown: the scheme and the public prefix, the secret elided. */
export function maskedToken(prefix: string | null | undefined): string {
  return prefix ? `ais_${prefix}_…` : '—'
}

/** Core measures a password in bytes of UTF-8: 10 to 1024. */
export const PASSWORD_MIN_BYTES = 10
export const PASSWORD_MAX_BYTES = 1024
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}
