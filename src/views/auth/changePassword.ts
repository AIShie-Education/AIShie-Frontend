// What the page that sets one's own password makes of Core's answers.
import { ApiError } from '@/api/http'

/**
 * Whether Core refused a password for being outside the rules for one (too
 * short or too long): invalid_argument, naming no reason, in words of its own.
 */
export function weakPasswordRefusal(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.code === 'invalid_argument' &&
    !e.details?.reason &&
    /\bpassword must be\b/i.test(e.message)
  )
}
