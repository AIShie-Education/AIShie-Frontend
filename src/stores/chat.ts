// The chat, a pane docked beside every signed-in page: whether it is open,
// and how wide (this browser's, for everyone who uses it), and what it
// shows: the course
// the caller asks in, a new conversation with one of its agents, the
// caller's conversations across their courses, or one of them. Every
// conversation in it is in a course and with an agent.
//
// AR lists the caller's own conversations, the latest activity first. The
// history reads each known course from AR and merges them; the pane clears a
// conversation's local unread indicator as it is read. No Core conversation
// tool or Core chat storage is used. The history is that
// list, of one course or of all of them, read a page at a time. Its first
// page is read again now and then (the chat panel does, open or not), so
// that an answer is counted on the panel's button until it is read. What is
// kept in this browser, for each caller, is only the course they last asked
// in.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { ApiError } from '@/api/http'
import { runtimeChat, type ChatConversation } from '@/api/runtimeChat'
import type { MyConversation, Respondent } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { loadFrame, loadLastCourse, saveFrame, saveLastCourse } from '@/components/chat/panel'
import { askableCourses } from '@/components/chat/seat'
import { chatHistoryView } from '@/components/chat/arModel'
import { useSessionStore } from './session'

/** What the panel shows: a new conversation (choosing its agent, then writing), the history, or one conversation. */
export type ChatScreen = 'new' | 'history' | 'conversation'

/** Which of the caller's conversations the history lists: in the course the panel asks in, or in every course. */
export type HistoryScope = 'course' | 'all'

/** The caller's conversations with agents as the history lists them, as far as they have been read. */
export interface HistoryList {
  items: MyConversation[]
  loading: boolean
  loaded: boolean
  error: ApiError | null
  /** Core lists more after the pages read (me.conversations' next). */
  hasMore: boolean
  loadingMore: boolean
  moreError: ApiError | null
}

/** Conversations per page of the history (Core's default; its most is 100). */
export const HISTORY_PAGE = 50
/** The newest conversations read for the count on the chat's button: one page. */
export const UNREAD_PAGE = 50

/**
 * Whether the history shows a conversation: one with an agent. A conversation
 * from before, with a person, is closed (conversations_are_with_agents), and
 * left out of the history as it always was, and out of the count.
 */
export const withAgent = (c: Pick<MyConversation, 'respondent'>) => c.respondent.kind === 'agent'

/** The history's key: a course's (course:<id>), or every course's (all). */
export function historyKey(scope: HistoryScope, courseId: string | null | undefined): string | null {
  if (scope === 'all') return 'all'
  return courseId ? `course:${courseId}` : null
}

function emptyHistory(): HistoryList {
  return {
    items: [],
    loading: false,
    loaded: false,
    error: null,
    hasMore: false,
    loadingMore: false,
    moreError: null,
  }
}

export const useChatStore = defineStore('chat', () => {
  const session = useSessionStore()

  // --- The frame: open, and how wide (this browser's) ------------------------------
  const frame = loadFrame()
  const open = ref(frame.open)
  /** The pane's width, or null for its default until its edge is dragged. */
  const width = ref<number | null>(frame.width)
  watch([open, width], () => saveFrame({ open: open.value, width: width.value }))

  /** Opens the chat, or minimizes it: it opens again on what it showed. */
  function setOpen(v: boolean) {
    open.value = v
  }

  // --- The caller -----------------------------------------------------------------
  let actorId: string | null = null
  /** Bumped when the caller changes: what was read for the one before is dropped. */
  let generation = 0
  /** The course the caller last asked in, or looked at (this browser's, for them). */
  const lastCourse = ref<string | null>(null)

  // --- Where the panel is -------------------------------------------------------
  /** The courses where the caller may ask agents now. */
  const courses = computed(() => askableCourses(session.liveMemberships))
  const courseIds = computed(() => courses.value.map((m) => m.course_id))
  /** The course the page shows, when it shows one. */
  const pageCourseId = ref<string | null>(null)
  const chosenCourseId = ref<string | null>(null)
  /**
   * The course the panel asks in and lists: the one chosen (by the caller,
   * or by the page they went to), else the page's, else the last one used,
   * else the first; only ever one where they may ask.
   */
  const courseId = computed<string | null>(() => {
    const ids = courseIds.value
    for (const id of [chosenCourseId.value, pageCourseId.value, lastCourse.value]) {
      if (id && ids.includes(id)) return id
    }
    return ids[0] ?? null
  })
  const screen = ref<ChatScreen>('new')
  /** The conversation shown (or last shown), and its course. */
  const conversation = ref<{ courseId: string; id: string; respondent?: Respondent } | null>(null)
  /** The agent a new conversation is being written to, in a course. */
  const draft = ref<{ courseId: string; agent: Respondent } | null>(null)
  /** The history lists the course asked in, or every course. */
  const historyScope = ref<HistoryScope>('course')

  function useCourse(id: string) {
    if (lastCourse.value === id) return
    lastCourse.value = id
    if (actorId) saveLastCourse(actorId, id)
  }

  /** The caller chose a course to ask in: a new conversation there, unless the history is shown. */
  function selectCourse(id: string) {
    chosenCourseId.value = id
    useCourse(id)
    if (draft.value?.courseId !== id) draft.value = null
    if (screen.value !== 'history') screen.value = 'new'
  }

  /**
   * The page went to a course, or away from any: the panel asks in that
   * course from now on, but a conversation on screen, or one being written,
   * stays where it is.
   */
  function followPage(id: string | null) {
    pageCourseId.value = id
    if (id && courseIds.value.includes(id)) chosenCourseId.value = id
  }

  /** A new conversation, in the course given or the one the panel asks in. */
  function startNew(id?: string) {
    if (id) {
      chosenCourseId.value = id
      useCourse(id)
    }
    draft.value = null
    screen.value = 'new'
  }

  /** The agent chosen for a new conversation in the panel's course. */
  function pickAgent(agent: Respondent) {
    const id = courseId.value
    if (!id) return
    draft.value = { courseId: id, agent }
    useCourse(id)
  }

  /** Shows a conversation (and the panel, when opened from elsewhere). */
  function showConversation(id: string, conversationId: string, opts: { open?: boolean; respondent?: Respondent } = {}) {
    conversation.value = { courseId: id, id: conversationId, respondent: opts.respondent }
    if (courseIds.value.includes(id)) {
      chosenCourseId.value = id
      useCourse(id)
    }
    draft.value = null
    screen.value = 'conversation'
    if (opts.open) open.value = true
  }

  /** Opens the panel on a course: a new conversation there. */
  function showCourse(id: string) {
    startNew(courseIds.value.includes(id) ? id : undefined)
    open.value = true
  }

  function showHistory() {
    screen.value = 'history'
  }

  /**
   * Closes the chat, leaving what it showed: it opens again on a new
   * conversation in the course it asks in. (Minimized, setOpen(false), it
   * opens again on what it showed.)
   */
  function close() {
    open.value = false
    conversation.value = null
    draft.value = null
    screen.value = 'new'
  }
  /** The history, or back from it to the conversation shown before (or a new one). */
  function toggleHistory() {
    if (screen.value !== 'history') screen.value = 'history'
    else screen.value = conversation.value ? 'conversation' : 'new'
  }

  // --- What is unread ---------------------------------------------------------------
  /**
   * Whether the agent has written in each of the caller's conversations since
   * they last read it, as the latest read of it said (me.conversations), or
   * since they read it here (markedRead).
   */
  const unreadOf = shallowRef(new Map<string, boolean>())
  /** Counts the conversations marked read here, so that a list read before one was can be told from one read after. */
  let marks = 0
  const markedAt = new Map<string, number>()

  /** The latest activity each AR read has brought, and the activity read on screen. */
  const activityOf = new Map<string, string>()
  const readActivity = new Map<string, string>()
  const coursesRead = new Set<string>()

  /** Notes a new answer without calling a Core read/mark tool. The DTO has no cross-device read marker. */
  function noteUnread(list: readonly MyConversation[], askedAt: number) {
    let next: Map<string, boolean> | null = null
    for (const c of list) {
      if (!withAgent(c) || (markedAt.get(c.conversation_id) ?? 0) > askedAt) continue
      if (unreadOf.value.get(c.conversation_id) === c.unread) continue
      next ??= new Map(unreadOf.value)
      next.set(c.conversation_id, c.unread)
    }
    if (next) unreadOf.value = next
  }

  /** One course's latest AR page, enriched with the course/agent names the chat already shows. */
  async function readCourse(courseId: string, limit: number) {
    const membership = session.liveMemberships.find((m) => m.course_id === courseId)
    if (!membership) return { rows: [] as MyConversation[], more: false }
    const [out, offered] = await Promise.all([
      runtimeChat.list(courseId, { limit }),
      runtimeChat.agents(courseId).catch(() => ({ agents: [] })),
    ])
    const agents = new Map((offered.agents ?? []).map((a) => [a.agent_id, a]))
    const wasRead = coursesRead.has(courseId)
    const rows = (out.conversations ?? []).map((c: ChatConversation) => {
      const id = c.id
      const previous = activityOf.get(id)
      // A conversation first appearing on a later read is new activity too.
      let unread = unreadOf.value.get(id) === true || (c.state === 'answered' && wasRead && previous !== c.last_activity_at)
      if (readActivity.get(id) === c.last_activity_at) unread = false
      activityOf.set(id, c.last_activity_at)
      return chatHistoryView(c, membership, agents.get(c.agent_id), unread)
    })
    coursesRead.add(courseId)
    return { rows, more: !!out.next }
  }

  /** Reads and merges the caller's AR conversations, one course or every membership's course. */
  async function readMine(args: { course_id?: string; limit: number }) {
    const g = generation
    const askedAt = marks
    const ids = args.course_id
      ? [args.course_id]
      : [...new Set(session.liveMemberships.map((m) => m.course_id))]
    const pages = await Promise.all(ids.map((id) => readCourse(id, args.limit)))
    const conversations = pages
      .flatMap((p) => p.rows)
      .sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at))
      .slice(0, args.limit)
    if (g === generation) noteUnread(conversations, askedAt)
    return { conversations, next: pages.some((p) => p.more) ? ('more' as string | null) : null }
  }

  /** The conversation on screen has been read locally; no Core write is sent. */
  function markedRead(conversationId: string) {
    markedAt.set(conversationId, ++marks)
    const activity = activityOf.get(conversationId)
    if (activity) readActivity.set(conversationId, activity)
    if (!unreadOf.value.get(conversationId)) return
    const next = new Map(unreadOf.value)
    next.set(conversationId, false)
    unreadOf.value = next
  }

  /** The conversation on screen now, if one is: what comes in it is read as it comes. */
  const onScreen = computed(() =>
    open.value && screen.value === 'conversation' ? (conversation.value?.id ?? null) : null,
  )

  /** The caller's conversations with an answer they have not read, less the one on screen. */
  const unreadIds = computed(() => {
    const ids = new Set<string>()
    for (const [id, unread] of unreadOf.value) if (unread && id !== onScreen.value) ids.add(id)
    return ids
  })
  const unreadCount = computed(() => unreadIds.value.size)

  /** Reads the newest page of the caller's conversations again, for the count on the chat's button. */
  async function pollUnread() {
    await readMine({ limit: UNREAD_PAGE })
  }

  // --- The history ----------------------------------------------------------------------
  const histories = ref<Record<string, HistoryList>>({})
  /** How many pages of each history were read: each refresh reads as many again. */
  const pagesOf = new Map<string, number>()
  /** The latest read of each history: an earlier one that ends after it is dropped. */
  const historyReads = new Map<string, number>()

  function setHistory(key: string, h: HistoryList) {
    histories.value = { ...histories.value, [key]: h }
  }

  /**
   * Reads a history from the top: as many pages as were read before (one,
   * the first time), since a conversation that moves goes to the top of the
   * list. Quiet, once it has been read, it keeps showing what it has while it
   * is read again, and a failure is thrown (polling backs off) rather than
   * shown; otherwise a failure is shown, with a retry.
   */
  async function loadHistory(key: string, opts: { quiet?: boolean } = {}) {
    const g = generation
    const mine = (historyReads.get(key) ?? 0) + 1
    historyReads.set(key, mine)
    const before = histories.value[key] ?? emptyHistory()
    const quiet = !!opts.quiet && before.loaded
    if (!quiet) setHistory(key, { ...before, loading: true, error: null })
    const courseArg = key.startsWith('course:') ? { course_id: key.slice('course:'.length) } : {}
    const pages = pagesOf.get(key) ?? 1
    const current = () => g === generation && historyReads.get(key) === mine
    try {
      const out = await readMine({ ...courseArg, limit: HISTORY_PAGE * pages })
      // One that moved to the top while the courses were read is listed once.
      const seen = new Set<string>()
      const all = out.conversations.filter((c) => {
        if (seen.has(c.conversation_id)) return false
        seen.add(c.conversation_id)
        return true
      })
      if (!current()) return
      setHistory(key, {
        items: all.filter(withAgent),
        loading: false,
        loaded: true,
        error: null,
        hasMore: !!out.next,
        loadingMore: false,
        moreError: null,
      })
    } catch (e) {
      if (!current()) return
      const now = histories.value[key] ?? before
      if (quiet) {
        // It may have been reading a page more for loadMoreHistory, whose own read it replaced.
        if (now.loadingMore) setHistory(key, { ...now, loadingMore: false })
        throw e
      }
      setHistory(key, { ...now, loading: false, error: toApiError(e) })
    }
  }

  /** Reads one more page of a history (all of them again, from the top). */
  async function loadMoreHistory(key: string) {
    const h = histories.value[key]
    if (!h?.loaded || !h.hasMore || h.loadingMore) return
    pagesOf.set(key, (pagesOf.get(key) ?? 1) + 1)
    setHistory(key, { ...h, loadingMore: true, moreError: null })
    try {
      await loadHistory(key, { quiet: true })
    } catch (e) {
      pagesOf.set(key, Math.max(1, (pagesOf.get(key) ?? 2) - 1))
      const now = histories.value[key] ?? h
      setHistory(key, { ...now, loadingMore: false, moreError: toApiError(e) })
    }
  }

  // --- A new caller -------------------------------------------------------------
  watch(
    () => session.me?.id ?? null,
    (id) => {
      if (id === actorId) return
      generation++
      actorId = id
      lastCourse.value = id ? loadLastCourse(id) : null
      unreadOf.value = new Map()
      markedAt.clear()
      activityOf.clear()
      readActivity.clear()
      coursesRead.clear()
      histories.value = {}
      pagesOf.clear()
      historyReads.clear()
      chosenCourseId.value = null
      conversation.value = null
      draft.value = null
      screen.value = 'new'
    },
    // At once, so that nothing is noted for the one before under the new caller.
    { immediate: true, flush: 'sync' },
  )

  return {
    open,
    width,
    setOpen,
    close,
    courses,
    courseIds,
    courseId,
    pageCourseId,
    lastCourse,
    screen,
    conversation,
    draft,
    historyScope,
    selectCourse,
    followPage,
    startNew,
    pickAgent,
    showConversation,
    showCourse,
    showHistory,
    toggleHistory,
    readMine,
    markedRead,
    unreadIds,
    unreadCount,
    pollUnread,
    histories,
    loadHistory,
    loadMoreHistory,
  }
})
