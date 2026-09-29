<script setup lang="ts">
// One agent's conversation log, for those who decide actions here: the
// conversations the members they oversee have had with it in this course
// (conversation.list as overseer, with the agent's seat as
// respondent_member_id), the latest activity first, and each one read as
// course staff read it: nothing written, nothing marked read, and a message
// withdrawn where the seat decides actions for its opener (Core checks).
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationView } from '@/api/types'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useNarrow } from '@/composables/useMediaQuery'
import ChatPane from '@/components/chat/ChatPane.vue'
import { stateOf } from '@/components/chat/chat'
import { useConversationList } from '@/components/chat/useConversationList'

const props = defineProps<{
  modelValue: boolean
  courseId: string
  /** The agent's seat: whose conversations are shown. */
  agent: { id: string; display_name: string } | null
}>()
const emit = defineEmits<{ 'update:modelValue': [open: boolean] }>()
const { t } = useI18n()
const narrow = useNarrow()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})
const shown = ref<string | null>(null)
watch(
  () => props.agent?.id,
  () => (shown.value = null),
)

const list = useConversationList({
  courseId: props.courseId,
  as: 'overseer',
  respondent: () => props.agent?.id ?? null,
  enabled: () => open.value && !shown.value,
})
const items = computed<ConversationView[]>(() => list.items.value)
// Read again each time it is opened: others may have written since.
watch(open, (v) => {
  if (v) void list.refresh()
})
</script>

<template>
  <el-drawer
    v-model="open"
    direction="rtl"
    :size="narrow ? '100%' : '560px'"
    :title="agent ? t('courseAgents.log.title', { name: agent.display_name }) : ''"
    class="agent-log"
    body-class="agent-log__body"
    append-to-body
  >
    <template v-if="agent">
      <ChatPane
        v-if="shown"
        :key="shown"
        class="agent-log__pane"
        :course-id="courseId"
        :conversation-id="shown"
        :active="open"
        oversee
        @changed="list.refresh()"
      >
        <template #actions>
          <el-button size="small" @click="shown = null">
            <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
            <span>{{ t('courseAgents.log.back') }}</span>
          </el-button>
        </template>
      </ChatPane>
      <div v-else class="agent-log__list">
        <p class="agent-log__hint">{{ t('courseAgents.log.hint', { name: agent.display_name }) }}</p>
        <AsyncState
          :loading="list.loading.value && !list.loaded.value"
          :error="list.error.value"
          :empty="list.loaded.value && !items.length && !list.hasMore.value"
          :empty-text="t('courseAgents.log.empty')"
          @retry="list.reload()"
        >
          <ul class="agent-log__rows">
            <li v-for="c in items" :key="c.id">
              <button type="button" class="log-row" @click="shown = c.id">
                <span class="log-row__line">
                  <span class="log-row__name">{{ c.opener.display_name }}</span>
                  <span class="log-row__time"><TimeText :value="c.last_message_at ?? c.created_at" relative /></span>
                </span>
                <span class="log-row__line">
                  <span class="log-row__title">{{ c.title || t('chat.history.untitled') }}</span>
                  <StatusTag vocab="conversationState" :value="stateOf(c)" />
                </span>
              </button>
            </li>
          </ul>
          <LoadMore :has-more="list.hasMore.value" :loading="list.loadingMore.value" @more="list.loadMore()" />
        </AsyncState>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.agent-log__list {
  padding: 0 20px 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.agent-log__hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.agent-log__pane {
  flex: 1;
  min-height: 0;
}
.agent-log__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.log-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.log-row:hover,
.log-row:focus-visible {
  background: var(--el-fill-color-light);
}
.log-row__line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.log-row__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.log-row__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.log-row__title {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>

<!-- The drawer is placed at the end of the page (append-to-body), out of reach of scoped styles. -->
<style>
.agent-log .agent-log__body {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.agent-log .el-drawer__header {
  margin-bottom: 12px;
}
</style>
