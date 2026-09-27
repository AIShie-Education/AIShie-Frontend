<script setup lang="ts">
// The chat button every course page carries (mounted once by CourseLayout),
// and the drawer it opens: whom the caller may ask, their conversations, and
// one conversation. Offered when the seat may ask or answer; not on the
// conversations page itself, which shows the same. The button counts the
// questions that wait for the caller's answer.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { Respondent } from '@/api/types'
import { useNarrow } from '@/composables/useMediaQuery'
import { useCourseStore } from '@/stores/course'
import { useInbox } from '../useConversationList'
import ChatBrowser from './ChatBrowser.vue'
import ChatPane from './ChatPane.vue'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const route = useRoute()
const narrow = useNarrow()

const offered = computed(
  () => course.courseId === props.courseId && (course.can('conversation_ask') || course.can('conversation_answer')),
)
const onPage = computed(() => route.name === 'course-conversations')
const shown = computed(() => offered.value && !onPage.value)

type Screen = { kind: 'browse' } | { kind: 'conversation'; id: string } | { kind: 'new'; respondent: Respondent }
const open = ref(false)
const screen = ref<Screen>({ kind: 'browse' })
watch(onPage, (v) => {
  if (v) open.value = false
})

// Counted while the drawer is closed; while it is open, its own list counts.
const inbox = useInbox({
  courseId: props.courseId,
  enabled: () => shown.value && !open.value && course.can('conversation_answer'),
})

const browser = ref<InstanceType<typeof ChatBrowser> | null>(null)
const paneKey = computed(() =>
  screen.value.kind === 'conversation'
    ? `c:${screen.value.id}`
    : screen.value.kind === 'new'
      ? `to:${screen.value.respondent.member_id}`
      : '',
)
const fullPage = computed(() => ({
  name: 'course-conversations',
  params: {
    courseId: props.courseId,
    ...(screen.value.kind === 'conversation' ? { conversationId: screen.value.id } : {}),
  },
}))

function show(id: string) {
  screen.value = { kind: 'conversation', id }
}
function start(r: Respondent) {
  screen.value = { kind: 'new', respondent: r }
}
function back() {
  screen.value = { kind: 'browse' }
  browser.value?.refresh()
}
</script>

<template>
  <template v-if="shown">
    <div class="chat-launcher">
      <el-badge :value="inbox.count.value" :hidden="!inbox.count.value || open" :max="99">
        <el-button
          type="primary"
          circle
          size="large"
          class="chat-launcher__button"
          :aria-label="t('chat.launcher.open')"
          :title="t('chat.launcher.open')"
          @click="open = true"
        >
          <el-icon :size="22" aria-hidden="true"><ChatDotRound /></el-icon>
        </el-button>
      </el-badge>
    </div>
    <el-drawer
      v-model="open"
      direction="rtl"
      :size="narrow ? '100%' : '480px'"
      :with-header="false"
      body-class="chat-drawer__body"
      class="chat-drawer"
      append-to-body
    >
      <div class="chat-drawer__head">
        <el-button
          v-if="screen.kind !== 'browse'"
          link
          class="chat-drawer__icon"
          :aria-label="t('chat.launcher.back')"
          :title="t('chat.launcher.back')"
          @click="back"
        >
          <el-icon :size="18" aria-hidden="true"><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="chat-drawer__title">{{ t('chat.title') }}</h2>
        <router-link
          :to="fullPage"
          class="chat-drawer__icon chat-drawer__full"
          :aria-label="t('chat.launcher.fullPage')"
          :title="t('chat.launcher.fullPage')"
          @click="open = false"
        >
          <el-icon :size="16" aria-hidden="true"><FullScreen /></el-icon>
        </router-link>
        <el-button
          link
          class="chat-drawer__icon"
          :aria-label="t('common.actions.close')"
          :title="t('common.actions.close')"
          @click="open = false"
        >
          <el-icon :size="18" aria-hidden="true"><Close /></el-icon>
        </el-button>
      </div>
      <div v-show="screen.kind === 'browse'" class="chat-drawer__browse">
        <ChatBrowser
          ref="browser"
          :course-id="courseId"
          :active="open && screen.kind === 'browse'"
          @open="show"
          @start="start"
        />
      </div>
      <ChatPane
        v-if="screen.kind !== 'browse'"
        :key="paneKey"
        class="chat-drawer__pane"
        :course-id="courseId"
        :conversation-id="screen.kind === 'conversation' ? screen.id : null"
        :respondent="screen.kind === 'new' ? screen.respondent : null"
        :active="open"
        @opened="show"
        @start="start"
        @changed="browser?.refresh()"
      />
    </el-drawer>
  </template>
</template>

<style scoped>
.chat-launcher {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 20;
}
.chat-launcher__button {
  width: 52px;
  height: 52px;
  box-shadow: var(--el-box-shadow);
}
@media (max-width: 640px) {
  .chat-launcher {
    right: 16px;
    bottom: 16px;
  }
}
@media print {
  .chat-launcher {
    display: none;
  }
}
</style>

<!-- The drawer is placed at the end of the page (append-to-body), out of reach of scoped styles. -->
<style>
.chat-drawer .chat-drawer__body {
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-drawer__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.chat-drawer__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.chat-drawer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  border-radius: 6px;
  color: var(--el-text-color-regular);
}
.chat-drawer__icon + .chat-drawer__icon {
  margin-left: 0;
}
.chat-drawer__icon:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
.chat-drawer__browse {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 16px;
}
.chat-drawer__pane {
  flex: 1;
  min-height: 0;
}
</style>
