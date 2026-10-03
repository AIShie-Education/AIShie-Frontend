<script setup lang="ts">
// The frame around every signed-in page, laid out as an editor is. On the
// left, an activity bar along the window's edge, with a button for each view
// the caller is offered (their courses, their agents, administration) and,
// at its bottom, their account (language, theme and signing out are in its
// menu), and the side bar beside it showing the view chosen; on top, the
// page's title and, at its right end, the chat's button; and the page, which
// runs to the window's right edge. The chat with the courses' agents opens
// from that button, with how many answers are not read, in a window over the
// page (ChatPanel). On a phone there is no activity bar: three lines at the
// header's left open the views in a drawer, the wordmark at its top and
// tabs under it, with the account at its bottom, and the chat opens from a
// round button floating at the bottom right, which goes out of the way while
// the page is scrolled down, as a sheet over the page. A newer build
// deployed while the tab is open is said in a small notice
// (NewVersionNotice), which reloads only when asked. A file opened from any
// list of files is shown in the file viewer (FileViewer), over the page,
// whose code is fetched the first time a file is opened. Back closes the
// phone's menu, the chat's sheet and the file viewer, the top one first,
// rather than leaving the page (useBackCloses). On a course's pages the top
// bar is the way back up, the course and the tab (CourseCrumbs), rather than
// the page's name again.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { shortcutLabel } from '@/components/chat/panel'
import AccountMenu from '@/components/sidebar/AccountMenu.vue'
import AppWordmark from '@/components/AppWordmark.vue'
import NewVersionNotice from '@/components/NewVersionNotice.vue'
import { previewState } from '@/components/preview/viewer'
import ActivityBar from '@/components/sidebar/ActivityBar.vue'
import SideBar from '@/components/sidebar/SideBar.vue'
import { SIDEBAR_DRAWER_MAX_WIDTH } from '@/components/sidebar/frame'
import { useSideBarStore } from '@/stores/sidebar'
import { useBackCloses } from '@/composables/useBackCloses'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { titleKey } from '@/router/title'
import { useCourseStore } from '@/stores/course'
import CourseCrumbs from './CourseCrumbs.vue'

const chat = useChatStore()
const route = useRoute()
const { t } = useI18n()

const narrow = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_MAX_WIDTH}px)`)
// The phone's menu closes as a link in it is followed, and with back. It
// stays open while the page writes its own address (a search as it is
// typed), since the page stays where it is.
const drawer = ref(false)
useBackCloses(drawer, () => (drawer.value = false), { when: narrow })
watch(
  () => route.path,
  () => (drawer.value = false),
)

// The side bar shows the view of the page's own (a course's pages, the
// agents', administration's), open or collapsed as it was.
const side = useSideBarStore()
watch(
  () => route.path,
  (path) => side.follow(path),
  { immediate: true },
)

// The chat's button, offered where the caller may ask agents somewhere, with
// how many answers they have not read. From 900 px up it is an icon at the
// header's right end, which nothing on the page is ever under, and opens the
// chat or, open, minimizes it. On a phone it floats at the bottom right,
// in the thumb's reach, while the chat's sheet is closed: it goes out of the
// way while the page is scrolled down and comes back as soon as it is
// scrolled up (or reaches its top), and the page keeps room below its last
// item for it, so that it never covers anything there.
const chatOffered = computed(() => chat.courses.length > 0 || chat.open)
const chatPanel = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatLabel = computed(() =>
  chat.unreadCount ? t('chat.panel.toggleUnread', { n: chat.unreadCount }) : t('chat.panel.toggle'),
)
function openChat() {
  chat.setOpen(true)
  void chatPanel.value?.focusPanel()
}
function toggleChat() {
  if (chat.open) chat.setOpen(false)
  else openChat()
}

/** The floating button tucked away, while a phone's page is scrolled down. */
const fabTucked = ref(false)
let lastY = 0
let frame = 0
function onScroll() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const y = Math.max(0, window.scrollY)
    // A few pixels either way is a hand resting, not a scroll.
    if (y < 64 || y < lastY - 4) fabTucked.value = false
    else if (y > lastY + 4) fabTucked.value = true
    else return
    lastY = y
  })
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (frame) cancelAnimationFrame(frame)
})
// Back from the chat's sheet, or another page: the button is there.
watch([() => chat.open, () => route.fullPath, narrow], () => (fabTucked.value = false))

// The file viewer, loaded the first time a file is opened, and kept from then on.
const FileViewer = defineAsyncComponent(() => import('@/components/preview/FileViewer.vue'))
const preview = previewState()

// The browser's tab is named by the router (router/title.ts); this is the header's.
const pageTitle = computed(() => {
  const key = titleKey(route)
  return key ? t(key) : ''
})
// On a course's pages, once the course is read: its breadcrumb.
const course = useCourseStore()
const crumbsCourse = computed(() => {
  const id = route.params.courseId
  return typeof id === 'string' && route.path.startsWith('/courses/') && course.courseId === id ? course.course : null
})
</script>

<template>
  <el-container class="app-shell">
    <!-- On the left, as an editor's: the activity bar, and beside it the side bar with the view chosen. -->
    <template v-if="!narrow">
      <ActivityBar />
      <SideBar v-if="side.open" />
    </template>
    <!-- On a phone, the views are the menu's, opened from the header; closed, it holds nothing that polls. -->
    <el-drawer
      v-else
      v-model="drawer"
      direction="ltr"
      size="300px"
      :with-header="false"
      :title="t('layout.menu')"
      append-to-body
      destroy-on-close
      class="app-nav-drawer"
    >
      <div class="app-nav-drawer__body">
        <div class="app-nav-drawer__brand"><AppWordmark /></div>
        <SideBar mode="drawer" @follow="drawer = false" />
        <AccountMenu variant="drawer" />
      </div>
    </el-drawer>

    <el-container direction="vertical" class="app-main-wrap">
      <el-header class="app-header" height="56px">
        <div class="app-header__left">
          <!-- On a phone, three lines open the menu: 20 px, in a 44 px square a thumb hits. -->
          <button
            v-if="narrow"
            type="button"
            class="app-header__menu"
            :aria-label="t('layout.menu')"
            aria-haspopup="dialog"
            :aria-expanded="drawer"
            @click="drawer = true"
          >
            <el-icon :size="20" aria-hidden="true"><Expand /></el-icon>
          </button>
          <CourseCrumbs v-if="crumbsCourse" :course="crumbsCourse" class="app-header__crumbs" />
          <span v-else class="app-header__title">{{ pageTitle }}</span>
        </div>
        <!-- From 900 px up, the chat's button, at the header's right end. -->
        <!-- No trigger keys: by default the tooltip takes Enter and Space for itself, and the button would not open the chat from the keyboard. -->
        <el-tooltip
          v-if="chatOffered && !narrow"
          :content="t('chat.panel.toggleTip', { key: shortcutLabel() })"
          placement="bottom-end"
          :show-after="300"
          :trigger-keys="[]"
        >
          <el-badge
            :value="chat.unreadCount"
            :hidden="!chat.unreadCount"
            :max="99"
            type="primary"
            class="app-chat-entry app-header__chat"
          >
            <button
              id="chat-panel-toggle"
              type="button"
              class="app-header__chat-button"
              :class="{ 'is-open': chat.open }"
              :aria-label="chatLabel"
              :aria-expanded="chat.open"
              aria-controls="chat-panel"
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+J Meta+J"
              @click="toggleChat"
            >
              <el-icon :size="20" aria-hidden="true"><ChatDotRound /></el-icon>
            </button>
          </el-badge>
        </el-tooltip>
      </el-header>

      <div class="app-body">
        <el-main class="app-main" :class="{ 'has-chat-fab': chatOffered && narrow }">
          <router-view />
        </el-main>
      </div>
      <!-- On a phone, the chat's button floats at the bottom right while the sheet is closed. -->
      <el-badge
        v-if="chatOffered && narrow && !chat.open"
        :value="chat.unreadCount"
        :hidden="!chat.unreadCount"
        :max="99"
        type="primary"
        class="app-chat-entry app-chat-fab"
        :class="{ 'is-tucked': fabTucked }"
      >
        <button
          id="chat-panel-toggle"
          type="button"
          class="app-chat-fab__button"
          :aria-label="chatLabel"
          aria-expanded="false"
          aria-controls="chat-panel"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+J Meta+J"
          @focus="fabTucked = false"
          @click="openChat"
        >
          <el-icon :size="22" aria-hidden="true"><ChatDotRound /></el-icon>
        </button>
      </el-badge>
      <ChatPanel ref="chatPanel" />
    </el-container>
    <!-- A newer build deployed since this tab loaded: said, never reloaded without asking. -->
    <NewVersionNotice />
    <FileViewer v-if="preview.opened" />
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  /* The chat's round button on a phone: how big, and how far from the screen's edges. */
  --app-fab-size: 48px;
  --app-fab-inset: 16px;
}
.app-main-wrap {
  min-width: 0;
}
.app-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--app-line);
  background: var(--app-ground);
  position: sticky;
  top: 0;
  z-index: var(--app-z-header);
  gap: 12px;
}
.app-header__left {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
/* On a phone, the menu's button: three lines, 20 px, in a 44 px square a thumb hits. */
.app-header__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  padding: 0;
  border: none;
  border-radius: var(--app-radius-control);
  background: none;
  color: var(--el-text-color-regular);
  cursor: pointer;
}
.app-header__menu:hover {
  background-color: var(--app-ground-2);
}
/* The chat's button, at the header's right end: an icon, the indigo once the chat is open. */
.app-header__chat {
  flex-shrink: 0;
}
.app-header__chat-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--app-radius-control);
  background: none;
  color: var(--app-ink-2);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.app-header__chat-button:hover {
  background-color: var(--app-ground-2);
  color: var(--app-ink);
}
.app-header__chat-button.is-open {
  background-color: var(--app-indigo-tint);
  border-color: var(--app-indigo-line);
  color: var(--app-indigo);
}
/* The count at the button's top right corner, half over it, whatever its
   width: Element's own pushes it its whole width past the corner, so that
   "12" or "99+" ran past the window's edge. The header's 20 px of padding
   take the half that is outside. */
.app-header__chat :deep(.el-badge__content.is-fixed) {
  top: 0;
  right: 0;
  transform: translate(40%, -30%);
}
/* On a touch screen, a control pressed often is at least 40 px. */
@media (pointer: coarse) {
  .app-header__chat-button {
    width: 44px;
    height: 44px;
  }
}
.app-header__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The page, to the window's right edge. */
.app-body {
  flex: 1 0 auto;
  display: flex;
  align-items: flex-start;
  min-width: 0;
}
.app-main {
  flex: 1 1 0;
  min-width: 0;
  padding: 24px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}
/* On a phone, the chat's button floats at the bottom right, clear of the
   rounded corners and home bar (above the safe area), over the page and
   under everything Element Plus lays over it (the side menu and its dimmed
   layer among them): see the layers in styles/tokens.css. Scrolled down, it
   slides below the screen's edge, at once where motion is reduced. */
.app-chat-fab {
  position: fixed;
  right: calc(var(--app-fab-inset) + env(safe-area-inset-right, 0px));
  bottom: calc(var(--app-fab-inset) + env(safe-area-inset-bottom, 0px));
  z-index: var(--app-z-fab);
  transition: transform 0.15s ease-out;
}
.app-chat-fab.is-tucked {
  transform: translateY(calc(100% + var(--app-fab-inset) + env(safe-area-inset-bottom, 0px) + 8px));
}
@media (prefers-reduced-motion: reduce) {
  .app-chat-fab {
    transition: none;
  }
}
.app-chat-fab__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--app-fab-size);
  height: var(--app-fab-size);
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-indigo);
  color: var(--app-on-indigo);
  box-shadow: var(--app-shadow-pop);
  cursor: pointer;
  transition: background-color 0.15s;
}
.app-chat-fab__button:hover,
.app-chat-fab__button:active {
  background: var(--app-indigo-dark);
}
.app-chat-fab :deep(.el-badge__content.is-fixed) {
  top: -2px;
  right: -2px;
  transform: none;
}
/* Room below the page's last item for the button, so that it never covers it. */
.app-main.has-chat-fab {
  padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
}
/* On a phone, the side menu: the wordmark, the views, and the account at its bottom. */
.app-nav-drawer__body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-nav-drawer__brand {
  flex-shrink: 0;
  padding: 18px 16px 10px;
}
.app-nav-drawer__brand :deep(.app-wordmark) {
  height: 22px;
}
.app-nav-drawer__body > .side-bar {
  flex: 1;
  min-height: 0;
}
@media print {
  .app-chat-entry {
    display: none;
  }
}
@media (max-width: 600px) {
  .app-main {
    padding: 16px;
  }
}
</style>
