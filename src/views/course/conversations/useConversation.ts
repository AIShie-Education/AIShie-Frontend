// One conversation, kept fresh: its newest messages first, then whatever is
// written after them, read by polling after the last seq held (Core pushes
// nothing); older ones on request, before the first seq held. The view that
// comes with every page (state, respondent's presence) replaces the one held.
//
// Retracting a message does not give it a new seq. The view that comes with
// every page says when a message in it was last retracted
// (last_retracted_at): when that moves, the messages held are read again, so
// a withdrawal shows wherever the message is. One the caller retracts is
// marked at once.
import { computed, onScopeDispose, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { ApiError, read } from '@/api/http'
import type { ConversationMessage, ConversationView } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { usePolling } from '@/composables/usePolling'
import { firstSeq, lastSeq, mergeMessages, POLL_MS, pollDelayMs, sameMessages, stateOf } from './chat'

/** Messages per page: the newest on opening, older ones on request. */
export const PAGE = 50
/** At most this many new messages per poll; a fuller page is read on at once. */
const POLL_PAGE = 100
/** At most this many pages are read again after a retraction; the rest on the next. */
const REREAD_PAGES = 20

export interface UseConversationOptions {
  courseId: string
  conversationId: string
  /** Whether it is on screen: polling runs only then (and not while the page is hidden). */
  active?: MaybeRefOrGetter<boolean>
  /** Called with the page's time (tests). */
  now?: () => number
}

export function useConversation(opts: UseConversationOptions) {
  const now = opts.now ?? Date.now
  const messages = shallowRef<ConversationMessage[]>([])
  const view = shallowRef<ConversationView | null>(null)
  /** Who can read it (conversation.get's visible_to); null until read, or if it could not be. */
  const visibleTo = shallowRef<string[] | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  /** Whether there may be messages older than the first held. */
  const hasOlder = ref(false)
  const loadingOlder = ref(false)
  const olderError = ref<ApiError | null>(null)
  const loaded = ref(false)

  let disposed = false
  let lastFetchAt = 0
  /** The last_retracted_at the messages held were read under. */
  let readRetractedAt: string | null = null
  /** A retraction happened since the messages held were read: read them again. */
  let reread = false
  /** Polls in a row that brought nothing new. */
  let quiet = 0
  let force = false
  onScopeDispose(() => {
    disposed = true
  })

  const base = () => ({ course_id: opts.courseId, conversation_id: opts.conversationId })

  function take(page: ConversationMessage[] | null | undefined, v: ConversationView | null | undefined): boolean {
    const next = mergeMessages(messages.value, page ?? [])
    const changedMessages = !sameMessages(messages.value, next)
    if (changedMessages) messages.value = next
    let changedView = false
    if (v) {
      const old = view.value
      changedView = !old || stateOf(old) !== stateOf(v) || old.last_message_at !== v.last_message_at
      if ((v.last_retracted_at ?? null) !== readRetractedAt) reread = true
      view.value = v
    }
    return changedMessages || changedView
  }

  /** Reads the newest page: the first load, and a retry after it failed. */
  async function load() {
    loading.value = true
    error.value = null
    try {
      const out = await read('conversation.messages', { ...base(), limit: PAGE })
      if (disposed) return
      messages.value = []
      readRetractedAt = out.conversation?.last_retracted_at ?? null
      reread = false
      take(out.messages, out.conversation)
      hasOlder.value = !!out.more
      loaded.value = true
      lastFetchAt = now()
      quiet = 0
    } catch (e) {
      if (!disposed) error.value = toApiError(e)
    } finally {
      if (!disposed) loading.value = false
    }
    // Who can read it: said once, and not needed to show the messages.
    if (loaded.value && !visibleTo.value) {
      read('conversation.get', base())
        .then((d) => {
          if (disposed) return
          visibleTo.value = d.visible_to ?? []
          if (d && !view.value) view.value = d
        })
        .catch(() => undefined)
    }
  }

  /** Reads what was written after the last message held, and the newest page now and then. */
  async function poll() {
    if (!loaded.value) {
      if (!loading.value) await load()
      return
    }
    const t = now()
    const due = view.value ? pollDelayMs(stateOf(view.value), quiet) : POLL_MS
    if (!force && (due === null || t - lastFetchAt < due - 50)) return
    force = false
    lastFetchAt = t
    let changed = false
    // A full page means more is waiting: read on (a few pages at most per poll).
    for (let i = 0; i < 5; i++) {
      const after = lastSeq(messages.value)
      const out = await read('conversation.messages', {
        ...base(),
        limit: POLL_PAGE,
        ...(after === null ? {} : { after_seq: after }),
      })
      if (disposed) return
      if (take(out.messages, out.conversation)) changed = true
      if (after === null) hasOlder.value = !!out.more
      if (!out.more || after === null) break
    }
    if (reread && (await readHeldAgain())) changed = true
    quiet = changed ? 0 : quiet + 1
  }

  /**
   * Reads every message held again, oldest first, after a retraction (whose
   * message may be any of them). True when anything changed.
   */
  async function readHeldAgain(): Promise<boolean> {
    const first = firstSeq(messages.value)
    const target = view.value?.last_retracted_at ?? null
    reread = false
    readRetractedAt = target
    if (first === null) return false
    let changed = false
    let after = first - 1
    const last = lastSeq(messages.value) ?? first
    for (let i = 0; i < REREAD_PAGES && after < last; i++) {
      const out = await read('conversation.messages', { ...base(), limit: POLL_PAGE, after_seq: after })
      if (disposed) return changed
      // A newer retraction while reading: go over them again next time.
      if ((out.conversation?.last_retracted_at ?? null) !== target) reread = true
      const page = out.messages ?? []
      if (take(page, null)) changed = true
      if (!out.more || !page.length) break
      after = page[page.length - 1]!.seq
    }
    return changed
  }

  /** Reads the page of messages before the first held. */
  async function loadOlder() {
    const before = firstSeq(messages.value)
    if (before === null || loadingOlder.value || !hasOlder.value) return
    loadingOlder.value = true
    olderError.value = null
    try {
      const out = await read('conversation.messages', { ...base(), limit: PAGE, before_seq: before })
      if (disposed) return
      take(out.messages, out.conversation)
      hasOlder.value = !!out.more
    } catch (e) {
      if (!disposed) olderError.value = toApiError(e)
    } finally {
      if (!disposed) loadingOlder.value = false
    }
  }

  const open = computed(() => !view.value || stateOf(view.value) !== 'closed')
  const polling = usePolling(poll, {
    intervalMs: POLL_MS,
    immediate: false,
    enabled: () => (opts.active === undefined ? true : toValue(opts.active)) && loaded.value && open.value,
  })

  /** Reads now, whatever the schedule says: after the caller wrote, say. */
  async function refresh() {
    force = true
    quiet = 0
    await polling.pollNow()
  }

  /** Marks a message retracted at once (the caller just retracted it); the next read confirms it. */
  function markRetracted(messageId: string, by: string | null, reason: string | null) {
    messages.value = messages.value.map((m) =>
      m.id === messageId && !m.retracted
        ? { ...m, body: null, retracted: { at: new Date(now()).toISOString(), by_member_id: by, reason } }
        : m,
    )
  }

  void load()

  return {
    messages,
    view,
    visibleTo,
    loading,
    loaded,
    error,
    hasOlder,
    loadingOlder,
    olderError,
    /** Whether a poll is under way. */
    polling: polling.inFlight,
    /** Polls that failed in a row (the pane says it is having trouble). */
    failures: polling.failures,
    load,
    loadOlder,
    refresh,
    markRetracted,
  }
}
