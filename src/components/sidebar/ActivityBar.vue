<script setup lang="ts">
// The activity bar along the window's left edge, as an editor's: the brand's
// mark on top, which leads home, and under it a button for each view the
// caller is offered (their courses, their agents, administration). A button
// shows its view in the side bar beside it (SideBar), or, pressed again while
// its view is shown, collapses the side bar. It is a vertical toolbar: one
// of its buttons is reached with Tab, and the arrow keys, Home and End move
// between them. At its bottom, as an editor's Accounts, the caller's account
// (AccountMenu): their language, the theme and signing out are there. A phone
// has none: the header's menu opens the views instead, with the account at
// the menu's bottom.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppMark from '@/components/AppMark.vue'
import { useSideBarStore } from '@/stores/sidebar'
import AccountMenu from './AccountMenu.vue'
import { VIEW_META, type SideView } from './frame'

const { t } = useI18n()
const side = useSideBarStore()

const isOpen = (v: SideView) => side.open && side.shown === v

/** The button Tab reaches: the one focused last, else the view shown's. */
const focused = ref<SideView | null>(null)
const tabStop = computed(() => (focused.value && side.views.includes(focused.value) ? focused.value : side.shown))

function onKey(e: KeyboardEvent) {
  const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])')]
  const at = buttons.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  const moves: Record<string, number> = { ArrowUp: at - 1, ArrowDown: at + 1, Home: 0, End: buttons.length - 1 }
  const to = moves[e.key]
  if (to === undefined) return
  e.preventDefault()
  buttons[(to + buttons.length) % buttons.length]?.focus()
}
</script>

<template>
  <div class="activity-bar">
    <router-link
      :to="{ name: 'home' }"
      class="activity-bar__home"
      :aria-label="t('common.nav.home')"
      :title="t('common.nav.home')"
    >
      <AppMark decorative class="activity-bar__mark" />
    </router-link>
    <div
      class="activity-bar__items"
      role="toolbar"
      aria-orientation="vertical"
      :aria-label="t('layout.side.views')"
      @keydown="onKey"
    >
      <!-- No trigger keys: by default the tooltip takes Enter and Space for itself, and the button would not work
           from the keyboard. Its trigger is a box around the button, whose own aria-expanded and aria-controls the
           tooltip would otherwise overwrite. -->
      <el-tooltip
        v-for="v in side.views"
        :key="v"
        :content="t(VIEW_META[v].label)"
        placement="right"
        :show-after="300"
        :trigger-keys="[]"
      >
        <span class="activity-bar__slot">
          <button
            :id="`side-view-${v}`"
            type="button"
            class="activity-bar__button"
            :class="{ 'is-active': isOpen(v) }"
            :aria-label="t(VIEW_META[v].label)"
            :aria-expanded="isOpen(v) ? 'true' : 'false'"
            aria-controls="side-bar"
            :tabindex="v === tabStop ? 0 : -1"
            @focus="focused = v"
            @click="side.toggle(v)"
          >
            <el-icon :size="22" aria-hidden="true"><component :is="VIEW_META[v].icon" /></el-icon>
          </button>
        </span>
      </el-tooltip>
    </div>
    <div class="activity-bar__foot">
      <AccountMenu />
    </div>
  </div>
</template>

<style scoped>
/* Along the window's left edge, as tall as the window: a step off the ground,
   with a hairline between it and what is beside it. */
.activity-bar {
  position: sticky;
  top: 0;
  flex: 0 0 48px;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  height: 100vh;
  height: 100dvh;
  border-right: 1px solid var(--app-line);
  background: var(--app-ground-2);
}
/* The mark, as high as the header beside it. */
.activity-bar__home {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 100%;
  height: 56px;
  border-radius: var(--app-radius-control);
}
.activity-bar__home:focus-visible {
  outline-offset: -4px;
}
.activity-bar__mark {
  height: 28px;
}
.activity-bar__items {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
}
/* The account, at the bottom, as an editor's Accounts. */
.activity-bar__foot {
  margin-top: auto;
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
.activity-bar__slot {
  display: flex;
}
.activity-bar__button {
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
.activity-bar__button:hover {
  background: var(--app-line);
  color: var(--app-ink);
}
/* Its focus ring inside its edge, which is close to the window's. */
.activity-bar__button:focus-visible {
  outline-offset: -2px;
}
/* Its view shown: tinted, with a bar on the bar's outer edge, as an editor marks the view it shows. */
.activity-bar__button.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
}
.activity-bar__button.is-active::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: -3px;
  width: 2px;
  border-radius: 1px;
  background: var(--app-indigo);
}
@media print {
  .activity-bar {
    display: none;
  }
}
</style>
