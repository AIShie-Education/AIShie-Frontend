// The lists the chat shows beside a conversation, each kept fresh by asking
// again: the caller's conversations in one part (opener, respondent,
// overseer), whom they may ask, and how many questions wait for their answer.
// A refresh replaces what is shown only once it has all of it, so a list
// never empties or flickers while it is read again.
import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiError, read } from '@/api/http'
import type { AgentSummary, ConversationRole, ConversationView, InboxItem, Respondent } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { seatPurpose, type SeatPurpose } from '@/utils/agents'
import { byActivity } from './chat'

/** Conversations per page (Core's most is 200). */
export const LIST_PAGE = 100
/** How often a list on screen is read again. */
export const LIST_POLL_MS = 20_000
/** How often whom one may ask is read again (their presence moves). */
export const RESPONDENTS_POLL_MS = 60_000
/** How often the questions waiting for the caller are counted. */
export const INBOX_POLL_MS = 30_000

type Enabled = MaybeRefOrGetter<boolean>
const on = (e: Enabled | undefined) => (e === undefined ? true : toValue(e))

/**
 * A list read whole and kept fresh. load(); refresh() reads it again quietly
 * (a failure keeps what is shown and is thrown, so polling backs off).
 */
function useQuietList<T>(fetchAll: () => Promise<T[]>) {
  const items = shallowRef<T[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<ApiError | null>(null)
  let generation = 0
  let disposed = false
  onScopeDispose(() => {
    disposed = true
  })

  async function load() {
    const mine = ++generation
    loading.value = true
    error.value = null
    try {
      const got = await fetchAll()
      if (disposed || mine !== generation) return
      items.value = got
      loaded.value = true
    } catch (e) {
      if (!disposed && mine === generation) error.value = toApiError(e)
    } finally {
      if (!disposed && mine === generation) loading.value = false
    }
  }

  async function refresh() {
    if (!loaded.value) return load()
    const mine = ++generation
    const got = await fetchAll()
    if (disposed || mine !== generation) return
    items.value = got
    error.value = null
  }

  return { items, loading, loaded, error, load, refresh }
}

/**
 * The caller's conversations as one of their parts, the latest activity
 * first. Core lists them oldest first by page; each refresh reads again as
 * many pages as were loaded (one, for nearly everyone), and loadMore one
 * more.
 */
export function useConversationList(opts: { courseId: string; as: ConversationRole; enabled?: Enabled }) {
  let pages = 1
  const hasMore = ref(false)
  const list = useQuietList<ConversationView>(async () => {
    const all: ConversationView[] = []
    let after: string | undefined
    let more = false
    for (let i = 0; i < pages; i++) {
      const out = await read('conversation.list', {
        course_id: opts.courseId,
        as: opts.as,
        limit: LIST_PAGE,
        ...(after ? { after } : {}),
      })
      all.push(...(out.conversations ?? []))
      after = out.next ?? undefined
      more = !!after
      if (!after) break
    }
    hasMore.value = more
    return all
  })
  const items = computed(() => byActivity(list.items.value))
  const loadingMore = ref(false)

  async function loadMore() {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true
    pages++
    try {
      await list.refresh()
    } catch (e) {
      pages--
      list.error.value = toApiError(e)
    } finally {
      loadingMore.value = false
    }
  }

  const polling = usePolling(list.refresh, {
    intervalMs: LIST_POLL_MS,
    immediate: false,
    enabled: () => on(opts.enabled) && list.loaded.value,
  })
  void list.load()

  return {
    items,
    loading: list.loading,
    loaded: list.loaded,
    error: list.error,
    hasMore,
    loadingMore,
    loadMore,
    reload: list.load,
    /** Reads it again now (after the caller started or closed one). */
    refresh: () => polling.pollNow(),
  }
}

/**
 * Whom the caller may ask here (conversation.respondents): their own agents
 * first, then by name. Read at once, or, lazy, only once it is first enabled
 * (a conversation that needs to know whether its respondent is still
 * offered).
 */
export function useRespondents(opts: { courseId: string; enabled?: Enabled; lazy?: boolean }) {
  const list = useQuietList<Respondent>(async () => {
    const out = await read('conversation.respondents', { course_id: opts.courseId })
    return sortRespondents(out.respondents ?? [])
  })
  const polling = usePolling(list.refresh, {
    intervalMs: RESPONDENTS_POLL_MS,
    immediate: false,
    enabled: () => on(opts.enabled) && list.loaded.value,
  })
  const started = startWhenEnabled(list.load, opts.lazy ? opts.enabled : true)
  return { ...list, reload: list.load, refresh: () => (started() ? polling.pollNow() : Promise.resolve()) }
}

/** Calls load once enabled is first true; says whether it has been called. */
function startWhenEnabled(load: () => unknown, enabled: Enabled | undefined): () => boolean {
  let started = false
  watch(
    () => on(enabled),
    (e) => {
      if (!e || started) return
      started = true
      void load()
    },
    { immediate: true },
  )
  return () => started
}

/**
 * One of the caller's own agents seated here as their delegate that takes no
 * conversations in the site: it is operated from an external tool, and
 * conversation.respondents leaves it out.
 */
export interface AgentElsewhere {
  actorId: string
  memberId: string
  displayName: string
  purpose: SeatPurpose | null
}

/**
 * The caller's own agents seated in a course as their delegates, live, that
 * take no conversations in the site: agent.list says which take none
 * (site_chat), and agent.get where each is seated. Only a person owns agents:
 * for anyone else, or when agent.list is refused, there are none.
 */
export async function ownAgentsElsewhere(
  courseId: string,
  myMemberId: string | null | undefined,
  now = Date.now(),
): Promise<AgentElsewhere[]> {
  let agents: AgentSummary[]
  try {
    agents = (await read('agent.list', {})).agents ?? []
  } catch (e) {
    if (e instanceof ApiError && (e.isForbidden || e.isNotFound)) return []
    throw e
  }
  const candidates = agents.filter((a) => !a.site_chat && a.status === 'active' && a.live_seats > 0)
  // One that cannot be read now (gone meanwhile, say) is left out, not the rest with it.
  const full = await Promise.all(
    candidates.map((a) => read('agent.get', { actor_id: a.actor_id }).catch(() => null)),
  )
  const out: AgentElsewhere[] = []
  for (const a of full) {
    if (!a || a.site_chat || a.status !== 'active') continue
    for (const s of a.seats ?? []) {
      if (s.course_id !== courseId || s.status !== 'active') continue
      if (s.expires_at && Date.parse(s.expires_at) <= now) continue
      if (myMemberId && s.principal_member_id && s.principal_member_id !== myMemberId) continue
      out.push({ actorId: a.actor_id, memberId: s.member_id, displayName: a.display_name, purpose: seatPurpose(s) })
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** ownAgentsElsewhere, kept fresh as whom the caller may ask is. */
export function useAgentsElsewhere(opts: {
  courseId: string
  myMemberId: MaybeRefOrGetter<string | null | undefined>
  enabled?: Enabled
}) {
  const list = useQuietList<AgentElsewhere>(() => ownAgentsElsewhere(opts.courseId, toValue(opts.myMemberId)))
  const polling = usePolling(list.refresh, {
    intervalMs: RESPONDENTS_POLL_MS,
    immediate: false,
    enabled: () => on(opts.enabled) && list.loaded.value,
  })
  const started = startWhenEnabled(list.load, opts.enabled)
  return { ...list, reload: list.load, refresh: () => (started() ? polling.pollNow() : Promise.resolve()) }
}

export function sortRespondents(list: readonly Respondent[]): Respondent[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        Number(b.is_my_delegate) - Number(a.is_my_delegate) ||
        Number(b.kind === 'agent') - Number(a.kind === 'agent') ||
        a.display_name.localeCompare(b.display_name),
    )
}

/**
 * The conversations waiting for the caller's answer (conversation.inbox):
 * those whose opener wrote last, with no answer of theirs waiting for
 * approval. Polled while enabled; a refusal (the seat does not answer) stops
 * nothing but leaves the count at zero.
 */
export function useInbox(opts: { courseId: string; enabled?: Enabled }) {
  const items = shallowRef<InboxItem[]>([])
  let disposed = false
  onScopeDispose(() => {
    disposed = true
  })
  async function poll() {
    try {
      const out = await read('conversation.inbox', { course_id: opts.courseId, limit: 100 })
      if (!disposed) items.value = out.conversations ?? []
    } catch (e) {
      // Not allowed to answer here: nothing waits, and asking again will not change that soon.
      if (e instanceof ApiError && (e.isForbidden || e.isNotFound)) {
        if (!disposed) items.value = []
        return
      }
      throw e
    }
  }
  const polling = usePolling(poll, { intervalMs: INBOX_POLL_MS, enabled: () => on(opts.enabled) })
  const ids = computed(() => new Set(items.value.map((c) => c.id)))
  return { items, ids, count: computed(() => items.value.length), refresh: () => polling.pollNow() }
}
