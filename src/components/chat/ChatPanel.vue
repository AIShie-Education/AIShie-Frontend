<script setup lang="ts">
// The chat, a pane docked at the window's right edge beside every
// signed-in page, as an editor's side panel is: the page column narrows by
// its width while it is open and lays itself out by its own width, as it
// does beside the side bar on the left, and nothing floats over the page. It
// opens from the chat's button at the header's right end (AppLayout), full
// height, its head row as high as the header and ruled with it, on the
// page's own ground with a rule at its left. It is 400 px wide until its left
// edge is dragged (or moved with the arrow keys, as a separator), from 320 up
// to 640 px and never so wide that the page beside it is left less than
// 420 px; in a window without room for the side bar too, the side bar gives
// way while the pane is open (stores/sidebar.ts). A double click on the edge
// puts it back. This browser remembers whether it was open, and how wide. Its head
// row minimizes it (as Escape does from within it, and Ctrl/⌘+J, which opens
// it too), and it opens again on what it showed; or closes it, and it opens
// again on a new conversation. Either way focus goes back to the button. It
// is a region of the page (complementary), not a dialog: the page beside it
// is there to use.
//
// On a phone (up to 899 px wide) it is a sheet over the whole screen, a modal
// dialog, with no edge to drag, closed with its button, Escape or back, which
// keeps what it showed, as minimizing the pane does; following a link in it
// closes it too. The pane on a wider screen is not closed by back: it is no
// modal one, and stays open from page to page, which back moves between.
//
// Under its head row (on a phone, on top), the course asked in (one of the
// caller's courses where they may ask: the page's own on a course page, else
// the last one used), a new conversation, and the history. A new conversation starts with one of that
// course's agents; the history lists the caller's conversations with agents
// in that course or in all of them; a conversation is read and written in
// the same pane as ever.
//
// Files dropped on the panel go to the conversation it shows, attached to
// what the caller is writing (ChatPane takes those dropped on it, and those
// dropped on the pane's head row or the panel's bar come to it too); where
// it shows none to write in, the panel takes them and does nothing with
// them, rather than the page beside it (materials, say) taking them.
//
// Mounted once, open or not: it reads the newest of the caller's
// conversations again every UNREAD_POLL_MS while the page is shown, so that an
// answer, wherever it came and whichever device read the others, is counted on
// its button until it is read. A conversation on screen is marked read as it
// is read (ChatPane).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { Respondent } from '@/api/types'
import { dragHasFiles, filesFrom } from '@/composables/useFileDrop'
import { useBackCloses } from '@/composables/useBackCloses'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { usePolling } from '@/composables/usePolling'
import { useChatStore } from '@/stores/chat'
import { useSideBarStore } from '@/stores/sidebar'
import AppEmpty from '@/components/AppEmpty.vue'
import AgentPicker from './AgentPicker.vue'
import ChatHistory from './ChatHistory.vue'
import ChatPane from './ChatPane.vue'
import {
  clampWidth,
  isPanelShortcut,
  PANEL_DEFAULT,
  PANEL_MIN,
  PANEL_SHEET_MAX_WIDTH,
  panelMax,
  UNREAD_POLL_MS,
  widthForKey,
} from './panel'
import { courseLabel } from './seat'
import { joinParts } from '@/utils/parts'

const { t } = useI18n()
const chat = useChatStore()
const route = useRoute()
const sheet = useMediaQuery(`(max-width: ${PANEL_SHEET_MAX_WIDTH}px)`)
const panel = ref<HTMLElement | null>(null)

// --- How wide the pane is ------------------------------------------------------
/**
 * The width the page and the pane share: the window's, less what is at its
 * left (the activity bar and the side bar), where the page column starts.
 * jsdom has no layout: the window's width there.
 */
function measureRoom(): number {
  const vw = typeof document === 'undefined' ? 0 : document.documentElement.clientWidth
  const width = vw || (typeof window === 'undefined' ? 1280 : window.innerWidth)
  const column = typeof document === 'undefined' ? null : document.querySelector('.app-main-wrap')
  return width - Math.max(0, column?.getBoundingClientRect().left ?? 0)
}
const room = ref<number>(measureRoom())
function onResize() {
  room.value = measureRoom()
}
// The side bar opened, collapsed or giving way to the pane (stores/sidebar.ts) leaves the page and the pane more
// room, or less.
const side = useSideBarStore()
watch(
  () => side.visible,
  () => void nextTick(onResize),
)
/** The widest the pane may be now. */
const maxWidth = computed(() => panelMax(room.value))
/** While its edge is dragged, how wide it is: kept once let go. */
const dragWidth = ref<number | null>(null)
const shownWidth = computed(() => dragWidth.value ?? clampWidth(chat.width ?? PANEL_DEFAULT, maxWidth.value))
const paneStyle = computed(() => ({ width: `${shownWidth.value}px` }))

// A drag reads nothing of the layout as it goes: where it started and the
// widest are taken once, and the width is set once a frame.
const nextFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => window.setTimeout(cb, 16)
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => window.clearTimeout(id)
let drag: { x: number; from: number; max: number; at: number } | null = null
let frame = 0
function dragTo(x: number) {
  if (!drag) return
  // The edge dragged to the left, towards the page, widens it.
  dragWidth.value = clampWidth(drag.from - (x - drag.x), drag.max)
}
function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  drag = { x: e.clientX, from: shownWidth.value, max: maxWidth.value, at: e.clientX }
  dragWidth.value = shownWidth.value
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.classList.add('is-dragging-chat')
}
function onPointerMove(e: PointerEvent) {
  if (!drag) return
  drag.at = e.clientX
  if (frame) return
  frame = nextFrame(() => {
    frame = 0
    if (drag) dragTo(drag.at)
  })
}
function endDrag() {
  document.body.classList.remove('is-dragging-chat')
}
function onPointerUp(e: PointerEvent) {
  if (!drag) return
  if (frame) cancelFrame(frame)
  frame = 0
  dragTo(drag.at)
  drag = null
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  endDrag()
  // Kept once let go, not while it moves.
  if (dragWidth.value !== null) chat.width = dragWidth.value
  dragWidth.value = null
}
// Closed (or turned into the sheet) while its edge is dragged: the drag is let go, and nothing of it kept.
watch(
  () => chat.open && !sheet.value,
  (shown) => {
    if (shown) return void nextTick(onResize)
    if (!drag) return
    if (frame) cancelFrame(frame)
    frame = 0
    drag = null
    dragWidth.value = null
    endDrag()
  },
)
function onEdgeKey(e: KeyboardEvent) {
  const w = widthForKey(e.key, shownWidth.value, maxWidth.value, { shift: e.shiftKey })
  if (w === null) return
  e.preventDefault()
  chat.width = w
}
/** Back to its width until resized. */
function resetWidth() {
  chat.width = null
}

// --- Opening and closing ---------------------------------------------------
/** Offered where the caller may ask somewhere, or while it is open (on a conversation sent here). */
const offered = computed(() => chat.courses.length > 0 || chat.open)

async function focusPanel() {
  await nextTick()
  const el = panel.value
  if (!el) return
  // Where one writes, if there is somewhere; else the course, else the panel itself.
  const first =
    el.querySelector<HTMLElement>('textarea:not([disabled])') ??
    el.querySelector<HTMLElement>('.chat-panel__course input') ??
    el.querySelector<HTMLElement>('.chat-panel__bar button')
  ;(first ?? el).focus()
}
/** Back to the button that opens it, at the header's right end. */
function focusToggle() {
  document.getElementById('chat-panel-toggle')?.focus()
}
/** Minimized (on a phone, the sheet closed): it opens again on what it showed. */
function minimize() {
  chat.setOpen(false)
  void nextTick(focusToggle)
}
/** Closed: it opens again on a new conversation. */
function close() {
  chat.close()
  void nextTick(focusToggle)
}
function toggleFromKeyboard() {
  if (chat.open) minimize()
  else {
    chat.setOpen(true)
    void focusPanel()
  }
}
defineExpose({ focusPanel })
// On a phone, back closes the sheet, keeping what it showed, as its button does.
useBackCloses(() => chat.open, minimize, { when: sheet })

function onKeydown(e: KeyboardEvent) {
  if (isPanelShortcut(e) && offered.value) {
    e.preventDefault()
    toggleFromKeyboard()
    return
  }
  if (e.key !== 'Escape' || !chat.open || e.defaultPrevented) return
  // The sheet, which covers the page, or the pane from within it.
  if (!sheet.value && !panel.value?.contains(document.activeElement)) return
  // Not while a box of its own (a confirmation, a list) is open over it: that closes first.
  const over = [...document.querySelectorAll<HTMLElement>('.el-overlay, .el-popper')].some(
    (el) => getComputedStyle(el).display !== 'none',
  )
  if (!over) minimize()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  onResize()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  if (frame) cancelFrame(frame)
  endDrag()
  document.documentElement.classList.remove('chat-sheet-open')
})

// The course the page shows is the one asked in; on a phone the sheet covers
// the page, and gives way to wherever a link in it leads, though not to the
// page under it writing its own address (a search, as it is typed).
watch(
  () => (typeof route.params.courseId === 'string' ? route.params.courseId : null),
  (id) => chat.followPage(id),
  { immediate: true },
)
watch(
  () => route.path,
  () => {
    if (sheet.value && chat.open) chat.setOpen(false)
  },
)
// Under the sheet, the page does not scroll.
watch(
  () => sheet.value && chat.open,
  (covered) => document.documentElement.classList.toggle('chat-sheet-open', covered),
  { immediate: true },
)

// --- What it shows -----------------------------------------------------------
const byCourse = computed(() => new Map(chat.courses.map((m) => [m.course_id, m])))
function labelOf(courseId: string): string | null {
  const m = byCourse.value.get(courseId)
  return m ? courseLabel(m, chat.courses) : null
}
const courseName = computed(() => {
  const m = chat.courseId ? byCourse.value.get(chat.courseId) : undefined
  return m ? courseLabel(m, chat.courses) : ''
})
const inHistory = computed(() => chat.screen === 'history')

function startAgain(courseId: string, agent: Respondent) {
  chat.startNew(courseId)
  chat.pickAgent(agent)
}

// --- Files dropped on the panel ---------------------------------------------------
/** The conversation shown, which takes files dropped on it (and on the panel's bar). */
const pane = ref<InstanceType<typeof ChatPane> | null>(null)
const paneTakesFiles = () => !!pane.value?.canTakeFiles
function onDragOver(e: DragEvent) {
  // Over the pane, it has said already.
  if (!dragHasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = paneTakesFiles() ? 'copy' : 'none'
}
function onDrop(e: DragEvent) {
  if (!dragHasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  if (!paneTakesFiles()) return
  const { files, folders } = filesFrom(e.dataTransfer)
  pane.value?.takeFiles(files, folders)
}

// --- Answers noticed with the panel closed ------------------------------------
// Where the caller may ask somewhere, as the button that shows the count is offered.
usePolling(() => chat.pollUnread(), { intervalMs: UNREAD_POLL_MS, enabled: () => chat.courses.length > 0 })
</script>

<template>
  <section
    v-if="chat.open"
    id="chat-panel"
    ref="panel"
    class="chat-panel"
    :class="sheet ? 'is-sheet' : 'is-docked'"
    :style="sheet ? undefined : paneStyle"
    :role="sheet ? 'dialog' : 'complementary'"
    :aria-modal="sheet ? 'true' : undefined"
    aria-labelledby="chat-panel-title"
    tabindex="-1"
    @dragenter="onDragOver"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <template v-if="!sheet">
      <!-- Its left edge, a separator that resizes it (with the arrow keys too); a double click puts it back. -->
      <div
        class="chat-panel__edge"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="shownWidth"
        :aria-valuemin="PANEL_MIN"
        :aria-valuemax="maxWidth"
        :aria-label="t('chat.panel.width')"
        tabindex="0"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onEdgeKey"
        @dblclick="resetWidth"
      />
      <!-- Its head row, as high as the header beside it and ruled with it: its name, minimize and close. -->
      <div class="chat-panel__head">
        <h2 id="chat-panel-title" class="chat-panel__title">{{ t('chat.panel.title') }}</h2>
        <el-button
          text
          class="chat-panel__icon chat-panel__minimize"
          :aria-label="t('chat.panel.minimize')"
          :title="t('chat.panel.minimize')"
          @click="minimize"
        >
          <el-icon :size="16" aria-hidden="true"><Minus /></el-icon>
        </el-button>
        <el-button
          text
          class="chat-panel__icon chat-panel__close"
          :aria-label="t('chat.panel.close')"
          :title="t('chat.panel.close')"
          @click="close"
        >
          <el-icon :size="16" aria-hidden="true"><Close /></el-icon>
        </el-button>
      </div>
    </template>

    <header class="chat-panel__bar">
      <h2 v-if="sheet" id="chat-panel-title" class="chat-panel__title is-hidden">{{ t('chat.panel.title') }}</h2>
      <el-select
        v-if="chat.courses.length"
        :model-value="chat.courseId ?? undefined"
        size="small"
        class="chat-panel__course"
        popper-class="chat-panel__course-popper"
        :aria-label="t('chat.panel.course')"
        @update:model-value="(id: string) => chat.selectCourse(id)"
      >
        <el-option
          v-for="m in chat.courses"
          :key="m.course_id"
          :value="m.course_id"
          :label="joinParts([courseLabel(m, chat.courses), m.title])"
        />
      </el-select>
      <span v-else class="chat-panel__spacer" />
      <!-- No trigger keys on these tooltips: they would take Enter and Space from their buttons. -->
      <el-tooltip :content="t('chat.panel.newTip')" placement="bottom" :show-after="400" :trigger-keys="[]">
        <el-button
          size="small"
          class="chat-panel__new"
          :disabled="!chat.courseId"
          :aria-label="t('chat.panel.newTip')"
          @click="chat.startNew()"
        >
          <el-icon aria-hidden="true"><Plus /></el-icon>
          <span>{{ t('chat.panel.new') }}</span>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('chat.panel.history')" placement="bottom" :show-after="400" :trigger-keys="[]">
        <el-button
          text
          size="small"
          class="chat-panel__icon"
          :class="{ 'is-on': inHistory }"
          :type="inHistory ? 'primary' : undefined"
          :aria-pressed="inHistory ? 'true' : 'false'"
          :aria-label="t('chat.panel.history')"
          @click="chat.toggleHistory()"
        >
          <el-icon aria-hidden="true"><Clock /></el-icon>
          <span v-if="chat.unreadCount && !inHistory" class="chat-panel__dot" aria-hidden="true" />
        </el-button>
      </el-tooltip>
      <!-- On a phone, the sheet's one way out, which keeps what it showed, as minimizing the pane does. -->
      <el-button
        v-if="sheet"
        text
        size="small"
        class="chat-panel__icon chat-panel__close"
        :aria-label="t('chat.panel.close')"
        :title="t('chat.panel.close')"
        @click="minimize"
      >
        <el-icon :size="16" aria-hidden="true"><Close /></el-icon>
      </el-button>
    </header>

    <div class="chat-panel__body">
      <!-- A conversation is shown in its own course, whatever the panel asks in. -->
      <ChatPane
        v-if="chat.screen === 'conversation' && chat.conversation"
        :key="`c:${chat.conversation.id}`"
        ref="pane"
        class="chat-panel__pane"
        :course-id="chat.conversation.courseId"
        :conversation-id="chat.conversation.id"
        :course-label="labelOf(chat.conversation.courseId)"
        :active="chat.open"
        @read="(id: string) => chat.markedRead(id)"
        @start="(r: Respondent) => startAgain(chat.conversation!.courseId, r)"
        @new="chat.startNew()"
        @history="chat.showHistory()"
      >
        <template #actions>
          <el-button size="small" :aria-label="t('chat.panel.backToHistory')" @click="chat.showHistory()">
            <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
          </el-button>
        </template>
      </ChatPane>

      <ChatHistory
        v-else-if="chat.screen === 'history'"
        class="chat-panel__scroll"
        :active="chat.open"
        @open="(courseId: string, id: string) => chat.showConversation(courseId, id)"
      />

      <AppEmpty v-else-if="!chat.courses.length" class="chat-panel__none" :text="t('chat.panel.noCourses')" page />

      <ChatPane
        v-else-if="chat.draft"
        :key="`to:${chat.draft.courseId}:${chat.draft.agent.member_id}`"
        ref="pane"
        class="chat-panel__pane"
        :course-id="chat.draft.courseId"
        :respondent="chat.draft.agent"
        :course-label="labelOf(chat.draft.courseId)"
        :active="chat.open"
        @opened="(id: string) => chat.showConversation(chat.draft!.courseId, id)"
        @new="chat.startNew()"
        @history="chat.showHistory()"
      >
        <template #actions>
          <el-button size="small" :aria-label="t('chat.panel.backToAgents')" @click="chat.startNew()">
            <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
          </el-button>
        </template>
      </ChatPane>

      <div v-else-if="chat.courseId" class="chat-panel__scroll chat-panel__pick">
        <h3 class="chat-panel__heading">{{ t('chat.panel.pickTitle') }}</h3>
        <p class="chat-panel__hint">{{ t('chat.panel.pickHint', { course: courseName }) }}</p>
        <AgentPicker
          :key="chat.courseId"
          :course-id="chat.courseId"
          :enabled="chat.open"
          @pick="(r: Respondent) => chat.pickAgent(r)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--app-page);
  outline: none;
}
/* Docked at the window's right edge, beside the page column, as tall as the window and staying as the page
   scrolls, as the side bar does on the left: on the page's ground, with a rule between them. Its width is set on
   it; the page takes the rest. */
.chat-panel.is-docked {
  position: sticky;
  top: 0;
  z-index: var(--app-z-panel);
  flex: 0 0 auto;
  align-self: flex-start;
  height: 100vh;
  height: 100dvh;
  border-left: var(--app-rule);
}
/* On a phone, a sheet over the whole screen: square, its edges the screen's. */
.chat-panel.is-sheet {
  position: fixed;
  inset: 0;
  z-index: var(--app-z-sheet);
  width: auto;
  height: 100vh;
  height: 100dvh;
}
/* Its left edge, a few pixels either side of its rule, which resizes it: the rule turns navy while it is
   hovered, focused or dragged. */
.chat-panel__edge {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  z-index: 3;
  width: 8px;
  cursor: ew-resize;
  touch-action: none;
}
.chat-panel__edge::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  background: transparent;
  transition: background-color 0.15s;
}
.chat-panel__edge:hover::after,
.chat-panel__edge:focus-visible::after {
  background: var(--app-indigo);
}
.chat-panel__edge:focus-visible {
  outline: none;
}
/* Its head row, as high as the page's header and ruled with it: its name, then minimize and close. */
.chat-panel__head {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 56px;
  padding: 0 var(--app-space-sm) 0 var(--app-space-lg);
  border-bottom: var(--app-rule);
}
.chat-panel__head .chat-panel__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-sans);
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
  letter-spacing: normal;
  line-height: var(--app-lh-heading);
  color: var(--app-ink);
}
.chat-panel__head .el-button {
  width: 36px;
  height: 36px;
  padding: 0;
}
.chat-panel__head .el-button + .el-button {
  margin-left: 0;
}
.chat-panel__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 10px 16px;
  border-bottom: var(--app-rule);
  flex-shrink: 0;
}
/* On a phone, the sheet's name is for screen readers: its bar has no room for it. */
.chat-panel__title.is-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.chat-panel__course {
  flex: 1 1 auto;
  min-width: 0;
}
.chat-panel__spacer {
  flex: 1;
}
.chat-panel__new {
  flex-shrink: 0;
}
.chat-panel__new .el-icon + span {
  margin-left: 4px;
}
.chat-panel__icon {
  position: relative;
  flex-shrink: 0;
  margin-left: 0;
  padding: 5px 7px;
}
/* The history shown: its button pressed, in the indigo on its tint. */
.chat-panel__icon.is-on {
  background: var(--app-indigo-tint);
}
/* On a touch screen, square: as wide as a small control is tall (40 px), and the head row's 44 px. */
@media (pointer: coarse) {
  .chat-panel__icon {
    min-width: var(--el-component-size-small);
  }
  .chat-panel__head .el-button {
    width: 44px;
    height: 44px;
  }
}
.chat-panel__bar .el-button + .el-button {
  margin-left: 0;
}
.chat-panel__dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--el-color-danger);
}
.chat-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chat-panel__pane {
  flex: 1;
  min-height: 0;
}
.chat-panel__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 16px;
  overscroll-behavior: contain;
}
.chat-panel__heading {
  margin: 0 0 4px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
  line-height: var(--app-lh-heading);
}
.chat-panel__hint {
  margin: 0 0 10px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--el-text-color-secondary);
}
.chat-panel__none {
  padding: var(--app-space-xl) var(--app-space-lg);
}
@media print {
  .chat-panel {
    display: none;
  }
}
</style>

<style>
html.chat-sheet-open {
  overflow: hidden;
}
/* While its edge is dragged, the page selects no text, and the cursor stays the edge's; and the edge's line stays
   navy wherever the pointer goes. Here, not in the scoped block: there Vue would keep only what is in :global(),
   and turn the body navy. */
body.is-dragging-chat {
  user-select: none;
  cursor: ew-resize;
}
body.is-dragging-chat .chat-panel__edge::after {
  background: var(--app-indigo);
}
/* The courses' names are longer than the list is wide. */
.chat-panel__course-popper {
  max-width: min(420px, calc(100vw - 32px));
}
</style>
