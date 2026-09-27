<script setup lang="ts">
// One action in a queue: what it is, who, what about, when; and deciding or
// reviewing it without leaving the list.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownView from '@/components/MarkdownView.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './ActionActor.vue'
import ActionTarget from './ActionTarget.vue'
import DecidePanel from './DecidePanel.vue'
import { payloadOf, str, typeLabel, type ActionRow } from './actionText'
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

    <dl class="action-card__facts">
      <div class="action-card__fact">
        <dt>{{ t('actions.fields.actor') }}</dt>
        <dd><ActionActor :member-id="action.member_id" :actor-id="action.actor_id" show-kind /></dd>
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
      <router-link :to="{ name: 'course-action', params: { courseId, actionId: action.id } }" class="action-card__details">
        {{ t('actions.link.details') }}
        <el-icon><ArrowRight /></el-icon>
      </router-link>
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
  border-radius: 10px;
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
  border-radius: 6px;
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
