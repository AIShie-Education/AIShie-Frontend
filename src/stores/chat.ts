// The chat panel beside every signed-in page: whether it is open and how wide
// (this browser's, for everyone who uses it), and what it shows: the course
// the caller asks in, a new conversation with one of its agents, the
// caller's conversations across their courses, or one of them. Every
// conversation in it is in a course and with an agent.
//
// Core keeps no record of what anyone has read, and pushes nothing. What the
// caller has read, which of their conversations wait for an answer, and the
// course they last asked in are kept in this browser for them
// (components/chat/unread.ts); the conversations waiting for an answer are
// read again now and then, so that an answer is noticed with the panel
// closed, and counted on its button until it is read.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { ApiError } from '@/api/http'
import type { ConversationView, Respondent } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { byActivity } from '@/components/chat/chat'
import { loadFrame, saveFrame } from '@/components/chat/panel'
import { askableCourses } from '@/components/chat/seat'
import { awaitsAnswer, freshMemory, isUnread, loadMemory, saveMemory, type ChatMemory } from '@/components/chat/unread'
import { eachLimited, readStarted } from '@/components/chat/useConversationList'
import { useSessionStore } from './session'

/** What the panel shows: a new conversation (choosing its agent, then writing), the history, or one conversation. */
export type ChatScreen = 'new' | 'history' | 'conversation'

/** A conversation, and the course it is in. */
export interface ChatItem {
  courseId: string
  view: ConversationView
}

/** One course's list of the caller's conversations, as far as it has been read. */
export interface CourseHistory {
  loading: boolean
  loaded: boolean
  error: ApiError | null
  /** More were started there than are read (Core lists them oldest first). */
  truncated: boolean
}

/** At most this many courses' conversations are read for the history at once. */
export const HISTORY_COURSES_MAX = 20
/** How many courses are read at the same time. */
export const HISTORY_CONCURRENCY = 4

export const useChatStore = defineStore('chat', () => {
  const session = useSessionStore()

  // --- The frame: open, and how wide (this browser's) ----------------------------
  const frame = loadFrame()
  const open = ref(frame.open)
  const width = ref(frame.width)
  watch([open, width], () => saveFrame({ open: open.value, width: width.value }))

  function setOpen(v: boolean) {
    open.value = v
  }
  function toggle() {
    open.value = !open.value
  }

  // --- The caller: what this browser keeps for them -------------------------------
  const memory = ref<ChatMemory>(freshMemory())
  let actorId: string | null = null
  /** Bumped when the caller changes: what was read for the one before is dropped. */
  let generation = 0

  function remember(next: ChatMemory) {
    memory.value = next
    if (actorId) saveMemory(actorId, next)
  }

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
    for (const id of [chosenCourseId.value, pageCourseId.value, memory.value.course]) {
      if (id && ids.includes(id)) return id
    }
    return ids[0] ?? null
  })
  const screen = ref<ChatScreen>('new')
  /** The conversation shown (or last shown), and its course. */
  const conversation = ref<{ courseId: string; id: string } | null>(null)
  /** The agent a new conversation is being written to, in a course. */
  const draft = ref<{ courseId: string; agent: Respondent } | null>(null)
  /** The history lists the course asked in, or every course. */
  const historyScope = ref<'course' | 'all'>('course')

  function useCourse(id: string) {
    if (memory.value.course !== id) remember({ ...memory.value, course: id })
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
  function showConversation(id: string, conversationId: string, opts: { open?: boolean } = {}) {
    conversation.value = { courseId: id, id: conversationId }
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
  /** The history, or back from it to the conversation shown before (or a new one). */
  function toggleHistory() {
    if (screen.value !== 'history') screen.value = 'history'
    else screen.value = conversation.value ? 'conversation' : 'new'
  }

  // --- Conversations known, and what is unread ----------------------------------
  const items = shallowRef(new Map<string, ChatItem>())
  const histories = ref<Record<string, CourseHistory>>({})

  const myMemberIn = (id: string) => session.membershipFor(id)?.member_id ?? null

  /** What the caller has open waiting for an answer, as far as is known: watched until it is answered. */
  function trackPending(next: ChatMemory, it: ChatItem): ChatMemory {
    const waits = it.view.respondent.kind === 'agent' && awaitsAnswer(it.view, myMemberIn(it.courseId))
    const has = it.view.id in next.pending
    if (waits === has) return next
    const pending = { ...next.pending }
    if (waits) pending[it.view.id] = it.courseId
    else delete pending[it.view.id]
    return { ...next, pending }
  }

  /** Conversations read (a list, a conversation on screen, a check on one waiting): the latest read of each is kept. */
  function note(list: ChatItem[]) {
    if (!list.length) return
    const map = new Map(items.value)
    let mem = memory.value
    for (const it of list) {
      map.set(it.view.id, it)
      mem = trackPending(mem, it)
    }
    items.value = map
    if (mem !== memory.value) remember(mem)
  }

  /** A conversation the caller can no longer read: no longer watched. */
  function forget(conversationId: string) {
    if (items.value.has(conversationId)) {
      const map = new Map(items.value)
      map.delete(conversationId)
      items.value = map
    }
    if (conversationId in memory.value.pending) {
      const pending = { ...memory.value.pending }
      delete pending[conversationId]
      remember({ ...memory.value, pending })
    }
  }

  /** The caller has the conversation on screen, as it stood then: its answers so far are read. */
  function markSeen(v: Pick<ConversationView, 'id' | 'last_message_at' | 'created_at'>) {
    const at = v.last_message_at ?? v.created_at
    const had = memory.value.seen[v.id]
    if (had && Date.parse(had) >= Date.parse(at)) return
    remember({ ...memory.value, seen: { ...memory.value.seen, [v.id]: at } })
  }

  /** The conversations with an answer the caller has not read, in courses where they may still ask. */
  const unread = computed(() =>
    [...items.value.values()].filter(
      (it) => courseIds.value.includes(it.courseId) && isUnread(it.view, myMemberIn(it.courseId), memory.value),
    ),
  )
  const unreadIds = computed(() => new Set(unread.value.map((it) => it.view.id)))
  const unreadCount = computed(() => unread.value.length)

  /** The conversations watched for an answer, and their courses. */
  const pending = computed(() =>
    Object.entries(memory.value.pending)
      .filter(([, c]) => courseIds.value.includes(c))
      .map(([id, c]) => ({ id, courseId: c })),
  )

  /**
   * The caller's conversations with agents in the given courses, the latest
   * activity first: those they started, as each course's list and anything
   * read since say.
   */
  function historyOf(ids: readonly string[]): ChatItem[] {
    const want = new Set(ids)
    const mine = [...items.value.values()].filter(
      (it) =>
        want.has(it.courseId) &&
        it.view.respondent.kind === 'agent' &&
        it.view.opener.member_id === myMemberIn(it.courseId),
    )
    const order = byActivity(mine.map((it) => it.view)).map((v) => v.id)
    const byId = new Map(mine.map((it) => [it.view.id, it]))
    return order.map((id) => byId.get(id)!)
  }

  /**
   * Reads the caller's conversations in each course given, several at a time:
   * the courses not read yet, or all of them again with force. A course that
   * cannot be read keeps what was read of it before, and says so.
   */
  async function loadHistory(ids: readonly string[], opts: { force?: boolean } = {}) {
    const g = generation
    const want = ids.filter((id) => {
      const h = histories.value[id]
      return !h?.loading && (opts.force || !h?.loaded)
    })
    if (!want.length) return
    const next = { ...histories.value }
    for (const id of want)
      next[id] = { ...(next[id] ?? { loaded: false, truncated: false, error: null }), loading: true }
    histories.value = next
    const results = await eachLimited(want, HISTORY_CONCURRENCY, (id) => readStarted(id))
    if (g !== generation) return
    const done = { ...histories.value }
    const read: ChatItem[] = []
    results.forEach((r, i) => {
      const id = want[i]!
      if (r.status === 'fulfilled') {
        done[id] = { loading: false, loaded: true, error: null, truncated: r.value.truncated }
        for (const view of r.value.items) read.push({ courseId: id, view })
      } else {
        done[id] = { ...done[id]!, loading: false, error: toApiError(r.reason) }
      }
    })
    histories.value = done
    note(read)
  }

  // --- A new caller -------------------------------------------------------------
  watch(
    () => session.me?.id ?? null,
    (id) => {
      if (id === actorId) return
      generation++
      actorId = id
      memory.value = id ? loadMemory(id) : freshMemory()
      items.value = new Map()
      histories.value = {}
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
    toggle,
    courses,
    courseIds,
    courseId,
    pageCourseId,
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
    items,
    histories,
    note,
    forget,
    markSeen,
    unread,
    unreadIds,
    unreadCount,
    pending,
    historyOf,
    loadHistory,
    memory,
  }
})
