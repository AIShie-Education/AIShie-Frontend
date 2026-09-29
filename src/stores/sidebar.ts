// The side bar on the window's left edge: which view it shows, and whether
// it is open (this browser's; components/sidebar/frame.ts). As in an editor,
// the activity bar's button of the view shown collapses it and another's
// shows that view; and going to a page of another view shows that one,
// without ever opening a side bar someone has collapsed.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { loadFrame, saveFrame, viewForPath, viewsFor, type SideView } from '@/components/sidebar/frame'
import { useSessionStore } from './session'

export const useSideBarStore = defineStore('sideBar', () => {
  const session = useSessionStore()
  const frame = loadFrame()
  const open = ref(frame.open)
  /** The view chosen last, which the caller may not be offered (an administrator no longer). */
  const view = ref<SideView>(frame.view)
  watch([open, view], () => saveFrame({ open: open.value, view: view.value }))

  /** The views the caller is offered, in the activity bar's order. */
  const views = computed(() => viewsFor({ kind: session.me?.kind, canAdminister: session.canAdminister }))
  /** The view shown: the one chosen, where the caller is offered it, and else their courses. */
  const shown = computed<SideView>(() => (views.value.includes(view.value) ? view.value : 'courses'))

  /** An activity bar's button, pressed: its view shown; or, if it is shown already, the side bar collapsed. */
  function toggle(v: SideView) {
    if (open.value && shown.value === v) open.value = false
    else {
      view.value = v
      open.value = true
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

  return { open, view, views, shown, toggle, select, follow, setOpen }
})
