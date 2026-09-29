// The steps of hosting an agent that involve its tokens in Core: issuing one
// for the runtime and handing it over without anyone seeing it (D6, the
// contract's §9.2), and revoking one as its owner when the runtime could not
// (§9.4's fallback) or when something else is running the agent (the
// one-brain rule).
//
// A token issued here lives in one local variable of handOverNewToken, from
// Core's answer until the runtime has it, and is blanked in a finally: it is
// in no reactive state, no storage, no log and no error. Core's answer is
// taken straight from http.ts's write, not useWrite, so that it is kept
// nowhere else either.
import { ApiError, newIdempotencyKey, read, write } from '@/api/http'
import { ensureRuntimeAssertion } from '@/api/runtime'
import { RUNTIME_TOKEN_LABEL, isDefinitive, ownerFallbackCredential } from './hosting'

/** The credential a token was issued as: what the Tokens list shows of it. */
export interface IssuedCredential {
  credentialId: string
  prefix: string
}

/** Revokes one of the agent's tokens as its owner (agent.revoke_credential); false when that failed. */
export async function revokeAsOwner(actorId: string, credentialId: string): Promise<boolean> {
  try {
    await write('agent.revoke_credential', { actor_id: actorId, credential_id: credentialId })
    return true
  } catch {
    return false
  }
}

/** Revokes several of the agent's tokens, one after another; resolves to how many could not be. */
export async function revokeAllAsOwner(actorId: string, credentialIds: readonly string[]): Promise<number> {
  let failed = 0
  for (const id of credentialIds) if (!(await revokeAsOwner(actorId, id))) failed++
  return failed
}

/**
 * The owner's fallback when the runtime could not revoke a token in Core
 * (§9.4): find the live API token with that prefix in the agent's list and
 * revoke it. 'none' when no live token has it (it is gone already).
 */
export async function ownerRevokeByPrefix(actorId: string, prefix: string): Promise<'revoked' | 'none' | 'failed'> {
  try {
    const out = await read('agent.list_credentials', { actor_id: actorId })
    const c = ownerFallbackCredential(out.credentials, prefix)
    if (!c) return 'none'
    await write('agent.revoke_credential', { actor_id: actorId, credential_id: c.id })
    return 'revoked'
  } catch {
    return 'failed'
  }
}

/** Issues one token for the runtime, under a new key; Core's answer, or its refusal. */
async function issueOnce(actorId: string) {
  const out = await write(
    'agent.issue_token',
    { actor_id: actorId, label: RUNTIME_TOKEN_LABEL },
    { idempotencyKey: newIdempotencyKey() },
  )
  if (out.status !== 'executed') {
    throw new ApiError({ status: 409, code: 'failed_precondition', message: 'the token was not issued' })
  }
  return out.result
}

export interface HandOff<T> {
  /** Gives the runtime the token; resolves with what it answered. */
  hand: (token: string) => Promise<T>
  /**
   * After no answer or a server failure: what the runtime has after all (the
   * first request may have gone through), null when it plainly does not have
   * this token, or a rejection when that cannot be told.
   */
  check: (issued: IssuedCredential) => Promise<T | null>
}

/**
 * Issues a token for the agent, labelled "AIshie runtime", and hands it to
 * the runtime, as the contract's §9.2 says:
 *
 * 1. an assertion first, so that a runtime that cannot be called stops the
 *    flow before a token exists;
 * 2. agent.issue_token under a key of its own; a replay of an earlier issue
 *    comes back without the token, and that credential is revoked and one
 *    more issued under a new key;
 * 3. hand, with the token in a local variable only, blanked in finally;
 * 4. a refusal (a 4xx other than 401 or 412) revokes the issued credential,
 *    best effort; no answer, a server failure or a 412 (the agent changed
 *    meanwhile) asks check whether the runtime has it after all, and
 *    revokes it only when it plainly does not. Never revoke without
 *    checking: the first request may have succeeded.
 *
 * Rejects with the error that stopped it.
 */
export async function handOverNewToken<T>(
  actorId: string,
  handOff: HandOff<T>,
): Promise<{ result: T; issued: IssuedCredential }> {
  await ensureRuntimeAssertion()

  let token = ''
  let issued: IssuedCredential
  try {
    let out = await issueOnce(actorId)
    if (!out.token) {
      await revokeAsOwner(actorId, out.credential_id)
      out = await issueOnce(actorId)
    }
    token = out.token ?? ''
    out.token = ''
    issued = { credentialId: out.credential_id, prefix: out.token_prefix }
    if (!token) {
      await revokeAsOwner(actorId, issued.credentialId)
      throw new ApiError({ status: 409, code: 'failed_precondition', message: 'Core issued the token without showing it' })
    }
  } catch (e) {
    token = ''
    throw e
  }

  try {
    const result = await handOff.hand(token)
    return { result, issued }
  } catch (e) {
    token = ''
    if (isDefinitive(e)) {
      await revokeAsOwner(actorId, issued.credentialId)
      throw e
    }
    let found: T | null
    try {
      found = await handOff.check(issued)
    } catch {
      // It cannot be told whether the runtime has the token: leave it, listed in Tokens.
      throw e
    }
    if (found) return { result: found, issued }
    await revokeAsOwner(actorId, issued.credentialId)
    throw e
  } finally {
    token = ''
  }
}
