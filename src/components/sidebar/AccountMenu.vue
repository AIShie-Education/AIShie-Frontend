<script setup lang="ts">
// The caller's account, as an editor's Accounts menu: one button, the
// initial of their name, at the bottom of the activity bar (on a phone, a row
// at the bottom of the side menu), which opens a menu with who is signed in
// (name, email or login ID, and a platform role where they hold one), the
// account's settings, the language and the theme, each a submenu whose
// choice in use is checked, and signing out. It is the only place these are
// offered: the header holds only the page's title.
//
// A menu button (aria-haspopup, aria-expanded): Enter, Space or a click
// opens it on its first item, ArrowUp on its last; the arrow keys, Home and
// End move among its items; ArrowRight, Enter or Space opens a submenu on its
// checked choice, and ArrowLeft or Escape goes back to the item it came from;
// Escape or Tab closes the menu, and focus returns to the button. Beside the
// activity bar, a submenu opens to the right of its item; in the side menu
// on a phone, where there is no room to the right, it opens beneath it.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useZIndex } from 'element-plus'
import StatusTag from '@/components/StatusTag.vue'
import AboutDialog from './AboutDialog.vue'
import { LOCALES, type Locale } from '@/i18n'
import { useSessionStore } from '@/stores/session'
import { useUiStore, type Theme } from '@/stores/ui'

const props = withDefaults(defineProps<{ variant?: 'bar' | 'drawer' }>(), { variant: 'bar' })
const { t } = useI18n()
const session = useSessionStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const { nextZIndex } = useZIndex()

const name = computed(() => session.me?.display_name ?? '')
const initial = computed(() => Array.from(name.value.trim())[0]?.toUpperCase() ?? '?')
/** What they sign in with: their email, else their login ID. */
const signInName = computed(() => session.me?.email || session.me?.login_id || '')
const role = computed(() => session.me?.platform_role || null)

type Sub = 'language' | 'theme'
const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'common.nav.themeLight', icon: 'Sunny' },
  { value: 'dark', label: 'common.nav.themeDark', icon: 'Moon' },
  { value: 'auto', label: 'common.nav.themeAuto', icon: 'Monitor' },
]
const localeLabel = computed(() => LOCALES.find((l) => l.value === ui.locale)?.label ?? '')
const themeNow = computed(() => THEMES.find((x) => x.value === ui.theme) ?? THEMES[2]!)
const themeLabel = computed(() => t(themeNow.value.label))
const themeIcon = computed(() => themeNow.value.icon)

const id = props.variant === 'bar' ? 'account-menu' : 'account-menu-drawer'
const buttonId = props.variant === 'bar' ? 'account-button' : 'account-button-drawer'
const open = ref(false)
const sub = ref<Sub | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
/** Where the menu stands beside the activity bar: fixed, from the button's place when it opened. */
const place = ref<Record<string, string>>({})

function position() {
  if (props.variant !== 'bar' || !trigger.value) return
  const r = trigger.value.getBoundingClientRect()
  place.value = {
    left: `${Math.round(r.right + 8)}px`,
    bottom: `${Math.max(8, Math.round(window.innerHeight - r.bottom))}px`,
    zIndex: String(nextZIndex()),
  }
}

/** The menu's own items (not a submenu's), or a submenu's, as they are laid out. */
function itemsOf(which: Sub | null): HTMLElement[] {
  const root = which ? menu.value?.querySelector<HTMLElement>(`[data-submenu="${which}"]`) : menu.value
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>('[data-item]')].filter(
    (el) => (el.closest('[data-submenu]') as HTMLElement | null)?.dataset.submenu === (which ?? undefined),
  )
}
function focusItem(which: Sub | null, at: number | 'checked') {
  const items = itemsOf(which)
  if (!items.length) return
  const i =
    at === 'checked'
      ? Math.max(
          0,
          items.findIndex((el) => el.getAttribute('aria-checked') === 'true'),
        )
      : at
  items[(i + items.length) % items.length]?.focus()
}

async function show(at: number = 0) {
  position()
  sub.value = null
  open.value = true
  await nextTick()
  focusItem(null, at)
}
function hide(refocus = true) {
  if (!open.value) return
  open.value = false
  sub.value = null
  if (refocus) trigger.value?.focus()
}
function toggle() {
  if (open.value) hide()
  else void show()
}
async function openSub(which: Sub, focus = true) {
  sub.value = which
  await nextTick()
  if (focus) focusItem(which, 'checked')
}
function closeSub() {
  const which = sub.value
  sub.value = null
  if (which) menu.value?.querySelector<HTMLElement>(`[data-opens="${which}"]`)?.focus()
}

function onTriggerKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    void show(e.key === 'ArrowUp' ? -1 : 0)
  }
}

function onMenuKey(e: KeyboardEvent) {
  const el = document.activeElement as HTMLElement | null
  const inSub = (el?.closest('[data-submenu]') as HTMLElement | null)?.dataset.submenu as Sub | undefined
  const which = inSub ?? null
  const items = itemsOf(which)
  const at = el ? items.indexOf(el) : -1
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      e.preventDefault()
      focusItem(which, at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1))
      return
    case 'Home':
    case 'End':
      e.preventDefault()
      focusItem(which, e.key === 'Home' ? 0 : -1)
      return
    case 'ArrowRight': {
      const opens = el?.dataset.opens as Sub | undefined
      if (opens) {
        e.preventDefault()
        void openSub(opens)
      }
      return
    }
    case 'ArrowLeft':
      if (which) {
        e.preventDefault()
        closeSub()
      }
      return
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      if (which) closeSub()
      else hide()
      return
    case 'Tab':
      e.preventDefault()
      hide()
      return
  }
}

function onSubItem(which: Sub) {
  if (sub.value === which) closeSub()
  else void openSub(which, true)
}

const about = ref(false)
function showAbout() {
  hide(false)
  about.value = true
}
function goAccount() {
  hide(false)
  void router.push({ name: 'account' })
}
function chooseLocale(l: Locale) {
  ui.locale = l
  hide()
}
function chooseTheme(v: Theme) {
  ui.theme = v
  hide()
}
async function signOut() {
  hide(false)
  await session.signOut().catch(() => undefined)
  void router.push({ name: 'login' })
}

// A press anywhere else closes it; so does going to another page, or the window changing size.
function onPointerDown(e: PointerEvent) {
  const target = e.target as Node | null
  if (!target || menu.value?.contains(target) || trigger.value?.contains(target)) return
  hide(false)
}
function onResize() {
  hide(false)
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onResize)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('resize', onResize)
  }
})
watch(
  () => route.fullPath,
  () => hide(false),
)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', onResize)
})

defineExpose({ show, hide })
</script>

<template>
  <div class="account" :class="`is-${variant}`">
    <!-- No trigger keys on the tooltip: it would take Enter and Space from the button. Its trigger is a box around
         the button, whose own aria-expanded and aria-controls the tooltip would otherwise overwrite. -->
    <el-tooltip
      v-if="variant === 'bar'"
      :content="name"
      placement="right"
      :show-after="300"
      :trigger-keys="[]"
      :disabled="open"
    >
      <span class="account__slot">
        <button
          :id="buttonId"
          ref="trigger"
          type="button"
          class="account__button"
          :class="{ 'is-open': open }"
          aria-haspopup="menu"
          :aria-expanded="open ? 'true' : 'false'"
          :aria-controls="id"
          :aria-label="t('layout.account.button', { name })"
          @click="toggle"
          @keydown="onTriggerKey"
        >
          <span class="account__avatar" aria-hidden="true">{{ initial }}</span>
        </button>
      </span>
    </el-tooltip>
    <button
      v-else
      :id="buttonId"
      ref="trigger"
      type="button"
      class="account__row"
      :class="{ 'is-open': open }"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="id"
      :aria-label="t('layout.account.button', { name })"
      @click="toggle"
      @keydown="onTriggerKey"
    >
      <span class="account__avatar" aria-hidden="true">{{ initial }}</span>
      <span class="account__who" aria-hidden="true">
        <span class="account__name">{{ name }}</span>
        <span v-if="signInName" class="account__email">{{ signInName }}</span>
      </span>
      <el-icon class="account__chevron" aria-hidden="true"><ArrowUp /></el-icon>
    </button>

    <Teleport to="body" :disabled="variant !== 'bar'">
      <div
        v-if="open"
        :id="id"
        ref="menu"
        class="account-menu"
        :class="`is-${variant}`"
        :style="variant === 'bar' ? place : undefined"
        role="menu"
        :aria-labelledby="`${id}-name`"
        @keydown="onMenuKey"
      >
        <div class="account-menu__head" role="none">
          <span class="account__avatar is-large" aria-hidden="true">{{ initial }}</span>
          <span class="account-menu__who">
            <span :id="`${id}-name`" class="account-menu__name">{{ name }}</span>
            <span v-if="signInName" class="account-menu__email">{{ signInName }}</span>
          </span>
          <StatusTag v-if="role" vocab="platformRole" :value="role" size="small" class="account-menu__role" />
        </div>
        <div class="account-menu__sep" role="separator" />

        <button type="button" class="account-menu__item" role="menuitem" data-item tabindex="-1" @click="goAccount">
          <el-icon aria-hidden="true"><User /></el-icon>
          <span class="account-menu__label">{{ t('layout.account.settings') }}</span>
        </button>

        <div class="account-menu__group" role="none">
          <button
            type="button"
            class="account-menu__item"
            role="menuitem"
            data-item
            data-opens="language"
            tabindex="-1"
            aria-haspopup="menu"
            :aria-expanded="sub === 'language' ? 'true' : 'false'"
            :aria-controls="`${id}-language`"
            @click="onSubItem('language')"
          >
            <span class="account-menu__glyph" aria-hidden="true">文</span>
            <span class="account-menu__label">{{ t('common.nav.language') }}</span>
            <span class="account-menu__value">{{ localeLabel }}</span>
            <el-icon class="account-menu__more" aria-hidden="true"><ArrowRight /></el-icon>
          </button>
          <div
            v-if="sub === 'language'"
            :id="`${id}-language`"
            class="account-menu__sub"
            role="menu"
            data-submenu="language"
            :aria-label="t('common.nav.language')"
          >
            <button
              v-for="l in LOCALES"
              :key="l.value"
              type="button"
              class="account-menu__item"
              role="menuitemradio"
              data-item
              tabindex="-1"
              :lang="l.value"
              :aria-checked="ui.locale === l.value ? 'true' : 'false'"
              @click="chooseLocale(l.value)"
            >
              <el-icon class="account-menu__check" aria-hidden="true"><Check v-if="ui.locale === l.value" /></el-icon>
              <span class="account-menu__label">{{ l.label }}</span>
            </button>
          </div>
        </div>

        <div class="account-menu__group" role="none">
          <button
            type="button"
            class="account-menu__item"
            role="menuitem"
            data-item
            data-opens="theme"
            tabindex="-1"
            aria-haspopup="menu"
            :aria-expanded="sub === 'theme' ? 'true' : 'false'"
            :aria-controls="`${id}-theme`"
            @click="onSubItem('theme')"
          >
            <el-icon aria-hidden="true"><component :is="themeIcon" /></el-icon>
            <span class="account-menu__label">{{ t('common.nav.theme') }}</span>
            <span class="account-menu__value">{{ themeLabel }}</span>
            <el-icon class="account-menu__more" aria-hidden="true"><ArrowRight /></el-icon>
          </button>
          <div
            v-if="sub === 'theme'"
            :id="`${id}-theme`"
            class="account-menu__sub"
            role="menu"
            data-submenu="theme"
            :aria-label="t('common.nav.theme')"
          >
            <button
              v-for="th in THEMES"
              :key="th.value"
              type="button"
              class="account-menu__item"
              role="menuitemradio"
              data-item
              tabindex="-1"
              :aria-checked="ui.theme === th.value ? 'true' : 'false'"
              @click="chooseTheme(th.value)"
            >
              <el-icon class="account-menu__check" aria-hidden="true"><Check v-if="ui.theme === th.value" /></el-icon>
              <span class="account-menu__label">{{ t(th.label) }}</span>
              <el-icon class="account-menu__icon-end" aria-hidden="true"><component :is="th.icon" /></el-icon>
            </button>
          </div>
        </div>

        <button type="button" class="account-menu__item" role="menuitem" data-item tabindex="-1" @click="showAbout">
          <el-icon aria-hidden="true"><InfoFilled /></el-icon>
          <span class="account-menu__label">{{ t('layout.about.item') }}</span>
        </button>

        <div class="account-menu__sep" role="separator" />
        <button type="button" class="account-menu__item" role="menuitem" data-item tabindex="-1" @click="signOut">
          <el-icon aria-hidden="true"><SwitchButton /></el-icon>
          <span class="account-menu__label">{{ t('common.actions.signOut') }}</span>
        </button>
      </div>
    </Teleport>
    <AboutDialog v-model="about" />
  </div>
</template>

<style scoped>
.account.is-drawer {
  position: relative;
}
.account__slot {
  display: flex;
}
/* On the activity bar: as its view buttons, the initial in a circle. */
.account__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--app-radius-control);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s;
}
.account__button:hover,
.account__button.is-open {
  background: var(--app-line);
}
.account__button:focus-visible {
  outline-offset: -2px;
}
.account__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  box-shadow: inset 0 0 0 1px var(--app-indigo-line);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}
.account__avatar.is-large {
  width: 34px;
  height: 34px;
  font-size: 15px;
}
/* On a phone, a row along the side menu's bottom: the initial, the name and what they sign in with. */
.account__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-top: 1px solid var(--app-line);
  background: var(--app-ground-2);
  color: var(--app-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.account__row:focus-visible {
  outline-offset: -3px;
}
.account__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.account__name,
.account__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account__name {
  font-size: 14px;
  font-weight: 600;
}
.account__email {
  font-size: 12px;
  color: var(--app-ink-3);
}
.account__chevron {
  color: var(--app-ink-3);
  transition: transform 0.15s;
}
.account__row.is-open .account__chevron {
  transform: rotate(180deg);
}

/* The menu: a card over the page, beside the activity bar (fixed, from where its button is), or over the side
   menu's list on a phone. */
.account-menu {
  position: fixed;
  width: 264px;
  padding: 6px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item);
  background: var(--app-overlay);
  box-shadow: var(--app-shadow-pop);
  color: var(--app-ink);
  font-size: 14px;
}
.account-menu.is-drawer {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(100% + 6px);
  width: auto;
  z-index: 1;
}
.account-menu__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 10px;
}
.account-menu__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.account-menu__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__email {
  font-size: 12px;
  color: var(--app-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__role {
  flex-shrink: 0;
  align-self: flex-start;
}
.account-menu__sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--app-line);
}
.account-menu__group {
  position: relative;
}
.account-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--app-radius-control);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.account-menu__item .el-icon {
  flex-shrink: 0;
  color: var(--app-ink-3);
}
.account-menu__item:hover,
.account-menu__item:focus-visible,
.account-menu__item[aria-expanded='true'] {
  background: var(--app-ground-2);
  outline: none;
}
.account-menu__item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--app-focus);
}
/* The language's mark, where the other items have an icon. */
.account-menu__glyph {
  display: inline-flex;
  justify-content: center;
  flex-shrink: 0;
  width: 1em;
  font-size: 14px;
  line-height: 1;
  color: var(--app-ink-3);
}
.account-menu__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__value {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-ink-3);
}
.account-menu__item[aria-checked='true'] {
  font-weight: 600;
}
.account-menu__item[aria-checked='true'] .account-menu__check {
  color: var(--app-indigo);
}
/* A submenu: to the right of its item, its bottom level with the item's, beside the activity bar; */
.account-menu__sub {
  position: absolute;
  left: calc(100% + 10px);
  bottom: -6px;
  width: 200px;
  padding: 6px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-item);
  background: var(--app-overlay);
  box-shadow: var(--app-shadow-pop);
}
/* beneath its item, indented, in the side menu on a phone. */
.account-menu.is-drawer .account-menu__sub {
  position: static;
  width: auto;
  margin: 2px 0 4px 24px;
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}
.account-menu.is-drawer .account-menu__more {
  transform: rotate(90deg);
}
.account-menu.is-drawer [aria-expanded='true'] .account-menu__more {
  transform: rotate(-90deg);
}
@media (prefers-reduced-motion: reduce) {
  .account__chevron {
    transition: none;
  }
}
@media print {
  .account {
    display: none;
  }
}
</style>
