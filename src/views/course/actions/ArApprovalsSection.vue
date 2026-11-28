<script setup lang="ts">
// The reviewer-facing half of AR chat: proposals before they happen, and
// post-review of messages already posted. This is deliberately separate from
// the Core action queues below it; the two systems' ids are not interchangeable.
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeChat, type ChatApproval } from '@/api/runtimeChat'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import AppResult from '@/components/AppResult.vue'
import LoadMore from '@/components/LoadMore.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import ArApprovalsCard from './ArApprovalsCard.vue'
import {
  arApprovalInvisible,
  arApprovalMode,
  arApprovalTarget,
  readArApproval,
  type ArApprovalDetail,
  type ArApprovalResult,
} from './arApprovals'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const titleId = `ar-approvals-${useId()}`
const PAGE = 50

const rows = ref<ArApprovalDetail[]>([])
const loading = ref(false)
const failed = ref(false)
const hidden = ref(false)
const next = ref<string | null>(null)
const notice = ref<{ type: 'success' | 'info'; text: string } | null>(null)
let generation = 0
let controller: AbortController | null = null

const pending = computed(() => rows.value.filter((d) => arApprovalMode(d) === 'decision'))
const review = computed(() => rows.value.filter((d) => arApprovalMode(d) === 'review'))
const actionableCount = computed(() => pending.value.length + review.value.length)

/**
 * Lists and details are both AR reads. Detail authorization is repeated for
 * each row; an unknown/unreadable id is omitted, never replaced with Core
 * action detail and never allowed to leak another conversation's snapshot.
 */
async function readPage(after: string | undefined, append: boolean, mine: number) {
  const signal = controller?.signal
  const out = await runtimeChat.approvals(props.courseId, { state: 'pending', limit: PAGE, after, signal })
  const details = await Promise.all(
    out.approvals.map(async (listed: ChatApproval) => {
      try {
        return await readArApproval(listed, { signal })
      } catch (e) {
        if (arApprovalInvisible(e)) return null
        throw e
      }
    }),
  )
  if (mine !== generation) return
  const visible = details.filter((d): d is ArApprovalDetail => d !== null)
  rows.value = append ? [...rows.value, ...visible] : visible
  next.value = out.next
}

async function load(append: boolean) {
  if (append && (loading.value || !next.value)) return
  const mine = append ? generation : ++generation
  if (!append) {
    controller?.abort()
    controller = new AbortController()
    rows.value = []
    next.value = null
    hidden.value = false
  }
  loading.value = true
  failed.value = false
  try {
    await readPage(append ? (next.value ?? undefined) : undefined, append, mine)
  } catch (e) {
    if (mine !== generation) return
    if (arApprovalInvisible(e)) {
      // A caller with no reviewer access gets no queue and no error contents.
      hidden.value = true
      rows.value = []
      next.value = null
    } else {
      // Deliberately boolean: no raw server/provider message is retained here.
      failed.value = true
    }
  } finally {
    if (mine === generation) loading.value = false
  }
}

function reload() {
  return load(false)
}

watch(() => props.courseId, () => void reload(), { immediate: true })
onBeforeUnmount(() => {
  generation++
  controller?.abort()
})

function successText(kind: 'decision' | 'review', result: ArApprovalResult): string {
  if (kind === 'review') return t('actions.arApprovals.done.reviewed')
  switch (result.approval.state) {
    case 'approved':
      return t(
        result.approval.subject === 'answer' && arApprovalTarget(result)?.status === 'posted'
          ? 'actions.arApprovals.done.answerPosted'
          : 'actions.arApprovals.done.questionApproved',
      )
    case 'rejected':
      return t('actions.arApprovals.done.rejected')
    case 'changes_requested':
      return t('actions.arApprovals.done.changesRequested')
    default:
      // Any 2xx accepted decision is a success; never turn a response into an
      // error merely because its state is additive or not one listed above.
      return t('actions.arApprovals.done.decisionAccepted')
  }
}

function onDone(id: string, kind: 'decision' | 'review', result: ArApprovalResult) {
  rows.value = rows.value.filter((d) => d.approval.id !== id)
  notice.value = { type: 'success', text: successText(kind, result) }
  // Re-read after posting/scheduling (or an accepted replay), so the list
  // reflects the live approval rather than assuming a local state transition.
  void reload()
}

function onUnavailable(id: string) {
  rows.value = rows.value.filter((d) => d.approval.id !== id)
  notice.value = { type: 'info', text: t('actions.arApprovals.notices.unavailable') }
  void reload()
}

function onStale() {
  notice.value = { type: 'info', text: t('actions.arApprovals.notices.stale') }
  void reload()
}
</script>

<template>
  <section v-if="!hidden" class="app-card ar-approvals" :aria-labelledby="titleId">
    <div class="ar-approvals__head">
      <div>
        <h2 :id="titleId" class="app-card__title">{{ t('actions.arApprovals.title') }}</h2>
        <p class="ar-approvals__help">{{ t('actions.arApprovals.help') }}</p>
      </div>
      <RefreshButton :loading="loading" @click="reload" />
    </div>

    <el-alert
      v-if="notice?.type === 'success'"
      class="ar-approvals__notice"
      type="success"
      :title="notice.text"
      show-icon
      @close="notice = null"
    />
    <AppNote v-else-if="notice" class="ar-approvals__notice" role="status">{{ notice.text }}</AppNote>

    <el-alert
      v-if="failed && rows.length"
      class="ar-approvals__error"
      type="error"
      :title="t('actions.arApprovals.errors.read')"
      :closable="false"
      show-icon
    />
    <AppResult
      v-else-if="failed"
      kind="failed"
      :title="t('actions.arApprovals.errors.readTitle')"
      :sub-title="t('actions.arApprovals.errors.read')"
    >
      <template #extra>
        <el-button text type="primary" data-action="retry-list" @click="reload">
          {{ t('common.actions.retry') }}
        </el-button>
      </template>
    </AppResult>

    <div v-else-if="loading && !rows.length" class="ar-approvals__loading" v-loading="true" />
    <AppEmpty v-else-if="!actionableCount" :text="t('actions.arApprovals.empty')" />
    <div v-else class="ar-approvals__queues">
      <section v-if="pending.length" class="ar-approvals__queue" :aria-label="t('actions.arApprovals.decision.queue')">
        <h3>{{ t('actions.arApprovals.decision.queue') }} <span>{{ pending.length }}</span></h3>
        <ArApprovalsCard
          v-for="detail in pending"
          :key="detail.approval.id"
          :course-id="courseId"
          :detail="detail"
          @done="(kind, result) => onDone(detail.approval.id, kind, result)"
          @unavailable="onUnavailable(detail.approval.id)"
          @stale="onStale"
        />
      </section>
      <section v-if="review.length" class="ar-approvals__queue" :aria-label="t('actions.arApprovals.review.queue')">
        <h3>{{ t('actions.arApprovals.review.queue') }} <span>{{ review.length }}</span></h3>
        <ArApprovalsCard
          v-for="detail in review"
          :key="detail.approval.id"
          :course-id="courseId"
          :detail="detail"
          @done="(kind, result) => onDone(detail.approval.id, kind, result)"
          @unavailable="onUnavailable(detail.approval.id)"
          @stale="onStale"
        />
      </section>
    </div>

    <LoadMore :has-more="!!next" :loading="loading" @more="load(true)" />
  </section>
</template>

<style scoped>
.ar-approvals {
  margin-bottom: 16px;
}
.ar-approvals__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ar-approvals__help {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.ar-approvals__notice,
.ar-approvals__error {
  margin-bottom: 12px;
}
.ar-approvals__loading {
  min-height: 100px;
}
.ar-approvals__queues,
.ar-approvals__queue {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ar-approvals__queue + .ar-approvals__queue {
  margin-top: 18px;
  padding-top: 16px;
  border-top: var(--app-rule);
}
.ar-approvals__queue h3 {
  margin: 0;
  font-size: var(--app-text-md);
}
.ar-approvals__queue h3 span {
  color: var(--el-text-color-secondary);
  font-weight: normal;
}
@media (max-width: 600px) {
  .ar-approvals__head {
    align-items: center;
  }
}
</style>
