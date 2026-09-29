<script setup lang="ts">
// The frame around every signed-in page: the caller's courses and, for
// administrators, the administration pages on the left; the chat with the
// courses' agents, language, theme and the account menu on top; and the chat
// panel, docked on the right while it is open (a sheet over the page on a
// phone). A department's administrator is offered the courses and
// departments they administer; people, terms and presets are a platform
// administrator's.
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

// The chat's button: offered where the caller may ask agents somewhere (or
// while the panel is open), with how many answers they have not read.
const chatOffered = computed(() => chat.courses.length > 0 || chat.open)
const chatPanel = ref<InstanceType<typeof ChatPanel> | null>(null)
const chatLabel = computed(() =>
  chat.unreadCount ? t('chat.panel.toggleUnread', { n: chat.unreadCount }) : t('chat.panel.toggle'),
)
function toggleChat() {
  chat.toggle()
  if (chat.open) void chatPanel.value?.focusPanel()
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
          <el-tooltip
            v-if="chatOffered"
            :content="t('chat.panel.toggleTip', { key: shortcutLabel() })"
            placement="bottom"
            :show-after="300"
          >
            <el-badge :value="chat.unreadCount" :hidden="!chat.unreadCount" :max="99" class="app-chat-badge">
              <el-button
                id="chat-panel-toggle"
                text
                circle
                class="app-chat-toggle"
                :class="{ 'is-open': chat.open }"
                :aria-label="chatLabel"
                :aria-expanded="chat.open ? 'true' : 'false'"
                aria-controls="chat-panel"
                aria-keyshortcuts="Control+J Meta+J"
                @click="toggleChat"
              >
                <el-icon :size="18"><ChatDotRound /></el-icon>
              </el-button>
            </el-badge>
          </el-tooltip>

          <el-dropdown trigger="click" @command="(l: Locale) => (ui.locale = l)">
            <el-button text circle :aria-label="t('common.nav.language')">
              <el-icon :size="18"><ChatLineSquare /></el-icon>
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
        <el-main class="app-main">
          <router-view />
        </el-main>
        <ChatPanel ref="chatPanel" />
      </div>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
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
  z-index: 10;
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
.app-chat-badge :deep(.el-badge__content) {
  top: 6px;
  right: 10px;
}
.app-header .app-chat-toggle.is-open {
  background-color: var(--app-indigo-tint);
  color: var(--app-indigo);
}
@media (max-width: 600px) {
  .app-main {
    padding: 16px;
  }
}
</style>
