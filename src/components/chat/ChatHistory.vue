<script setup lang="ts">
// The caller's conversations with agents, the latest activity first: in the
// course the panel asks in, or in every course they are seated in
// (me.conversations, with course_id for one course), a page at a time. Each
// says where and with whom (course code · agent), its title, where it
// stands where that is not the usual (answered: nothing is said), and whether
// the agent has written since the caller last read it (unread, which Core
// keeps). A conversation from before, with a person, is closed and not
// listed. Kept fresh while it is shown.
//
// Grouped by when each last moved: today, yesterday, this week, earlier; and
// searched by title and agent, among those read so far (more pages are read
// with Load more, as ever).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MyConversation } from '@/api/types'
import AiBadge from '@/components/AiBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { usePolling } from '@/composables/usePolling'
import { historyKey, useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { HISTORY_GROUPS, historyGroup, historyMatches, stateOf, type HistoryGroup } from './chat'
import { useNow } from '@/composables/useNow'
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

// --- Searching and grouping ---------------------------------------------------------
const query = ref('')
const now = useNow()
const shown = computed(() => items.value.filter((c) => historyMatches(c, query.value)))
const groups = computed(() => {
  const by = new Map<HistoryGroup, MyConversation[]>()
  for (const c of shown.value) {
    const g = historyGroup(c.last_activity_at, now.value)
    by.set(g, [...(by.get(g) ?? []), c])
  }
  return HISTORY_GROUPS.filter((g) => by.has(g)).map((g) => ({ key: g, items: by.get(g)! }))
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
    <div class="chat-history__tools">
      <el-input
        v-model="query"
        size="small"
        clearable
        class="chat-history__search"
        :placeholder="t('chat.history.search')"
        :aria-label="t('chat.history.search')"
      >
        <template #prefix
          ><el-icon aria-hidden="true"><Search /></el-icon
        ></template>
      </el-input>
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
      <p v-if="query.trim() && !shown.length" class="chat-history__none" role="status">
        {{ t('chat.history.noMatch', { q: query.trim() }) }}
      </p>
      <section v-for="g in groups" :key="g.key" class="chat-history__group" :aria-labelledby="`chat-history-${g.key}`">
        <h3 :id="`chat-history-${g.key}`" class="chat-history__heading">{{ t(`chat.history.groups.${g.key}`) }}</h3>
        <ul class="chat-history__list">
          <li v-for="c in g.items" :key="c.conversation_id">
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
                  ><span class="hist-row__course">{{ where(c) }}</span
                  >{{ t('common.sep') }}<span class="hist-row__agent">{{ c.respondent.display_name }}</span></span
                >
                <!-- Always an agent: the "AI" after its name, whole however short the name is cut. -->
                <AiBadge />
                <span class="hist-row__time"><TimeText :value="c.last_activity_at" relative /></span>
              </span>
              <span class="hist-row__line hist-row__sub">
                <span class="hist-row__title">{{ c.title || t('chat.history.untitled') }}</span>
                <span v-if="chat.unreadIds.has(c.conversation_id)" class="hist-row__unread">{{
                  t('chat.history.unread')
                }}</span>
                <!-- The usual state, answered, is no tag in a list: only what departs from it is said. -->
                <StatusTag v-if="stateOf(c) !== 'answered'" vocab="conversationState" :value="stateOf(c)" />
              </span>
            </button>
          </li>
        </ul>
      </section>
      <p v-if="query.trim() && list?.hasMore" class="chat-history__hint">{{ t('chat.history.searchLoaded') }}</p>
      <LoadMore :has-more="!!list?.hasMore" :loading="!!list?.loadingMore" @more="more" />
      <p v-if="list?.moreError" class="chat-history__hint" role="alert">{{ t('chat.history.moreFailed') }}</p>
    </AsyncState>
  </div>
</template>

<style scoped>
.chat-history__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.chat-history__search {
  flex: 1 1 160px;
  min-width: 0;
}
.chat-history__group + .chat-history__group {
  margin-top: 10px;
}
/* When each moved (today, yesterday…): a plain sub-heading in the second ink, staying while its rows scroll. */
.chat-history__heading {
  position: sticky;
  top: -12px;
  z-index: 1;
  margin: 0;
  padding: 8px 8px 6px;
  background: var(--app-page);
  font-family: var(--app-font-sans);
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  line-height: var(--app-lh-heading);
  color: var(--app-ink-2);
}
.chat-history__none {
  margin: 16px 0;
  text-align: center;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.chat-history__hint {
  margin: 0;
  text-align: center;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--el-text-color-secondary);
}
/* The conversations: rows between rules, hovered in a tint; the one shown marked at its left in the navy, as
   the side bar marks the page shown. */
.chat-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-bottom: var(--app-rule);
}
.chat-history__list > li {
  border-top: var(--app-rule);
}
.hist-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hist-row:hover {
  background: var(--el-fill-color-light);
}
.hist-row:focus-visible {
  outline-offset: -2px;
}
.hist-row.is-selected {
  box-shadow: inset 2px 0 0 var(--app-indigo);
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
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  color: var(--app-indigo);
}
.hist-row__agent {
  font-weight: var(--app-weight-strong);
  color: var(--el-text-color-primary);
}
.hist-row__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.hist-row__sub {
  justify-content: space-between;
}
.hist-row__title {
  flex: 1;
  font-size: var(--app-text-sm);
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
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  color: var(--el-color-danger);
}
</style>
