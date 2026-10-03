<script setup lang="ts">
// An answer in the making (draft.ts), in the place the agent's answer will
// take: under the agent's name, what it is doing (ChatDraftSteps) and, where
// the caller may see it, the text so far as Markdown with a caret at its
// end, the steps done summed up in one line once the text begins. Where the
// answer needs someone's confirmation first (text_hidden), only the steps,
// and that it will show once confirmed. Between steps, before any text, the
// agent's working line (ChatStatusLine) counts the seconds since the
// question. The posted message takes its place.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentAvatar from '@/components/AgentAvatar.vue'
import AiBadge from '@/components/AiBadge.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import '@/styles/chat-prose.css'
import ChatDraftSteps from './ChatDraftSteps.vue'
import ChatStatusLine from './ChatStatusLine.vue'
import { stepDone, type ConversationDraft } from './draft'

const props = defineProps<{
  draft: ConversationDraft
  authorName: string
  /** When the question was asked (on Core's clock), for the working line. */
  since?: number | null
}>()
const { t } = useI18n()

const steps = computed(() => props.draft.steps ?? [])
const text = computed(() => (props.draft.text_hidden ? '' : (props.draft.text ?? '')))
const hidden = computed(() => !!props.draft.text_hidden)
/** Nothing running and no text yet: the working line says the agent is at it. */
const idle = computed(() => !text.value && !steps.value.some((s) => !stepDone(s)))
</script>

<template>
  <article class="chat-msg is-agent chat-draft" :aria-label="authorName" aria-busy="true">
    <header class="chat-msg__head">
      <AgentAvatar :name="authorName" size="small" />
      <span class="chat-msg__author">{{ authorName }}</span>
      <AiBadge />
    </header>
    <ChatDraftSteps v-if="steps.length" :steps="steps" :collapsed="!!text" class="chat-draft__steps" />
    <div v-if="text" class="chat-draft__text">
      <MarkdownView :source="text" code-tools class="chat-prose is-streaming" />
    </div>
    <p v-if="hidden" class="chat-draft__hidden">
      <el-icon aria-hidden="true"><Lock /></el-icon>{{ t('chat.draft.hidden') }}
    </p>
    <ChatStatusLine v-if="idle" :label="t('chat.status.thinking')" :since="since" class="chat-draft__working" />
  </article>
</template>

<style scoped>
.chat-draft {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-width: 0;
}
.chat-msg__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 2px;
  font-size: var(--app-text-xs);
  line-height: 1.4;
}
.chat-msg__author {
  font-weight: var(--app-weight-strong);
  color: var(--app-ink-2);
}
.chat-draft__steps {
  margin: 2px 2px 4px;
}
.chat-draft__text {
  padding: 0 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.chat-draft__hidden {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 2px 0;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
</style>
