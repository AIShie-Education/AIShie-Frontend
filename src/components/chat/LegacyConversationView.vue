<script setup lang="ts">
// A self-contained archive of Core v0.2.1 conversations. It sits below the
// AR-owned chat history without sharing its selected id, store, composer,
// draft state or SSE lifecycle. The list is read only when the section opens;
// the shared detail performs finite conversation.messages/attachment reads.
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { legacyConversation } from '@/api/legacyConversation'
import type { MyConversation } from '@/api/types'
import LegacyConversationDetail from './LegacyConversationDetail.vue'
import { formatDateTime } from '@/utils/format'
import { joinParts } from '@/utils/parts'

const props = withDefaults(
  defineProps<{
    /** Limit the archive to one course; omitted, Core lists all of the caller's own history. */
    courseId?: string | null
    /** Embedded in chat, the section starts closed and reads nothing. */
    initiallyExpanded?: boolean
  }>(),
  { courseId: null, initiallyExpanded: false },
)

const { t } = useI18n()
const titleId = useId()
const expanded = ref(props.initiallyExpanded)

const items = ref<MyConversation[]>([])
const next = ref<string | null>(null)
const listLoaded = ref(false)
const listLoading = ref(false)
const listLoadingMore = ref(false)
const listError = ref(false)
let listRead = 0
let listController: AbortController | null = null
const selected = ref<MyConversation | null>(null)

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !listLoaded.value && !listLoading.value) void loadList()
}

async function loadList(more = false) {
  if (listLoading.value || listLoadingMore.value) return
  const read = ++listRead
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  listError.value = false
  if (more) listLoadingMore.value = true
  else listLoading.value = true
  try {
    const out = await legacyConversation.list({
      courseId: props.courseId,
      after: more ? next.value : null,
      signal: controller.signal,
    })
    if (read !== listRead) return
    if (more) {
      const seen = new Set(items.value.map((c) => c.conversation_id))
      items.value = [...items.value, ...out.conversations.filter((c) => !seen.has(c.conversation_id))]
    } else {
      items.value = out.conversations
    }
    next.value = out.next
    listLoaded.value = true
  } catch {
    if (read === listRead) listError.value = true
  } finally {
    if (read === listRead) {
      listLoading.value = false
      listLoadingMore.value = false
    }
  }
}

function courseAndAgent(c: MyConversation): string {
  return joinParts([c.course.code, c.course.section, c.respondent.display_name])
}

function backToList() {
  selected.value = null
}

watch(
  () => props.courseId,
  () => {
    listRead++
    listController?.abort()
    items.value = []
    next.value = null
    listLoaded.value = false
    listLoading.value = false
    listLoadingMore.value = false
    listError.value = false
    backToList()
    if (expanded.value) void loadList()
  },
)

onMounted(() => {
  if (expanded.value && !listLoaded.value) void loadList()
})

onBeforeUnmount(() => {
  listRead++
  listController?.abort()
})

const showListEmpty = computed(
  () => listLoaded.value && !listLoading.value && !listError.value && items.value.length === 0,
)
</script>

<template>
  <section class="legacy-chat" :aria-labelledby="titleId" data-conversation-owner="core-v0.2.1">
    <header class="legacy-chat__header">
      <div class="legacy-chat__heading">
        <h2 :id="titleId">{{ t('legacyChat.title') }}</h2>
        <p>{{ t('legacyChat.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="legacy-chat__toggle"
        :aria-expanded="expanded ? 'true' : 'false'"
        @click="toggle"
      >
        {{ t(expanded ? 'legacyChat.hide' : 'legacyChat.show') }}
      </button>
    </header>

    <div v-if="expanded" class="legacy-chat__body">
      <p class="legacy-chat__notice">{{ t('legacyChat.readOnly') }}</p>

      <LegacyConversationDetail
        v-if="selected"
        :key="`${selected.course.course_id}:${selected.conversation_id}`"
        :course-id="selected.course.course_id"
        :conversation-id="selected.conversation_id"
        :title="selected.title"
        :subtitle="courseAndAgent(selected)"
        show-back
        @back="backToList"
      />

      <template v-else>
        <p v-if="listLoading" class="legacy-chat__status" role="status">{{ t('legacyChat.loading') }}</p>
        <div v-if="listError" class="legacy-chat__error" role="alert">
          <span>{{ t('legacyChat.error') }}</span>
          <button type="button" @click="loadList(items.length > 0)">{{ t('legacyChat.retry') }}</button>
        </div>
        <p v-if="showListEmpty" class="legacy-chat__status">{{ t('legacyChat.empty') }}</p>

        <ul v-if="items.length" class="legacy-chat__list">
          <li v-for="conversation in items" :key="conversation.conversation_id">
            <button
              type="button"
              class="legacy-chat__row"
              :data-legacy-conversation-id="conversation.conversation_id"
              @click="selected = conversation"
            >
              <span class="legacy-chat__row-title">{{ conversation.title || t('legacyChat.untitled') }}</span>
              <span class="legacy-chat__row-meta">{{ courseAndAgent(conversation) }}</span>
              <time :datetime="conversation.last_activity_at">{{ formatDateTime(conversation.last_activity_at) }}</time>
            </button>
          </li>
        </ul>
        <button
          v-if="next"
          type="button"
          class="legacy-chat__more"
          :disabled="listLoadingMore"
          @click="loadList(true)"
        >
          {{ t('legacyChat.loadMore') }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.legacy-chat {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 2px solid var(--app-line);
  color: var(--app-ink);
}
.legacy-chat__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.legacy-chat__heading {
  min-width: 0;
}
.legacy-chat__heading h2 {
  margin: 0;
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
  line-height: var(--app-lh-heading);
}
.legacy-chat__heading p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
}
.legacy-chat__toggle,
.legacy-chat__more,
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
.legacy-chat__toggle:hover,
.legacy-chat__more:hover,
.legacy-chat__error button:hover {
  text-decoration: underline;
}
.legacy-chat__body {
  margin-top: 10px;
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
.legacy-chat__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-bottom: var(--app-rule);
}
.legacy-chat__list > li {
  border-top: var(--app-rule);
}
.legacy-chat__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  width: 100%;
  padding: 10px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.legacy-chat__row:hover {
  background: var(--el-fill-color-light);
}
.legacy-chat__row-title {
  overflow: hidden;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legacy-chat__row-meta {
  grid-column: 1;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legacy-chat__row time {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.legacy-chat__more {
  display: block;
  margin: 10px auto;
}
.legacy-chat button:disabled {
  cursor: wait;
  opacity: 0.6;
}
@media (max-width: 480px) {
  .legacy-chat__header {
    flex-direction: column;
  }
  .legacy-chat__row time {
    display: none;
  }
  .legacy-chat__row-meta {
    grid-column: 1 / -1;
  }
}
</style>
