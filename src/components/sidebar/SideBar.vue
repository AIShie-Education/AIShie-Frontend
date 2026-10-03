<script setup lang="ts">
// The primary side bar, as an editor's: the view chosen on the activity bar
// (ActivityBar), beside it on the window's left edge, at a fixed width
// (SIDEBAR_WIDTH); this browser remembers the view and whether it is open
// (stores/sidebar.ts).
//
// On a phone (mode 'drawer') it is the menu the header's button opens: the
// views are tabs along its top, and the one chosen is below them. Following a
// link in it says so ('follow'), for the menu to close.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSideBarStore } from '@/stores/sidebar'
import SideAdmin from './SideAdmin.vue'
import SideAgents from './SideAgents.vue'
import SideCourses from './SideCourses.vue'
import { SIDEBAR_WIDTH, VIEW_META, type SideView } from './frame'

const props = withDefaults(defineProps<{ mode?: 'docked' | 'drawer' }>(), { mode: 'docked' })
const emit = defineEmits<{ follow: [] }>()
const { t } = useI18n()
const side = useSideBarStore()

const BODIES = { courses: SideCourses, agents: SideAgents, admin: SideAdmin } as const
const title = computed(() => t(VIEW_META[side.shown].label))

/** A link in the view was followed (even to the page already shown). */
function onBodyClick(e: MouseEvent) {
  if ((e.target as Element | null)?.closest?.('a[href]')) emit('follow')
}

// --- The phone's tabs -------------------------------------------------------
/** The tabs are one stop for Tab: the arrow keys (and Home, End) choose among them. */
function onTabKey(e: KeyboardEvent) {
  const views = side.views
  const at = views.indexOf(side.shown)
  const moves: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: views.length - 1 }
  const to = moves[e.key]
  if (to === undefined) return
  e.preventDefault()
  const v = views[(to + views.length) % views.length] as SideView
  side.select(v)
  ;(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`#side-tab-${v}`)?.focus()
}
</script>

<template>
  <aside
    v-if="props.mode === 'docked'"
    id="side-bar"
    class="side-bar"
    :style="{ width: `${SIDEBAR_WIDTH}px` }"
    aria-labelledby="side-bar-title"
  >
    <header class="side-bar__head">
      <h2 id="side-bar-title" class="side-bar__title">{{ title }}</h2>
    </header>
    <div class="side-bar__body" @click="onBodyClick">
      <component :is="BODIES[side.shown]" :key="side.shown" />
    </div>
  </aside>

  <div v-else class="side-bar is-drawer">
    <div class="side-bar__tabs" role="tablist" :aria-label="t('layout.side.views')" @keydown="onTabKey">
      <button
        v-for="v in side.views"
        :id="`side-tab-${v}`"
        :key="v"
        type="button"
        role="tab"
        class="side-bar__tab"
        :class="{ 'is-active': side.shown === v }"
        :aria-selected="side.shown === v ? 'true' : 'false'"
        aria-controls="side-bar-panel"
        :tabindex="side.shown === v ? 0 : -1"
        @click="side.select(v)"
      >
        <el-icon :size="20" aria-hidden="true"><component :is="VIEW_META[v].icon" /></el-icon>
        <span>{{ t(VIEW_META[v].label) }}</span>
      </button>
    </div>
    <div
      id="side-bar-panel"
      class="side-bar__body"
      role="tabpanel"
      :aria-labelledby="`side-tab-${side.shown}`"
      @click="onBodyClick"
    >
      <component :is="BODIES[side.shown]" :key="side.shown" />
    </div>
  </div>
</template>

<style scoped>
/* Beside the activity bar, as tall as the window, on the ground, with a hairline between it and the page. */
.side-bar {
  position: sticky;
  top: 0;
  flex: 0 0 auto;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  border-right: 1px solid var(--app-line);
  background: var(--app-ground);
}
.side-bar.is-drawer {
  position: static;
  width: 100%;
  height: 100%;
  border-right: none;
}
/* Its title, as high as the header beside it, and ruled as it is. */
.side-bar__head {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-line);
}
.side-bar__title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-ink-3);
}
.side-bar__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 8px 24px;
}
/* On a phone, the views are tabs along the menu's top, each its icon over its name. */
.side-bar__tabs {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--app-line);
  background: var(--app-ground-2);
}
.side-bar__tab {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border: none;
  border-radius: var(--app-radius-control);
  background: transparent;
  color: var(--app-ink-3);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.side-bar__tab span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-bar__tab.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-weight: 600;
}
@media print {
  .side-bar {
    display: none;
  }
}
</style>

<style>
/* What every view lists: links, one to a line or more, the one open tinted. */
.side-bar .side-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side-bar .side-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 14px;
  line-height: 1.4;
}
.side-bar .side-item:hover {
  background: var(--app-ground-2);
  color: var(--app-ink);
}
.side-bar .side-item.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
}
.side-bar .side-item:focus-visible {
  outline-offset: -2px;
}
.side-bar .side-link {
  margin-top: 8px;
}
.side-bar .side-list .side-link {
  margin-top: 0;
}
.side-bar .side-group {
  margin-top: 18px;
}
.side-bar .side-heading {
  margin: 0;
  padding: 0 10px 6px;
  font-family: var(--app-font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-ink-3);
}
/* Chinese has no capitals, and its characters are not spaced out. */
html:lang(zh) .side-bar__title,
html:lang(zh) .side-bar .side-heading {
  letter-spacing: 0;
}
.side-bar .side-note {
  margin: 4px 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.side-bar .side-more {
  display: inline-block;
  margin: 6px 10px 0;
  font-size: 13px;
}
.side-bar .side-loading {
  min-height: 64px;
}
</style>
