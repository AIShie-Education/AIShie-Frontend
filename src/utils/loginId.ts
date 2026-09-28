// A login ID is a person's sign-in name other than an email: the student or
// staff number their school gives them (學號, 工號). Core takes 1 to 64
// letters and digits of ASCII, dots, hyphens and underscores, trimmed, and
// never an @, so that a name with an @ is an email and one without a login
// ID (internal/auth/loginid.go). These say the same before Core is asked.

/** The longest login ID Core takes, in characters. */
export const MAX_LOGIN_ID = 64

const LOGIN_ID = /^[0-9A-Za-z._-]{1,64}$/

/** Whether text, trimmed, is shaped like a login ID. */
export function isLoginId(text: string | null | undefined): boolean {
  return LOGIN_ID.test((text ?? '').trim())
}

/**
 * What is wrong with a login ID typed, or null when nothing is: empty, too
 * long, an email (it has an @), or a character Core does not take.
 */
export type LoginIdProblem = 'empty' | 'long' | 'email' | 'chars' | null

export function loginIdProblem(text: string | null | undefined): LoginIdProblem {
  const s = (text ?? '').trim()
  if (!s) return 'empty'
  if (s.includes('@')) return 'email'
  if (s.length > MAX_LOGIN_ID) return 'long'
  return LOGIN_ID.test(s) ? null : 'chars'
}
