<script setup lang="ts">
// One agent's retained Core conversation log for staff. conversation.list's
// overseer scope is the only source of rows: AR lists the assertion actor's
// own conversations and cannot represent this oversight. Messages and files
// use the same finite, read-only Core detail as the legacy deep-link page.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationView } from '@/api/types'
import { legacyConversation } from '@/api/legacyConversation'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import LegacyConversationDetail from '@/components/chat/LegacyConversationDetail.vue'
import { byActivity, stateOf } from '@/components/chat/chat'
import { useBackCloses } from '@/composables/useBackCloses'
import { usePhoneScreen } from '@/composables/useMediaQuery'

const props = defineProps<{
  modelValue: boolean
  courseId: string
  /** The agent's seat: whose conversations Core lets this staff reader oversee. */
  agent: { id: string; display_name: string } | null
}>()
const emit = defineEmits<{ 'update:modelValue': [open: boolean] }>()
const { t } = useI18n()
const phone = usePhoneScreen()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})
useBackCloses(
  () => props.modelValue,
  () => (open.value = false),
)
const shown = ref<ConversationView | null>(null)
useBackCloses(
  () => props.modelValue && !!shown.value,
  () => (shown.value = null),
)

const rows = ref<ConversationView[]>([])
const items = computed(() => byActivity(rows.value))
const next = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const loaded = ref(false)
const listError = ref(false)
let listRead = 0
let listController: AbortController | null = null

function resetList() {
  listRead++
  listController?.abort()
  rows.value = []
  next.value = null
  loading.value = false
  loadingMore.value = false
  loaded.value = false
  listError.value = false
}

async function loadList(more = false) {
  const agentId = props.agent?.id
  if (!agentId || loading.value || loadingMore.value) return
  const read = ++listRead
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  listError.value = false
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const out = await legacyConversation.overseerList(props.courseId, {
      respondentMemberId: agentId,
      after: more ? next.value : null,
      signal: controller.signal,
    })
    if (read !== listRead || props.agent?.id !== agentId) return
    if (more) {
      const seen = new Set(rows.value.map((c) => c.id))
      rows.value = [...rows.value, ...out.conversations.filter((c) => !seen.has(c.id))]
    } else {
      rows.value = out.conversations
    }
    next.value = out.next
    loaded.value = true
  } catch {
    if (read === listRead) listError.value = true
  } finally {
    if (read === listRead) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch(
  () => props.agent?.id,
  () => {
    shown.value = null
    resetList()
    if (open.value) void loadList()
  },
)
watch(open, (v) => {
  if (v) void loadList()
})
onMounted(() => {
  if (open.value) void loadList()
})
onBeforeUnmount(() => {
  listRead++
  listController?.abort()
})
</script>

<template>
  <el-drawer
    v-model="open"
    direction="rtl"
    :size="phone ? '100%' : '560px'"
    :title="agent ? t('courseAgents.log.title', { name: agent.display_name }) : ''"
    class="agent-log"
    body-class="agent-log__body"
    append-to-body
  >
    <template v-if="agent">
      <LegacyConversationDetail
        v-if="shown"
        :key="shown.id"
        class="agent-log__pane"
        :course-id="courseId"
        :conversation-id="shown.id"
        :title="shown.title"
        :subtitle="shown.opener.display_name"
        show-back
        @back="shown = null"
      />
      <div v-else class="agent-log__list">
        <p class="agent-log__archive">{{ t('legacyChat.title') }}</p>
        <p class="agent-log__hint">{{ t('legacyChat.readOnly') }}</p>
        <div v-if="listError" class="agent-log__error" role="alert">
          <span>{{ t('legacyChat.error') }}</span>
          <button type="button" @click="loadList(rows.length > 0)">{{ t('legacyChat.retry') }}</button>
        </div>
        <AsyncState
          :loading="loading && !loaded"
          :empty="loaded && !items.length && !next && !listError"
          :empty-text="t('courseAgents.log.empty')"
        >
          <ul class="agent-log__rows">
            <li v-for="c in items" :key="c.id">
              <button type="button" class="log-row" @click="shown = c">
                <span class="log-row__body">
                  <span class="log-row__line">
                    <span class="log-row__name">{{ c.opener.display_name }}</span>
                    <span class="log-row__time"><TimeText :value="c.last_message_at ?? c.created_at" relative /></span>
                  </span>
                  <span class="log-row__line">
                    <span class="log-row__title">{{ c.title || t('chat.history.untitled') }}</span>
                    <StatusTag vocab="conversationState" :value="stateOf(c)" />
                  </span>
                </span>
                <el-icon class="log-row__go"><ArrowRight /></el-icon>
              </button>
            </li>
          </ul>
          <LoadMore :has-more="!!next" :loading="loadingMore" @more="loadList(true)" />
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
.agent-log__archive {
  margin: 0 0 4px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
}
.agent-log__hint {
  margin: 0 0 12px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-ui);
  color: var(--el-text-color-secondary);
}
.agent-log__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 0;
  color: var(--el-color-danger);
  font-size: var(--app-text-sm);
}
.agent-log__error button {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.agent-log__pane {
  flex: 1;
  min-height: 0;
  padding: 0 20px 20px;
  overflow-y: auto;
}
.agent-log__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-top: var(--app-rule);
}
.agent-log__rows > li {
  border-bottom: var(--app-rule);
}
.log-row {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  width: 100%;
  padding: 9px var(--app-space-sm);
  border: 0;
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
.log-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.log-row__go {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}
.log-row__line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.log-row__name {
  font-weight: var(--app-weight-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.log-row__time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.log-row__title {
  flex: 1;
  font-size: var(--app-text-sm);
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
