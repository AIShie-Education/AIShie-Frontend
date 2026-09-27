<script setup lang="ts">
// The caller's conversations in a course, full page: the lists on the left
// and one conversation (or a new one) on the right; on a phone, one then the
// other. The same parts as the chat drawer (ChatBrowser, ChatPane).
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { Respondent } from '@/api/types'
import PageHeader from '@/components/PageHeader.vue'
import { useNarrow } from '@/composables/useMediaQuery'
import { useCourseStore } from '@/stores/course'
import ChatBrowser from './components/ChatBrowser.vue'
import ChatPane from './components/ChatPane.vue'
import type { ChatRole } from './chat'

const props = defineProps<{ courseId: string; conversationId?: string }>()
const { t } = useI18n()
const router = useRouter()
const course = useCourseStore()
const narrow = useNarrow(900)

const offered = computed(
  () => course.can('conversation_ask') || course.can('conversation_answer') || course.can('action_decide'),
)

/** Whom a new conversation is for, while one is being started. */
const draft = ref<Respondent | null>(null)
watch(
  () => props.conversationId,
  (id) => {
    if (id) draft.value = null
  },
)
const selected = computed(() => props.conversationId ?? null)
const showPane = computed(() => !!selected.value || !!draft.value)
const paneKey = computed(() =>
  selected.value ? `c:${selected.value}` : draft.value ? `to:${draft.value.member_id}` : '',
)

const browser = ref<InstanceType<typeof ChatBrowser> | null>(null)
/** The caller's part in the conversation shown, once read: the list shows its tab. */
const selectedRole = ref<ChatRole | null>(null)
watch(selected, () => (selectedRole.value = null))

// On a phone the conversation takes the screen: brought fully into view, its
// composer at the bottom, as it is opened.
const paneEl = ref<HTMLElement | null>(null)
watch(
  [showPane, paneKey],
  ([shown]) => {
    if (shown && narrow.value) void nextTick(() => paneEl.value?.scrollIntoView?.({ block: 'end' }))
  },
  { immediate: true },
)

function openConversation(id: string) {
  draft.value = null
  if (id !== props.conversationId)
    void router.push({ name: 'course-conversations', params: { courseId: props.courseId, conversationId: id } })
}
function start(r: Respondent) {
  draft.value = r
  if (props.conversationId) void router.push({ name: 'course-conversations', params: { courseId: props.courseId } })
}
function opened(id: string) {
  draft.value = null
  void router.replace({ name: 'course-conversations', params: { courseId: props.courseId, conversationId: id } })
  browser.value?.refresh()
}
function backToList() {
  draft.value = null
  if (props.conversationId) void router.push({ name: 'course-conversations', params: { courseId: props.courseId } })
}
</script>

<template>
  <div>
    <PageHeader :title="t('chat.title')" :subtitle="t('chat.page.subtitle')" />
    <div v-if="!offered" class="app-card">
      <el-empty :description="t('chat.nothingHere')" />
    </div>
    <div v-else class="chat-page" :class="{ 'is-narrow': narrow, 'has-pane': showPane }">
      <aside v-show="!narrow || !showPane" class="app-card chat-page__list">
        <ChatBrowser
          ref="browser"
          :course-id="courseId"
          :selected-id="selected"
          :active="!narrow || !showPane"
          :selected-role="selectedRole"
          @open="openConversation"
          @start="start"
        />
      </aside>
      <section v-if="showPane || !narrow" ref="paneEl" class="app-card chat-page__pane">
        <ChatPane
          v-if="showPane"
          :key="paneKey"
          :course-id="courseId"
          :conversation-id="selected"
          :respondent="draft"
          @opened="opened"
          @start="start"
          @changed="browser?.refresh()"
          @role="selectedRole = $event"
        >
          <template v-if="narrow" #actions>
            <el-button size="small" @click="backToList">
              <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
              <span>{{ t('chat.page.all') }}</span>
            </el-button>
          </template>
        </ChatPane>
        <el-empty v-else class="chat-page__pick" :description="t('chat.page.pick')" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.chat-page.is-narrow {
  grid-template-columns: minmax(0, 1fr);
}
.chat-page__list {
  padding: 8px 16px 16px;
  max-height: calc(100vh - 200px);
  min-height: 420px;
  overflow-y: auto;
}
.chat-page.is-narrow .chat-page__list {
  max-height: none;
  min-height: 0;
}
.chat-page__pane {
  padding: 0;
  height: calc(100vh - 200px);
  min-height: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.chat-page.is-narrow .chat-page__pane {
  /* The screen below the app's top bar. */
  height: calc(100dvh - 76px);
  min-height: 360px;
  scroll-margin-bottom: 8px;
}
.chat-page__pick {
  margin: auto;
}
/* Two cards side by side, not one after the other. */
.chat-page .app-card + .app-card {
  margin-top: 0;
}
</style>
