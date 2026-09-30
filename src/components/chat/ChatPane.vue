<script setup lang="ts">
// One conversation with an agent, or the start of one: which agent, in which
// course, who can read it, the messages, where it stands (an answer awaited,
// one waiting for approval, closed), and the composer. The caller asks
// (conversation.open for the first message, then conversation.ask) and the
// agent answers, through whatever runs it; course staff overseeing it only
// read, and may withdraw a message. Nobody ends it here: a new question is a
// new conversation, or more in this one. Only agents are asked: a
// conversation from before in which a person was asked is closed
// (conversations_are_with_agents), as one is whose participant's seat was
// removed, or which was closed before closing was taken out of the chat; it
// stays readable.
//
// While the caller reads it as one of the two taking part, what is shown is
// marked read in Core (useConversation's reader), so that it is not counted
// as unread on any device; staff reading it mark nothing.
//
// Laid out as an editor's agent chat is: one compact row on top, the agent
// and whether anything runs it, with a ⋯ menu for who can read it and how
// its answers arrive; the messages; and the composer, one box.
// Whatever stops the caller writing (a paused or departed agent, one that
// takes no conversations here, a closed conversation, a question or a
// conversation waiting for approval) is one muted line above it, as is an
// answer being waited for; a new conversation takes its title from the first
// line of its first message.
//
// The seat it goes by is the caller's in the conversation's course, from
// their memberships: the chat is beside every page, whatever course (if any)
// the page shows.
//
// An agent operated from an external tool takes no conversations in the
// site: Core no longer offers it to be asked (conversation.respondents), and
// refuses a question to it (agent_answers_elsewhere). A conversation with one
// stays readable, and in place of the composer the opener is told why.
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ConversationMessage, ConversationView, Respondent } from '@/api/types'
import AgentBadge from '@/components/AgentBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import PresenceText from '@/components/PresenceText.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useNow } from '@/composables/useNow'
import { useWrite } from '@/composables/useWrite'
import { notifyError } from '@/composables/useErrors'
import type { ApiError } from '@/api/http'
import {
  answersElsewhere,
  availabilityOf,
  bodyProblem,
  charCount,
  chatStatus,
  cleanBody,
  closedConflict,
  draftKey,
  getDraft,
  groupedWith,
  lastSent,
  lastSeq,
  noteSent,
  offeredIn,
  questionWithdrawn,
  REASON_MAX,
  roleIn,
  setDraft,
  titleFrom,
  visibleToLines,
  type Availability,
  type ChatRole,
} from './chat'
import { useChatSeat } from './seat'
import { useConversation } from './useConversation'
import { useRespondents } from './useConversationList'
import ChatComposer, { type ComposerCommand } from './ChatComposer.vue'
import { courseMentions } from './mentions'
import ChatMessage from './ChatMessage.vue'
import ChatStatusLine from './ChatStatusLine.vue'
import ChatDraft from './ChatDraft.vue'

const props = withDefaults(
  defineProps<{
    courseId: string
    /** The conversation to show; without it, a new one with respondent. */
    conversationId?: string | null
    /** The agent a new conversation is with (conversation.respondents). */
    respondent?: Respondent | null
    /** On screen: it is kept fresh (its next messages waited for) only then. */
    active?: boolean
    /** The course, as it is named beside the agent (its code), where more than one course may be shown. */
    courseLabel?: string | null
    /** Read it as staff do, whoever the caller is in it: nothing is written, a message may be withdrawn. */
    oversee?: boolean
  }>(),
  { conversationId: null, respondent: null, active: true, courseLabel: null, oversee: false },
)
const emit = defineEmits<{
  /** A new conversation was started: show it. */
  opened: [conversationId: string]
  /** Start a new conversation with the same respondent (this one is closed). */
  start: [respondent: Respondent]
  /** Something the lists show changed (started, closed). */
  changed: []
  /** Core has recorded that the caller read the conversation, as far as it is shown. */
  read: [conversationId: string]
  /** The composer's /new: a new conversation. */
  new: []
  /** The composer's /history: the caller's conversations. */
  history: []
}>()
const { t } = useI18n()
const seat = useChatSeat(() => props.courseId)
const now = useNow()

// This component is keyed by the conversation (or by whom a new one is for),
// so what it holds is for one conversation only.
/** The caller's seat while they read it on screen as one of the two taking part (set below, once their part is known). */
const reader = ref<string | null>(null)
const conv = props.conversationId
  ? useConversation({
      courseId: props.courseId,
      conversationId: props.conversationId,
      active: () => props.active,
      reader,
      onRead: () => emit('read', props.conversationId!),
    })
  : null
const view = computed<ConversationView | null>(() => conv?.view.value ?? null)
const messages = computed<ConversationMessage[]>(() => conv?.messages.value ?? [])
/** The answer being written, as Core sends it while the agent writes (useConversation). */
const answerDraft = computed(() => conv?.draft.value ?? null)
const me = computed(() => seat.value.memberId)
const role = computed<ChatRole>(() => {
  if (props.oversee) return 'overseer'
  return view.value ? roleIn(view.value, me.value) : 'opener'
})
watchEffect(() => {
  reader.value = props.active && view.value && role.value !== 'overseer' ? me.value : null
})

// --- Whether its agent may still be asked here -------------------------------------
// Only the opener asks, and only an agent may take no conversations in the
// site; so only then is whom the caller may ask read (and kept fresh).
const needsOffer = computed(
  () =>
    !!conv && role.value === 'opener' && view.value?.respondent.kind === 'agent' && seat.value.can('conversation_ask'),
)
const offers = useRespondents({ courseId: props.courseId, enabled: () => props.active && needsOffer.value, lazy: true })
/** Core refused a question here because the agent takes no conversations in the site. */
const refusedElsewhere = ref(false)
// Until whom one may ask has been read again since.
watch(offers.items, () => (refusedElsewhere.value = false))
/** Whether the opener may still ask the agent here; null while that is not known. */
const offered = computed<boolean | null>(() => {
  if (refusedElsewhere.value) return false
  const v = view.value
  if (!v || !needsOffer.value || !offers.loaded.value) return null
  return offeredIn(offers.items.value, v.respondent.member_id)
})

/** The question awaiting its answer was taken back: nothing is awaited. */
const withdrawn = computed(() => questionWithdrawn(messages.value, view.value?.opener.member_id))
const status = computed(() =>
  view.value
    ? chatStatus(view.value, props.oversee ? null : me.value, {
        now: now.value,
        empty: messages.value.length === 0,
        offered: offered.value,
        withdrawn: withdrawn.value,
      })
    : null,
)
const isDraft = computed(() => !props.conversationId)

// --- Who it is with -----------------------------------------------------------------

interface Party {
  name: string
  kind: string
  ownerName?: string | null
  mine?: boolean
  lastSeenAt?: string | null
  answerLevel?: string | null
}
/** The one the caller talks to (for staff reading it, the respondent). */
const other = computed<Party | null>(() => {
  if (isDraft.value) {
    const r = props.respondent
    return r
      ? {
          name: r.display_name,
          kind: r.kind,
          ownerName: r.owner_name,
          mine: r.is_my_delegate,
          lastSeenAt: r.last_seen_at,
          answerLevel: r.answer_level,
        }
      : null
  }
  const v = view.value
  if (!v) return null
  const r = v.respondent
  return {
    name: r.display_name,
    kind: r.kind,
    ownerName: r.owner_name,
    mine: role.value === 'opener' && r.is_delegate_of_opener,
    lastSeenAt: r.last_seen_at,
    answerLevel: r.answer_level,
  }
})
/** What the agent's answers go through, when not straight out. */
const answerLevel = computed(() => {
  const l = other.value?.answerLevel
  return l && l !== 'autonomous' ? l : null
})
/**
 * Whether the one answering answers other members too, before Core has said
 * (visible_to): so for anyone but the opener's own agent.
 */
const answersOthers = computed(() => {
  if (isDraft.value) return !!props.respondent && !props.respondent.is_my_delegate
  const v = view.value
  return !!v && !v.respondent.is_delegate_of_opener
})
const visibleLines = computed(() => visibleToLines(conv?.visibleTo.value, { answersOthers: answersOthers.value }))
/** The opener is told plainly when what they write may be repeated to others. */
const sharedNote = computed(
  () => role.value === 'opener' && visibleLines.value.some((l) => 'key' in l && l.key === 'respondentAnswersOthers'),
)

// --- Messages -------------------------------------------------------------------------

function authorName(m: ConversationMessage): string {
  if (m.author_member_id === me.value) return t('common.labels.you')
  const v = view.value
  if (!v) return ''
  return m.author_member_id === v.opener.member_id ? v.opener.display_name : v.respondent.display_name
}
const fromOpener = (m: ConversationMessage) => m.author_member_id === view.value?.opener.member_id
const canRetract = (m: ConversationMessage) =>
  seat.value.writable &&
  !m.retracted &&
  (m.author_member_id === me.value || (role.value === 'overseer' && seat.value.can('action_decide')))
/** Whether a message follows the one before it closely, by the same author: its name is not said again. */
const grouped = (i: number) => groupedWith(messages.value[i - 1], messages.value[i]!)
/**
 * The question the caller asked last, while it waits for its answer: it may
 * be taken back to the composer, changed and sent again (it is withdrawn,
 * which no agent answers).
 */
const pendingQuestion = computed<ConversationMessage | null>(() => {
  const last = messages.value.at(-1)
  if (!last || role.value !== 'opener' || !seat.value.writable) return null
  if (last.author_member_id !== me.value || last.retracted || !last.body) return null
  return status.value?.state === 'awaiting_answer' ? last : null
})

/** Questions the caller asked that wait for someone's approval, shown until they appear. */
interface Held {
  actionId: string
  body: string
  at: number
}
const held = ref<Held[]>([])
const heldShown = computed(() =>
  held.value.filter(
    (h) =>
      !messages.value.some(
        (m) => m.author_member_id === me.value && m.body === h.body && Date.parse(m.created_at) >= h.at - 60_000,
      ),
  ),
)

// --- Scrolling: kept at the newest while the reader is there -----------------------

const scroller = ref<HTMLElement | null>(null)
let atBottom = true
function onScroll() {
  const el = scroller.value
  if (!el) return
  atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function toBottom() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}
watch(
  () =>
    [
      lastSeq(messages.value),
      heldShown.value.length,
      status.value?.typing,
      status.value?.notice?.kind,
      answerDraft.value?.version,
    ] as const,
  (_, old) => {
    const first = !old || old[0] === null
    const mineLast = messages.value.at(-1)?.author_member_id === me.value
    if (first || atBottom || mineLast) void nextTick(toBottom)
  },
  { flush: 'post' },
)
onMounted(() => void nextTick(toBottom))

async function older() {
  if (!conv) return
  const el = scroller.value
  const before = el ? el.scrollHeight - el.scrollTop : 0
  await conv.loadOlder()
  await nextTick()
  // Keep the message that was at the top where it was.
  if (el) el.scrollTop = el.scrollHeight - before
}

// --- Writing -----------------------------------------------------------------------------

const key = draftKey(props.courseId, props.conversationId, props.respondent?.member_id)
const draft = ref(getDraft(key))
// Kept as it changes: a command (/history) may take the pane away in the same tick.
watch(draft, (v) => setDraft(key, v), { flush: 'sync' })
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)

const openWrite = useWrite('conversation.open')
const askWrite = useWrite('conversation.ask')
const retractWrite = useWrite('conversation.retract')
const sending = computed(() => openWrite.pending.value || askWrite.pending.value)
/** The new conversation is waiting for someone's approval (nothing to show until then). */
const openProposed = ref(false)

const writeBlocked = computed(() => {
  if (!seat.value.writable) return true
  if (isDraft.value) return !props.respondent || openProposed.value || refusedElsewhere.value
  if (!conv?.loaded.value) return true
  // Not known yet whether the agent may still be asked here: in a moment.
  if (needsOffer.value && offered.value === null && !offers.error.value) return true
  return !!status.value?.block
})
/** The caller writes nothing here: staff reading it, or the one asked in it. */
const readOnly = computed(() => {
  const b = status.value?.block
  return b === 'overseer' || b === 'respondent'
})
/** In place of the composer, why its agent is asked nothing here. */
const elsewhere = computed(() => (isDraft.value ? refusedElsewhere.value : status.value?.block === 'elsewhere'))
const placeholder = computed(() => t('chat.composer.askPlaceholder', { name: other.value?.name ?? '' }))
const blockText = computed(() => (seat.value.writable ? '' : t('chat.blocked.archived')))

function afterWrite(out: { reviewState: string } | null) {
  if (out?.reviewState === 'pending') ElMessage({ type: 'info', message: t('common.outcome.pendingReview') })
}

/**
 * The agent takes no conversations in the site after all (Core refused a
 * question to it): the composer gives way to why, and the lists are read
 * again, where it is no longer offered.
 */
function noteElsewhere() {
  refusedElsewhere.value = true
  void offers.refresh()
  emit('changed')
}

/** Tells the person why a question was refused (closed meanwhile, in words of its own), then reads again. */
function refused(err: ApiError | null) {
  if (!err) return
  if (closedConflict(err)) ElMessage({ type: 'warning', message: t('chat.conflict.closed'), duration: 6000 })
  else notifyError(err)
  if (answersElsewhere(err)) noteElsewhere()
  if (err.code === 'conflict') {
    void conv?.refresh()
    emit('changed')
  }
}

async function send() {
  if (writeBlocked.value || sending.value || bodyProblem(draft.value)) return
  const body = cleanBody(draft.value)
  if (isDraft.value) {
    const r = props.respondent
    if (!r) return
    const title = titleFrom(body)
    const out = await openWrite.run(
      { course_id: props.courseId, respondent_member_id: r.member_id, body, ...(title ? { title } : {}) },
      { success: false },
    )
    if (!out) {
      // Said already, in the words every page has for such an agent.
      if (answersElsewhere(openWrite.lastError.value)) noteElsewhere()
      return
    }
    draft.value = ''
    noteSent(body)
    emit('changed')
    if (out.status === 'proposed') {
      openProposed.value = true
      return
    }
    afterWrite(out)
    emit('opened', out.result.conversation_id)
    return
  }
  if (!conv || !props.conversationId || role.value !== 'opener') return
  const out = await askWrite.run(
    { course_id: props.courseId, conversation_id: props.conversationId, body },
    { success: false, notify: false },
  )
  if (!out) {
    refused(askWrite.lastError.value)
    return
  }
  draft.value = ''
  noteSent(body)
  if (out.status === 'proposed') held.value = [...held.value, { actionId: out.actionId, body, at: Date.now() }]
  afterWrite(out)
  await conv.refresh()
  composer.value?.focus()
}

const reasonValidator = (v: string | null) =>
  charCount(v ?? '') <= REASON_MAX || t('chat.reasonTooLong', { max: REASON_MAX })

async function askReason(message: string, title: string, confirm: string): Promise<string | null | false> {
  try {
    const res = await ElMessageBox.prompt(message, title, {
      inputType: 'textarea',
      inputPlaceholder: t('chat.reasonPlaceholder'),
      inputValidator: reasonValidator,
      confirmButtonText: confirm,
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
      type: 'warning',
    })
    const v = (res as { value?: string }).value?.trim()
    return v ? v : null
  } catch {
    return false
  }
}

/**
 * Takes the question waiting for its answer back to the composer: it is
 * withdrawn (conversation.retract, as its author), which no agent answers
 * (Core leaves it out of the inbox and refuses an answer to it, and a
 * runtime stops the answer it was writing), and its words are put back
 * where they can be changed and sent again. To stop the wait, or to edit.
 */
const withdrawing = ref<string | null>(null)
async function withdrawToComposer(m: ConversationMessage, why: 'edit' | 'stop') {
  if (!conv || !m.body || withdrawing.value) return
  const body = m.body
  withdrawing.value = m.id
  const out = await retractWrite.run({ course_id: props.courseId, message_id: m.id }, { success: false })
  withdrawing.value = null
  if (!out) return
  if (out.status === 'executed') {
    conv.markRetracted(m.id, me.value, null)
    draft.value = cleanBody(draft.value) ? `${body}\n\n${draft.value}` : body
    ElMessage({
      type: 'info',
      message: t(why === 'stop' ? 'chat.stop.done' : 'chat.edit.done', { name: other.value?.name ?? '' }),
      duration: 6000,
    })
    void nextTick(() => composer.value?.focus())
  }
  await conv.refresh()
}

/** Stops waiting: the question awaiting its answer, taken back to the composer (withdrawToComposer). */
function stop() {
  const q = pendingQuestion.value
  if (q) void withdrawToComposer(q, 'stop')
}

// --- The line that says an answer is being waited for -----------------------------------
/** When the question awaiting its answer was asked, on Core's clock: the line counts from it. */
const askedAt = computed(() => {
  const last = messages.value.at(-1)
  const at = last ? Date.parse(last.created_at) : NaN
  return Number.isFinite(at) ? at : null
})
/** The agent at work, where something runs it; else only that it is waited for. */
const statusLabel = computed(() => {
  const n = status.value?.notice
  const name = other.value?.name ?? ''
  if (n?.kind === 'waiting' && n.availability !== 'online') return t('chat.typing', { name })
  return t('chat.status.thinking')
})
const statusSub = computed(() => {
  const n = status.value?.notice
  return n?.kind === 'waiting' && n.approval ? t('chat.state.waitingApproval') : null
})

const retracting = ref<string | null>(null)
async function retract(m: ConversationMessage) {
  if (!conv) return
  const mine = m.author_member_id === me.value
  const reason = await askReason(
    mine ? t('chat.retract.bodyMine') : t('chat.retract.bodyStaff', { name: authorName(m) }),
    t('chat.retract.title'),
    t('chat.retract.confirm'),
  )
  if (reason === false) return
  retracting.value = m.id
  const out = await retractWrite.run(
    { course_id: props.courseId, message_id: m.id, ...(reason ? { reason } : {}) },
    { success: t('chat.retract.done') },
  )
  retracting.value = null
  if (!out) return
  if (out.status === 'executed') conv.markRetracted(m.id, me.value, reason)
  await conv.refresh()
}

/** A new conversation with the one this closed conversation was with. */
function startAgain() {
  const r = view.value?.respondent
  if (!r) return
  emit('start', {
    member_id: r.member_id,
    display_name: r.display_name,
    kind: r.kind,
    role: r.role,
    is_my_delegate: r.is_delegate_of_opener,
    // Someone else's agent answers the opener only if it answers the course.
    answers_course: r.kind === 'agent' && !r.is_delegate_of_opener,
    owner_name: r.owner_name,
    last_seen_at: r.last_seen_at,
    answer_level: r.answer_level,
  })
}

// --- What the composer offers beyond writing ------------------------------------------------
/** The slash commands: a new conversation, the history, and closing this one where the caller may. */
const commands = computed<ComposerCommand[]>(() => [
  { name: 'new', label: t('chat.commands.new') },
  { name: 'history', label: t('chat.commands.history') },
])
function onCommand(name: string) {
  if (name === 'new') emit('new')
  else if (name === 'history') emit('history')
}
/** What ↑ brings back: the last message sent from this page, else the caller's last one here. */
const recall = computed(() => {
  const sent = lastSent()
  if (sent) return sent
  const mine = [...messages.value].reverse().find((m) => m.author_member_id === me.value && !m.retracted && m.body)
  return mine?.body ?? null
})
/** What @ offers: the course's assignments and materials, as the caller may read them. */
const loadMentions = () => courseMentions(props.courseId)

/** A new conversation's first words, offered to start with. */
const suggestions = computed(() => [
  t('chat.suggestions.explainAssignment'),
  t('chat.suggestions.checkReasoning'),
  t('chat.suggestions.summarizeWeek'),
  t('chat.suggestions.practice'),
])
function suggest(text: string) {
  draft.value = text
  void nextTick(() => composer.value?.focus())
}

// --- The ⋯ menu: who can read it, how its answers arrive ---------------------------------

/** Who can read it, opened from the menu. */
const readersOpen = ref(false)
function onMenu(command: string) {
  if (command === 'readers') readersOpen.value = true
}

// --- What the line above the composer says -------------------------------------------

/** Why the agent cannot answer now (whether anything runs it is said beside its name, not here). */
function availabilityText(a: Availability, name: string): string {
  switch (a) {
    case 'gone':
      return t('chat.availability.gone', { name })
    case 'paused':
      return t('chat.availability.paused', { name })
    case 'notAnswering':
      return t('chat.availability.notAnswering', { name })
  }
  return ''
}
/** What the opener is told of an agent operated from outside; its owner, how that would change. */
function elsewhereNotice(mine: boolean) {
  return {
    type: 'info' as const,
    text: t('common.agent.externalNote'),
    sub: mine ? t('common.agent.hostedTakesChat') : undefined,
  }
}
const notice = computed<{ type: 'info' | 'warning' | 'success'; text: string; sub?: string } | null>(() => {
  const n = status.value?.notice
  const name = other.value?.name ?? ''
  if (isDraft.value) {
    if (openProposed.value) return null
    if (refusedElsewhere.value) return elsewhereNotice(!!props.respondent?.is_my_delegate)
    return null
  }
  if (!n) return null
  switch (n.kind) {
    case 'waiting':
      // Said by the status line in the messages instead.
      return null
    case 'unavailable':
      return { type: 'warning', text: availabilityText(n.availability, name) }
    case 'elsewhere':
      return elsewhereNotice(!!view.value?.respondent.is_delegate_of_opener)
    case 'pendingApproval':
      return { type: 'info', text: t('chat.state.answerPending') }
    case 'withdrawn':
      return { type: 'info', text: t('chat.state.withdrawn', { name }) }
    case 'start':
      return { type: 'info', text: t('chat.state.start', { name }) }
    case 'overseeing':
      return { type: 'info', text: t('chat.state.overseeing') }
    case 'readOnly':
      return { type: 'info', text: t('chat.state.readOnly') }
    case 'closed':
      return null
  }
  return null
})
const closedReason = computed(() => {
  const n = status.value?.notice
  if (n?.kind !== 'closed' || !n.reason) return null
  return 'code' in n.reason
    ? t(`enums.closedReason.${n.reason.code}`)
    : t('chat.closed.said', { reason: n.reason.text })
})
const canStartAgain = computed(
  () =>
    role.value === 'opener' &&
    view.value?.respondent.kind === 'agent' &&
    seat.value.can('conversation_ask') &&
    seat.value.writable &&
    offered.value !== false,
)
/**
 * A closed conversation with an agent that is asked nothing here now, though
 * its seat is there and it may answer: said instead of offering another.
 */
const closedElsewhere = computed(() => {
  const v = view.value
  if (!v || status.value?.state !== 'closed' || offered.value !== false) return false
  const a = availabilityOf(v.respondent, now.value)
  return a !== 'gone' && a !== 'paused' && a !== 'notAnswering'
})
/** The closed conversation's one line: that it is closed, why, and whether its agent is asked anything here. */
const closedLine = computed(() => {
  const parts = [{ class: 'chat-pane__closed-title', text: t('chat.closed.title') }]
  if (closedReason.value) parts.push({ class: 'chat-pane__closed-reason', text: closedReason.value })
  if (closedElsewhere.value) parts.push({ class: 'chat-pane__closed-elsewhere', text: t('common.agent.externalNote') })
  return parts
})
</script>

<template>
  <div class="chat-pane">
    <header class="chat-pane__head">
      <!-- One row: the agent, whether anything runs it, and a closed conversation's state; its title on hover. -->
      <div class="chat-pane__name-row" :title="view?.title || undefined">
        <span class="chat-pane__name">
          <template v-if="courseLabel"
            ><span class="chat-pane__course">{{ courseLabel }}</span> ·
          </template>
          <template v-if="role === 'overseer' && view">
            {{ t('chat.between', { opener: view.opener.display_name, respondent: view.respondent.display_name }) }}
          </template>
          <template v-else>{{ other?.name ?? '' }}</template>
        </span>
        <AgentBadge v-if="other && other.kind === 'agent' && other.mine" :kind="other.kind" mine />
        <span v-if="other?.kind === 'agent'" class="chat-pane__presence"
          ><PresenceText :value="other.lastSeenAt"
        /></span>
        <StatusTag v-if="status?.state === 'closed'" vocab="conversationState" :value="status.state" />
      </div>
      <div class="chat-pane__head-actions">
        <slot name="actions" />
        <el-dropdown trigger="click" placement="bottom-end" popper-class="chat-pane__menu" @command="onMenu">
          <el-button
            text
            size="small"
            class="chat-pane__more"
            :aria-label="t('chat.menu.label')"
            :title="t('chat.menu.label')"
          >
            <el-icon aria-hidden="true"><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="readers">
                <el-icon aria-hidden="true"><View /></el-icon>{{ t('chat.visibleTo.button') }}
              </el-dropdown-item>
              <el-dropdown-item v-if="answerLevel" disabled class="chat-pane__menu-level">
                <el-icon aria-hidden="true"><Stamp /></el-icon>{{ t(`enums.answerLevel.${answerLevel}`) }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <el-dialog
      v-model="readersOpen"
      :title="t('chat.visibleTo.title')"
      width="min(380px, calc(100vw - 32px))"
      append-to-body
      align-center
      class="chat-pane__readers"
    >
      <div class="chat-pane__readers-body">
        <ul>
          <li v-for="(line, i) in visibleLines" :key="i">
            {{ 'key' in line ? t(`chat.visibleTo.${line.key}`) : line.text }}
          </li>
        </ul>
        <p class="app-muted">{{ t('chat.visibleTo.note') }}</p>
      </div>
    </el-dialog>

    <div ref="scroller" class="chat-pane__messages" @scroll.passive="onScroll">
      <p v-if="conv && sharedNote" class="chat-pane__shared">{{ t('chat.visibleTo.sharedNote') }}</p>
      <template v-if="conv">
        <AsyncState :loading="conv.loading.value && !conv.loaded.value" :error="conv.error.value" @retry="conv.load()">
          <div v-if="conv.hasOlder.value" class="chat-pane__older">
            <el-button link size="small" :loading="conv.loadingOlder.value" @click="older">
              {{ t('chat.older') }}
            </el-button>
            <span v-if="conv.olderError.value" class="chat-pane__older-error">{{ t('chat.olderFailed') }}</span>
          </div>
          <div v-if="conv.loaded.value && !messages.length && !heldShown.length" class="chat-pane__empty app-muted">
            {{ role === 'opener' ? t('chat.empty.opener', { name: other?.name ?? '' }) : t('chat.empty.other') }}
          </div>
          <ul class="chat-pane__list" :aria-label="t('chat.messagesLabel')">
            <li v-for="(m, i) in messages" :key="m.id" :class="{ 'is-grouped': grouped(i) }">
              <ChatMessage
                :message="m"
                :author-name="authorName(m)"
                :from-opener="fromOpener(m)"
                :mine="m.author_member_id === me"
                :my-member-id="me"
                :grouped="grouped(i)"
                :can-retract="canRetract(m)"
                :retracting="retracting === m.id"
                :can-edit="pendingQuestion?.id === m.id"
                :editing="withdrawing === m.id"
                @retract="retract(m)"
                @edit="withdrawToComposer(m, 'edit')"
              />
            </li>
            <li v-for="h in heldShown" :key="h.actionId" class="chat-pane__held">
              <div class="chat-pane__held-bubble">
                <p class="chat-pane__held-text">{{ h.body }}</p>
              </div>
              <div class="chat-pane__held-note">
                <el-icon aria-hidden="true"><Clock /></el-icon>
                {{ t('chat.held') }}
                <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
                  t('chat.myActions')
                }}</router-link>
              </div>
            </li>
            <li v-if="status?.typing && answerDraft" class="chat-pane__typing chat-pane__draft">
              <ChatDraft :draft="answerDraft" :author-name="other?.name ?? ''" :since="askedAt" />
            </li>
            <li v-else-if="status?.typing" class="chat-pane__typing">
              <ChatStatusLine :label="statusLabel" :since="askedAt" :sub="statusSub" />
            </li>
          </ul>
        </AsyncState>
      </template>
      <template v-else-if="respondent">
        <div v-if="openProposed" class="chat-pane__intro">
          <el-result
            icon="info"
            :title="t('chat.proposed.title')"
            :sub-title="t('chat.proposed.body', { name: respondent.display_name })"
          >
            <template #extra>
              <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
                <el-button>{{ t('chat.myActions') }}</el-button>
              </router-link>
            </template>
          </el-result>
        </div>
        <div v-else class="chat-pane__intro chat-pane__start">
          <span class="chat-pane__start-mark" aria-hidden="true">✻</span>
          <p class="chat-pane__start-title">{{ t('chat.new.intro', { name: respondent.display_name }) }}</p>
          <p v-if="respondent.is_my_delegate" class="app-muted">{{ t('chat.new.yourAgent') }}</p>
          <p v-if="sharedNote" class="chat-pane__shared">{{ t('chat.visibleTo.sharedNote') }}</p>
          <div
            v-if="!writeBlocked"
            class="chat-pane__suggestions"
            role="group"
            :aria-label="t('chat.suggestions.title')"
          >
            <p class="chat-pane__suggestions-title">{{ t('chat.suggestions.title') }}</p>
            <button v-for="s in suggestions" :key="s" type="button" class="chat-pane__suggestion" @click="suggest(s)">
              {{ s }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <footer class="chat-pane__foot">
      <div v-if="conv && conv.failures.value >= 2" class="chat-pane__trouble">
        <el-icon aria-hidden="true"><WarningFilled /></el-icon>{{ t('chat.trouble') }}
      </div>
      <!-- Whatever stops the caller writing, or an answer awaited: one muted line. -->
      <p
        v-if="notice"
        class="chat-pane__notice"
        :class="[`is-${notice.type}`, { 'is-elsewhere': elsewhere, 'is-alone': readOnly }]"
        role="status"
      >
        {{ notice.text }}
        <span v-if="notice.sub" class="chat-pane__notice-sub">{{ notice.sub }}</span>
      </p>

      <div v-if="status?.state === 'closed'" class="chat-pane__closed" role="status">
        <p class="chat-pane__closed-text">
          <template v-for="(part, i) in closedLine" :key="part.class"
            >{{ i ? ' ' : '' }}<span :class="part.class">{{ part.text }}</span></template
          >
        </p>
        <el-button v-if="canStartAgain" link type="primary" size="small" @click="startAgain">
          {{ t('chat.closed.startNew') }}
        </el-button>
      </div>
      <template v-else-if="!(isDraft && openProposed)">
        <p v-if="blockText" class="chat-pane__blocked">{{ blockText }}</p>
        <ChatComposer
          v-if="!readOnly && !elsewhere"
          ref="composer"
          v-model="draft"
          :placeholder="placeholder"
          :disabled="writeBlocked"
          :pending="sending"
          :stoppable="!!pendingQuestion && !!status?.typing"
          :stopping="!!withdrawing"
          :recall="recall"
          :commands="commands"
          :load-mentions="loadMentions"
          @send="send"
          @stop="stop"
          @command="onCommand"
        />
      </template>
    </footer>
  </div>
</template>

<style scoped>
.chat-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
/* One compact row, as an editor's agent chat has it. */
.chat-pane__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 8px 6px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.chat-pane__name-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.chat-pane__course {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--app-indigo);
}
.chat-pane__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
}
/* Whether anything runs it stays whole; a long name gives way first. */
.chat-pane__presence {
  flex-shrink: 0;
}
.chat-pane__presence :deep(.presence) {
  font-size: 12px;
}
.chat-pane__head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.chat-pane__head-actions .el-button + .el-button,
.chat-pane__head-actions .el-button + .el-dropdown {
  margin-left: 0;
}
.chat-pane__more {
  padding: 5px 7px;
}
/* What it says of a conversation, muted: that an agent that answers others may repeat what is written. */
.chat-pane__shared {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.chat-pane__intro .chat-pane__shared {
  margin-top: 8px;
}
.chat-pane__readers-body ul {
  margin: 0 0 12px;
  padding-left: 18px;
  line-height: 1.6;
}
.chat-pane__readers-body p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.chat-pane__messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  overscroll-behavior: contain;
}
.chat-pane__older {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.chat-pane__older-error {
  font-size: 12px;
  color: var(--el-color-danger);
}
.chat-pane__empty,
.chat-pane__intro {
  text-align: center;
  padding: 24px 8px;
  line-height: 1.6;
}
.chat-pane__intro p {
  margin: 0 0 8px;
}
/* A new conversation: who it is with, and a few ways to begin, which fill the box. */
.chat-pane__start {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 8px 16px;
}
.chat-pane__start-mark {
  margin-bottom: 10px;
  font-size: 26px;
  line-height: 1;
  color: var(--app-light);
}
.chat-pane__start-title {
  max-width: 34ch;
  font-size: 15px;
  color: var(--app-ink-2);
}
.chat-pane__suggestions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: min(100%, 360px);
  margin-top: 18px;
}
.chat-pane__suggestions-title {
  margin: 0 0 2px !important;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-align: left;
  color: var(--el-text-color-secondary);
}
.chat-pane__suggestion {
  padding: 9px 12px;
  border: 1px solid var(--app-line);
  border-radius: 10px;
  background: var(--el-bg-color);
  color: var(--app-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.chat-pane__suggestion:hover {
  border-color: var(--app-indigo-line);
  background: var(--app-indigo-tint);
}
.chat-pane__suggestion:focus-visible {
  outline-offset: 1px;
}
.chat-pane__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
/* A run of messages by one author sits close; a new author, further apart. */
.chat-pane__list > li + li {
  margin-top: 14px;
}
.chat-pane__list > li.is-grouped {
  margin-top: 0;
}
.chat-pane__held {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.chat-pane__held-bubble {
  max-width: min(100%, 680px);
  padding: 9px 13px;
  border-radius: var(--app-radius-item);
  border-top-right-radius: 4px;
  border: 1px dashed var(--el-color-warning-light-3);
  background: var(--el-color-warning-light-9);
  overflow-wrap: anywhere;
}
.chat-pane__held-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}
.chat-pane__held-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 4px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* The working line (or the answer being written) follows the question closely. */
.chat-pane__list > li.chat-pane__typing {
  margin-top: 2px;
}
.chat-pane__foot {
  padding: 6px 12px 12px;
}
.chat-pane__trouble {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-danger);
  margin-bottom: 6px;
}
/* One muted line above the composer: whatever stops the caller writing, or an answer awaited. */
.chat-pane__notice {
  margin: 0 2px 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.chat-pane__notice-sub {
  color: var(--el-text-color-placeholder);
}
/* In place of the composer: nothing follows it. */
.chat-pane__notice.is-elsewhere,
.chat-pane__notice.is-alone {
  margin-bottom: 0;
}
.chat-pane__closed {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.chat-pane__closed-text {
  margin: 0 2px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
.chat-pane__closed-title {
  font-weight: 600;
}
.chat-pane__closed-reason {
  white-space: pre-wrap;
}
.chat-pane__closed .el-button {
  flex-shrink: 0;
}
.chat-pane__blocked {
  margin: 0 2px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
