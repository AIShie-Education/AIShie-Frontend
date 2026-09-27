<script setup lang="ts">
// The caller's conversations in one of their parts: those they started
// (opener), those addressed to them (respondent), or those of members they
// decide actions for (overseer). The latest activity first; a dot marks one
// that waits for the caller's answer.
import { useI18n } from 'vue-i18n'
import type { ConversationRole, ConversationView } from '@/api/types'
import AgentBadge from '@/components/AgentBadge.vue'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { stateOf } from '../chat'
import { useConversationList } from '../useConversationList'

const props = defineProps<{
  courseId: string
  as: ConversationRole
  selectedId?: string | null
  /** Kept fresh only while it is on screen. */
  enabled?: boolean
  /** Conversations that wait for the caller's answer (conversation.inbox). */
  waiting?: Set<string>
}>()
const emit = defineEmits<{ open: [conversationId: string] }>()
const { t } = useI18n()

const list = useConversationList({ courseId: props.courseId, as: props.as, enabled: () => props.enabled !== false })

const emptyText = () =>
  props.as === 'opener'
    ? t('chat.list.emptyOpener')
    : props.as === 'respondent'
      ? t('chat.list.emptyRespondent')
      : t('chat.list.emptyOverseer')

function name(c: ConversationView): string {
  if (props.as === 'opener') return c.respondent.display_name
  if (props.as === 'respondent') return c.opener.display_name
  return t('chat.between', { opener: c.opener.display_name, respondent: c.respondent.display_name })
}
defineExpose({ refresh: list.refresh })
</script>

<template>
  <AsyncState
    :loading="list.loading.value && !list.loaded.value"
    :error="list.error.value"
    :empty="list.loaded.value && !list.items.value.length"
    :empty-text="emptyText()"
    @retry="list.reload()"
  >
    <ul class="conv-list">
      <li v-for="c in list.items.value" :key="c.id">
        <button
          type="button"
          class="conv-row"
          :class="{ 'is-selected': c.id === selectedId }"
          :aria-current="c.id === selectedId ? 'true' : undefined"
          @click="emit('open', c.id)"
        >
          <span class="conv-row__line">
            <span v-if="waiting?.has(c.id)" class="conv-row__dot" :title="t('chat.list.waitsForYou')" />
            <span class="conv-row__name">{{ name(c) }}</span>
            <AgentBadge
              v-if="as === 'opener' && c.respondent.kind === 'agent'"
              :kind="c.respondent.kind"
              :owner-name="c.respondent.owner_name"
              :mine="c.respondent.is_delegate_of_opener"
            />
            <AgentBadge v-else-if="as === 'respondent' && c.opener.kind === 'agent'" :kind="c.opener.kind" />
            <span class="conv-row__time"><TimeText :value="c.last_message_at ?? c.created_at" relative /></span>
          </span>
          <span class="conv-row__line conv-row__sub">
            <span class="conv-row__title">{{ c.title ?? '' }}</span>
            <StatusTag vocab="conversationState" :value="stateOf(c)" />
          </span>
        </button>
      </li>
    </ul>
    <LoadMore :has-more="list.hasMore.value" :loading="list.loadingMore.value" @more="list.loadMore()" />
  </AsyncState>
</template>

<style scoped>
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.conv-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.conv-row:hover,
.conv-row:focus-visible {
  background: var(--el-fill-color-light);
}
.conv-row.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.conv-row__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.conv-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-danger);
  flex-shrink: 0;
}
.conv-row__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.conv-row__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.conv-row__sub {
  justify-content: space-between;
}
.conv-row__title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
