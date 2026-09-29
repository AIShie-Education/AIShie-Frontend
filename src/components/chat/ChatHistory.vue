<script setup lang="ts">
// The caller's conversations with agents, the latest activity first: in the
// course the panel asks in, or in every course they are seated in
// (me.conversations, with course_id for one course), a page at a time. Each
// says where and with whom (course code · agent), its title, where it
// stands, and whether the agent has written since the caller last read it
// (unread, which Core keeps). A conversation from before, with a person, is
// closed and not listed. Kept fresh while it is shown.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MyConversation } from '@/api/types'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { usePolling } from '@/composables/usePolling'
import { historyKey, useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { stateOf } from './chat'
import { courseLabel } from './seat'
import { LIST_POLL_MS } from './useConversationList'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{ open: [courseId: string, conversationId: string] }>()
const { t } = useI18n()
const chat = useChatStore()
const session = useSessionStore()

const key = computed(() => historyKey(chat.historyScope, chat.courseId))
const list = computed(() => (key.value ? chat.histories[key.value] : undefined))
const items = computed<MyConversation[]>(() => list.value?.items ?? [])

// Read when it is first shown, and read again, quietly, each time it is shown after.
watch(
  key,
  (k) => {
    if (k) void chat.loadHistory(k, { quiet: true }).catch(() => undefined)
  },
  { immediate: true },
)
usePolling(() => (key.value ? chat.loadHistory(key.value, { quiet: true }) : undefined), {
  intervalMs: LIST_POLL_MS,
  immediate: false,
  enabled: () => props.active && !!list.value?.loaded,
})

function where(c: MyConversation): string {
  return courseLabel(c.course, session.liveMemberships)
}
function retry() {
  if (key.value) void chat.loadHistory(key.value)
}
function more() {
  if (key.value) void chat.loadMoreHistory(key.value)
}
</script>

<template>
  <div class="chat-history">
    <div class="chat-history__scope">
      <el-radio-group v-model="chat.historyScope" size="small" :aria-label="t('chat.history.scope')">
        <el-radio-button value="course">{{ t('chat.history.thisCourse') }}</el-radio-button>
        <el-radio-button value="all">{{ t('chat.history.allCourses') }}</el-radio-button>
      </el-radio-group>
    </div>

    <AsyncState
      :loading="!!list?.loading && !list?.loaded"
      :error="list?.loaded ? null : (list?.error ?? null)"
      :empty="!!list?.loaded && !items.length"
      :empty-text="chat.historyScope === 'all' ? t('chat.history.emptyAll') : t('chat.history.empty')"
      @retry="retry"
    >
      <ul class="chat-history__list" :aria-label="t('chat.history.title')">
        <li v-for="c in items" :key="c.conversation_id">
          <button
            type="button"
            class="hist-row"
            :class="{
              'is-unread': chat.unreadIds.has(c.conversation_id),
              'is-selected': chat.conversation?.id === c.conversation_id,
            }"
            @click="emit('open', c.course.course_id, c.conversation_id)"
          >
            <span class="hist-row__line">
              <span v-if="chat.unreadIds.has(c.conversation_id)" class="hist-row__dot" aria-hidden="true" />
              <span class="hist-row__where"
                ><span class="hist-row__course">{{ where(c) }}</span> ·
                <span class="hist-row__agent">{{ c.respondent.display_name }}</span></span
              >
              <span class="hist-row__time"><TimeText :value="c.last_activity_at" relative /></span>
            </span>
            <span class="hist-row__line hist-row__sub">
              <span class="hist-row__title">{{ c.title || t('chat.history.untitled') }}</span>
              <span v-if="chat.unreadIds.has(c.conversation_id)" class="hist-row__unread">{{
                t('chat.history.unread')
              }}</span>
              <StatusTag vocab="conversationState" :value="stateOf(c)" />
            </span>
          </button>
        </li>
      </ul>
      <LoadMore :has-more="!!list?.hasMore" :loading="!!list?.loadingMore" @more="more" />
      <p v-if="list?.moreError" class="chat-history__hint" role="alert">{{ t('chat.history.moreFailed') }}</p>
    </AsyncState>
  </div>
</template>

<style scoped>
.chat-history__scope {
  margin-bottom: 10px;
}
.chat-history__hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.chat-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hist-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-item);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hist-row:hover,
.hist-row:focus-visible {
  background: var(--el-fill-color-light);
}
.hist-row.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.hist-row__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.hist-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-danger);
  flex-shrink: 0;
}
.hist-row__where {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-placeholder);
}
.hist-row__course {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--app-indigo);
}
.hist-row__agent {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.hist-row__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.hist-row__sub {
  justify-content: space-between;
}
.hist-row__title {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.hist-row.is-unread .hist-row__title {
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.hist-row__unread {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-danger);
}
</style>
