<script setup lang="ts">
// The caller's conversations with agents, the latest activity first: in the
// course the panel asks in, or in every course where they may ask. Each says
// where and with whom (course code · agent), its title, where it stands, and
// whether an answer in it is unread. Core lists conversations one course at a
// time, so each course is read as it is first needed, several at once, at
// most HISTORY_COURSES_MAX of them; a course that could not be read is named.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { usePolling } from '@/composables/usePolling'
import { HISTORY_COURSES_MAX, useChatStore, type ChatItem } from '@/stores/chat'
import { stateOf } from './chat'
import { courseLabel } from './seat'
import { LIST_POLL_MS } from './useConversationList'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{ open: [courseId: string, conversationId: string] }>()
const { t } = useI18n()
const chat = useChatStore()

const ids = computed<string[]>(() => {
  if (chat.historyScope === 'all') return chat.courseIds.slice(0, HISTORY_COURSES_MAX)
  return chat.courseId ? [chat.courseId] : []
})
/** Courses left out of every course's history, past the most read at once. */
const leftOut = computed(() =>
  chat.historyScope === 'all' ? Math.max(0, chat.courseIds.length - HISTORY_COURSES_MAX) : 0,
)
watch(ids, (list) => void chat.loadHistory(list), { immediate: true })
usePolling(() => chat.loadHistory(ids.value, { force: true }), {
  intervalMs: LIST_POLL_MS,
  immediate: false,
  enabled: () => props.active,
})

const items = computed(() => chat.historyOf(ids.value))
const loading = computed(() => ids.value.some((id) => chat.histories[id]?.loading && !chat.histories[id]?.loaded))
const loaded = computed(() => ids.value.some((id) => chat.histories[id]?.loaded))
const byCourse = computed(() => new Map(chat.courses.map((m) => [m.course_id, m])))
const failed = computed(() => ids.value.filter((id) => chat.histories[id]?.error))
const truncated = computed(() => ids.value.filter((id) => chat.histories[id]?.truncated))
const names = (list: string[]) =>
  list.map((id) => (byCourse.value.get(id) ? courseLabel(byCourse.value.get(id)!, chat.courses) : id)).join(', ')
/** Every course asked could not be read: nothing to show but that. */
const allFailed = computed(() => !!ids.value.length && failed.value.length === ids.value.length && !items.value.length)

function where(it: ChatItem): string {
  const m = byCourse.value.get(it.courseId)
  return m ? courseLabel(m, chat.courses) : ''
}
function retry() {
  void chat.loadHistory(failed.value, { force: true })
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

    <el-alert v-if="failed.length && !allFailed" type="warning" :closable="false" show-icon class="chat-history__note">
      {{ t('chat.history.failed', { courses: names(failed) }) }}
      <el-button link type="primary" size="small" @click="retry">{{ t('common.actions.retry') }}</el-button>
    </el-alert>
    <p v-if="leftOut" class="chat-history__hint">
      {{ t('chat.history.leftOut', { n: HISTORY_COURSES_MAX, total: chat.courseIds.length }) }}
    </p>
    <p v-if="truncated.length" class="chat-history__hint">
      {{ t('chat.history.truncated', { courses: names(truncated) }) }}
    </p>

    <AsyncState
      :loading="loading && !loaded"
      :error="allFailed ? chat.histories[failed[0]!]?.error : null"
      :empty="loaded && !items.length"
      :empty-text="chat.historyScope === 'all' ? t('chat.history.emptyAll') : t('chat.history.empty')"
      @retry="retry"
    >
      <ul class="chat-history__list" :aria-label="t('chat.history.title')">
        <li v-for="it in items" :key="it.view.id">
          <button
            type="button"
            class="hist-row"
            :class="{
              'is-unread': chat.unreadIds.has(it.view.id),
              'is-selected': chat.conversation?.id === it.view.id,
            }"
            @click="emit('open', it.courseId, it.view.id)"
          >
            <span class="hist-row__line">
              <span v-if="chat.unreadIds.has(it.view.id)" class="hist-row__dot" aria-hidden="true" />
              <span class="hist-row__where"
                ><span class="hist-row__course">{{ where(it) }}</span> ·
                <span class="hist-row__agent">{{ it.view.respondent.display_name }}</span></span
              >
              <span class="hist-row__time"
                ><TimeText :value="it.view.last_message_at ?? it.view.created_at" relative
              /></span>
            </span>
            <span class="hist-row__line hist-row__sub">
              <span class="hist-row__title">{{ it.view.title || t('chat.history.untitled') }}</span>
              <span v-if="chat.unreadIds.has(it.view.id)" class="hist-row__unread">{{ t('chat.history.unread') }}</span>
              <StatusTag vocab="conversationState" :value="stateOf(it.view)" />
            </span>
          </button>
        </li>
      </ul>
    </AsyncState>
  </div>
</template>

<style scoped>
.chat-history__scope {
  margin-bottom: 10px;
}
.chat-history__note {
  margin-bottom: 8px;
}
.chat-history__hint {
  margin: 0 0 8px;
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
