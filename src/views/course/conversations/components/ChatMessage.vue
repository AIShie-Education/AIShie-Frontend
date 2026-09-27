<script setup lang="ts">
// One message. The opener's words are shown as they were typed (plain text,
// new lines kept); the respondent's, usually an agent's, as Markdown. A
// retracted message shows who withdrew it and why, never its text (Core no
// longer sends it).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationMessage } from '@/api/types'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'
import { retractedBy } from '../chat'

const props = defineProps<{
  message: ConversationMessage
  authorName: string
  /** Written by the conversation's opener (plain text) rather than its respondent (Markdown). */
  fromOpener: boolean
  mine: boolean
  myMemberId: string | null
  /** The caller may withdraw it. */
  canRetract?: boolean
  retracting?: boolean
}>()
const emit = defineEmits<{ retract: [] }>()
const { t } = useI18n()

const withdrawnBy = computed(() => retractedBy(props.message, props.myMemberId))
const withdrawnText = computed(() => {
  switch (withdrawnBy.value) {
    case 'you':
      return t('chat.message.retractedByYou')
    case 'staff':
      return t('chat.message.retractedByStaff')
    default:
      return t('chat.message.retractedBy', { name: props.authorName })
  }
})
</script>

<template>
  <div class="chat-msg" :class="{ 'is-mine': mine, 'is-retracted': !!message.retracted }">
    <div class="chat-msg__meta">
      <span class="chat-msg__author">{{ authorName }}</span>
      <TimeText :value="message.created_at" relative class="chat-msg__time" />
    </div>
    <div class="chat-msg__bubble">
      <template v-if="message.retracted">
        <div class="chat-msg__retracted">
          <el-icon aria-hidden="true"><RemoveFilled /></el-icon>
          <span>{{ withdrawnText }}</span>
        </div>
        <div v-if="message.retracted.reason" class="chat-msg__reason">
          {{ t('chat.message.reason', { reason: message.retracted.reason }) }}
        </div>
      </template>
      <MarkdownView v-else-if="!fromOpener" :source="message.body" class="chat-msg__markdown" />
      <p v-else class="chat-msg__text">{{ message.body }}</p>
    </div>
    <div v-if="canRetract && !message.retracted" class="chat-msg__actions">
      <el-button link size="small" :loading="retracting" @click="emit('retract')">
        {{ t('chat.message.retract') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 100%;
}
.chat-msg.is-mine {
  align-items: flex-end;
}
.chat-msg__meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 4px 3px;
  max-width: 100%;
}
.chat-msg__author {
  font-weight: 600;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-msg__bubble {
  max-width: min(100%, 680px);
  min-width: 0;
  padding: 9px 13px;
  border-radius: 12px;
  border-top-left-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
.chat-msg.is-mine .chat-msg__bubble {
  border-top-left-radius: 12px;
  border-top-right-radius: 4px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
}
.chat-msg.is-retracted .chat-msg__bubble {
  background: transparent;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
}
.chat-msg__text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 15px;
}
.chat-msg__markdown {
  font-size: 15px;
}
.chat-msg__markdown :deep(pre) {
  max-width: 100%;
  overflow-x: auto;
}
.chat-msg__retracted {
  display: flex;
  align-items: center;
  gap: 6px;
  font-style: italic;
  font-size: 14px;
}
.chat-msg__reason {
  margin-top: 4px;
  font-size: 13px;
  white-space: pre-wrap;
}
.chat-msg__actions {
  margin: 0 4px;
}
/* Where there is a pointer that hovers, the action shows on the message it is for. */
@media (hover: hover) {
  .chat-msg__actions {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .chat-msg:hover .chat-msg__actions,
  .chat-msg:focus-within .chat-msg__actions {
    opacity: 1;
  }
}
</style>
