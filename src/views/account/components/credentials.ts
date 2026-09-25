// What the account page needs to know about a credential beyond what Core
// says of it: whether it still works, and whether it is the one this tab is
// using.
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
 * read, so which session is this browser's cannot be told.
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

/** A dialog as wide as the conventions ask, and no wider than a phone. */
export const DIALOG_WIDTH = 'min(560px, calc(100vw - 32px))'
