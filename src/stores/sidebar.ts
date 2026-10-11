// The side bar on the window's left edge: which view it shows, and whether
// it is open (this browser's; components/sidebar/frame.ts). As in an editor,
// the activity bar's button of the view shown collapses it and another's
// shows that view; and going to a page of another view shows that one,
// without ever opening a side bar someone has collapsed.
//
// In a window too narrow for the side bar, the chat docked beside the page
// at its narrowest and the least the page is left (SIDEBAR_GIVES_WAY_MAX_WIDTH:
// 1048 px), the one opened last stays: opening the chat, the side bar gives
// way, hidden and still open, and is back once the chat is minimized or
// closed or the window widens; pressing a view's button shows the side bar
// and minimizes the chat, which opens again on what it showed.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  loadFrame,
  saveFrame,
  SIDEBAR_DRAWER_MAX_WIDTH,
  SIDEBAR_GIVES_WAY_MAX_WIDTH,
  viewForPath,
  viewsFor,
  type SideView,
} from '@/components/sidebar/frame'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useChatStore } from './chat'
import { useSessionStore } from './session'

export const useSideBarStore = defineStore('sideBar', () => {
  const session = useSessionStore()
  const chat = useChatStore()
  const frame = loadFrame()
  const open = ref(frame.open)
  /** The view chosen last, which the caller may not be offered (an administrator no longer). */
  const view = ref<SideView>(frame.view)
  watch([open, view], () => saveFrame({ open: open.value, view: view.value }))

  /** The views the caller is offered, in the activity bar's order. */
  const views = computed(() => viewsFor({ kind: session.me?.kind, canAdminister: session.canAdminister }))
  /** The view shown: the one chosen, where the caller is offered it, and else their courses. */
  const shown = computed<SideView>(() => (views.value.includes(view.value) ? view.value : 'courses'))

  /** A window with the activity bar, but without room for the side bar beside the docked chat and the page. */
  const cramped = useMediaQuery(
    `(min-width: ${SIDEBAR_DRAWER_MAX_WIDTH + 1}px) and (max-width: ${SIDEBAR_GIVES_WAY_MAX_WIDTH}px)`,
  )
  /** Whether the side bar gives way to the chat now: the chat is open in a window without room for both. */
  const givesWay = computed(() => cramped.value && chat.open)
  /** Whether the side bar is beside the page: open, and not giving way to the chat. */
  const visible = computed(() => open.value && !givesWay.value)

  /** An activity bar's button, pressed: its view shown; or, if it is shown already, the side bar collapsed. */
  function toggle(v: SideView) {
    if (visible.value && shown.value === v) open.value = false
    else {
      view.value = v
      open.value = true
      // No room for both: the chat gives way in its turn, minimized, and opens again on what it showed.
      if (givesWay.value) chat.setOpen(false)
    }
  }

  /** Makes a view the one shown, leaving the side bar open or collapsed as it is. */
  function select(v: SideView) {
    if (views.value.includes(v)) view.value = v
  }

  /** The page moved: the view it belongs to, if any, is the one shown. */
  function follow(path: string) {
    const v = viewForPath(path)
    if (v) select(v)
  }

  function setOpen(v: boolean) {
    open.value = v
  }

  return { open, view, views, shown, givesWay, visible, toggle, select, follow, setOpen }
})
