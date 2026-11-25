<script setup lang="ts">
// The frame around every signed-in page, laid out as an editor is. On the
// left, an activity bar along the window's edge, with a button for each view
// the caller is offered (their courses, their agents, administration) and,
// at its bottom, their account (language, theme and signing out are in its
// menu), and the side bar beside it showing the view chosen; then the page
// column, its header (the page's title and, at its right end, the chat's
// button) over the page, on the page's own ground; and, while the chat is
// open, the chat docked at the window's right edge beside the page column,
// which narrows by its width (ChatPanel); in a window too narrow for the
// side bar beside them, the side bar gives way to the chat while it is open
// (stores/sidebar.ts). The chat's button says how many
// answers are not read. On a phone there is no activity bar: three lines at
// the header's left open the views in a drawer, the wordmark at its top and
// tabs under it, with the account at its bottom; the chat's button stays at
// the header's right end, in one row of 56 px, and opens the chat as a sheet
// over the page. Nothing floats over the page. A newer build deployed while
// the tab is open is said in a strip under the header (NewVersionNotice),
// which reloads only when asked. A file opened from any list of files is
// shown in the file viewer (FileViewer), over the page, whose code is
// fetched the first time a file is opened. Back closes the phone's menu, the
// chat's sheet and the file viewer, the top one first, rather than leaving
// the page (useBackCloses). On a course's pages the top bar is the way back
// up, the course and the tab (CourseCrumbs), rather than the page's name
// again.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { PANEL_SHEET_MAX_WIDTH, shortcutLabel } from '@/components/chat/panel'
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
// how many answers they have not read: at the header's right end, which
// nothing on the page is ever under, at every width. It opens the chat or,
// open, minimizes it; on a phone it opens the sheet, which covers it.
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
// On a phone the chat is a sheet over the whole screen, a modal dialog: while it is open, the page column under it
// (its header, the crumbs, the menu's button, the chat's own, and the page) is inert, so that Tab, a screen
// reader's cursor and a tap stay in the sheet, as its aria-modal says. Overlays opened from the sheet (a
// confirmation, a list, the file viewer) are laid on the body, outside the column, and stay usable. Closed, the
// attribute is left out, never written false: an inert="false" is inert all the same where it is an attribute.
const sheet = useMediaQuery(`(max-width: ${PANEL_SHEET_MAX_WIDTH}px)`)
const underSheet = computed(() => sheet.value && chat.open)

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
      <SideBar v-if="side.visible" />
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

    <el-container direction="vertical" class="app-main-wrap" :inert="underSheet || undefined">
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
        <!-- The chat's button, at the header's right end at every width; its shortcut in a tooltip, but on a phone. -->
        <!-- No trigger keys: by default the tooltip takes Enter and Space for itself, and the button would not open the chat from the keyboard. -->
        <el-tooltip
          v-if="chatOffered"
          :content="t('chat.panel.toggleTip', { key: shortcutLabel() })"
          placement="bottom-end"
          :show-after="300"
          :trigger-keys="[]"
          :disabled="narrow"
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
              :aria-haspopup="narrow ? 'dialog' : undefined"
              aria-keyshortcuts="Control+J Meta+J"
              @click="toggleChat"
            >
              <el-icon :size="20" aria-hidden="true"><ChatDotRound /></el-icon>
            </button>
          </el-badge>
        </el-tooltip>
      </el-header>
      <!-- A newer build deployed since this tab loaded: said in a strip under the header, never reloaded without asking. -->
      <NewVersionNotice />

      <div class="app-body">
        <el-main class="app-main">
          <router-view />
        </el-main>
      </div>
    </el-container>
    <!-- The chat, docked beside the page column at the window's right edge (on a phone, a sheet over the page). -->
    <ChatPanel ref="chatPanel" />
    <FileViewer v-if="preview.opened" />
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}
/* The page column, its header and the page, on the page's own ground: the near-white, not the paper, which the
   activity bar and the side bar keep. */
.app-main-wrap {
  min-width: 0;
  background: var(--app-page);
}
.app-header {
  display: flex;
  align-items: center;
  border-bottom: var(--app-rule);
  background: var(--app-page);
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
  border-radius: var(--app-radius);
  background: none;
  color: var(--app-ink);
  cursor: pointer;
}
.app-header__menu:hover {
  background-color: var(--app-ground-2);
}
/* The chat's button, at the header's right end: an icon, the indigo on its tint while the chat is open. */
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
  border: none;
  border-radius: var(--app-radius);
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
  color: var(--app-indigo);
}
/* The count at the button's top right corner, half over it, whatever its
   width: Element's own pushes it its whole width past the corner, so that
   "12" or "99+" ran past the window's edge. The header's padding takes the
   half that is outside. A count, square-cornered as every count is. */
.app-header__chat :deep(.el-badge__content.is-fixed) {
  top: 0;
  right: 0;
  border-radius: var(--app-radius);
  transform: translate(40%, -30%);
}
/* On a touch screen, a control pressed often is at least 40 px: on a phone the chat's button is the header's
   44 px square at its right end, as the menu's is at its left. */
@media (pointer: coarse) {
  .app-header__chat-button {
    width: 44px;
    height: 44px;
  }
}
.app-header__title {
  font-weight: var(--app-weight-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The page, to the page column's right edge: the window's, or the chat's rule while it is open. */
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
/* On a phone, the side menu: the wordmark in a row as high as the header and ruled as it is, the views, and the
   account at its bottom. */
.app-nav-drawer__body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-nav-drawer__brand {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 16px;
  border-bottom: var(--app-rule);
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
/* On a phone, one row of 56 px holds the menu's button, the way up and the chat's button: the header's gutters are
   the page's 16 px, and the chat's square reaches a little into its gutter as the menu's does into its own (not
   so far that its count leaves the screen), so that the way up keeps its words whole as long as it can. */
@media (max-width: 899px) {
  .app-header {
    padding: 0 16px;
    gap: 8px;
  }
  .app-header__chat {
    margin-right: -4px;
  }
}
</style>
