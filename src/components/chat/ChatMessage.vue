<script setup lang="ts">
// One message, laid out as an agent chat is. The agent's words take the
// whole width, with no bubble, as Markdown set for reading (its code in a
// box with its language and a copy button); the person's words are a quiet
// bubble on the right, shown as they were typed (plain text, new lines
// kept). The name is said once for a run of messages from the same author
// (grouped: the ones after it say nothing), and the time and the actions
// (copy it as Markdown; edit the person's question while it waits for its
// answer; withdraw it) show under the message on hover or focus, and always
// on a touch screen. A retracted message shows who withdrew it and why,
// never its text (Core no longer sends it).
//
// The files a message carries (attachments) are listed with it, each to
// download: the person's over their bubble, on the right, as they were sent
// with it; the agent's under its words. A retracted message shows none, as it
// shows no text (Core no longer sends them either).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationMessage } from '@/api/types'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'
import { copyText } from '@/utils/clipboard'
import '@/styles/chat-prose.css'
import { retractedBy } from './chat'
import ChatMessageFiles from './ChatMessageFiles.vue'

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
  /** The person's question waiting for its answer: it may be taken back to the composer and changed. */
  canEdit?: boolean
  editing?: boolean
  /** Follows a message by the same author closely: its name is not said again. */
  grouped?: boolean
  /** The conversation's course: its files are downloaded there. */
  courseId?: string | null
}>()
const emit = defineEmits<{ retract: []; edit: [] }>()
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
/** The files it carries, while it is not withdrawn. */
const files = computed(() => (props.message.retracted || !props.courseId ? [] : (props.message.attachments ?? [])))
/** The name over a run of messages: the agent's always; the person's only when it is not the caller's own. */
const showAuthor = computed(() => !props.grouped && (!props.fromOpener || !props.mine))

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (!props.message.body) return
  if (!(await copyText(props.message.body))) return
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = false), 1600)
}
</script>

<template>
  <article
    class="chat-msg"
    :class="{
      'is-person': fromOpener,
      'is-agent': !fromOpener,
      'is-mine': mine,
      'is-grouped': grouped,
      'is-retracted': !!message.retracted,
    }"
    :aria-label="authorName"
  >
    <header v-if="showAuthor" class="chat-msg__head">
      <span v-if="!fromOpener" class="chat-msg__mark" aria-hidden="true" />
      <span class="chat-msg__author">{{ authorName }}</span>
    </header>
    <ChatMessageFiles
      v-if="files.length && fromOpener"
      class="chat-msg__files is-before"
      :course-id="courseId!"
      :files="files"
      :retry-renditions="canRetract"
    />
    <div class="chat-msg__body">
      <template v-if="message.retracted">
        <div class="chat-msg__retracted">
          <el-icon aria-hidden="true"><RemoveFilled /></el-icon>
          <span>{{ withdrawnText }}</span>
        </div>
        <div v-if="message.retracted.reason" class="chat-msg__reason">
          {{ t('chat.message.reason', { reason: message.retracted.reason }) }}
        </div>
      </template>
      <MarkdownView v-else-if="!fromOpener" :source="message.body" code-tools class="chat-msg__markdown chat-prose" />
      <p v-else class="chat-msg__text">{{ message.body }}</p>
    </div>
    <ChatMessageFiles
      v-if="files.length && !fromOpener"
      class="chat-msg__files is-after"
      :course-id="courseId!"
      :files="files"
      :retry-renditions="canRetract"
    />
    <footer class="chat-msg__foot">
      <TimeText :value="message.created_at" class="chat-msg__time" />
      <template v-if="!message.retracted">
        <!-- No trigger keys: the tooltip would take Enter and Space from the button. -->
        <el-tooltip
          :content="copied ? t('common.actions.copied') : t('chat.message.copy')"
          placement="top"
          :trigger-keys="[]"
        >
          <button
            type="button"
            class="chat-msg__action chat-msg__copy"
            :class="{ 'is-done': copied }"
            :aria-label="t('chat.message.copy')"
            @click="copy"
          >
            <el-icon aria-hidden="true"><Check v-if="copied" /><CopyDocument v-else /></el-icon>
          </button>
        </el-tooltip>
        <el-tooltip v-if="canEdit" :content="t('chat.message.editTip')" placement="top" :trigger-keys="[]">
          <button
            type="button"
            class="chat-msg__action chat-msg__edit"
            :aria-label="t('chat.message.edit')"
            :disabled="editing"
            @click="emit('edit')"
          >
            <el-icon aria-hidden="true"><Loading v-if="editing" class="is-loading" /><EditPen v-else /></el-icon>
          </button>
        </el-tooltip>
        <el-button
          v-if="canRetract"
          link
          size="small"
          class="chat-msg__retract"
          :loading="retracting"
          @click="emit('retract')"
        >
          {{ t('chat.message.retract') }}
        </el-button>
      </template>
      <span v-if="copied" class="chat-msg__announce" role="status">{{ t('common.actions.copied') }}</span>
    </footer>
  </article>
</template>

<style scoped>
.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-width: 100%;
  min-width: 0;
}
/* The person's: on the right. */
.chat-msg.is-person {
  align-items: flex-end;
}
.chat-msg__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 2px 4px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
}
.chat-msg__mark {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-light);
}
.chat-msg__author {
  font-weight: 600;
  color: var(--app-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-msg__body {
  min-width: 0;
  max-width: 100%;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
}
/* The agent's: the whole width, no bubble. */
.chat-msg.is-agent .chat-msg__body {
  padding: 0 2px;
}
/* The person's: a quiet bubble, as wide as its words, up to most of the width. */
.chat-msg.is-person .chat-msg__body {
  max-width: min(88%, 620px);
  padding: 8px 13px;
  border-radius: 14px;
  border-bottom-right-radius: 5px;
  background: var(--app-ground-2);
  border: 1px solid var(--app-line-soft);
}
.chat-msg.is-person.is-grouped .chat-msg__body {
  border-top-right-radius: 5px;
}
/* Its files: over the person's bubble, on the right; under the agent's words. */
.chat-msg__files.is-before {
  justify-content: flex-end;
  max-width: min(88%, 620px);
  margin-bottom: 4px;
}
.chat-msg__files.is-after {
  margin-top: 8px;
  padding: 0 2px;
}
.chat-msg.is-retracted .chat-msg__body {
  padding: 8px 12px;
  border-radius: 10px;
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
/* Under the message: its time and what may be done with it. */
.chat-msg__foot {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 24px;
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.chat-msg.is-person .chat-msg__foot {
  flex-direction: row-reverse;
}
.chat-msg__time {
  margin: 0 6px 0 2px;
}
.chat-msg.is-person .chat-msg__time {
  margin: 0 2px 0 6px;
}
.chat-msg__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-ink-3);
  cursor: pointer;
}
.chat-msg__action:hover:not(:disabled) {
  background: var(--app-ground-2);
  color: var(--app-ink);
}
.chat-msg__action:focus-visible {
  outline-offset: -2px;
}
.chat-msg__action.is-done {
  color: var(--app-done-fg);
}
.chat-msg__retract {
  margin: 0 4px;
  font-size: 12px;
}
.chat-msg__announce {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
/* Where a pointer hovers, the time and the actions show on the message they are for (or while one has focus). */
@media (hover: hover) {
  .chat-msg__foot {
    opacity: 0;
    transition: opacity 0.12s;
  }
  .chat-msg:hover .chat-msg__foot,
  .chat-msg:focus-within .chat-msg__foot {
    opacity: 1;
  }
}
</style>
