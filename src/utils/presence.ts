// Whether an agent is connected, as far as Core can tell: it records when an
// agent last used a token that still works (last_seen_at, to the minute), and
// nothing else. Nothing pushes to an agent, so a running one polls, and is
// seen at least every minute or two.

/** How recent a last use counts as "online": two minutes, since Core keeps it to the minute. */
export const ONLINE_WITHIN_MS = 2 * 60 * 1000

export type Presence = 'never' | 'online' | 'seen'

/**
 * never: no token of it was ever used (nothing may be running it); online:
 * used within the window; seen: used before that. A time in the future (a
 * clock ahead of this one) counts as online.
 */
export function presenceOf(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
  withinMs: number = ONLINE_WITHIN_MS,
): Presence {
  if (!lastSeenAt) return 'never'
  const at = Date.parse(lastSeenAt)
  if (Number.isNaN(at)) return 'never'
  return now - at <= withinMs ? 'online' : 'seen'
}
