// Files dragged onto the page, or pasted into it, or chosen.
//
// A drop zone takes the files dropped on it (useDropTarget: FileDropZone's,
// the chat panel's). One place on the screen may also
// take files dropped anywhere on the page, or pasted where nothing else takes
// them: the zone of an open dialog, or a page's list that makes something of
// each file (usePageDrop). Where several ask, the one that asked last takes
// them (a dialog over the page that opened it); one that is turned off
// (enabled false) passes them on to the one before.
//
// Wherever nothing takes them, files dropped on the page are not opened by
// the browser in the app's place, which would lose whatever was on it
// (installDropGuard, from App.vue).
//
// Files are chosen from the computer through the browser's own dialog: a
// drop zone's, or a button's that is not a zone (useFilePicker: the chat
// composer's paperclip).
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

export interface DropTargetOptions {
  /** Whether it takes files now: while not, a drop on it is taken and nothing is done with it. */
  enabled: () => boolean
  onFiles: (files: File[], folders: number) => void
}

/**
 * An element that takes files dropped on it: bind `handlers` to it
 * (v-on="handlers"). `over` says files are being dragged over it, while it
 * takes them. A drop on it is taken there (the page does not take it again),
 * whether or not it takes files now.
 */
export function useDropTarget(opts: DropTargetOptions) {
  const over = ref(false)
  // dragenter and dragleave come for each element inside it too.
  let depth = 0
  function dragenter(e: DragEvent) {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    depth++
    over.value = opts.enabled()
  }
  function dragover(e: DragEvent) {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = opts.enabled() ? 'copy' : 'none'
  }
  function dragleave(e: DragEvent) {
    if (!dragHasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (!depth) over.value = false
  }
  function drop(e: DragEvent) {
    if (!dragHasFiles(e)) return
    // Taken here: the page does not take it again.
    e.preventDefault()
    depth = 0
    over.value = false
    if (!opts.enabled()) return
    const { files, folders } = filesFrom(e.dataTransfer)
    if (files.length || folders) opts.onFiles(files, folders)
  }
  return { over: readonly(over), handlers: { dragenter, dragover, dragleave, drop } }
}

/**
 * The files a paste carries, when it is files alone: a paste that carries
 * text too (a table or a paragraph copied from an office program, which puts
 * a picture of it beside the text) is the text's, and pasted as text.
 */
export function pastedFiles(e: ClipboardEvent): { files: File[]; folders: number } {
  const dt = e.clipboardData
  if (!dt || dt.getData('text/plain')) return { files: [], folders: 0 }
  return filesFrom(dt)
}

export interface FilePickerOptions {
  multiple?: boolean
  /** What the dialog offers (the input's accept). */
  accept?: string
  onFiles: (files: File[]) => void
}

/**
 * Chooses files through the browser's own dialog, for a button that is not a
 * drop zone: choose() opens it, and what is chosen goes to onFiles. Its
 * input lives hidden at the end of the page while the component does.
 */
export function useFilePicker(opts: FilePickerOptions): { choose: () => void } {
  let input: HTMLInputElement | null = null
  function ensure(): HTMLInputElement {
    if (input) return input
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = !!opts.multiple
    if (opts.accept) el.accept = opts.accept
    el.tabIndex = -1
    el.setAttribute('aria-hidden', 'true')
    el.style.display = 'none'
    el.addEventListener('change', () => {
      const files = Array.from(el.files ?? [])
      el.value = ''
      if (files.length) opts.onFiles(files)
    })
    document.body.appendChild(el)
    input = el
    return el
  }
  onScopeDispose(() => {
    input?.remove()
    input = null
  })
  return { choose: () => ensure().click() }
}
