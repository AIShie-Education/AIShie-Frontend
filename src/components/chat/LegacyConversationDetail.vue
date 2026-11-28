<script setup lang="ts">
// One Core v0.2.1 conversation by its own course/id pair. This reader works
// for an opener following a bookmark and for staff whose conversation.messages
// mayRead comes from oversight; it never requires the id to occur in the
// caller's own me.conversations or AR list. Reads are finite and write-free.
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { blobUrl } from '@/api/http'
import { legacyConversation, type LegacyMessagePage } from '@/api/legacyConversation'
import type { ConversationMessage, MessageAttachment } from '@/api/types'
import MarkdownView from '@/components/MarkdownView.vue'
import { formatBytes, formatDateTime } from '@/utils/format'
import { joinParts } from '@/utils/parts'

const props = withDefaults(
  defineProps<{
    courseId: string
    conversationId: string
    title?: string | null
    subtitle?: string | null
    showBack?: boolean
  }>(),
  { title: null, subtitle: null, showBack: false },
)
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()

const detail = ref<LegacyMessagePage['conversation'] | null>(null)
const messages = ref<ConversationMessage[]>([])
const hasOlder = ref(false)
const messagesLoading = ref(false)
const olderLoading = ref(false)
const messagesError = ref(false)
const openingAttachment = ref<string | null>(null)
const attachmentError = ref(false)
let messageRead = 0
let messageController: AbortController | null = null

async function readMessages(older = false) {
  if (messagesLoading.value || olderLoading.value) return
  const courseId = props.courseId
  const conversationId = props.conversationId
  const read = ++messageRead
  messageController?.abort()
  const controller = new AbortController()
  messageController = controller
  messagesError.value = false
  if (older) olderLoading.value = true
  else messagesLoading.value = true
  try {
    const out = await legacyConversation.messages(courseId, conversationId, {
      beforeSeq: older ? (messages.value[0]?.seq ?? null) : null,
      signal: controller.signal,
    })
    if (read !== messageRead || props.courseId !== courseId || props.conversationId !== conversationId) return
    detail.value = out.conversation
    if (older) {
      const byId = new Map(messages.value.map((m) => [m.id, m]))
      for (const message of out.messages) byId.set(message.id, message)
      messages.value = [...byId.values()].sort((a, b) => a.seq - b.seq)
    } else {
      messages.value = [...out.messages].sort((a, b) => a.seq - b.seq)
    }
    hasOlder.value = out.more
  } catch {
    if (read === messageRead) messagesError.value = true
  } finally {
    if (read === messageRead) {
      messagesLoading.value = false
      olderLoading.value = false
    }
  }
}

function fromOpener(message: ConversationMessage): boolean {
  return message.author_member_id === detail.value?.opener.member_id
}

function authorName(message: ConversationMessage): string {
  return fromOpener(message) ? (detail.value?.opener.display_name ?? '') : (detail.value?.respondent.display_name ?? '')
}

function safeAttachmentUrl(raw: string): string {
  const url = new URL(blobUrl(raw), window.location.href)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported attachment URL')
  return url.toString()
}

async function openAttachment(file: MessageAttachment) {
  if (openingAttachment.value) return
  openingAttachment.value = file.id
  attachmentError.value = false
  try {
    const out = await legacyConversation.attachment(props.courseId, file.id)
    // The short-lived URL is used only here, never put in an AR request or route.
    window.open(safeAttachmentUrl(out.download_url), '_blank', 'noopener,noreferrer')
  } catch {
    attachmentError.value = true
  } finally {
    openingAttachment.value = null
  }
}

watch(
  () => [props.courseId, props.conversationId],
  () => {
    messageRead++
    messageController?.abort()
    detail.value = null
    messages.value = []
    hasOlder.value = false
    messagesLoading.value = false
    olderLoading.value = false
    messagesError.value = false
    openingAttachment.value = null
    attachmentError.value = false
    void readMessages()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  messageRead++
  messageController?.abort()
})
</script>

<template>
  <article class="legacy-chat__detail" :data-legacy-conversation-id="conversationId">
    <div class="legacy-chat__detail-head">
      <button v-if="showBack" type="button" class="legacy-chat__back" @click="emit('back')">
        {{ t('legacyChat.back') }}
      </button>
      <div>
        <h2>{{ detail?.title || title || t('legacyChat.untitled') }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
        <p v-else-if="detail">{{ joinParts([detail.opener.display_name, detail.respondent.display_name]) }}</p>
      </div>
    </div>

    <p class="legacy-chat__notice">{{ t('legacyChat.readOnly') }}</p>
    <button
      v-if="hasOlder"
      type="button"
      class="legacy-chat__older"
      :disabled="olderLoading"
      @click="readMessages(true)"
    >
      {{ t('legacyChat.messages.older') }}
    </button>

    <div v-if="messagesError" class="legacy-chat__error" role="alert">
      <span>{{ t('legacyChat.error') }}</span>
      <button type="button" @click="readMessages(messages.length > 0)">{{ t('legacyChat.retry') }}</button>
    </div>
    <p v-if="messagesLoading" class="legacy-chat__status" role="status">{{ t('legacyChat.messages.loading') }}</p>

    <ol v-if="messages.length" class="legacy-chat__messages">
      <li
        v-for="message in messages"
        :key="message.id"
        class="legacy-chat__message"
        :class="{ 'is-opener': fromOpener(message) }"
        :data-legacy-message-id="message.id"
      >
        <header>
          <span class="legacy-chat__author">{{ authorName(message) }}</span>
          <time :datetime="message.created_at">{{ formatDateTime(message.created_at) }}</time>
        </header>
        <p v-if="message.retracted" class="legacy-chat__withdrawn">{{ t('legacyChat.messages.withdrawn') }}</p>
        <MarkdownView v-else-if="!fromOpener(message)" :source="message.body" />
        <p v-else class="legacy-chat__text">{{ message.body }}</p>

        <div v-if="!message.retracted && message.attachments?.length" class="legacy-chat__files">
          <h3>{{ t('legacyChat.messages.attachments') }}</h3>
          <ul>
            <li v-for="file in message.attachments" :key="file.id">
              <button
                type="button"
                class="legacy-chat__attachment"
                :aria-label="t('legacyChat.messages.openAttachment', { name: file.filename })"
                :disabled="!!openingAttachment"
                @click="openAttachment(file)"
              >
                <span>{{ file.filename }}</span>
                <span class="legacy-chat__file-meta">{{ formatBytes(file.byte_size) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </li>
    </ol>
    <p v-else-if="!messagesLoading && !messagesError" class="legacy-chat__status">
      {{ t('legacyChat.messages.empty') }}
    </p>

    <div v-if="attachmentError" class="legacy-chat__error" role="alert">
      <span>{{ t('legacyChat.messages.attachmentError') }}</span>
    </div>
    <p class="legacy-chat__notice is-bottom">{{ t('legacyChat.messages.readOnly') }}</p>
  </article>
</template>

<style scoped>
.legacy-chat__detail-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.legacy-chat__detail-head h2 {
  margin: 0;
  font-size: var(--app-text-md);
  line-height: var(--app-lh-heading);
}
.legacy-chat__detail-head p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.legacy-chat__back,
.legacy-chat__older,
.legacy-chat__error button {
  flex-shrink: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--app-indigo);
  font: inherit;
  font-size: var(--app-text-xs);
  cursor: pointer;
}
.legacy-chat__back:hover,
.legacy-chat__older:hover,
.legacy-chat__error button:hover {
  text-decoration: underline;
}
.legacy-chat__notice {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-left: 3px solid var(--app-indigo-line);
  background: var(--app-indigo-tint);
  color: var(--app-ink-2);
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.legacy-chat__notice.is-bottom {
  margin: 12px 0 0;
  border-left-color: var(--app-line);
  background: transparent;
}
.legacy-chat__status {
  margin: 12px 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
  text-align: center;
}
.legacy-chat__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0;
  color: var(--el-color-danger);
  font-size: var(--app-text-sm);
}
.legacy-chat__error button {
  color: var(--el-color-danger);
}
.legacy-chat__messages,
.legacy-chat__files ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.legacy-chat__messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.legacy-chat__message {
  min-width: 0;
  padding-bottom: 12px;
  border-bottom: var(--app-rule);
}
.legacy-chat__message > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.legacy-chat__author {
  color: var(--app-ink-2);
  font-weight: var(--app-weight-strong);
}
.legacy-chat__text {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--app-line-soft);
  border-radius: var(--app-radius);
  background: var(--app-ground-2);
  line-height: var(--app-lh-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.legacy-chat__withdrawn {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-sm);
  font-style: italic;
}
.legacy-chat__files {
  margin-top: 8px;
}
.legacy-chat__files h3 {
  margin: 0 0 4px;
  color: var(--app-ink-2);
  font-size: var(--app-text-xs);
}
.legacy-chat__attachment {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius);
  background: var(--app-page);
  color: var(--app-indigo);
  font: inherit;
  font-size: var(--app-text-sm);
  text-align: left;
  cursor: pointer;
}
.legacy-chat__attachment > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legacy-chat__file-meta {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.legacy-chat__older {
  display: block;
  margin: 10px auto;
}
.legacy-chat__detail button:disabled {
  cursor: wait;
  opacity: 0.6;
}
</style>
