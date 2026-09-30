<script setup lang="ts">
// The chat, docked on the right of every signed-in page, as an editor's side
// panel is: open, it takes its width from the page beside it, 380 px until
// its left edge is dragged (or moved with the arrow keys) to make it wider or
// narrower: from PANEL_MIN up to half the window, and never so wide that the
// page is left less than PAGE_MIN; a double click on the edge goes back to
// 380. The page reflows as it is dragged (its own container queries follow),
// and the width is kept when the edge is let go. It is opened and closed from
// its button on the rail along the window's right edge (AppLayout), between
// which and the page it is docked, and with Ctrl/⌘+J; this browser remembers
// whether it was open and how wide. In a window narrower than
// PANEL_DOCKED_MIN_WIDTH (1200 px), where the page would be left too little,
// it floats over the page instead, against the rail, with a shadow, and the
// page keeps its width; its edge drags there too, up to 70 % of the window.
// On a phone (up to 899 px wide) it is a sheet over the whole screen, opened
// from a button floating at the bottom right, with a button that closes it,
// and no edge to drag.
//
// On top, the course asked in (one of the caller's courses where they may ask:
// the page's own on a course page, else the last one used), a new
// conversation, and the history. A new conversation starts with one of that
// course's agents; the history lists the caller's conversations with agents
// in that course or in all of them; a conversation is read and written in
// the same pane as ever.
//
// Files dropped on the panel go to the conversation it shows, attached to
// what the caller is writing (ChatPane takes those dropped on it, and those
// dropped on the panel's bar come to it too); where it shows none to write
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
import { useMediaQuery } from '@/composables/useMediaQuery'
import { usePolling } from '@/composables/usePolling'
import { useChatStore } from '@/stores/chat'
import AgentPicker from './AgentPicker.vue'
import ChatHistory from './ChatHistory.vue'
import ChatPane from './ChatPane.vue'
import {
  clampWidth,
  isPanelShortcut,
  PANEL_DEFAULT,
  PANEL_DOCKED_MIN_WIDTH,
  PANEL_MIN,
  PANEL_SHEET_MAX_WIDTH,
  panelMax,
  UNREAD_POLL_MS,
  widthForKey,
} from './panel'
import { courseLabel } from './seat'

const { t } = useI18n()
const chat = useChatStore()
const route = useRoute()
const sheet = useMediaQuery(`(max-width: ${PANEL_SHEET_MAX_WIDTH}px)`)
/** A window too narrow to give the panel's width from the page: it floats over the page instead (not on a phone, where it is a sheet). */
const narrowWindow = useMediaQuery(`(max-width: ${PANEL_DOCKED_MIN_WIDTH - 1}px)`)
const floating = computed(() => narrowWindow.value && !sheet.value)
const panel = ref<HTMLElement | null>(null)

// --- Width -----------------------------------------------------------------
const viewport = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
function onResize() {
  viewport.value = window.innerWidth
}
/**
 * The width the page and the docked panel share: the row they are in, less
 * the rail. Measured as that row changes (the window, the side bar), never
 * while the edge is dragged; null where it cannot be (then half the window
 * is the most).
 */
const room = ref<number | null>(null)
let rowObserver: ResizeObserver | null = null
function measureRoom(row: HTMLElement) {
  const rail = row.querySelector<HTMLElement>(':scope > .app-rail')
  room.value = row.clientWidth - (rail?.getBoundingClientRect().width ?? 0)
}
watch(panel, (el) => {
  rowObserver?.disconnect()
  rowObserver = null
  const row = el?.parentElement
  if (!row || typeof ResizeObserver === 'undefined') return
  measureRoom(row)
  rowObserver = new ResizeObserver(() => measureRoom(row))
  rowObserver.observe(row)
})
const maxWidth = computed(() => panelMax(viewport.value, { room: room.value, floating: floating.value }))
/** The width while its edge is being dragged, kept once it is let go. */
const dragWidth = ref<number | null>(null)
const shownWidth = computed(() => clampWidth(dragWidth.value ?? chat.width, maxWidth.value))

// A drag reads nothing of the layout as it goes: where it started, and the
// most it may reach, are taken once, and the width is set once a frame.
const nextFrame: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => window.setTimeout(cb, 16)
const cancelFrame: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id) => window.clearTimeout(id)
let drag: { x: number; width: number; max: number; at: number } | null = null
let frame = 0
function dragTo(x: number) {
  if (drag) dragWidth.value = clampWidth(drag.width + (drag.x - x), drag.max)
}
function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  drag = { x: e.clientX, width: shownWidth.value, max: maxWidth.value, at: e.clientX }
  dragWidth.value = shownWidth.value
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.classList.add('is-resizing-chat')
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
function onPointerUp(e: PointerEvent) {
  if (!drag) return
  if (frame) cancelFrame(frame)
  frame = 0
  dragTo(drag.at)
  drag = null
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  document.body.classList.remove('is-resizing-chat')
  // Kept once let go, not while it moves.
  if (dragWidth.value !== null) chat.width = dragWidth.value
  dragWidth.value = null
}
function onHandleKey(e: KeyboardEvent) {
  const w = widthForKey(e.key, shownWidth.value, maxWidth.value, { shift: e.shiftKey })
  if (w === null) return
  e.preventDefault()
  chat.width = w
}
function resetWidth() {
  chat.width = PANEL_DEFAULT
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
    el.querySelector<HTMLElement>('button')
  ;(first ?? el).focus()
}
/** Back to the button that opens it: the rail's, or on a phone the floating one, shown again once it is closed. */
function focusToggle() {
  document.getElementById('chat-panel-toggle')?.focus()
}
function close() {
  chat.setOpen(false)
  void nextTick(focusToggle)
}
function toggleFromKeyboard() {
  if (chat.open) close()
  else {
    chat.setOpen(true)
    void focusPanel()
  }
}
defineExpose({ focusPanel })

function onKeydown(e: KeyboardEvent) {
  if (isPanelShortcut(e) && offered.value) {
    e.preventDefault()
    toggleFromKeyboard()
    return
  }
  if (e.key === 'Escape' && sheet.value && chat.open && !e.defaultPrevented) {
    // Not while a box of its own (a confirmation, a list) is open over it: that closes first.
    const over = [...document.querySelectorAll<HTMLElement>('.el-overlay, .el-popper')].some(
      (el) => getComputedStyle(el).display !== 'none',
    )
    if (!over) close()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  rowObserver?.disconnect()
  if (frame) cancelFrame(frame)
  document.body.classList.remove('is-resizing-chat')
  document.documentElement.classList.remove('chat-sheet-open')
})

// The course the page shows is the one asked in; on a phone the sheet covers
// the page, and gives way to wherever a link in it leads.
watch(
  () => (typeof route.params.courseId === 'string' ? route.params.courseId : null),
  (id) => chat.followPage(id),
  { immediate: true },
)
watch(
  () => route.fullPath,
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
  <aside
    v-if="chat.open"
    id="chat-panel"
    ref="panel"
    class="chat-panel"
    :class="{ 'is-sheet': sheet, 'is-floating': floating }"
    :style="sheet ? undefined : { width: `${shownWidth}px` }"
    :role="sheet ? 'dialog' : 'complementary'"
    :aria-modal="sheet ? 'true' : undefined"
    aria-labelledby="chat-panel-title"
    tabindex="-1"
    @dragenter="onDragOver"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <div
      v-if="!sheet"
      class="chat-panel__handle"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="shownWidth"
      :aria-valuemin="PANEL_MIN"
      :aria-valuemax="maxWidth"
      :aria-label="t('chat.panel.resize')"
      :title="t('chat.panel.resize')"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onHandleKey"
      @dblclick="resetWidth"
    />

    <header class="chat-panel__bar">
      <h2 id="chat-panel-title" class="chat-panel__title">{{ t('chat.panel.title') }}</h2>
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

      <el-empty v-else-if="!chat.courses.length" class="chat-panel__none" :description="t('chat.panel.noCourses')" />

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
  </aside>
</template>

<style scoped>
.chat-panel {
  position: sticky;
  top: 56px;
  flex: 0 0 auto;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);
  height: calc(100dvh - 56px);
  min-width: 0;
  border-left: 1px solid var(--app-line);
  background: var(--el-bg-color);
  outline: none;
}
/* In a window too narrow to dock it, over the page, against the rail (48 px wide, AppLayout), under the header. */
.chat-panel.is-floating {
  position: fixed;
  top: 56px;
  right: 48px;
  bottom: 0;
  z-index: var(--app-z-panel);
  /* From the header to the bottom: its parent, the page's row, aligns it to the top otherwise. */
  align-self: stretch;
  height: auto;
  border-left-color: var(--app-line-strong);
  box-shadow: var(--app-shadow-side);
}
.chat-panel.is-sheet {
  position: fixed;
  inset: 0;
  z-index: var(--app-z-sheet);
  width: auto;
  height: 100vh;
  height: 100dvh;
  border-left: none;
}
.chat-panel__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 8px;
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}
.chat-panel__handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  background: transparent;
  transition: background-color 0.15s;
}
.chat-panel__handle:hover::after,
.chat-panel__handle:focus-visible::after,
:global(body.is-resizing-chat) .chat-panel__handle::after {
  background: var(--el-color-primary);
}
.chat-panel__handle:focus-visible {
  outline: none;
}
.chat-panel__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.chat-panel__title {
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
/* While the panel's edge is dragged, the page neither selects text nor shows another cursor. */
body.is-resizing-chat {
  cursor: col-resize;
  user-select: none;
}
/* The courses' names are longer than the list is wide. */
.chat-panel__course-popper {
  max-width: min(420px, calc(100vw - 32px));
}
</style>
