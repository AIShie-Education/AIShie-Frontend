// One AR-owned conversation. The first page and explicit refreshes are AR
// reads; while it is open, active and visible, one assertion-authenticated AR
// SSE stream supplies complete snapshots, drafts, retractions and state.
// Abnormal EOF reconnects with backoff. There is deliberately no Core read,
// write, long-poll or conversation stream in this path.
import { computed, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiError } from '@/api/http'
import {
  runtimeChat,
  type ChatAgent,
  type ChatConversation,
  type ChatDraft,
  type ChatMessage,
  type ChatSnapshot,
  type ChatStreamEvent,
} from '@/api/runtimeChat'
import type { ConversationMessage, ConversationView } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { chatConversationView, chatDraftView, chatMessageView, chatSnapshotView } from './arModel'
import type { ConversationDraft } from './draft'
import { firstSeq, lastSeq, mergeMessages, sameMessages, stateOf } from './chat'

/** Messages per page: the newest on opening, older ones on request. */
export const PAGE = 50
/** Reconnect delays after an abnormal stream end, capped at fifteen seconds. */
export const STREAM_RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const

export interface UseConversationOptions {
  courseId: string
  conversationId: string
  /** Kept fresh only on screen; a hidden page or a closed conversation has no stream. */
  active?: MaybeRefOrGetter<boolean>
  /** The local reader, for clearing the pane's unread indicator. AR has no Core mark_read call. */
  reader?: MaybeRefOrGetter<string | null | undefined>
  /** The reader has seen the latest assistant message (or opened the conversation). */
  onRead?: (out?: unknown) => void
  now?: () => number
}

export function useConversation(opts: UseConversationOptions) {
  const now = opts.now ?? Date.now
  const messages = shallowRef<ConversationMessage[]>([])
  const view = shallowRef<ConversationView | null>(null)
  const visibleTo = shallowRef<string[] | null>(null)
  const loading = ref(false)
  const error = ref<ApiError | null>(null)
  const hasOlder = ref(false)
  const loadingOlder = ref(false)
  const olderError = ref<ApiError | null>(null)
  const loaded = ref(false)
  const draft = shallowRef<ConversationDraft | null>(null)
  const agent = shallowRef<ChatAgent | null>(null)
  const failures = ref(0)
  const refreshing = ref(false)

  let disposed = false
  let revision = -1
  let draftVersion = -1
  let readSeq = 0
  let lastReadNotified: number | null = null
  onScopeDispose(() => {
    disposed = true
    stopStream()
  })

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const shown = ref(!hidden())
  const onVisibility = () => (shown.value = !hidden())
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    onScopeDispose(() => document.removeEventListener('visibilitychange', onVisibility))
  }
  const reader = () => (opts.reader === undefined ? null : (toValue(opts.reader) ?? null))
  const active = () => (opts.active === undefined ? true : toValue(opts.active))
  const open = computed(() => !view.value || stateOf(view.value) !== 'closed')
  const wanted = () => active() && loaded.value && open.value && shown.value && !disposed

  /** Clears the chat's local unread state; AR does not expose Core's mark_read tool. */
  function markRead(): Promise<void> {
    const last = lastSeq(messages.value)
    if (!reader() || !shown.value || disposed || last === null || lastReadNotified === last) return Promise.resolve()
    lastReadNotified = last
    readSeq = Math.max(readSeq, last)
    opts.onRead?.()
    return Promise.resolve()
  }
  watch([reader, shown], () => void markRead())

  function newerConversation(c: ChatConversation): boolean {
    return c.revision >= revision
  }

  function takeView(c: ChatConversation, page: ChatMessage[] = []): boolean {
    if (!newerConversation(c)) return false
    const next = chatConversationView(c, agent.value ?? undefined)
    const mapped = page.map((m) => chatMessageView(m, next))
    const latestUser = [...mapped].reverse().find((m) => m.author_member_id === next.opener.member_id)
    const last = mapped.at(-1)
    next.latest_opener_message_id = latestUser?.id ?? null
    next.last_author_member_id = last?.author_member_id ?? null
    const retractedAt = mapped.map((m) => m.retracted?.at).filter((x): x is string => !!x).sort().at(-1)
    if (retractedAt) next.last_retracted_at = retractedAt
    const changed = !view.value || JSON.stringify(view.value) !== JSON.stringify(next)
    revision = c.revision
    view.value = next
    return changed
  }

  function takeMessages(page: ConversationMessage[]): boolean {
    const previous = new Map(messages.value.map((m) => [m.id, m]))
    const next = mergeMessages(messages.value, page).map((m) => {
      const old = previous.get(m.id)
      if (!old) return m
      const current = m as ConversationMessage & { ar_sources?: unknown[]; ar_sources_stated?: boolean }
      const before = old as ConversationMessage & { ar_sources?: unknown[]; ar_sources_stated?: boolean }
      // AR source pointers are immutable. A later partial SSE/page copy may
      // omit them; do not replace a known source list with an empty one.
      if (before.ar_sources?.length && !current.ar_sources?.length) {
        return { ...m, ar_sources: before.ar_sources, ar_sources_stated: before.ar_sources_stated }
      }
      return m
    })
    if (sameMessages(messages.value, next)) return false
    messages.value = next
    return true
  }

  function takeDraft(next: ChatDraft | null | undefined, atRevision = revision): boolean {
    if (atRevision < revision) return false
    if (next && next.version < draftVersion) return false
    if (!next && draft.value === null) return false
    if (next && draft.value?.version === next.version) return false
    draftVersion = next?.version ?? draftVersion
    const mapped = chatDraftView(next)
    if (mapped) {
      const level = agent.value?.answer_level ?? view.value?.respondent.answer_level
      // Until AR's answer level is known, do not expose a possible pending
      // answer's text. Only an explicit autonomous grant reveals the stream.
      mapped.text_hidden = level !== 'autonomous'
    }
    draft.value = mapped
    return true
  }

  function takeSnapshot(out: ChatSnapshot): boolean {
    if (!newerConversation(out.conversation)) return false
    const page = chatSnapshotView(out, agent.value ?? undefined)
    const changedView = takeView(out.conversation, out.messages ?? [])
    if (view.value && page.conversation.state !== view.value.state) view.value = page.conversation
    const changedMessages = takeMessages(page.messages)
    const answerPending =
      out.conversation.state === 'reply_pending_approval' ||
      (out.messages ?? []).some((m) => m.role === 'assistant' && m.status === 'pending')
    const changedDraft = takeDraft(answerPending ? null : out.draft, out.conversation.revision)
    void markRead()
    return changedView || changedMessages || changedDraft
  }

  async function readAgent() {
    try {
      const out = await runtimeChat.agents(opts.courseId)
      const current = view.value?.respondent.member_id
      if (disposed) return
      agent.value = (out.agents ?? []).find((a) => a.agent_id === current) ?? null
      if (view.value && agent.value) {
        view.value = {
          ...view.value,
          respondent: {
            ...view.value.respondent,
            display_name: agent.value.display_name,
            is_delegate_of_opener: agent.value.is_my_delegate,
            answer_level: agent.value.answer_level,
          },
        }
      }
      if (draft.value) draft.value = { ...draft.value, text_hidden: agent.value?.answer_level !== 'autonomous' }
    } catch {
      // The conversation remains readable; its id is used until the agents read succeeds.
    }
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      const out = await runtimeChat.messages(opts.courseId, opts.conversationId, { limit: PAGE })
      if (disposed) return
      messages.value = []
      revision = -1
      draftVersion = -1
      agent.value = null
      takeSnapshot(out)
      hasOlder.value = !!out.more
      loaded.value = true
      visibleTo.value = ['participants']
      failures.value = 0
      void readAgent()
      void markRead()
    } catch (e) {
      if (!disposed) error.value = toApiError(e)
    } finally {
      if (!disposed) loading.value = false
    }
  }

  async function loadOlder() {
    const before = firstSeq(messages.value)
    if (before === null || loadingOlder.value || !hasOlder.value) return
    loadingOlder.value = true
    olderError.value = null
    try {
      const out = await runtimeChat.messages(opts.courseId, opts.conversationId, { limit: PAGE, before_seq: before })
      if (disposed) return
      if (takeSnapshot(out)) {
        // takeSnapshot also accepts the older page's conversation at the same revision.
      }
      hasOlder.value = !!out.more
    } catch (e) {
      if (!disposed) olderError.value = toApiError(e)
    } finally {
      if (!disposed) loadingOlder.value = false
    }
  }

  // --- AR SSE ------------------------------------------------------------------
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let retries = 0

  function retryable(e: unknown): boolean {
    const err = toApiError(e)
    return err.isNetwork || err.status === 200 || err.status === 429 || err.status >= 500
  }

  function scheduleReconnect() {
    if (!running || !wanted() || timer !== null) return
    const delay = STREAM_RETRY_MS[Math.min(retries, STREAM_RETRY_MS.length - 1)]!
    retries++
    timer = setTimeout(() => {
      timer = null
      void connect()
    }, delay)
  }

  async function event(ev: ChatStreamEvent, signal: AbortSignal) {
    if (signal.aborted || disposed) return
    if (ev.event === 'snapshot' || ev.event === 'message') {
      takeSnapshot(ev.data as ChatSnapshot)
    } else if (ev.event === 'draft') {
      const data = ev.data as { conversation_id: string; revision: number; draft: ChatDraft | null }
      if (data.conversation_id === opts.conversationId)
        takeDraft(view.value?.state === 'reply_pending_approval' ? null : data.draft, data.revision)
    } else if (ev.event === 'retracted') {
      const data = ev.data as { conversation: ChatConversation; retracted: ChatMessage; draft: ChatDraft | null }
      takeSnapshot({
        conversation: data.conversation,
        messages: [data.retracted],
        more: hasOlder.value,
        draft: data.draft,
      })
    } else if (ev.event === 'state') {
      takeView((ev.data as { conversation: ChatConversation }).conversation)
    } else if (ev.event === 'error') {
      const body = (ev.data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error
      error.value = new ApiError({
        status: 200,
        code: body?.code ?? 'internal',
        message: body?.message ?? 'the agent runtime reported an error',
        details: body?.details,
      })
    }
    if (ev.event !== 'error') error.value = null
    failures.value = 0
    retries = 0
    void markRead()
  }

  async function connect() {
    if (!running || !wanted() || controller) return
    const ctrl = new AbortController()
    controller = ctrl
    try {
      await runtimeChat.stream(opts.courseId, opts.conversationId, {
        signal: ctrl.signal,
        onEvent: (ev) => event(ev, ctrl.signal),
      })
      if (!ctrl.signal.aborted) scheduleReconnect()
    } catch (e) {
      if (ctrl.signal.aborted || disposed) return
      failures.value++
      if (retryable(e)) scheduleReconnect()
      else {
        error.value = toApiError(e)
        running = false
      }
    } finally {
      if (controller === ctrl) controller = null
    }
  }

  function startStream() {
    if (running || !wanted()) return
    running = true
    retries = 0
    void connect()
  }

  function stopStream() {
    running = false
    if (timer !== null) clearTimeout(timer)
    timer = null
    controller?.abort()
    controller = null
  }

  watch(wanted, (on) => (on ? startStream() : stopStream()), { immediate: true })

  /** One immediate AR snapshot read; an active stream is restarted afterwards with a fresh assertion. */
  async function refresh() {
    const resume = running
    if (resume) stopStream()
    refreshing.value = true
    try {
      const out = await runtimeChat.messages(opts.courseId, opts.conversationId, { limit: PAGE })
      if (!disposed) {
        takeSnapshot(out)
        hasOlder.value = !!out.more || hasOlder.value
        failures.value = 0
        error.value = null
      }
    } catch (e) {
      if (!disposed) failures.value++
    } finally {
      refreshing.value = false
      if (resume) startStream()
    }
  }

  /** Applies the full snapshot returned by an AR create/ask/withdraw without another read. */
  function accept(out: ChatSnapshot) {
    if (!disposed) takeSnapshot(out)
  }

  /** Applies a just-withdrawn message locally; the AR stream confirms its revision. */
  function markRetracted(messageId: string, by: string | null, reason: string | null) {
    messages.value = messages.value.map((m) => {
      if (m.id !== messageId || m.retracted) return m
      const { attachments: _files, sources: _sources, ...rest } = m
      return { ...rest, body: null, retracted: { at: new Date(now()).toISOString(), by_member_id: by, reason } }
    })
    draft.value = null
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
    polling: computed(() => refreshing.value || controller !== null),
    failures,
    load,
    loadOlder,
    refresh,
    accept,
    markRetracted,
    markRead,
  }
}
