<script setup lang="ts">
// One conversation with an agent, or the start of one: which agent, in which
// course, who can read it, the messages, where it stands (an answer awaited,
// one waiting for approval, closed), and the composer. The caller asks
// (conversation.open for the first message, then conversation.ask) and the
// agent answers, through whatever runs it; course staff overseeing it only
// read, and may withdraw a message. Its opener may close it. Only agents are
// asked: a conversation from before in which a person was asked is closed
// (conversations_are_with_agents), and stays readable.
//
// While the caller reads it as one of the two taking part, what is shown is
// marked read in Core (useConversation's reader), so that it is not counted
// as unread on any device; staff reading it mark nothing.
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
import { fromNow } from '@/utils/format'
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
  lastSeq,
  offeredIn,
  REASON_MAX,
  roleIn,
  setDraft,
  TITLE_MAX,
  visibleToLines,
  type Availability,
  type ChatRole,
} from './chat'
import { useChatSeat } from './seat'
import { useConversation } from './useConversation'
import { useRespondents } from './useConversationList'
import ChatComposer from './ChatComposer.vue'
import ChatMessage from './ChatMessage.vue'

const props = withDefaults(
  defineProps<{
    courseId: string
    /** The conversation to show; without it, a new one with respondent. */
    conversationId?: string | null
    /** The agent a new conversation is with (conversation.respondents). */
    respondent?: Respondent | null
    /** On screen: it polls only then. */
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
}>()
const { t, locale } = useI18n()
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

const status = computed(() =>
  view.value
    ? chatStatus(view.value, props.oversee ? null : me.value, {
        now: now.value,
        empty: messages.value.length === 0,
        offered: offered.value,
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
const draftAvailability = computed<Availability | null>(() =>
  isDraft.value && props.respondent ? availabilityOf(props.respondent, now.value) : null,
)
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
  () => [lastSeq(messages.value), heldShown.value.length, status.value?.typing, status.value?.notice?.kind] as const,
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
watch(draft, (v) => setDraft(key, v))
const title = ref('')
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)

const openWrite = useWrite('conversation.open')
const askWrite = useWrite('conversation.ask')
const closeWrite = useWrite('conversation.close')
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
const elsewhere = computed(() =>
  isDraft.value ? refusedElsewhere.value : status.value?.block === 'elsewhere',
)
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
    const out = await openWrite.run(
      {
        course_id: props.courseId,
        respondent_member_id: r.member_id,
        body,
        ...(title.value.trim() ? { title: title.value.trim() } : {}),
      },
      { success: false },
    )
    if (!out) {
      // Said already, in the words every page has for such an agent.
      if (answersElsewhere(openWrite.lastError.value)) noteElsewhere()
      return
    }
    draft.value = ''
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

const canClose = computed(
  () => !!conv && seat.value.writable && status.value?.state !== 'closed' && role.value === 'opener',
)
async function close() {
  if (!conv || !props.conversationId) return
  const reason = await askReason(t('chat.close.bodyOpener'), t('chat.close.title'), t('chat.close.confirm'))
  if (reason === false) return
  const out = await closeWrite.run(
    { course_id: props.courseId, conversation_id: props.conversationId, ...(reason ? { reason } : {}) },
    { success: t('chat.close.done') },
  )
  if (!out) return
  await conv.refresh()
  emit('changed')
}

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

// --- What the line above the composer says -------------------------------------------

function availabilityText(a: Availability, name: string, lastSeenAt?: string | null): string {
  switch (a) {
    case 'never':
      return t('chat.availability.never', { name })
    case 'offline':
      return (locale.value, now.value, t('chat.availability.offline', { name, time: fromNow(lastSeenAt) }))
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
    const a = draftAvailability.value
    if (openProposed.value) return null
    if (refusedElsewhere.value) return elsewhereNotice(!!props.respondent?.is_my_delegate)
    if (a === 'never' || a === 'offline')
      return { type: 'warning', text: availabilityText(a, name, props.respondent?.last_seen_at) }
    return null
  }
  if (!n) return null
  switch (n.kind) {
    case 'waiting': {
      const sub = n.approval ? t('chat.state.waitingApproval') : undefined
      if (n.availability === 'never' || n.availability === 'offline') {
        return { type: 'warning', text: availabilityText(n.availability, name, other.value?.lastSeenAt), sub }
      }
      return { type: 'info', text: t('chat.state.waiting', { name }), sub }
    }
    case 'unavailable':
      return { type: 'warning', text: availabilityText(n.availability, name) }
    case 'elsewhere':
      return elsewhereNotice(!!view.value?.respondent.is_delegate_of_opener)
    case 'pendingApproval':
      return { type: 'info', text: t('chat.state.answerPending') }
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
</script>

<template>
  <div class="chat-pane">
    <header class="chat-pane__head">
      <div class="chat-pane__who">
        <div class="chat-pane__name-row">
          <span class="chat-pane__name">
            <template v-if="courseLabel"
              ><span class="chat-pane__course">{{ courseLabel }}</span> ·
            </template>
            <template v-if="role === 'overseer' && view">
              {{ t('chat.between', { opener: view.opener.display_name, respondent: view.respondent.display_name }) }}
            </template>
            <template v-else>{{ other?.name ?? '' }}</template>
          </span>
          <AgentBadge
            v-if="other && other.kind === 'agent'"
            :kind="other.kind"
            :owner-name="other.ownerName"
            :mine="other.mine"
          />
          <StatusTag v-if="view && status" vocab="conversationState" :value="status.state" />
        </div>
        <div v-if="view?.title" class="chat-pane__title">{{ view.title }}</div>
        <div class="chat-pane__facts">
          <PresenceText v-if="other?.kind === 'agent'" :value="other.lastSeenAt" />
          <StatusTag v-if="answerLevel" vocab="answerLevel" :value="answerLevel" />
          <el-popover placement="bottom-start" :width="300" trigger="click">
            <template #reference>
              <el-button link size="small" class="chat-pane__readers">
                <el-icon aria-hidden="true"><View /></el-icon>
                <span>{{ t('chat.visibleTo.button') }}</span>
              </el-button>
            </template>
            <div class="chat-pane__readers-body">
              <div class="chat-pane__readers-title">{{ t('chat.visibleTo.title') }}</div>
              <ul>
                <li v-for="(line, i) in visibleLines" :key="i">
                  {{ 'key' in line ? t(`chat.visibleTo.${line.key}`) : line.text }}
                </li>
              </ul>
              <p class="app-muted">{{ t('chat.visibleTo.note') }}</p>
            </div>
          </el-popover>
        </div>
        <div v-if="sharedNote" class="chat-pane__shared">{{ t('chat.visibleTo.sharedNote') }}</div>
      </div>
      <div class="chat-pane__head-actions">
        <slot name="actions" />
        <el-button v-if="canClose" size="small" :loading="closeWrite.pending.value" @click="close">
          {{ t('chat.close.button') }}
        </el-button>
      </div>
    </header>

    <div ref="scroller" class="chat-pane__messages" @scroll.passive="onScroll">
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
            <li v-for="m in messages" :key="m.id">
              <ChatMessage
                :message="m"
                :author-name="authorName(m)"
                :from-opener="fromOpener(m)"
                :mine="m.author_member_id === me"
                :my-member-id="me"
                :can-retract="canRetract(m)"
                :retracting="retracting === m.id"
                @retract="retract(m)"
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
            <li v-if="status?.typing" class="chat-pane__typing" aria-live="polite">
              <span class="chat-pane__dots" aria-hidden="true"><i /><i /><i /></span>
              <span class="app-muted">{{ t('chat.typing', { name: other?.name ?? '' }) }}</span>
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
        <div v-else class="chat-pane__intro app-muted">
          <p>{{ t('chat.new.intro', { name: respondent.display_name }) }}</p>
          <p v-if="respondent.is_my_delegate">{{ t('chat.new.yourAgent') }}</p>
        </div>
      </template>
    </div>

    <footer class="chat-pane__foot">
      <div v-if="conv && conv.failures.value >= 2" class="chat-pane__trouble">
        <el-icon aria-hidden="true"><WarningFilled /></el-icon>{{ t('chat.trouble') }}
      </div>
      <div
        v-if="notice"
        class="chat-pane__notice"
        :class="[`is-${notice.type}`, { 'is-elsewhere': elsewhere, 'is-alone': readOnly }]"
        role="status"
      >
        <el-icon aria-hidden="true">
          <WarningFilled v-if="notice.type === 'warning'" />
          <InfoFilled v-else />
        </el-icon>
        <div>
          <div>{{ notice.text }}</div>
          <div v-if="notice.sub" class="chat-pane__notice-sub">{{ notice.sub }}</div>
        </div>
      </div>

      <div v-if="status?.state === 'closed'" class="chat-pane__closed">
        <div>
          <strong>{{ t('chat.closed.title') }}</strong>
          <div v-if="closedReason" class="chat-pane__closed-reason">{{ closedReason }}</div>
          <div class="app-muted">{{ t('chat.closed.readOnly') }}</div>
          <div v-if="closedElsewhere" class="app-muted chat-pane__closed-elsewhere">
            {{ t('common.agent.externalNote') }}
          </div>
        </div>
        <el-button v-if="canStartAgain" type="primary" plain size="small" @click="startAgain">
          {{ t('chat.closed.startNew') }}
        </el-button>
      </div>
      <template v-else-if="!(isDraft && openProposed)">
        <p v-if="blockText" class="chat-pane__blocked app-muted">{{ blockText }}</p>
        <template v-if="!readOnly && !elsewhere">
          <el-input
            v-if="isDraft"
            v-model="title"
            size="small"
            class="chat-pane__title-input"
            :maxlength="TITLE_MAX"
            :placeholder="t('chat.new.titlePlaceholder')"
            :aria-label="t('chat.new.titlePlaceholder')"
            :disabled="!seat.writable"
          />
          <ChatComposer
            ref="composer"
            v-model="draft"
            :placeholder="placeholder"
            :disabled="writeBlocked"
            :pending="sending"
            @send="send"
          />
        </template>
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
.chat-pane__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.chat-pane__who {
  min-width: 0;
  flex: 1;
}
.chat-pane__name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.chat-pane__course {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--app-indigo);
}
.chat-pane__name {
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.chat-pane__title {
  margin-top: 2px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.chat-pane__facts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 4px;
}
.chat-pane__shared {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
.chat-pane__readers {
  gap: 4px;
}
.chat-pane__readers-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.chat-pane__readers-body ul {
  margin: 0 0 8px;
  padding-left: 18px;
  line-height: 1.6;
}
.chat-pane__readers-body p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.chat-pane__head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
.chat-pane__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.chat-pane__typing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.chat-pane__dots {
  display: inline-flex;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--app-radius-item);
  border-top-left-radius: 4px;
  background: var(--el-fill-color-light);
}
.chat-pane__dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
  animation: chat-dot 1.2s infinite ease-in-out;
}
.chat-pane__dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.chat-pane__dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes chat-dot {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-pane__dots i {
    animation: none;
    opacity: 0.6;
  }
}
.chat-pane__foot {
  padding: 10px 16px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.chat-pane__trouble {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-danger);
  margin-bottom: 6px;
}
.chat-pane__notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: var(--app-radius-item);
  margin-bottom: 8px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}
.chat-pane__notice .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}
.chat-pane__notice.is-warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning-dark-2);
}
.chat-pane__notice.is-info .el-icon {
  color: var(--el-color-info);
}
.chat-pane__notice-sub {
  font-size: 12px;
  opacity: 0.85;
}
/* In place of the composer: nothing follows it. */
.chat-pane__notice.is-elsewhere,
.chat-pane__notice.is-alone {
  margin-bottom: 0;
}
.chat-pane__closed-elsewhere {
  margin-top: 4px;
}
.chat-pane__closed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.chat-pane__closed-reason {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-pane__blocked {
  margin: 0 0 8px;
  font-size: 13px;
}
.chat-pane__title-input {
  margin-bottom: 8px;
}
</style>
