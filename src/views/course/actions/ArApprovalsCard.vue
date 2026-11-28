<script setup lang="ts">
// One AR-owned chat proposal or post-review item. Its id is only ever sent to
// runtimeChat.approval's decision/review routes, never to Core's action tools.
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { chatIdempotencyKey, downloadChatApprovalAttachmentBytes, runtimeChat } from '@/api/runtimeChat'
import AppTag from '@/components/AppTag.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'
import ArMessageSources from '@/components/chat/ArMessageSources.vue'
import { formatBytes } from '@/utils/format'
import {
  arApprovalMode,
  arApprovalQuestion,
  arApprovalTarget,
  arApprovalInvisible,
  arApprovalStale,
  arReviewerConfirmationRequired,
  type ArApprovalDetail,
  type ArApprovalResult,
} from './arApprovals'

type Decision = 'approve' | 'reject' | 'changes_requested'
type DoneKind = 'decision' | 'review'

const props = defineProps<{ courseId: string; detail: ArApprovalDetail }>()
const emit = defineEmits<{
  done: [kind: DoneKind, result: ArApprovalResult]
  /** Unknown or not visible to this reviewer: remove it without exposing it. */
  unavailable: []
  /** Settled or changed elsewhere: read the queue again. */
  stale: []
}>()
const { t } = useI18n()

const approval = computed(() => props.detail.approval)
const target = computed(() => arApprovalTarget(props.detail))
const question = computed(() => arApprovalQuestion(props.detail))
const answer = computed(() => (target.value?.role === 'assistant' ? target.value : null))
const mode = computed(() => arApprovalMode(props.detail))
const files = computed(() => question.value?.attachments ?? [])
const sourceCount = computed(() => new Set((answer.value?.sources ?? []).map((s) => s.document_id)).size)

const choice = ref<Decision | null>(null)
const reason = ref('')
const pending = ref(false)
const error = ref('')
const field = useTemplateRef<{ focus: () => void }>('field')
const uid = useId()
const hintId = `${uid}-hint`
const reasonErrorId = `${uid}-reason-error`

const reasonMissing = computed(() => choice.value === 'changes_requested' && !reason.value.trim())
const reasonTooLong = computed(() => Array.from(reason.value.trim()).length > 500)
const reasonInvalid = computed(() => reasonMissing.value || reasonTooLong.value)
const describedBy = computed(() => (reasonInvalid.value ? `${hintId} ${reasonErrorId}` : hintId))
const hint = computed(() => (choice.value ? t(`actions.arApprovals.hints.${choice.value}`) : ''))
const confirmLabel = computed(() => {
  switch (choice.value) {
    case 'approve':
      return t('actions.arApprovals.confirmApprove')
    case 'reject':
      return t('actions.arApprovals.confirmReject')
    case 'changes_requested':
      return t('actions.arApprovals.confirmChanges')
    default:
      return ''
  }
})

async function open(next: Decision) {
  if (pending.value) return
  if (choice.value !== next) reason.value = ''
  choice.value = next
  error.value = ''
  if (next === 'approve') return
  await nextTick()
  field.value?.focus()
}

function cancel() {
  if (pending.value) return
  choice.value = null
  reason.value = ''
  error.value = ''
}

/**
 * A key belongs to one exact intended write. A lost answer is retried with
 * that key; changing the decision or its reason is a new intention and gets a
 * new key. A successful result or a replay of it is equally a success.
 */
let intent: { fingerprint: string; key: string } | null = null
function keyFor(fingerprint: string): string {
  if (!intent || intent.fingerprint !== fingerprint) intent = { fingerprint, key: chatIdempotencyKey() }
  return intent.key
}

function failed(e: unknown, operation: DoneKind): boolean {
  if (arApprovalInvisible(e)) {
    emit('unavailable')
    return true
  }
  if (arApprovalStale(e)) {
    emit('stale')
    return true
  }
  error.value = t(
    arReviewerConfirmationRequired(e)
      ? 'actions.arApprovals.errors.reviewerConfirmationRequired'
      : `actions.arApprovals.errors.${operation}`,
  )
  return false
}

async function confirm() {
  const decision = choice.value
  if (!decision || pending.value) return
  if (reasonInvalid.value) {
    await nextTick()
    field.value?.focus()
    return
  }
  const note = reason.value.trim() || undefined
  const idempotency_key = keyFor(JSON.stringify(['decision', decision, note ?? '']))
  pending.value = true
  error.value = ''
  try {
    const result = await runtimeChat.decide(approval.value.id, { decision, reason: note, idempotency_key })
    intent = null
    choice.value = null
    reason.value = ''
    emit('done', 'decision', result)
  } catch (e) {
    failed(e, 'decision')
  } finally {
    pending.value = false
  }
}

async function review() {
  if (pending.value || mode.value !== 'review') return
  const idempotency_key = keyFor('review')
  pending.value = true
  error.value = ''
  try {
    const result = await runtimeChat.review(approval.value.id, { idempotency_key })
    intent = null
    emit('done', 'review', result)
  } catch (e) {
    failed(e, 'review')
  } finally {
    pending.value = false
  }
}

const downloading = ref<string | null>(null)
async function download(id: string, filename: string) {
  if (downloading.value) return
  downloading.value = id
  error.value = ''
  try {
    const file = await downloadChatApprovalAttachmentBytes(approval.value.id, id, { filename })
    const url = URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename
    link.style.display = 'none'
    document.body.appendChild(link)
    try {
      link.click()
    } finally {
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  } catch {
    // A reviewer 404 has no owner-route fallback; transport/provider details
    // never belong in this review interface either.
    error.value = t('actions.arApprovals.errors.download')
  } finally {
    downloading.value = null
  }
}
</script>

<template>
  <article v-if="target && mode" class="ar-approval-card" :data-approval-id="approval.id">
    <header class="ar-approval-card__head">
      <div class="ar-approval-card__title">
        <h4>{{ detail.snapshot.conversation.title || t('actions.arApprovals.untitled') }}</h4>
        <AppTag :tone="mode === 'decision' ? 'wait' : 'neutral'" size="small">
          {{ t(`actions.arApprovals.${mode}.label`) }}
        </AppTag>
      </div>
      <TimeText :value="approval.created_at" relative />
    </header>

    <section class="ar-approval-card__message" :aria-label="t('actions.arApprovals.question')">
      <h5>{{ t('actions.arApprovals.question') }}</h5>
      <p v-if="question" class="ar-approval-card__question">{{ question.body }}</p>
      <p v-else class="ar-approval-card__muted">{{ t('actions.arApprovals.questionUnavailable') }}</p>
      <ul v-if="files.length" class="ar-approval-card__files" :aria-label="t('actions.arApprovals.attachments')">
        <li v-for="file in files" :key="file.id" class="ar-approval-card__file">
          <span class="ar-approval-card__filename">{{ file.filename }}</span>
          <span class="ar-approval-card__filemeta">{{ formatBytes(file.size) }}</span>
          <el-button
            link
            type="primary"
            size="small"
            :aria-label="t('actions.arApprovals.download', { name: file.filename })"
            :aria-busy="downloading === file.id ? 'true' : undefined"
            data-action="download"
            @click="download(file.id, file.filename)"
          >
            <el-icon aria-hidden="true"><Download /></el-icon>
            {{ t('common.actions.download') }}
          </el-button>
        </li>
      </ul>
    </section>

    <section v-if="answer" class="ar-approval-card__message ar-approval-card__answer" :aria-label="t('actions.arApprovals.answer')">
      <h5>{{ t('actions.arApprovals.answer') }}</h5>
      <MarkdownView :source="answer.body" code-tools />
      <el-tooltip v-if="sourceCount" :content="t('actions.answer.sourcesTip')" placement="top">
        <p class="answer-sources ar-approval-card__source-count" tabindex="0">
          {{ t('actions.answer.sources', sourceCount) }}
        </p>
      </el-tooltip>
      <ArMessageSources
        v-if="answer.sources?.length"
        :course-id="courseId"
        :sources="answer.sources"
        class="ar-approval-card__sources"
      />
      <p v-else-if="answer.sources_stated" class="ar-approval-card__muted">{{ t('actions.arApprovals.noSources') }}</p>
    </section>

    <p v-if="mode === 'decision' && approval.subject === 'answer'" class="ar-approval-card__hint">
      {{ t('actions.arApprovals.hiddenUntilApproved') }}
    </p>
    <p v-else-if="mode === 'review'" class="ar-approval-card__hint">{{ t('actions.arApprovals.reviewHint') }}</p>
    <p v-if="approval.reason" class="ar-approval-card__reason">
      {{ t('actions.arApprovals.previousReason', { reason: approval.reason }) }}
    </p>

    <div v-if="mode === 'decision'" class="ar-approval-card__buttons">
      <el-button
        type="primary"
        :text="choice !== null && choice !== 'approve'"
        :class="{ 'is-chosen': choice === 'approve' }"
        :aria-pressed="choice === 'approve'"
        :disabled="pending"
        data-action="approve"
        @click="open('approve')"
      >
        <el-icon><Check /></el-icon>{{ t('actions.decision.approve') }}
      </el-button>
      <el-button
        :class="{ 'is-chosen': choice === 'changes_requested' }"
        :aria-pressed="choice === 'changes_requested'"
        :disabled="pending"
        data-action="changes_requested"
        @click="open('changes_requested')"
      >
        <el-icon><EditPen /></el-icon>{{ t('actions.decision.requestChanges') }}
      </el-button>
      <el-button
        :class="{ 'is-chosen': choice === 'reject' }"
        :aria-pressed="choice === 'reject'"
        :disabled="pending"
        data-action="reject"
        @click="open('reject')"
      >
        <el-icon><Close /></el-icon>{{ t('actions.decision.reject') }}
      </el-button>
    </div>
    <el-button
      v-else
      type="primary"
      :loading="pending"
      data-action="review"
      @click="review"
    >
      <el-icon><Select /></el-icon>{{ t('actions.decision.reviewed') }}
    </el-button>

    <div v-if="choice && mode === 'decision'" class="ar-approval-card__form">
      <p :id="hintId" class="ar-approval-card__hint">{{ hint }}</p>
      <el-input
        ref="field"
        v-model="reason"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        :placeholder="t(`actions.arApprovals.placeholders.${choice}`)"
        :aria-label="t(`actions.arApprovals.reasonLabels.${choice}`)"
        :aria-required="choice === 'changes_requested' ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-invalid="reasonInvalid ? 'true' : undefined"
        maxlength="500"
        show-word-limit
      />
      <p v-if="reasonInvalid" :id="reasonErrorId" class="ar-approval-card__field-error">
        {{ t(reasonMissing ? 'actions.arApprovals.reasonRequired' : 'actions.arApprovals.reasonTooLong') }}
      </p>
      <div class="ar-approval-card__confirm">
        <el-button
          type="primary"
          :loading="pending"
          :class="{ 'is-disabled': reasonInvalid }"
          :aria-disabled="reasonInvalid ? 'true' : undefined"
          :aria-describedby="reasonInvalid ? reasonErrorId : undefined"
          data-action="confirm"
          @click="confirm"
        >
          {{ confirmLabel }}
        </el-button>
        <el-button :disabled="pending" data-action="cancel" @click="cancel">{{ t('common.actions.cancel') }}</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="ar-approval-card__error"
      type="error"
      :title="error"
      :closable="false"
      show-icon
    />
  </article>
</template>

<style scoped>
.ar-approval-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius);
}
.ar-approval-card__head,
.ar-approval-card__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.ar-approval-card__title {
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  min-width: 0;
}
.ar-approval-card__title h4 {
  margin: 0;
  font-size: var(--app-text-md);
  overflow-wrap: anywhere;
}
.ar-approval-card__head > :last-child {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.ar-approval-card__message h5 {
  margin: 0 0 4px;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
}
.ar-approval-card__question {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid var(--app-line-strong);
  background: var(--app-ground-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.ar-approval-card__answer {
  padding-left: var(--app-space-md);
  border-left: 2px solid var(--app-indigo);
}
.ar-approval-card__answer :deep(.markdown-body) {
  font-size: var(--app-text-sm);
}
.ar-approval-card__files {
  display: flex;
  flex-direction: column;
  gap: 2px;
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.ar-approval-card__file {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  font-size: var(--app-text-xs);
}
.ar-approval-card__filename {
  overflow-wrap: anywhere;
  font-weight: var(--app-weight-strong);
}
.ar-approval-card__filemeta,
.ar-approval-card__muted,
.ar-approval-card__hint {
  color: var(--el-text-color-secondary);
}
.ar-approval-card__hint,
.ar-approval-card__reason {
  margin: 0;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.ar-approval-card__reason {
  color: var(--el-color-warning);
  white-space: pre-wrap;
}
.ar-approval-card__sources {
  margin-top: 6px;
}
.ar-approval-card__buttons,
.ar-approval-card__confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.ar-approval-card__buttons .el-button + .el-button,
.ar-approval-card__confirm .el-button + .el-button {
  margin-left: 0;
}
.ar-approval-card__buttons .el-button.is-chosen {
  box-shadow: inset 0 0 0 1px var(--app-indigo);
  font-weight: var(--app-weight-strong);
}
.ar-approval-card__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: var(--app-rule);
}
.ar-approval-card__confirm {
  flex-direction: row-reverse;
  justify-content: flex-start;
}
.ar-approval-card__field-error {
  margin: 0;
  color: var(--el-color-danger);
  font-size: var(--app-text-xs);
}
.ar-approval-card__error {
  padding: 8px 12px;
}
@media (max-width: 480px) {
  .ar-approval-card {
    padding: 12px;
  }
  .ar-approval-card__head {
    flex-direction: column;
  }
}
</style>
