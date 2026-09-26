// Core's rule for a password (auth.HashPassword): 10 to 1024 bytes of UTF-8.
// It counts bytes, not characters, so a letter outside English counts as two
// or three. Checked here only to say so before Core does; Core decides.

export const PASSWORD_MIN_BYTES = 10
export const PASSWORD_MAX_BYTES = 1024

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/** What is wrong with a password by Core's rule, or null when nothing is. */
export function passwordProblem(password: string): 'short' | 'long' | null {
  const n = byteLength(password)
  if (n < PASSWORD_MIN_BYTES) return 'short'
  if (n > PASSWORD_MAX_BYTES) return 'long'
  return null
}
