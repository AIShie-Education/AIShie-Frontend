<script setup lang="ts">
// A reply in a conversation (conversation.answer), as whoever decides it
// should read it: the conversation, the question it answers, and the reply
// itself, rendered. A reply answers the opener's latest message; if they have
// written again since, approving is refused, and the page says so first.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationDetail, ConversationMessage } from '@/api/types'
import AgentBadge from '@/components/AgentBadge.vue'
import IdText from '@/components/IdText.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import MaybeLink from './MaybeLink.vue'
import { payloadOf, routeFor, str, type ActionRow } from './actionText'
import { useLookup, useSpecs } from './lookups'

const props = defineProps<{ action: ActionRow; courseId: string }>()
const { t } = useI18n()
const specs = useSpecs()

const p = computed(() => payloadOf(props.action))
const conversationId = computed(() => str(p.value.conversation_id) ?? props.action.target_id ?? undefined)
const replyTo = computed(() => str(p.value.in_reply_to_message_id))
const body = computed(() => (typeof p.value.body === 'string' ? p.value.body : ''))

const conv = useLookup(() => specs.conversation(props.courseId, conversationId.value))
const msgs = useLookup(() => specs.messages(props.courseId, conversationId.value))
const c = computed(() => conv.value?.value as ConversationDetail | undefined)
const question = computed(() =>
  (msgs.value?.value as ConversationMessage[] | undefined)?.find((m) => m.id === replyTo.value),
)
const questionState = computed(() => {
  if (question.value) return 'found'
  if (!msgs.value || msgs.value.state === 'error') return 'unreadable'
  if (msgs.value.state === 'loading') return 'loading'
  return 'older'
})

const waiting = computed(() => props.action.status === 'proposed')
/** The opener has written again since the message this answers: approving would be refused. */
const movedOn = computed(
  () => !!c.value?.latest_opener_message_id && !!replyTo.value && c.value.latest_opener_message_id !== replyTo.value,
)
const closed = computed(() => c.value?.status === 'closed')
</script>

<template>
  <div class="answer-proposal">
    <template v-if="waiting">
      <el-alert
        v-if="closed"
        type="warning"
        :closable="false"
        show-icon
        class="answer-proposal__alert"
        :title="t('actions.answer.closed')"
      />
      <el-alert
        v-else-if="movedOn"
        type="warning"
        :closable="false"
        show-icon
        class="answer-proposal__alert"
        :title="t('actions.answer.movedOn')"
      />
      <p v-else class="answer-proposal__help">{{ t('actions.answer.help') }}</p>
    </template>

    <dl class="answer-proposal__facts">
      <div>
        <dt>{{ t('actions.fields.conversation_id') }}</dt>
        <dd class="answer-proposal__inline">
          <MaybeLink :to="routeFor(courseId, 'conversation', conversationId)" class="answer-proposal__title">
            <template v-if="c?.title">{{ c.title }}</template>
            <template v-else-if="c">{{ t('actions.answer.untitled') }}</template>
            <IdText v-else :id="conversationId" />
          </MaybeLink>
          <StatusTag v-if="c" vocab="conversationState" :value="c.state" />
        </dd>
      </div>
      <div v-if="c">
        <dt>{{ t('actions.answer.between') }}</dt>
        <dd class="answer-proposal__inline">
          <span>{{ c.opener.display_name }}</span>
          <span class="answer-proposal__muted">→</span>
          <span>{{ c.respondent.display_name }}</span>
          <AgentBadge :kind="c.respondent.kind" :owner-name="c.respondent.owner_name" />
        </dd>
      </div>
    </dl>

    <h3 class="answer-proposal__head">{{ t('actions.answer.question') }}</h3>
    <div v-if="question" class="answer-proposal__message">
      <div class="answer-proposal__meta">
        {{ c?.opener.display_name }} · <TimeText :value="question.created_at" relative />
      </div>
      <p v-if="question.retracted" class="answer-proposal__muted">{{ t('actions.answer.retracted') }}</p>
      <MarkdownView v-else :source="question.body ?? ''" />
    </div>
    <p v-else-if="questionState === 'loading'" class="answer-proposal__muted">{{ t('common.labels.loading') }}</p>
    <p v-else-if="questionState === 'older'" class="answer-proposal__muted">{{ t('actions.answer.older') }}</p>
    <p v-else class="answer-proposal__muted">{{ t('actions.answer.unreadable') }}</p>

    <h3 class="answer-proposal__head">{{ t('actions.answer.reply') }}</h3>
    <div class="answer-proposal__message answer-proposal__message--reply">
      <MarkdownView :source="body" />
    </div>
  </div>
</template>

<style scoped>
.answer-proposal {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.answer-proposal__help {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.answer-proposal__alert :deep(.el-alert__title) {
  line-height: 1.5;
}
.answer-proposal__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.answer-proposal__facts > div {
  display: grid;
  grid-template-columns: minmax(96px, 30%) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.answer-proposal__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.answer-proposal__facts dd {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
}
.answer-proposal__inline {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.answer-proposal__title {
  font-weight: 500;
}
.answer-proposal__head {
  margin: 8px 0 0;
  font-size: 14px;
  font-weight: 600;
}
.answer-proposal__message {
  max-height: 360px;
  overflow: auto;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}
.answer-proposal__message--reply {
  border-left: 3px solid var(--el-color-primary);
}
.answer-proposal__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.answer-proposal__muted {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
@media (max-width: 600px) {
  .answer-proposal__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
