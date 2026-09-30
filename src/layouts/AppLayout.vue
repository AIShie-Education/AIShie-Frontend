<script setup lang="ts">
// The frame around every signed-in page, laid out as an editor is. On the
// left, an activity bar along the window's edge, with a button for each view
// the caller is offered (their courses, their agents, administration) and,
// at its bottom, their account (language, theme and signing out are in its
// menu), and the side bar beside it showing the view chosen; on top, the
// page's title; and the page, which runs to the window's right edge. The
// chat with the courses' agents opens from a round button floating at the
// bottom right, over every page, in a window over the page (ChatPanel). On a
// phone there is no activity bar: the header's menu button opens the views in
// a drawer, as tabs along its top, with the account at its bottom, and the
// chat opens from the same button as a sheet over the page. A newer build
// deployed while the tab is open is said in a small notice
// (NewVersionNotice), which reloads only when asked.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { shortcutLabel } from '@/components/chat/panel'
import AccountMenu from '@/components/sidebar/AccountMenu.vue'
import NewVersionNotice from '@/components/NewVersionNotice.vue'
import ActivityBar from '@/components/sidebar/ActivityBar.vue'
import SideBar from '@/components/sidebar/SideBar.vue'
import { SIDEBAR_DRAWER_MAX_WIDTH } from '@/components/sidebar/frame'
import { useSideBarStore } from '@/stores/sidebar'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { titleKey } from '@/router/title'

const chat = useChatStore()
const route = useRoute()
const { t } = useI18n()

const narrow = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_MAX_WIDTH}px)`)
// The phone's menu closes as a link in it is followed.
const drawer = ref(false)
watch(
  () => route.fullPath,
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

// The chat's button, floating at the bottom right while the chat is closed or
// minimized (the chat opens in its corner): offered where the caller may ask
// agents somewhere, with how many answers they have not read. The page keeps
// room below its last item for it, so that it never covers anything there.
const chatOffered = computed(() => chat.courses.length > 0 || chat.open)
const chatPanel = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatLabel = computed(() =>
  chat.unreadCount ? t('chat.panel.toggleUnread', { n: chat.unreadCount }) : t('chat.panel.toggle'),
)
function openChat() {
  chat.setOpen(true)
  void chatPanel.value?.focusPanel()
}

// The browser's tab is named by the router (router/title.ts); this is the header's.
const pageTitle = computed(() => {
  const key = titleKey(route)
  return key ? t(key) : ''
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
        <SideBar mode="drawer" @follow="drawer = false" />
        <AccountMenu variant="drawer" />
      </div>
    </el-drawer>

    <el-container direction="vertical" class="app-main-wrap">
      <el-header class="app-header" height="56px">
        <div class="app-header__left">
          <el-button v-if="narrow" text circle :aria-label="t('layout.menu')" @click="drawer = true">
            <el-icon :size="20"><Menu /></el-icon>
          </el-button>
          <span class="app-header__title">{{ pageTitle }}</span>
        </div>
      </el-header>

      <div class="app-body">
        <el-main class="app-main" :class="{ 'has-chat-fab': chatOffered }">
          <router-view />
        </el-main>
      </div>
      <!-- The chat's button, at the bottom right while the chat is closed; the chat opens in its corner. -->
      <!-- No trigger keys: by default the tooltip takes Enter and Space for itself, and the button would not open the chat from the keyboard. -->
      <el-tooltip
        v-if="chatOffered && !chat.open"
        :content="t('chat.panel.toggleTip', { key: shortcutLabel() })"
        placement="left"
        :show-after="300"
        :trigger-keys="[]"
        :disabled="narrow"
      >
        <el-badge :value="chat.unreadCount" :hidden="!chat.unreadCount" :max="99" class="app-chat-fab">
          <button
            id="chat-panel-toggle"
            type="button"
            class="app-chat-fab__button"
            :aria-label="chatLabel"
            aria-expanded="false"
            aria-controls="chat-panel"
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+J Meta+J"
            @click="openChat"
          >
            <el-icon :size="24" aria-hidden="true"><ChatDotRound /></el-icon>
          </button>
        </el-badge>
      </el-tooltip>
      <ChatPanel ref="chatPanel" />
    </el-container>
    <!-- A newer build deployed since this tab loaded: said, never reloaded without asking. -->
    <NewVersionNotice />
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  /* The chat's round button: how big, and how far from the screen's edges. */
  --app-fab-size: 52px;
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
/* The header's menu button, on the ground: its hover is the ground's second shade. */
.app-header .el-button.is-text:not(.is-disabled):hover {
  background-color: var(--app-ground-2);
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
/* The chat's button floats at the bottom right, clear of a phone's rounded
   corners and home bar (above its safe area), over the page and under
   everything Element Plus lays over it (the side menu and its dimmed layer
   among them): see the layers in styles/tokens.css. */
.app-chat-fab {
  position: fixed;
  right: calc(var(--app-fab-inset) + env(safe-area-inset-right, 0px));
  bottom: calc(var(--app-fab-inset) + env(safe-area-inset-bottom, 0px));
  z-index: var(--app-z-fab);
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
  padding-bottom: calc(var(--app-fab-size) + 2 * var(--app-fab-inset) + env(safe-area-inset-bottom, 0px));
}
/* On a phone, the side menu: the views, and the account at its bottom. */
.app-nav-drawer__body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-nav-drawer__body > .side-bar {
  flex: 1;
  min-height: 0;
}
@media print {
  .app-chat-fab {
    display: none;
  }
}
@media (max-width: 600px) {
  .app-main {
    padding: 16px;
  }
}
</style>
