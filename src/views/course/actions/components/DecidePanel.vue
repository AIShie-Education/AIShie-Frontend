<script setup lang="ts">
// Approve or reject a proposal (action.decide), or send it back for changes
// (an agent's answer in a conversation not yet: offersChanges, below), or
// review an action that ran pending review (action.review), with a reason
// or note, right where it is listed. The reason is optional, but for a request
// for changes, whose note says what to change: 1 to 2000 characters, not
// spaces alone, or Core refuses it. Core refuses anyone deciding or reviewing
// their own action; where that can be seen here the buttons are off and say
// why. The owner of the agent that did it decides it where they could have
// done it themselves, and then as their own doing of it: at once, whatever
// they hold of action_decide, so it never becomes a proposal of theirs.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import StatusTag from '@/components/StatusTag.vue'
import { notifyError } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import type { ApiError, WriteOutcome } from '@/api/http'
import { isAboutAction, reasonText, useJudgeRules, type ActionRow } from './actionText'
import type { Decision, Done } from './decide'
import { useLookup, useSpecs } from './lookups'

const props = withDefaults(
  defineProps<{
    action: ActionRow
    courseId: string
    mode: 'decide' | 'review'
    size?: 'small' | 'default'
    /** The caller's own decision on this, waiting for approval: nothing more to do here meanwhile. */
    waiting?: string | null
  }>(),
  { size: 'default' },
)
const emit = defineEmits<{ done: [Done] }>()
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()
const rules = useJudgeRules()

// A decision about a decision: whose was the action underneath?
const about = useLookup(() => (isAboutAction(props.action) ? specs.action(props.courseId, props.action.target_id) : null))
const blocked = computed(() => {
  const b = rules.block(props.action, props.mode, about.value?.value ?? null)
  return b ?? (props.waiting ? 'waiting' : null)
})
const approveBlocked = computed(() =>
  props.mode === 'decide' && !blocked.value ? rules.approveBlock(props.action, about.value?.value ?? null) : null,
)
/** The caller's own agent's: decided as its owner, at once (by_owner). */
const asOwner = computed(() => rules.isOwnAgent(props.action))
const needsApproval = computed(() => course.needsApproval('action_decide') && !asOwner.value)

type Choice = Decision | 'reviewed' | 'escalated'
const choice = ref<Choice | null>(null)
const text = ref('')

/** A request for changes says what to change: it is not sent without a note. */
const noteMissing = computed(() => choice.value === 'request_changes' && !text.value.trim())

/**
 * An agent's answer in a conversation is not sent back for changes yet. Only
 * the site's runtime runs an agent people ask in the site, and a runtime that
 * does not know of requests for changes leaves an answer sent back waiting for
 * good: until the one that does (AIShie-Agent-Runtime#52) runs wherever this
 * front end does, the answer is rejected with a reason, which the agent
 * answers again with (Core's docs/deploying.md, Migration 0028).
 */
const offersChanges = computed(() => props.action.action_type !== 'conversation.answer')

const decide = useWrite('action.decide')
const review = useWrite('action.review')
const pending = computed(() => decide.pending.value || review.pending.value)

function open(c: Choice) {
  if (choice.value !== c) text.value = ''
  choice.value = c
}
function cancel() {
  choice.value = null
  text.value = ''
}

const hint = computed(() => {
  switch (choice.value) {
    case 'approve':
      return t('actions.decision.approveHint')
    case 'reject':
      return t('actions.decision.rejectHint')
    case 'request_changes':
      return t('actions.decision.requestChangesHint')
    case 'reviewed':
      return t('actions.decision.reviewedHint')
    case 'escalated':
      return t('actions.decision.escalateHint')
  }
  return ''
})
const placeholder = computed(() => {
  switch (choice.value) {
    case 'approve':
      return t('actions.decision.reasonPlaceholder')
    case 'reject':
      return t('actions.decision.rejectPlaceholder')
    case 'request_changes':
      return t('actions.decision.requestChangesPlaceholder')
    case 'escalated':
      return t('actions.decision.escalatePlaceholder')
  }
  return t('actions.decision.notePlaceholder')
})
const confirmLabel = computed(() => {
  switch (choice.value) {
    case 'approve':
      return t('actions.decision.confirmApprove')
    case 'reject':
      return t('actions.decision.confirmReject')
    case 'request_changes':
      return t('actions.decision.confirmRequestChanges')
    case 'escalated':
      return t('actions.decision.confirmEscalate')
  }
  return t('actions.decision.confirmReviewed')
})

function stale(code: string | undefined) {
  return code === 'conflict' || code === 'not_found'
}

/**
 * Says what useWrite would have said, except when someone else got there
 * first: that is no error, and the page says so itself and refreshes. True
 * in that case. A refusal of the note (note_required, note_too_long) is said
 * in the words under actions.decision.refusal.
 */
function sayUnlessStale(out: WriteOutcome<unknown> | null, err: ApiError | null): boolean {
  if (out) {
    announce(out, { success: false })
    return false
  }
  if (!err) return false
  if (stale(err.code)) return true
  notifyError(err, undefined, { reasons: 'actions.decision.refusal' })
  return false
}

async function confirm() {
  const c = choice.value
  if (!c) return
  const note = text.value.trim() || undefined
  if (c === 'request_changes' && !note) return
  if (c === 'approve' || c === 'reject' || c === 'request_changes') {
    const out = await decide.run(
      { course_id: props.courseId, action_id: props.action.id, decision: c, reason: note },
      { notify: false },
    )
    if (sayUnlessStale(out, decide.lastError.value)) emit('done', { kind: 'stale' })
    if (!out) return
    cancel()
    if (out.status === 'proposed') {
      emit('done', { kind: 'proposed', decision: c, actionId: out.actionId })
      return
    }
    const r = out.result
    tell(r.outcome, r.error ?? undefined, r.by_owner === true)
    emit('done', { kind: 'decided', decision: c, out: r })
    return
  }
  const out = await review.run(
    { course_id: props.courseId, action_id: props.action.id, outcome: c, note },
    { notify: false },
  )
  if (sayUnlessStale(out, review.lastError.value)) emit('done', { kind: 'stale' })
  if (!out) return
  cancel()
  if (out.status === 'proposed') {
    emit('done', { kind: 'proposed', decision: c, actionId: out.actionId })
    return
  }
  ElMessage({ type: c === 'escalated' ? 'warning' : 'success', message: t(`actions.outcome.${c}`) })
  emit('done', { kind: 'reviewed', state: c, byOwner: out.result.by_owner === true })
}

/**
 * Says what became of the proposal: executed, failed, rejected, sent back for
 * changes or cancelled; and that its owner decided it.
 */
function tell(
  outcome: string,
  error?: { code: string; message: string; details?: Record<string, unknown> },
  byOwner = false,
) {
  switch (outcome) {
    case 'executed':
      ElMessage({ type: 'success', message: t(byOwner ? 'actions.outcome.executedByOwner' : 'actions.outcome.executed') })
      break
    case 'rejected':
      ElMessage({ type: 'info', message: t(byOwner ? 'actions.outcome.rejectedByOwner' : 'actions.outcome.rejected') })
      break
    case 'changes_requested':
      ElMessage({
        type: 'info',
        message: t(byOwner ? 'actions.outcome.changesRequestedByOwner' : 'actions.outcome.changes_requested'),
      })
      break
    case 'failed':
      ElNotification({
        type: 'error',
        title: t('actions.outcome.failed'),
        message: error ? `${t('actions.outcome.coreSays')}: ${error.message}` : '',
        duration: 8000,
      })
      break
    case 'cancelled':
      ElNotification({
        type: 'warning',
        title: t('actions.outcome.cancelled'),
        message: reasonText(error) ?? error?.message ?? '',
        duration: 8000,
      })
      break
  }
}
</script>

<template>
  <div class="decide-panel">
    <div class="decide-panel__buttons">
      <template v-if="mode === 'decide'">
        <el-button
          :type="!choice || choice === 'approve' ? 'primary' : undefined"
          :size="size"
          :class="{ 'is-chosen': choice === 'approve' }"
          :aria-pressed="choice === 'approve'"
          :disabled="!!blocked || !!approveBlocked || pending"
          @click="open('approve')"
        >
          <el-icon><Check /></el-icon>
          <span>{{ t('actions.decision.approve') }}</span>
        </el-button>
        <el-button
          v-if="offersChanges"
          :size="size"
          :class="{ 'is-chosen': choice === 'request_changes' }"
          :aria-pressed="choice === 'request_changes'"
          :disabled="!!blocked || pending"
          @click="open('request_changes')"
        >
          <el-icon><EditPen /></el-icon>
          <span>{{ t('actions.decision.requestChanges') }}</span>
        </el-button>
        <el-button
          :size="size"
          :class="{ 'is-chosen': choice === 'reject' }"
          :aria-pressed="choice === 'reject'"
          :disabled="!!blocked || pending"
          @click="open('reject')"
        >
          <el-icon><Close /></el-icon>
          <span>{{ t('actions.decision.reject') }}</span>
        </el-button>
      </template>
      <template v-else>
        <el-button
          :type="!choice || choice === 'reviewed' ? 'primary' : undefined"
          :size="size"
          :class="{ 'is-chosen': choice === 'reviewed' }"
          :aria-pressed="choice === 'reviewed'"
          :disabled="!!blocked || pending"
          @click="open('reviewed')"
        >
          <el-icon><Select /></el-icon>
          <span>{{ t('actions.decision.reviewed') }}</span>
        </el-button>
        <el-button
          v-if="action.review_state === 'pending'"
          :size="size"
          :class="{ 'is-chosen': choice === 'escalated' }"
          :aria-pressed="choice === 'escalated'"
          :disabled="!!blocked || pending"
          @click="open('escalated')"
        >
          <el-icon><Warning /></el-icon>
          <span>{{ t('actions.decision.escalate') }}</span>
        </el-button>
      </template>
      <el-tooltip v-if="needsApproval && !blocked" :content="t('actions.decision.willBeProposal')" placement="top">
        <StatusTag vocab="level" value="confirm_required" size="small" />
      </el-tooltip>
    </div>

    <p v-if="blocked || approveBlocked" class="decide-panel__blocked">
      <el-icon><Lock /></el-icon>
      <span>{{ t(`actions.decision.blocked.${blocked ?? approveBlocked}`) }}</span>
    </p>

    <div v-if="choice && !blocked" class="decide-panel__form">
      <p class="decide-panel__hint">{{ hint }}</p>
      <p v-if="asOwner" class="decide-panel__hint decide-panel__hint--owner">{{ t('actions.decision.asOwner') }}</p>
      <el-input
        v-model="text"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="placeholder"
        maxlength="2000"
        show-word-limit
      />
      <p v-if="noteMissing" class="decide-panel__hint">{{ t('actions.decision.noteRequired') }}</p>
      <p v-if="needsApproval" class="decide-panel__hint decide-panel__hint--warn">
        {{ t('actions.decision.willBeProposal') }}
      </p>
      <div class="decide-panel__confirm">
        <el-button :size="size" :disabled="pending" @click="cancel">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :size="size" :loading="pending" :disabled="noteMissing" @click="confirm">
          {{ confirmLabel }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decide-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.decide-panel__buttons {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.decide-panel__buttons .el-button + .el-button {
  margin-left: 0;
}
/* The choice open below, while its form asks for a reason: its button stays
   pressed in, a 2 px indigo edge on the indigo's tint, in bold, and the
   other choice is an ordinary secondary button beside it; the form's own
   button is the one primary. */
.decide-panel__buttons .el-button.is-chosen {
  --el-button-bg-color: var(--app-indigo-tint);
  --el-button-border-color: var(--app-indigo);
  --el-button-text-color: var(--app-indigo);
  --el-button-hover-bg-color: var(--app-indigo-tint);
  --el-button-hover-border-color: var(--app-indigo);
  --el-button-hover-text-color: var(--app-indigo);
  --el-button-active-bg-color: var(--app-indigo-tint);
  --el-button-active-border-color: var(--app-indigo);
  --el-button-active-text-color: var(--app-indigo);
  box-shadow: inset 0 0 0 1px var(--app-indigo);
  font-weight: 600;
}
.decide-panel__blocked {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.decide-panel__blocked .el-icon {
  margin-top: 2px;
  flex-shrink: 0;
}
.decide-panel__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}
.decide-panel__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.decide-panel__hint--owner {
  color: var(--el-color-primary);
}
.decide-panel__hint--warn {
  color: var(--el-color-warning);
}
.decide-panel__confirm {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.decide-panel__confirm .el-button + .el-button {
  margin-left: 0;
}
</style>
