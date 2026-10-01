// An actor's credentials as an administrator sees them (actor.list_credentials):
// API tokens first, with who issued each, then the other ways in (browser
// sessions, a password, single sign-on, an invitation), which can be revoked
// the same way (actor.revoke_credential).
//
// A Core from before actor.list_credentials has no GET route under
// /v1/actors/{id}/credentials: it answers 404 (or 405, if some other method
// were taken there), and something in front of Core may answer 404 too. The
// page has read the actor already, so a 404 here is about the route, not the
// actor. That is a fact about the Core, noted once for the page's life, as
// actorSearch does for actor.list.
import { readonly, ref } from 'vue'
import { isApiError, read } from '@/api/http'
import type { ListItem } from '@/api/types'
import { credentialState, type CredentialState } from '@/views/account/components/credentials'

export type ActorCredential = ListItem<'actor.list_credentials', 'credentials'>

/** Whether an error from actor.list_credentials says this Core has no such tool. */
export function lacksCredentialList(e: unknown): boolean {
  return isApiError(e) && (e.status === 405 || e.status === 404 || e.code === 'method_not_allowed')
}

const missing = ref(false)

/** True once a call has said this Core has no actor.list_credentials. */
export const credentialListMissing = readonly(missing)

/** actor.list_credentials, noting on the way whether this Core has it. */
export async function listActorCredentials(actorId: string): Promise<ActorCredential[]> {
  try {
    const out = await read('actor.list_credentials', { actor_id: actorId })
    return out.credentials ?? []
  } catch (e) {
    if (lacksCredentialList(e)) missing.value = true
    throw e
  }
}

/**
 * A password someone else set (member.reset_password), which its person must
 * replace with their own at the next sign-in (must_change).
 */
export function isTemporaryPassword(c: Pick<ActorCredential, 'kind' | 'must_change'>): boolean {
  return c.kind === 'password' && !!c.must_change
}

export interface CredentialRow {
  c: ActorCredential
  state: CredentialState
}

export interface ArrangedCredentials {
  /** API tokens, live before revoked and expired, otherwise newest first (Core's order). */
  tokens: CredentialRow[]
  /** Everything else, in the same order. */
  others: CredentialRow[]
  /** How many are revoked or expired, shown or not. */
  inactive: number
}

/**
 * Splits the list into tokens and the rest, leaving out the revoked and
 * expired unless asked for. `now` is when the list was read, so that every
 * row is judged at the same moment.
 */
export function arrangeCredentials(
  list: readonly ActorCredential[] | null | undefined,
  opts: { showInactive: boolean; now?: number },
): ArrangedCredentials {
  const now = opts.now ?? Date.now()
  const rows = (list ?? []).map((c) => ({ c, state: credentialState(c, now) }))
  const inactive = rows.filter((r) => r.state !== 'active').length
  const shown = rows
    .filter((r) => opts.showInactive || r.state === 'active')
    // Array.prototype.sort is stable: Core's order holds within each group.
    .sort((a, b) => Number(b.state === 'active') - Number(a.state === 'active'))
  return {
    tokens: shown.filter((r) => r.c.kind === 'api_token'),
    others: shown.filter((r) => r.c.kind !== 'api_token'),
    inactive,
  }
}

export type TokenIssuer =
  /** The actor made it for themself (credential.issue_token). */
  | { by: 'self' }
  /** An administrator issued it (actor.issue_token). */
  | { by: 'other'; id: string; name: string | null }
  /** A runtime agent's one token, issued to the site's agent runtime (issued_to agent_runtime). */
  | { by: 'runtime' }
  /** Not recorded: a token from before Core kept the issuer, or not a token. */
  | null

/** Who issued a token, told apart from the actor who holds it, and the site's agent runtime's. */
export function tokenIssuer(
  c: Pick<ActorCredential, 'kind' | 'issued_by_actor_id' | 'issued_by_name' | 'issued_to'>,
  holderId: string,
): TokenIssuer {
  if (c.kind === 'api_token' && c.issued_to === 'agent_runtime') return { by: 'runtime' }
  if (c.kind !== 'api_token' || !c.issued_by_actor_id) return null
  if (c.issued_by_actor_id.toLowerCase() === holderId.toLowerCase()) return { by: 'self' }
  return { by: 'other', id: c.issued_by_actor_id, name: c.issued_by_name?.trim() || null }
}
