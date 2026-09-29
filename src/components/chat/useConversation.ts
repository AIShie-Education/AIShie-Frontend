// One conversation, kept fresh: its newest messages first, then whatever is
// written after them, read after the last seq held (Core pushes nothing);
// older ones on request, before the first seq held. The view that comes with
// every page (state, respondent's presence) replaces the one held.
//
// What is written next is long-polled (chat.ts, Polling): while the
// conversation is on screen and the page shown, one read after the last seq
// waits for news (wait_s, with seen_state, the state held), and the next is
// made as soon as it answers, so an answer shows within moments of being
// written. The read under way is cut short (its fetch aborted) when the pane
// goes off screen or away, the page is hidden, or the caller writes; after a
// pause, or a write (refresh), the pane reads at once without waiting, then
// waits again. Where Core does not wait, it reads on pollDelayMs's schedule
// for a while (NO_WAIT_MS). It stops once the conversation is closed.
//
// Retracting a message does not give it a new seq. The view that comes with
// every page says when a message in it was last retracted
// (last_retracted_at): when that moves, the messages held are read again, so
// a withdrawal shows wherever the message is. One the caller retracts is
// marked at once.
//
// Core keeps what each of the two taking part has read. While one of them
// has it before their eyes (reader), what is shown is marked read
// (conversation.mark_read, up to the newest message held): when it opens, if
// Core says the other has written since they last read it (conversation.get's
// unread), and each time the other writes while it is shown.
//
// An answer in the making (draft): the agent's steps and its text so far, as
// Core will send them with each read (the draft contract, draft.ts). Core's
// catalogue has no conversation.draft yet, so `draft` stays null here and the
// pane shows its working line instead. Wiring it is one small step once it
// has: take the read's `draft` in take() (null when it has none), and give
// the read that waits seen_draft_version, the version held.
import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiError, read, write, type ToolOut } from '@/api/http'
import type { ConversationMessage, ConversationView } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { usePolling, type PollContext } from '@/composables/usePolling'
import type { ConversationDraft } from './draft'
import {
  EARLY_MS,
  firstSeq,
  FRESH_MS,
  lastSeq,
  mergeMessages,
  NO_WAIT_MS,
  POLL_MS,
  pollDelayMs,
  refusesWaiting,
  sameMessages,
  sameStanding,
  stateOf,
  WAIT_S,
  WAIT_TIMEOUT_MS,
} from './chat'

/** Messages per page: the newest on opening, older ones on request. */
export const PAGE = 50
/** At most this many new messages per read; a fuller page is read on at once. */
const POLL_PAGE = 100
/** At most this many pages are read again after a retraction; the rest on the next. */
const REREAD_PAGES = 20

export interface UseConversationOptions {
  courseId: string
  conversationId: string
  /** Whether it is on screen: it is kept fresh only then (and not while the page is hidden). */
  active?: MaybeRefOrGetter<boolean>
  /**
   * The caller's seat while they read it as one of the two taking part, with
   * it on screen: what is shown is then marked read, while the page is not
   * hidden. Null, or left out, marks nothing (staff reading it keep no place
   * in it).
   */
  reader?: MaybeRefOrGetter<string | null | undefined>
  /** Core has recorded what the reader has read (conversation.mark_read's answer). */
  onRead?: (out: ToolOut<'conversation.mark_read'>) => void
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
  /** The answer being written, as Core shows it to the caller; null until Core sends drafts (see above). */
  const draft = shallowRef<ConversationDraft | null>(null)

  let disposed = false
  let lastFetchAt = 0
  /** When a read last answered: the next waits for news only right after one (FRESH_MS). */
  let answeredAt = -Infinity
  /** Until then Core is taken not to wait (it answered at once, or refused to): the schedule is kept. */
  let noWaitUntil = -Infinity
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

  // --- What the reader has read ------------------------------------------------------
  /**
   * Every message up to this seq is read, as far as is known: null until
   * conversation.get has said whether anything is unread.
   */
  let readSeq: number | null = null
  let marking: Promise<void> | null = null
  /** Core refused to mark it read (the caller takes no part in it after all): not asked again. */
  let markRefused = false
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const shown = ref(!hidden())
  const onVisibility = () => (shown.value = !hidden())
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    onScopeDispose(() => document.removeEventListener('visibilitychange', onVisibility))
  }
  const reader = () => (opts.reader === undefined ? null : (toValue(opts.reader) ?? null))

  /**
   * Marks read, up to the newest message held, what the other has written
   * since what is known read, when the reader has it before their eyes.
   * Never twice at once; again at once when more came meanwhile.
   */
  function markRead(): Promise<void> {
    if (marking) return marking
    const me = reader()
    const held = messages.value
    const last = held.at(-1)
    const since = readSeq
    if (!me || since === null || markRefused || disposed || !shown.value || !last) return Promise.resolve()
    if (!held.some((m) => m.seq > since && m.author_member_id !== me && !m.retracted)) return Promise.resolve()
    marking = (async () => {
      let done = false
      try {
        const out = await write('conversation.mark_read', { ...base(), up_to_message_id: last.id })
        if (disposed || out.status !== 'executed') return
        readSeq = Math.max(readSeq ?? 0, out.result.read_up_to_seq, last.seq)
        done = true
        opts.onRead?.(out.result)
      } catch (e) {
        // Refused: not asked again. Not answered: asked again after the next poll.
        const err = toApiError(e)
        if (!err.isNetwork && err.status > 0 && err.status < 500 && err.code !== 'rate_limited') markRefused = true
      } finally {
        marking = null
      }
      if (done) await markRead()
    })()
    return marking
  }
  watch([reader, shown], () => void markRead())

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
      lastFetchAt = answeredAt = now()
      quiet = 0
    } catch (e) {
      if (!disposed) error.value = toApiError(e)
    } finally {
      if (!disposed) loading.value = false
    }
    // Who can read it, and whether the other has written since the caller
    // last read it: said once, and not needed to show the messages.
    if (loaded.value && !visibleTo.value) {
      read('conversation.get', base())
        .then((d) => {
          if (disposed) return
          visibleTo.value = d.visible_to ?? []
          if (d && !view.value) view.value = d
          // Unread: whatever the other wrote that is held. Otherwise all held is read.
          readSeq = d.unread ? 0 : (lastSeq(messages.value) ?? 0)
          void markRead()
        })
        .catch(() => {
          // Not known: what is held counts as read, and what comes next is marked.
          if (!disposed && readSeq === null) readSeq = lastSeq(messages.value) ?? 0
        })
    }
  }

  /** Whether what comes next is waited for: Core waits, as far as is known, and there is a message to read after. */
  const longPolls = () => now() >= noWaitUntil && lastSeq(messages.value) !== null

  /**
   * Reads what was written after `after`: waiting for news when wait says
   * so (answering with how long it waited), or at once. A Core from before
   * waiting, which refuses wait_s, is read at once, and on the schedule for
   * a while.
   */
  async function readAfter(after: number | null, wait: boolean, signal: AbortSignal) {
    const args = { ...base(), limit: POLL_PAGE, ...(after === null ? {} : { after_seq: after }) }
    if (wait && after !== null) {
      const asked = now()
      const seen = view.value ? { seen_state: view.value.state } : {}
      try {
        const out = await read(
          'conversation.messages',
          { ...args, wait_s: WAIT_S, ...seen },
          { signal, timeoutMs: WAIT_TIMEOUT_MS },
        )
        return { out, waited: now() - asked }
      } catch (e) {
        if (!(e instanceof ApiError) || !refusesWaiting(e)) throw e
        noWaitUntil = now() + NO_WAIT_MS
      }
    }
    return { out: await read('conversation.messages', args, { signal }), waited: null }
  }

  /**
   * Reads what was written after the last message held, waiting for it
   * while Core waits; where it does not, now and then, as the schedule says.
   */
  async function poll({ signal }: PollContext) {
    if (!loaded.value) {
      if (!loading.value) await load()
      return
    }
    const t = now()
    const waits = longPolls()
    if (!force && !waits) {
      const due = view.value ? pollDelayMs(stateOf(view.value), quiet) : POLL_MS
      if (due === null || t - lastFetchAt < due - 50) return
    }
    // Waits only right after a read answered, and not when asked to read now:
    // otherwise what it would compare with may be out of date.
    const wait = waits && !force && t - answeredAt < FRESH_MS
    force = false
    lastFetchAt = t
    let changed = false
    // A full page means more is waiting: read on (a few pages at most per poll).
    for (let i = 0; i < 5; i++) {
      const after = lastSeq(messages.value)
      const held = view.value
      const { out, waited } = await readAfter(after, wait && i === 0, signal)
      if (disposed) return
      const took = take(out.messages, out.conversation)
      if (took) changed = true
      // Nothing new, well before the wait was up: Core did not wait (too many
      // of the caller's reads wait, or it is shutting down). Its schedule, for a while.
      const news = took || !held || !out.conversation || !sameStanding(held, out.conversation)
      if (waited !== null && waited < EARLY_MS && !news) noWaitUntil = now() + NO_WAIT_MS
      if (after === null) hasOlder.value = !!out.more
      if (!out.more || after === null) break
    }
    if (reread && (await readHeldAgain(signal))) changed = true
    quiet = changed ? 0 : quiet + 1
    answeredAt = now()
    void markRead()
  }

  /**
   * Reads every message held again, oldest first, after a retraction (whose
   * message may be any of them). True when anything changed. Cut short, it
   * is done again on the next read.
   */
  async function readHeldAgain(signal?: AbortSignal): Promise<boolean> {
    const first = firstSeq(messages.value)
    const target = view.value?.last_retracted_at ?? null
    reread = false
    readRetractedAt = target
    if (first === null) return false
    let changed = false
    let after = first - 1
    const last = lastSeq(messages.value) ?? first
    try {
      for (let i = 0; i < REREAD_PAGES && after < last; i++) {
        const out = await read('conversation.messages', { ...base(), limit: POLL_PAGE, after_seq: after }, { signal })
        if (disposed) return changed
        // A newer retraction while reading: go over them again next time.
        if ((out.conversation?.last_retracted_at ?? null) !== target) reread = true
        const page = out.messages ?? []
        if (take(page, null)) changed = true
        if (!out.more || !page.length) break
        after = page[page.length - 1]!.seq
      }
    } catch (e) {
      reread = true
      throw e
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
    // Again at once while Core waits; where it does not, every POLL_MS, to see whether the schedule says to read.
    get intervalMs() {
      return longPolls() ? 0 : POLL_MS
    },
    // After a failure, as ever: 6, 12, 24, then 48 seconds.
    failureIntervalMs: POLL_MS,
    maxIntervalMs: POLL_MS * 16,
    immediate: false,
    enabled: () => (opts.active === undefined ? true : toValue(opts.active)) && loaded.value && open.value,
  })

  /**
   * Reads now, whatever the schedule says, and without waiting: after the
   * caller wrote, say. A read waiting for news is cut short for it.
   */
  async function refresh() {
    force = true
    quiet = 0
    await polling.pollNow({ interrupt: true })
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
    draft,
    visibleTo,
    loading,
    loaded,
    error,
    hasOlder,
    loadingOlder,
    olderError,
    /** Whether a read of what comes next is under way (one waiting for news included). */
    polling: polling.inFlight,
    /** Reads of what comes next that failed in a row (the pane says it is having trouble). */
    failures: polling.failures,
    load,
    loadOlder,
    refresh,
    markRetracted,
    /** Marks read what is shown, if anything the other wrote is not yet (tests; it happens by itself). */
    markRead,
  }
}
