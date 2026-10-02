<script setup lang="ts">
// One action in a queue: what it is, who, what about, when, and the proposal
// it revises, if it revises one sent back for changes; and deciding or
// reviewing it without leaving the list. A proposal of the caller's own, or of
// an agent of theirs, may be taken back here while it waits (action.withdraw).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { announce, useWrite } from '@/composables/useWrite'
import { notifyError } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import MarkdownView from '@/components/MarkdownView.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './ActionActor.vue'
import ActionTarget from './ActionTarget.vue'
import DecidePanel from './DecidePanel.vue'
import RevisesLine from './RevisesLine.vue'
import { payloadOf, str, typeLabel, useJudgeRules, type ActionRow } from './actionText'
import type { Done } from './decide'

const props = defineProps<{
  action: ActionRow
  courseId: string
  mode: 'decide' | 'review'
  /** The caller's own decision on this is waiting for approval. */
  waiting?: string | null
}>()
const emit = defineEmits<{ done: [Done] }>()
const { t } = useI18n()
const course = useCourseStore()
const rules = useJudgeRules()

// --- Taking it back ------------------------------------------------------------
/** The caller's own agent's, taken back as its owner; or the caller's own. */
const ownersAgent = computed(() => rules.isOwnAgent(props.action))
const canWithdraw = computed(
  () =>
    props.mode === 'decide' &&
    props.action.status === 'proposed' &&
    course.writable &&
    (ownersAgent.value || rules.isMine(props.action)),
)
const withdrawW = useWrite('action.withdraw')
async function withdraw() {
  const agent = ownersAgent.value
  try {
    await ElMessageBox.confirm(
      t(agent ? 'actions.withdraw.confirmAgent' : 'actions.withdraw.confirm'),
      t(agent ? 'actions.withdraw.titleAgent' : 'actions.withdraw.title'),
      { type: 'warning', confirmButtonText: t('actions.withdraw.action'), cancelButtonText: t('common.actions.cancel') },
    )
  } catch {
    return
  }
  const out = await withdrawW.run({ course_id: props.courseId, action_id: props.action.id }, { notify: false })
  if (!out) {
    const e = withdrawW.lastError.value
    // Decided, or taken back, meanwhile: the page reads the queue again.
    if (e && (e.code === 'conflict' || e.code === 'not_found')) emit('done', { kind: 'stale' })
    else if (e) notifyError(e)
    return
  }
  announce(out, { success: t(agent ? 'actions.withdraw.doneAgent' : 'actions.withdraw.done') })
  emit('done', { kind: 'withdrawn', byOwner: agent })
}

const p = computed(() => payloadOf(props.action))
/** A line of what was said with it: feedback, a reason, a note, or the text handed in. */
/** A message written in a conversation is the thing decided: shown whole, as it would be read. */
const message = computed(() =>
  props.action.action_type.startsWith('conversation.') ? (str(p.value.body) ?? null) : null,
)
const excerpt = computed(() => {
  const s = str(p.value.feedback) ?? str(p.value.reason) ?? str(p.value.note) ?? str(p.value.body) ?? str(p.value.body_md)
  return s ? s.replace(/\s+/g, ' ').trim() : null
})
</script>

<template>
  <article class="action-card">
    <header class="action-card__head">
      <div class="action-card__type">
        <router-link :to="{ name: 'course-action', params: { courseId, actionId: action.id } }" class="action-card__title">
          {{ typeLabel(action.action_type) }}
        </router-link>
        <StatusTag v-if="mode === 'review'" vocab="reviewState" :value="action.review_state" />
        <router-link
          v-if="waiting"
          :to="{ name: 'course-action', params: { courseId, actionId: waiting } }"
          class="action-card__waiting"
        >
          <el-tag type="info" size="small" effect="plain">
            <el-icon><Clock /></el-icon> {{ t('actions.decision.proposedNotice') }}
          </el-tag>
        </router-link>
      </div>
      <span class="action-card__when"><TimeText :value="action.created_at" relative /></span>
    </header>

    <RevisesLine v-if="action.revises_action_id" :course-id="courseId" :action-id="action.revises_action_id" />

    <dl class="action-card__facts">
      <div class="action-card__fact">
        <dt>{{ t('actions.fields.actor') }}</dt>
        <dd><ActionActor :member-id="action.member_id" :actor-id="action.actor_id" /></dd>
      </div>
      <div class="action-card__fact">
        <dt>{{ t('actions.fields.target') }}</dt>
        <dd><ActionTarget :action="action" :course-id="courseId" link :quote="!message" /></dd>
      </div>
      <div v-if="mode === 'review' && action.review_state === 'escalated' && action.reviewed_by_member_id" class="action-card__fact">
        <dt>{{ t('enums.reviewState.escalated') }}</dt>
        <dd class="action-card__inline">
          <ActionActor :member-id="action.reviewed_by_member_id" />
          <TimeText :value="action.reviewed_at" relative />
        </dd>
      </div>
      <div v-else-if="mode === 'review'" class="action-card__fact">
        <dt>{{ t('actions.fields.executed') }}</dt>
        <dd><TimeText :value="action.executed_at" relative /></dd>
      </div>
    </dl>

    <div v-if="message" class="action-card__message"><MarkdownView :source="message" /></div>
    <p v-else-if="excerpt" class="action-card__excerpt">{{ excerpt }}</p>

    <footer class="action-card__foot">
      <DecidePanel
        :action="action"
        :course-id="courseId"
        :mode="mode"
        :waiting="waiting"
        size="small"
        @done="(d) => emit('done', d)"
      />
      <div class="action-card__side">
        <el-button
          v-if="canWithdraw"
          size="small"
          :loading="withdrawW.pending.value"
          class="action-card__withdraw"
          @click="withdraw"
        >
          <el-icon><RefreshLeft /></el-icon>
          <span>{{ t('actions.withdraw.action') }}</span>
        </el-button>
        <router-link :to="{ name: 'course-action', params: { courseId, actionId: action.id } }" class="action-card__details">
          {{ t('actions.link.details') }}
          <el-icon><ArrowRight /></el-icon>
        </router-link>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.action-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--app-radius-card);
  background: var(--el-bg-color);
  min-width: 0;
}
.action-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.action-card__type {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.action-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-decoration: none;
}
.action-card__title:hover {
  color: var(--el-color-primary);
}
.action-card__waiting {
  text-decoration: none;
}
.action-card__when {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.action-card__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.action-card__fact {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.action-card__fact dt {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.action-card__fact dd {
  margin: 0;
  min-width: 0;
}
.action-card__inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.action-card__message {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 6px 12px;
  border-radius: var(--app-radius-control);
  background: var(--el-fill-color-lighter);
  border-left: 3px solid var(--el-color-primary);
}
.action-card__message :deep(.markdown-body) {
  font-size: 13px;
}
.action-card__excerpt {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-lighter);
  border-left: 3px solid var(--el-border-color);
  padding: 6px 10px;
  border-radius: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.action-card__foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.action-card__foot > :first-child {
  flex: 1 1 280px;
}
.action-card__side {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.action-card__details {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
  padding-top: 4px;
}
</style>
