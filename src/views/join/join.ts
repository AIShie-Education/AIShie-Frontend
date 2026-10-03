// What the join page makes of Core's answers: why a link cannot be joined
// through now, and Core's refusals in the reader's words; and what it says of
// an account being created before Core is asked.
import { ApiError, type JoinPreview } from '@/api/http'
import { i18n } from '@/i18n'
import { emailDomainAllowed } from '@/utils/joinLink'
import { loginIdProblem as loginIdIssue, MAX_LOGIN_ID } from '@/utils/loginId'
import { passwordProblem } from '@/utils/password'
import { formatList } from '@/utils/format'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})
const te = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

/** Why nobody can join through a link now, as the page says it. */
export const CLOSED_REASONS = ['expired', 'used_up', 'revoked', 'course_archived', 'creator_lost_authority', 'invalid'] as const
export type ClosedReason = (typeof CLOSED_REASONS)[number]

/**
 * Why the link a preview describes cannot be joined through now, or null
 * when it can. A reason this app does not know yet is said as a link that
 * no longer works.
 */
export function closedReason(p: Pick<JoinPreview, 'joinable' | 'reason'>): ClosedReason | null {
  if (p.joinable) return null
  const r = p.reason ?? ''
  return (CLOSED_REASONS as readonly string[]).includes(r) ? (r as ClosedReason) : 'invalid'
}

const REASON = /^[a-z][a-z_]*$/

/**
 * Core's refusal, in the reader's words, when it names a reason
 * (details.reason) the app has words for under `scope`: join.errors for a
 * join or a registration on the join page, join.links.errors for making or
 * revoking links on the members page. Null for any other, which
 * errorMessage says. A link kept to some email domains names them.
 */
export function joinRefusal(e: unknown, scope: 'join.errors' | 'join.links.errors' = 'join.errors'): string | null {
  if (!(e instanceof ApiError)) return null
  const reason = e.details?.reason
  if (typeof reason !== 'string' || !REASON.test(reason)) return null
  if (reason === 'email_domain_not_allowed' && scope === 'join.errors') {
    const d = e.details?.allowed_email_domains
    if (Array.isArray(d) && d.length && d.every((x) => typeof x === 'string'))
      return t('join.errors.email_domain_not_allowed_at', { domains: formatList(d.map((x) => `@${x}`), 'or') })
  }
  const key = `${scope}.${reason}`
  return te(key) ? t(key) : null
}

// ---------------------------------------------------------------------------
// Creating an account through a link: Core's rules, said before Core is asked
// ---------------------------------------------------------------------------

/** Core's longest name (a registration's display_name). */
export const MAX_NAME = 200
/** An address and nothing else: something, an @, and a domain with a dot in it. */
const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/

/** A problem with what was typed, as a message key and its arguments; null when there is none. */
export type Problem = { key: string; args?: Record<string, unknown> } | null

/** What is wrong with a name: none given, or longer than Core takes. */
export function nameProblem(name: string): Problem {
  const n = name.trim()
  if (!n) return { key: 'common.errors.required' }
  if ([...n].length > MAX_NAME) return { key: 'join.page.tooLongName', args: { n: MAX_NAME } }
  return null
}

/**
 * What is wrong with a student number (a login ID): none given, or not 1 to
 * 64 letters, digits, dots, hyphens and underscores, as Core takes them.
 */
export function loginIdProblem(loginId: string): Problem {
  switch (loginIdIssue(loginId)) {
    case 'empty':
      return { key: 'common.errors.required' }
    case 'email':
      return { key: 'join.page.loginIdEmail' }
    case 'long':
      return { key: 'join.page.loginIdLong', args: { n: MAX_LOGIN_ID } }
    case 'chars':
      return { key: 'join.page.loginIdChars' }
  }
  return null
}

/**
 * What is wrong with an email: none given (unless it is optional), not an
 * address, or at no domain the link takes.
 */
export function emailProblem(email: string, domains: readonly string[], opts: { optional?: boolean } = {}): Problem {
  const e = email.trim()
  if (!e) return opts.optional ? null : { key: 'common.errors.required' }
  if (!EMAIL.test(e)) return { key: 'join.page.badEmail' }
  if (!emailDomainAllowed(e, domains))
    return { key: 'join.page.emailWrongDomain', args: { domains: formatList(domains.map((d) => `@${d}`), 'or') } }
  return null
}

/** What is wrong with a new password, and with the same typed again. */
export function passwordProblems(password: string, repeat: string): { password: Problem; repeat: Problem } {
  const p = passwordProblem(password)
  return {
    password: !password
      ? { key: 'common.errors.required' }
      : p === 'short'
        ? { key: 'join.page.tooShort' }
        : p === 'long'
          ? { key: 'join.page.tooLong' }
          : null,
    repeat: !repeat ? { key: 'common.errors.required' } : repeat !== password ? { key: 'join.page.mismatch' } : null,
  }
}
