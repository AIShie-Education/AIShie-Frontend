<script setup lang="ts">
// Approve or reject a proposal (action.decide), or review an action that ran
// pending review (action.review), with an optional reason or note, right
// where it is listed. Core refuses anyone deciding or reviewing their own
// action; where that can be seen here the buttons are off and say why.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import { notifyError } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import type { ApiError, WriteOutcome } from '@/api/http'
import { isAboutAction, reasonText, useJudgeRules, type ActionRow } from './actionText'
import type { Done } from './decide'
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
const needsApproval = computed(() => course.needsApproval('action_decide'))

type Choice = 'approve' | 'reject' | 'reviewed' | 'escalated'
const choice = ref<Choice | null>(null)
const text = ref('')

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
    case 'escalated':
      return t('actions.decision.confirmEscalate')
  }
  return t('actions.decision.confirmReviewed')
})
const confirmType = computed(() =>
  choice.value === 'reject' ? 'danger' : choice.value === 'escalated' ? 'warning' : 'success',
)

function stale(code: string | undefined) {
  return code === 'conflict' || code === 'not_found'
}

/**
 * Says what useWrite would have said, except when someone else got there
 * first: that is no error, and the page says so itself and refreshes. True
 * in that case.
 */
function sayUnlessStale(out: WriteOutcome<unknown> | null, err: ApiError | null): boolean {
  if (out) {
    announce(out, { success: false })
    return false
  }
  if (!err) return false
  if (stale(err.code)) return true
  notifyError(err)
  return false
}

async function confirm() {
  const c = choice.value
  if (!c) return
  const note = text.value.trim() || undefined
  if (c === 'approve' || c === 'reject') {
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
    tell(r.outcome, r.error ?? undefined)
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
  emit('done', { kind: 'reviewed', state: c })
}

/** Says what became of the proposal: executed, failed, rejected or cancelled. */
function tell(outcome: string, error?: { code: string; message: string; details?: Record<string, unknown> }) {
  switch (outcome) {
    case 'executed':
      ElMessage({ type: 'success', message: t('actions.outcome.executed') })
      break
    case 'rejected':
      ElMessage({ type: 'info', message: t('actions.outcome.rejected') })
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
          type="success"
          :plain="choice !== 'approve'"
          :size="size"
          :disabled="!!blocked || !!approveBlocked || pending"
          @click="open('approve')"
        >
          <el-icon><Check /></el-icon>
          <span>{{ t('actions.decision.approve') }}</span>
        </el-button>
        <el-button
          type="danger"
          :plain="choice !== 'reject'"
          :size="size"
          :disabled="!!blocked || pending"
          @click="open('reject')"
        >
          <el-icon><Close /></el-icon>
          <span>{{ t('actions.decision.reject') }}</span>
        </el-button>
      </template>
      <template v-else>
        <el-button
          type="success"
          :plain="choice !== 'reviewed'"
          :size="size"
          :disabled="!!blocked || pending"
          @click="open('reviewed')"
        >
          <el-icon><Select /></el-icon>
          <span>{{ t('actions.decision.reviewed') }}</span>
        </el-button>
        <el-button
          v-if="action.review_state === 'pending'"
          type="warning"
          :plain="choice !== 'escalated'"
          :size="size"
          :disabled="!!blocked || pending"
          @click="open('escalated')"
        >
          <el-icon><Warning /></el-icon>
          <span>{{ t('actions.decision.escalate') }}</span>
        </el-button>
      </template>
      <el-tooltip v-if="needsApproval && !blocked" :content="t('actions.decision.willBeProposal')" placement="top">
        <el-tag type="warning" effect="plain" size="small">{{ t('enums.level.confirm_required') }}</el-tag>
      </el-tooltip>
    </div>

    <p v-if="blocked || approveBlocked" class="decide-panel__blocked">
      <el-icon><Lock /></el-icon>
      <span>{{ t(`actions.decision.blocked.${blocked ?? approveBlocked}`) }}</span>
    </p>

    <div v-if="choice && !blocked" class="decide-panel__form">
      <p class="decide-panel__hint">{{ hint }}</p>
      <el-input
        v-model="text"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="placeholder"
        maxlength="2000"
        show-word-limit
      />
      <p v-if="needsApproval" class="decide-panel__hint decide-panel__hint--warn">
        {{ t('actions.decision.willBeProposal') }}
      </p>
      <div class="decide-panel__confirm">
        <el-button :size="size" :disabled="pending" @click="cancel">{{ t('common.actions.cancel') }}</el-button>
        <el-button :type="confirmType" :size="size" :loading="pending" @click="confirm">{{ confirmLabel }}</el-button>
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
