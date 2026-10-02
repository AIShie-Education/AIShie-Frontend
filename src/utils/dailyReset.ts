// When the agent runtime's daily counts start again: the school plan's
// quotas, tenants' quotas, agents' budgets and the transcriber's pages.
//
// The runtime counts each a day at a time, and names the start of the day
// it is counting where it answers with what was used (GET /agents' and
// /agents/{id}'s today.since, GET admin/school-plan/usage's since): the next
// day starts one day after it (the runtime's nextDay, startOfDay + 1 day),
// so that a runtime whose day starts at another hour is followed. Where it
// names none (GET /models, the settings), the day is the one its documents
// give, the UTC day ("Days are UTC: a quota starts again at 00:00 UTC",
// its docs/deploying.md), and this is the one place that rule is written.

const DAY = 86_400_000

/**
 * The next time the runtime's daily counts start again after now, as an
 * RFC 3339 instant: a day after since, the start of the day the runtime is
 * counting, where it names one, or else the next 00:00 UTC. A day read
 * before it ended, and shown after, gives the next one, at the same time of
 * day.
 */
export function nextDailyReset(since?: string | null, now: number = Date.now()): string {
  const start = since ? Date.parse(since) : NaN
  let next = Number.isFinite(start) ? start + DAY : Math.floor(now / DAY) * DAY + DAY
  if (next <= now) next += Math.ceil((now - next + 1) / DAY) * DAY
  return new Date(next).toISOString()
}
