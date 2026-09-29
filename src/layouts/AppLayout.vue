<script setup lang="ts">
// The frame around every signed-in page: the caller's courses and, for
// administrators, the administration pages on the left; language, theme and
// the account menu on top; and on the right, as in an editor, a rail along
// the window's edge with a button for each side panel (the chat with the
// courses' agents, for now), the panel docked between the page and the rail
// while it is open. On a phone there is no rail: the chat's button floats at
// the bottom right, and the panel is a sheet over the page. A department's
// administrator is offered the courses and departments they administer;
// people, terms and presets are a platform administrator's.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { useUiStore, type Theme } from '@/stores/ui'
import { LOCALES, type Locale } from '@/i18n'
import AppWordmark from '@/components/AppWordmark.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { shortcutLabel } from '@/components/chat/panel'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { titleKey } from '@/router/title'

const session = useSessionStore()
const ui = useUiStore()
// The language button shows the language in use in a mark of its own (繁, 简,
// EN), not a speech-bubble icon, which would read as the chat's.
const localeMark = computed(() => ({ 'zh-Hant': '繁', 'zh-Hans': '简', en: 'EN' })[ui.locale as Locale] ?? 'EN')
const chat = useChatStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const narrow = useMediaQuery('(max-width: 899px)')
const drawer = ref(false)
watch(
  () => route.fullPath,
  () => (drawer.value = false),
)

const courses = computed(() =>
  [...session.liveMemberships].sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)
const activeCourseId = computed(() => (route.params.courseId as string | undefined) ?? null)

const allAdminLinks = [
  { name: 'admin-courses', icon: 'School', label: 'admin.nav.courses' },
  { name: 'admin-actors', icon: 'User', label: 'admin.nav.actors', platform: true },
  { name: 'admin-terms', icon: 'Calendar', label: 'admin.nav.terms', platform: true },
  { name: 'admin-departments', icon: 'OfficeBuilding', label: 'admin.nav.departments' },
  { name: 'admin-presets', icon: 'Key', label: 'admin.nav.presets', platform: true },
]
const adminLinks = computed(() => allAdminLinks.filter((l) => !l.platform || session.isAdmin))

const themes: { value: Theme; label: string; icon: string }[] = [
  { value: 'auto', label: 'common.nav.themeAuto', icon: 'Monitor' },
  { value: 'light', label: 'common.nav.themeLight', icon: 'Sunny' },
  { value: 'dark', label: 'common.nav.themeDark', icon: 'Moon' },
]
const themeIcon = computed(() => themes.find((x) => x.value === ui.theme)?.icon ?? 'Monitor')

async function signOut() {
  await session.signOut().catch(() => undefined)
  router.push({ name: 'login' })
}

function onUserCommand(cmd: string) {
  if (cmd === 'account') router.push({ name: 'account' })
  else if (cmd === 'agents') router.push({ name: 'account-agents' })
  else if (cmd === 'signout') void signOut()
}

// The chat's button, on the rail (on a phone, floating over the page while
// the sheet is closed): offered where the caller may ask agents somewhere
// (or while the panel is open), with how many answers they have not read.
// The rail stays, empty, for someone who may ask nowhere: it is part of the
// frame, as an editor's activity bar is.
const chatOffered = computed(() => chat.courses.length > 0 || chat.open)
const chatPanel = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatLabel = computed(() =>
  chat.unreadCount ? t('chat.panel.toggleUnread', { n: chat.unreadCount }) : t('chat.panel.toggle'),
)
function toggleChat() {
  chat.toggle()
  if (chat.open) void chatPanel.value?.focusPanel()
}

/** The rail is a toolbar: the arrow keys (and Home, End) move between its buttons. */
function onRailKey(e: KeyboardEvent) {
  const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])')]
  const at = buttons.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  const moves: Record<string, number> = { ArrowUp: at - 1, ArrowDown: at + 1, Home: 0, End: buttons.length - 1 }
  const to = moves[e.key]
  if (to === undefined) return
  e.preventDefault()
  buttons[(to + buttons.length) % buttons.length]?.focus()
}

// The browser's tab is named by the router (router/title.ts); this is the header's.
const pageTitle = computed(() => {
  const key = titleKey(route)
  return key ? t(key) : ''
})
</script>

<template>
  <el-container class="app-shell">
    <component
      :is="narrow ? 'el-drawer' : 'el-aside'"
      v-bind="
        narrow
          ? { modelValue: drawer, direction: 'ltr', size: '280px', withHeader: false, appendToBody: true, class: 'app-nav-drawer' }
          : { width: '264px' }
      "
      class="app-aside"
      @update:model-value="(v: boolean) => (drawer = v)"
    >
      <div class="app-aside__inner">
        <router-link :to="{ name: 'home' }" class="app-brand">
          <AppWordmark class="app-brand__logo" />
        </router-link>

        <nav class="app-nav">
          <router-link :to="{ name: 'home' }" class="app-nav__item" :class="{ 'is-active': route.name === 'home' }">
            <el-icon><House /></el-icon>
            <span>{{ t('common.nav.home') }}</span>
          </router-link>

          <div v-if="courses.length" class="app-nav__section">
            <div class="app-nav__heading">{{ t('layout.courses') }}</div>
            <router-link
              v-for="m in courses"
              :key="m.member_id"
              :to="{ name: 'course-overview', params: { courseId: m.course_id } }"
              class="app-nav__item app-nav__course"
              :class="{ 'is-active': activeCourseId === m.course_id }"
            >
              <span class="app-nav__code">{{ m.code }}{{ m.section ? ` · ${m.section}` : '' }}</span>
              <span class="app-nav__title">{{ m.title }}</span>
              <span v-if="m.status === 'paused' || m.course_status !== 'active'" class="app-nav__flags">
                <StatusTag v-if="m.status === 'paused'" vocab="memberStatus" :value="m.status" />
                <StatusTag v-if="m.course_status !== 'active'" vocab="courseStatus" :value="m.course_status" />
              </span>
            </router-link>
          </div>

          <div v-if="session.canAdminister" class="app-nav__section">
            <div class="app-nav__heading">{{ t('common.nav.admin') }}</div>
            <router-link
              v-for="l in adminLinks"
              :key="l.name"
              :to="{ name: l.name }"
              class="app-nav__item"
              :class="{ 'is-active': typeof route.name === 'string' && route.name.startsWith(l.name.replace(/s$/, '')) }"
            >
              <el-icon><component :is="l.icon" /></el-icon>
              <span>{{ t(l.label) }}</span>
            </router-link>
          </div>
        </nav>
      </div>
    </component>

    <el-container direction="vertical" class="app-main-wrap">
      <el-header class="app-header" height="56px">
        <div class="app-header__left">
          <el-button v-if="narrow" text circle :aria-label="t('layout.menu')" @click="drawer = true">
            <el-icon :size="20"><Menu /></el-icon>
          </el-button>
          <span class="app-header__title">{{ pageTitle }}</span>
        </div>
        <div class="app-header__right">
          <el-dropdown trigger="click" @command="(l: Locale) => (ui.locale = l)">
            <el-button text circle :aria-label="t('common.nav.language')">
              <span class="app-lang" aria-hidden="true">{{ localeMark }}</span>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="l in LOCALES" :key="l.value" :command="l.value" :disabled="ui.locale === l.value">
                  {{ l.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-dropdown trigger="click" @command="(v: Theme) => (ui.theme = v)">
            <el-button text circle :aria-label="t('common.nav.theme')">
              <el-icon :size="18"><component :is="themeIcon" /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="th in themes" :key="th.value" :command="th.value" :disabled="ui.theme === th.value">
                  <el-icon><component :is="th.icon" /></el-icon>
                  {{ t(th.label) }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-dropdown trigger="click" @command="onUserCommand">
            <button type="button" class="app-user">
              <el-avatar :size="28" class="app-user__avatar">{{ session.me?.display_name?.slice(0, 1) ?? '?' }}</el-avatar>
              <span class="app-user__name">{{ session.me?.display_name }}</span>
              <StatusTag v-if="session.me?.platform_role" vocab="platformRole" :value="session.me.platform_role" />
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="account">
                  <el-icon><User /></el-icon>{{ t('common.nav.account') }}
                </el-dropdown-item>
                <el-dropdown-item v-if="session.me?.kind === 'human'" command="agents">
                  <el-icon><Cpu /></el-icon>{{ t('common.nav.agents') }}
                </el-dropdown-item>
                <el-dropdown-item command="signout" divided>
                  <el-icon><SwitchButton /></el-icon>{{ t('common.actions.signOut') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <div class="app-body">
        <el-main class="app-main" :class="{ 'has-chat-fab': narrow && chatOffered }">
          <router-view />
        </el-main>
        <ChatPanel ref="chatPanel" />
        <!-- The rail along the right edge, as an editor's activity bar: a button for each side panel, the chat's for now. -->
        <div
          v-if="!narrow"
          class="app-rail"
          role="toolbar"
          aria-orientation="vertical"
          :aria-label="t('layout.panels')"
          @keydown="onRailKey"
        >
          <!-- No trigger keys: by default the tooltip takes Enter and Space for itself, and the button would not open the panel from the keyboard. -->
          <el-tooltip
            v-if="chatOffered"
            :content="t('chat.panel.toggleTip', { key: shortcutLabel() })"
            placement="left"
            :show-after="300"
            :trigger-keys="[]"
          >
            <el-badge :value="chat.unreadCount" :hidden="!chat.unreadCount" :max="99" class="app-rail__badge">
              <button
                id="chat-panel-toggle"
                type="button"
                class="app-rail__button"
                :class="{ 'is-active': chat.open }"
                :aria-label="chatLabel"
                :aria-expanded="chat.open ? 'true' : 'false'"
                aria-controls="chat-panel"
                aria-keyshortcuts="Control+J Meta+J"
                @click="toggleChat"
              >
                <el-icon :size="20" aria-hidden="true"><ChatDotRound /></el-icon>
              </button>
            </el-badge>
          </el-tooltip>
        </div>
      </div>
      <!-- On a phone, no rail: the chat's button floats at the bottom right while its sheet is closed. -->
      <el-badge
        v-if="narrow && chatOffered && !chat.open"
        :value="chat.unreadCount"
        :hidden="!chat.unreadCount"
        :max="99"
        class="app-chat-fab"
      >
        <button
          id="chat-panel-toggle"
          type="button"
          class="app-chat-fab__button"
          :aria-label="chatLabel"
          aria-expanded="false"
          aria-controls="chat-panel"
          aria-haspopup="dialog"
          @click="toggleChat"
        >
          <el-icon :size="24" aria-hidden="true"><ChatDotRound /></el-icon>
        </button>
      </el-badge>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  /* The phone's floating chat button: how big, and how far from the screen's edges. */
  --app-fab-size: 52px;
  --app-fab-inset: 16px;
}
.app-aside {
  border-right: 1px solid var(--app-line);
  background: var(--app-ground);
}
.app-aside__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
}
.app-brand {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 22px;
  text-decoration: none;
  flex-shrink: 0;
}
.app-brand__logo {
  height: 26px;
}
.app-nav {
  padding: 8px 12px 24px;
}
.app-nav__section {
  margin-top: 18px;
}
.app-nav__heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 10px 6px;
}
.app-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 14px;
}
.app-nav__item:hover {
  background: var(--app-ground-2);
  color: var(--app-ink);
}
.app-nav__item.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-weight: 500;
}
.app-nav__course {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.app-nav__code {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.app-nav__course.is-active .app-nav__code {
  color: var(--app-indigo);
}
.app-nav__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.app-nav__flags {
  display: flex;
  gap: 4px;
}
.app-main-wrap {
  min-width: 0;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--app-line);
  background: var(--app-ground);
  position: sticky;
  top: 0;
  z-index: var(--app-z-header);
  gap: 12px;
}
.app-header__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.app-header__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-header__right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.app-header__left {
  flex: 1 1 auto;
}
.app-header__right {
  flex-shrink: 0;
}
.app-lang {
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
}
.app-user {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--el-text-color-primary);
  padding: 4px 8px;
  border-radius: var(--app-radius-control);
  font: inherit;
}
.app-user:hover {
  background: var(--app-ground-2);
}
/* The header's icon buttons, on the ground: their hover is the ground's second shade. */
.app-header .el-button.is-text:not(.is-disabled):hover {
  background-color: var(--app-ground-2);
}
.app-user__avatar {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-size: 13px;
  font-weight: 600;
}
.app-user__name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 600px) {
  .app-user__name {
    display: none;
  }
}
/* The page, and beside it the chat panel while it is open: the panel takes its width from the page. */
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
/* The rail along the right edge, under the header, as tall as the window: a
   step off the ground, with a hairline between it and the page (or the panel). */
.app-rail {
  position: sticky;
  top: 56px;
  flex: 0 0 auto;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 48px;
  height: calc(100vh - 56px);
  height: calc(100dvh - 56px);
  padding: 8px 0;
  border-left: 1px solid var(--app-line);
  background: var(--app-ground-2);
}
.app-rail__button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--app-radius-control);
  background: transparent;
  color: var(--app-ink-3);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.app-rail__button:hover {
  background: var(--app-line);
  color: var(--app-ink);
}
/* Its focus ring inside its edge, which is close to the window's. */
.app-rail__button:focus-visible {
  outline-offset: -2px;
}
/* Its panel open: tinted, with a bar on the rail's outer edge, as an editor marks the view it shows. */
.app-rail__button.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
}
.app-rail__button.is-active::after {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  right: -3px;
  width: 2px;
  border-radius: 1px;
  background: var(--app-indigo);
}
/* The count sits on the button's corner, inside the rail: the window's edge is just beyond it. */
.app-rail__badge :deep(.el-badge__content.is-fixed) {
  top: 2px;
  right: 2px;
  transform: none;
}
/* On a phone, the chat's button floats at the bottom right, clear of the
   screen's rounded corners and home bar, and under everything Element Plus
   lays over the page (the side menu and its dimmed layer among them): see
   the layers in styles/tokens.css. */
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
}
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
@media print {
  .app-rail,
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
