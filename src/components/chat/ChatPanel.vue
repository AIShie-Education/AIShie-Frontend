<script setup lang="ts">
// The chat, a window floating over every signed-in page, as a chat on a web
// page is: it neither docks nor takes its width from the page, which stays
// as it is, and usable, behind it. It opens from the chat's button at the
// header's right end (AppLayout), in the bottom right corner, 400 × 600 px until
// it is moved by its title bar or resized from its top edge, its left edge
// or its top left corner (the edges also with the arrow keys, as
// separators), always within the viewport; a double click on its title bar
// puts it back. This browser remembers whether it was open, and where and how
// big it was left, unless it no longer fits the viewport, when it goes back
// to its corner. It lies over the page and under whatever Element Plus lays
// over the page (a dialog, a list, a message), with a shadow. Its title bar
// minimizes it (as Escape does from within it, and Ctrl/⌘+J, which opens it
// too), and it opens again on what it showed; or closes it, and it opens
// again on a new conversation. Either way focus goes back to the button. It
// is a dialog, not a modal one: the page is still there to use.
//
// On a phone (up to 899 px wide) it is a sheet over the whole screen, a modal
// dialog, with no edge to drag, closed with its button, Escape or back, which
// keeps what it showed, as minimizing the window does; following a link in
// it closes it too. The window on a wider screen is not closed by back: it
// is no modal one, and stays open from page to page, which back moves
// between.
//
// Under its title bar (on a phone, on top), the course asked in (one of the
// caller's courses where they may ask: the page's own on a course page, else
// the last one used), a new conversation, and the history. A new conversation starts with one of that
// course's agents; the history lists the caller's conversations with agents
// in that course or in all of them; a conversation is read and written in
// the same pane as ever.
//
// Files dropped on the panel go to the conversation it shows, attached to
// what the caller is writing (ChatPane takes those dropped on it, and those
// dropped on the window's title bar or the panel's bar come to it too),
// wherever the window has been moved; where it shows none to write
// in, the panel takes them and does nothing with them, rather than the page
// under it (materials, say) taking them.
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
import AppEmpty from '@/components/AppEmpty.vue'
import AgentPicker from './AgentPicker.vue'
import ChatHistory from './ChatHistory.vue'
import ChatPane from './ChatPane.vue'
import {
  boxForKey,
  clampBox,
  defaultBox,
  fitsIn,
  isPanelShortcut,
  largestBox,
  moveBox,
  PANEL_SHEET_MAX_WIDTH,
  resizeBox,
  UNREAD_POLL_MS,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  type Viewport,
  type WindowBox,
} from './panel'
import { courseLabel } from './seat'

const { t } = useI18n()
const chat = useChatStore()
const route = useRoute()
const sheet = useMediaQuery(`(max-width: ${PANEL_SHEET_MAX_WIDTH}px)`)
const panel = ref<HTMLElement | null>(null)

// --- Where the window is, and how big ------------------------------------------
/** The viewport, less any scroll bar (jsdom has no layout: the window's size there). */
function measureViewport(): Viewport {
  const el = typeof document === 'undefined' ? null : document.documentElement
  return {
    width: el?.clientWidth || (typeof window === 'undefined' ? 1280 : window.innerWidth),
    height: el?.clientHeight || (typeof window === 'undefined' ? 800 : window.innerHeight),
  }
}
const viewport = ref<Viewport>(measureViewport())
/** Where it was left, back in its corner once it no longer fits the viewport (never on a phone, where it is a sheet). */
function keepOnScreen() {
  if (!sheet.value && chat.box && !fitsIn(chat.box, viewport.value)) chat.box = null
}
function onResize() {
  viewport.value = measureViewport()
  keepOnScreen()
}
/** While it is moved or resized, where it is: kept once let go. */
const dragBox = ref<WindowBox | null>(null)
const shownBox = computed(() => dragBox.value ?? clampBox(chat.box ?? defaultBox(viewport.value), viewport.value))
const largest = computed(() => largestBox(shownBox.value, viewport.value))
const boxStyle = computed(() => {
  const b = shownBox.value
  return { width: `${b.width}px`, height: `${b.height}px`, right: `${b.right}px`, bottom: `${b.bottom}px` }
})

// A drag reads nothing of the layout as it goes: where it started and the
// viewport are taken once, and the window is set once a frame.
const nextFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => window.setTimeout(cb, 16)
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => window.clearTimeout(id)
/** What a drag does: moves the window by its title bar, or resizes it from its left edge, its top or its corner. */
type Grip = 'move' | 'left' | 'top' | 'corner'
let drag: { grip: Grip; x: number; y: number; from: WindowBox; vp: Viewport; at: { x: number; y: number } } | null =
  null
let frame = 0
function dragTo(at: { x: number; y: number }) {
  if (!drag) return
  const dx = at.x - drag.x
  const dy = at.y - drag.y
  const { grip, from, vp } = drag
  dragBox.value =
    grip === 'move' ? moveBox(from, dx, dy, vp) : resizeBox(from, grip === 'top' ? 0 : dx, grip === 'left' ? 0 : dy, vp)
}
function onPointerDown(grip: Grip, e: PointerEvent) {
  if (e.button !== 0) return
  // The title bar's own buttons are pressed, not dragged.
  if (grip === 'move' && (e.target as Element | null)?.closest?.('button')) return
  e.preventDefault()
  const at = { x: e.clientX, y: e.clientY }
  drag = { grip, x: at.x, y: at.y, from: shownBox.value, vp: viewport.value, at }
  dragBox.value = shownBox.value
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.classList.add('is-dragging-chat', `is-dragging-chat-${grip}`)
}
function onPointerMove(e: PointerEvent) {
  if (!drag) return
  drag.at = { x: e.clientX, y: e.clientY }
  if (frame) return
  frame = nextFrame(() => {
    frame = 0
    if (drag) dragTo(drag.at)
  })
}
const GRIPS: Grip[] = ['move', 'left', 'top', 'corner']
function endDrag() {
  document.body.classList.remove('is-dragging-chat', ...GRIPS.map((g) => `is-dragging-chat-${g}`))
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
  if (dragBox.value) chat.box = dragBox.value
  dragBox.value = null
}
// Closed (or turned into the sheet) while it is dragged: the drag is let go, and nothing of it kept.
watch(
  () => chat.open && !sheet.value,
  (shown) => {
    if (shown || !drag) return
    if (frame) cancelFrame(frame)
    frame = 0
    drag = null
    dragBox.value = null
    endDrag()
  },
)
function onEdgeKey(edge: 'left' | 'top', e: KeyboardEvent) {
  const box = boxForKey(edge, e.key, shownBox.value, viewport.value, { shift: e.shiftKey })
  if (!box) return
  e.preventDefault()
  chat.box = box
}
/** Back in its corner, at its size until resized. */
function resetBox(e?: MouseEvent) {
  if ((e?.target as Element | null)?.closest?.('button')) return
  chat.box = null
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
/** Back to the button that opens it: the header's, or on a phone the round one, shown again once the sheet is closed. */
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
  // The sheet, which covers the page, or the window from within it.
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
    :class="sheet ? 'is-sheet' : 'is-window'"
    :style="sheet ? undefined : boxStyle"
    role="dialog"
    :aria-modal="sheet ? 'true' : 'false'"
    aria-labelledby="chat-panel-title"
    tabindex="-1"
    @dragenter="onDragOver"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <template v-if="!sheet">
      <!-- Its left edge and its top, each a separator that resizes it (with the arrow keys too), and its top left corner. -->
      <div
        class="chat-panel__edge is-left"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="shownBox.width"
        :aria-valuemin="Math.min(WINDOW_MIN_WIDTH, largest.width)"
        :aria-valuemax="largest.width"
        :aria-label="t('chat.panel.width')"
        tabindex="0"
        @pointerdown="onPointerDown('left', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onEdgeKey('left', $event)"
      />
      <div
        class="chat-panel__edge is-top"
        role="separator"
        aria-orientation="horizontal"
        :aria-valuenow="shownBox.height"
        :aria-valuemin="Math.min(WINDOW_MIN_HEIGHT, largest.height)"
        :aria-valuemax="largest.height"
        :aria-label="t('chat.panel.height')"
        tabindex="0"
        @pointerdown="onPointerDown('top', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onEdgeKey('top', $event)"
      />
      <div
        class="chat-panel__corner"
        aria-hidden="true"
        @pointerdown="onPointerDown('corner', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
      <!-- The title bar: it moves the window, and a double click on it puts the window back in its corner. -->
      <div
        class="chat-panel__titlebar"
        @pointerdown="onPointerDown('move', $event)"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="resetBox"
      >
        <h2 id="chat-panel-title" class="chat-panel__title">{{ t('chat.panel.title') }}</h2>
        <el-button
          text
          size="small"
          class="chat-panel__icon chat-panel__minimize"
          :aria-label="t('chat.panel.minimize')"
          :title="t('chat.panel.minimize')"
          @click="minimize"
        >
          <el-icon :size="16" aria-hidden="true"><Minus /></el-icon>
        </el-button>
        <el-button
          text
          size="small"
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
          :label="`${courseLabel(m, chat.courses)} · ${m.title}`"
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
          size="small"
          class="chat-panel__icon"
          :class="{ 'is-on': inHistory }"
          :type="inHistory ? 'primary' : undefined"
          :plain="inHistory"
          :aria-pressed="inHistory ? 'true' : 'false'"
          :aria-label="t('chat.panel.history')"
          @click="chat.toggleHistory()"
        >
          <el-icon aria-hidden="true"><Clock /></el-icon>
          <span v-if="chat.unreadCount && !inHistory" class="chat-panel__dot" aria-hidden="true" />
        </el-button>
      </el-tooltip>
      <!-- On a phone, the sheet's one way out, which keeps what it showed, as minimizing the window does. -->
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
  background: var(--el-bg-color);
  outline: none;
}
/* Over the page, placed from the viewport's bottom right corner (its place and size are set on it), with a
   shadow, and under whatever Element Plus lays over the page: see the layers in styles/tokens.css. */
.chat-panel.is-window {
  position: fixed;
  z-index: var(--app-z-panel);
  border: 1px solid var(--app-line-strong);
  border-radius: var(--app-radius-item);
  box-shadow: var(--app-shadow-window);
  overflow: hidden;
}
.chat-panel.is-sheet {
  position: fixed;
  inset: 0;
  z-index: var(--app-z-sheet);
  width: auto;
  height: 100vh;
  height: 100dvh;
}
/* Its left edge and its top, a few pixels inside it, and its top left corner, which resize it. */
.chat-panel__edge,
.chat-panel__corner {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  touch-action: none;
}
.chat-panel__edge.is-left {
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
}
.chat-panel__edge.is-top {
  right: 0;
  height: 6px;
  cursor: ns-resize;
}
.chat-panel__corner {
  z-index: 4;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}
.chat-panel__edge::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  background: transparent;
  transition: background-color 0.15s;
}
.chat-panel__edge.is-left::after {
  bottom: 0;
  width: 2px;
}
.chat-panel__edge.is-top::after {
  right: 0;
  height: 2px;
}
.chat-panel__edge:hover::after,
.chat-panel__edge:focus-visible::after,
:global(body.is-dragging-chat-left) .chat-panel__edge.is-left::after,
:global(body.is-dragging-chat-top) .chat-panel__edge.is-top::after,
:global(body.is-dragging-chat-corner) .chat-panel__edge::after {
  background: var(--el-color-primary);
}
.chat-panel__edge:focus-visible {
  outline: none;
}
/* The title bar, which the window is moved by: its name, and minimize and close. */
.chat-panel__titlebar {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  height: 40px;
  padding: 0 6px 0 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--app-ground);
  cursor: move;
  user-select: none;
  touch-action: none;
}
.chat-panel__titlebar .chat-panel__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-ink);
}
.chat-panel__titlebar .el-button + .el-button {
  margin-left: 0;
}
.chat-panel__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
/* On a touch screen, square: as wide as a small control is tall (40 px). */
@media (pointer: coarse) {
  .chat-panel__icon {
    min-width: var(--el-component-size-small);
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
  font-size: 14px;
  font-weight: 600;
}
.chat-panel__hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.chat-panel__none {
  margin: auto;
  padding: 24px;
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
/* While the window is moved or resized, the page selects no text, and the cursor stays the grip's. */
body.is-dragging-chat {
  user-select: none;
}
body.is-dragging-chat-move {
  cursor: move;
}
body.is-dragging-chat-left {
  cursor: ew-resize;
}
body.is-dragging-chat-top {
  cursor: ns-resize;
}
body.is-dragging-chat-corner {
  cursor: nwse-resize;
}
/* The courses' names are longer than the list is wide. */
.chat-panel__course-popper {
  max-width: min(420px, calc(100vw - 32px));
}
</style>
