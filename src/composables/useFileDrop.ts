// Files dragged onto the page, or pasted into it.
//
// A drop zone takes the files dropped on it. One place on the screen may also
// take files dropped anywhere on the page, or pasted where nothing else takes
// them: the zone of an open dialog, or a page's list that makes something of
// each file (usePageDrop). Where several ask, the one that asked last takes
// them (a dialog over the page that opened it); one that is turned off
// (enabled false) passes them on to the one before.
//
// Wherever nothing takes them, files dropped on the page are not opened by
// the browser in the app's place, which would lose whatever was on it
// (installDropGuard, from App.vue).
import { onScopeDispose, readonly, ref, type Ref } from 'vue'

/** Whether a drag carries files (not text or a link). */
export function dragHasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

/**
 * The files a drop or a paste carries. A folder cannot be uploaded: it is
 * counted, not taken, where the browser says which items are folders.
 */
export function filesFrom(dt: DataTransfer | null | undefined): { files: File[]; folders: number } {
  if (!dt) return { files: [], folders: 0 }
  const items = dt.items ? Array.from(dt.items) : []
  if (items.length && items.some((i) => typeof i.webkitGetAsEntry === 'function')) {
    const files: File[] = []
    let folders = 0
    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
      if (entry?.isDirectory) {
        folders++
        continue
      }
      const f = item.getAsFile()
      if (f) files.push(f)
    }
    return { files, folders }
  }
  return { files: Array.from(dt.files ?? []), folders: 0 }
}

/** Whether an element takes text typed or pasted into it. */
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'image'].includes(type)
}

export interface PageDropOptions {
  /** Whether it takes files now. */
  enabled: () => boolean
  onFiles: (files: File[], folders: number) => void
}

interface Taker extends PageDropOptions {
  dragging: Ref<boolean>
}

const takers: Taker[] = []
/** Files are being dragged over the window. */
const dragging = ref(false)
let watchdog: ReturnType<typeof setTimeout> | undefined
let installed = false

function top(): Taker | undefined {
  for (let i = takers.length - 1; i >= 0; i--) if (takers[i]!.enabled()) return takers[i]
  return undefined
}

function setDragging(v: boolean) {
  dragging.value = v
  const t = v ? top() : undefined
  for (const k of takers) k.dragging.value = k === t
}

function onDragOver(e: DragEvent) {
  if (!dragHasFiles(e)) return
  // A zone under the pointer has taken it already, and said how. Otherwise
  // it is taken here, or nowhere: never opened by the browser in the app's
  // place.
  if (!e.defaultPrevented) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = top() ? 'copy' : 'none'
  }
  setDragging(true)
  // A drag that ends outside the window, or is called off, says nothing here
  // at all: dragover comes many times a second while it goes on.
  clearTimeout(watchdog)
  watchdog = setTimeout(() => setDragging(false), 1_000)
}

function onDragLeave(e: DragEvent) {
  // Out of the window altogether.
  if (!e.relatedTarget && dragging.value) {
    clearTimeout(watchdog)
    setDragging(false)
  }
}

function onDrop(e: DragEvent) {
  if (!dragHasFiles(e)) return
  clearTimeout(watchdog)
  setDragging(false)
  // Dropped on a zone, which took it.
  if (e.defaultPrevented) return
  e.preventDefault()
  const t = top()
  if (!t) return
  const { files, folders } = filesFrom(e.dataTransfer)
  if (files.length || folders) t.onFiles(files, folders)
}

function onPaste(e: ClipboardEvent) {
  if (e.defaultPrevented || isEditable(e.target)) return
  const t = top()
  if (!t) return
  const { files, folders } = filesFrom(e.clipboardData)
  if (!files.length) return
  e.preventDefault()
  t.onFiles(files, folders)
}

/**
 * Keeps the browser from opening a file dropped anywhere on the page in the
 * app's place, and routes it (and a file pasted) to whatever takes files.
 * Called once, when the app starts; harmless again.
 */
export function installDropGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('dragenter', onDragOver)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('paste', onPaste)
}

/**
 * Takes files dropped anywhere on the page, or pasted where no field takes
 * them, while enabled() and nothing that asked later takes them. `dragging`
 * says files are being dragged over the window, to be dropped here: the
 * place to show where they will go.
 */
export function usePageDrop(opts: PageDropOptions): { dragging: Readonly<Ref<boolean>> } {
  installDropGuard()
  const taker: Taker = { ...opts, dragging: ref(false) }
  takers.push(taker)
  onScopeDispose(() => {
    const i = takers.indexOf(taker)
    if (i >= 0) takers.splice(i, 1)
    if (dragging.value) setDragging(true)
  })
  return { dragging: readonly(taker.dragging) }
}

/** Whether files are being dragged over the window at all. */
export const draggingFiles: Readonly<Ref<boolean>> = readonly(dragging)
