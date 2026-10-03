<script setup lang="ts">
// What an answer relied on (its sources, AIShie-Core#69), in one quiet line
// under it, each as Core shows it to the reader now (ChatMessageSource). One
// source is named on the line ("Based on: “Week 2” · lecture2.pdf · page
// 3"); several are summed up by the first one with a title and how many
// ("Based on: “Week 2” · 3 items"), and the line opens to list them, as the
// steps of an answer in the making do (ChatDraftSteps).
//
// An answer that said it relied on no course material (an empty list) shows
// a neutral pill instead, which says on hover, focus or a tap that the agent
// said so. One that did not say (no sources: every answer from before Core
// kept them, and an agent that does not say) shows nothing, which
// ChatMessage decides.
//
// A title with no spaces (one taken from a file's name,
// "COMP1001_Lecture04_Lists_Tuples_and_Dictionaries") breaks wherever it
// must, on the line and in the summary alike: nothing in the chat scrolls
// sideways, on a phone or in the chat's window.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageSource } from '@/api/types'
import ChatMessageSource from './ChatMessageSource.vue'

const props = defineProps<{
  /** The conversation's course: the documents are read there. */
  courseId: string
  sources: MessageSource[]
}>()
const { t } = useI18n()

const open = ref(false)
const listId = `chat-sources-${Math.random().toString(36).slice(2, 9)}`
/** Several, summed up: by the first the reader is told the title of, or, with none, as many it cannot open. */
const summary = computed(() => {
  const n = props.sources.length
  const named = props.sources.find((s) => !s.restricted && s.document_id)
  return named
    ? t('chat.sources.summary', { title: t('chat.sources.quoted', { title: named.title ?? '' }), n })
    : t('chat.sources.summaryNone', { n })
})
</script>

<template>
  <div class="chat-sources">
    <el-tooltip
      v-if="!sources.length"
      :content="t('chat.sources.noneTip')"
      :trigger="['hover', 'focus']"
      placement="top"
      popper-class="app-tip-wrap"
    >
      <el-tag type="info" size="small" disable-transitions class="chat-sources__none" tabindex="0">
        {{ t('chat.sources.none') }}
      </el-tag>
    </el-tooltip>
    <i18n-t
      v-else-if="sources.length === 1"
      keypath="chat.sources.basedOn"
      tag="p"
      scope="global"
      class="chat-sources__line"
    >
      <template #source><ChatMessageSource :course-id="courseId" :source="sources[0]!" /></template>
    </i18n-t>
    <template v-else>
      <button
        type="button"
        class="chat-sources__summary"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="listId"
        @click="open = !open"
      >
        <span class="chat-sources__summary-text">{{ summary }}</span>
        <el-icon class="chat-sources__chevron" :class="{ 'is-open': open }" aria-hidden="true"><ArrowRight /></el-icon>
      </button>
      <ol v-if="open" :id="listId" class="chat-sources__list" :aria-label="t('chat.sources.label')">
        <li v-for="(s, i) in sources" :key="i" class="chat-sources__item">
          <ChatMessageSource :course-id="courseId" :source="s" />
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.chat-sources {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  margin-top: 6px;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-ink-3);
}
.chat-sources__line {
  margin: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.chat-sources__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 6px 2px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.chat-sources__summary-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.chat-sources__summary:hover {
  color: var(--app-ink);
}
.chat-sources__chevron {
  flex-shrink: 0;
  font-size: 11px;
  transition: transform 0.15s;
}
.chat-sources__chevron.is-open {
  transform: rotate(90deg);
}
/* Several, opened: listed under the line, as the steps an answer took are. */
.chat-sources__list {
  list-style: none;
  margin: 0 0 0 5px;
  padding: 0 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  border-left: 1px solid var(--app-line);
}
.chat-sources__item {
  min-width: 0;
  max-width: 100%;
}
@media (prefers-reduced-motion: reduce) {
  .chat-sources__chevron {
    transition: none;
  }
}
</style>
