// The app's typefaces, served from its own origin (@fontsource): no page
// asks a font service for anything, which a school may not want its pages to
// do and which some readers cannot reach. Each face comes in pieces by
// unicode-range, and a browser fetches only the pieces the page's text uses.
//
// IBM Plex Sans (400, 500, 600) and Source Serif 4 (600) set English text and
// headings, and load with the app; so do the same faces under names of their
// own for Latin alone, which a page in Chinese sets its letters and figures
// in (fonts-latin.css). Chinese is set in Noto Sans (400, 500, 700) and Noto
// Serif (700), in the forms of each script: TC for Traditional Chinese, SC
// for Simplified, whose glyphs differ even where the code points are the
// same. Their style sheets alone outweigh the rest of the app's, so each
// script's load the first time the page is in it (setLocale), and never for
// a reader who does not switch to it. A page in English sets the Chinese it
// shows (a name, a course's title, what is typed into a field) in TC's, Hong
// Kong's script: they load the first time it shows any, so that a reader
// whose pages are all English never fetches them. Which stack applies is
// chosen by <html lang> (styles/tokens.css); buttons and fields take it as
// the rest of the page's text does (styles/main.css).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/source-serif-4/600.css'
import './fonts-latin.css'

// Each in a chunk of its own (vite.config.ts), fetched only when imported here.
const CHINESE: Record<string, () => Promise<unknown>> = {
  'zh-Hant': () => import('./fonts-zh-hant'),
  'zh-Hans': () => import('./fonts-zh-hans'),
}

const loading = new Map<string, Promise<unknown>>()

function load(script: string): void {
  const faces = CHINESE[script]
  if (!faces || loading.has(script)) return
  loading.set(
    script,
    faces().catch(() => {
      // Until they come, the system's Chinese fonts stand in; the next change of language tries again.
      loading.delete(script)
    }),
  )
}

const HAN = /\p{Script=Han}/u
/**
 * Text that is not the page's own: what is marked as in a language of its
 * own (a language's name in the language menu, `lang="zh-Hans"`, and the
 * menu's 文; the loading screen's Chinese, index.html), and what a browser
 * that runs scripts never shows.
 */
const NOT_THE_PAGES = ':not(html)[lang], noscript, script, style'

/** Whether a text node is Chinese the page shows. */
function isHan(text: Node): boolean {
  return HAN.test(text.nodeValue ?? '') && !text.parentElement?.closest(NOT_THE_PAGES)
}

/**
 * Whether a field shows Chinese: what the reader typed into it, or what the
 * page put in it (a name to edit), which is its value and not a text in the
 * page. A password's field shows dots.
 */
function fieldShowsHan(el: EventTarget | null): boolean {
  return (
    (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'password')) &&
    HAN.test(el.value) &&
    !el.closest(NOT_THE_PAGES)
  )
}

/** Whether what was put in the page (an element and all it holds, or a text) shows any Chinese. */
function showsHan(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return isHan(node)
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as Element
  if (fieldShowsHan(el) || [...el.querySelectorAll('input, textarea')].some(fieldShowsHan)) return true
  if (!HAN.test(el.textContent ?? '')) return false
  const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let t = texts.nextNode(); t; t = texts.nextNode()) if (isHan(t)) return true
  return false
}

let watching: {
  observer: MutationObserver
  typed: (e: Event) => void
  timer: ReturnType<typeof setTimeout>
} | null = null

function stopWatching(): void {
  if (!watching) return
  watching.observer.disconnect()
  document.removeEventListener('input', watching.typed, true)
  clearTimeout(watching.timer)
  watching = null
}

/**
 * Calls found, once, when the page shows Chinese: what it shows now, once a
 * change of language has redrawn the page's own words (after the tasks
 * queued before this one), anything put in it later, or what the reader
 * types into a field.
 */
function watchForHan(found: () => void): void {
  const body = typeof document === 'undefined' ? null : document.body
  if (!body || typeof MutationObserver === 'undefined') return found()
  const seen = () => {
    stopWatching()
    found()
  }
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData' ? isHan(r.target) : [...r.addedNodes].some(showsHan)) return seen()
    }
  })
  observer.observe(body, { childList: true, subtree: true, characterData: true })
  const typed = (e: Event) => {
    if (fieldShowsHan(e.target)) seen()
  }
  document.addEventListener('input', typed, true)
  watching = {
    observer,
    typed,
    timer: setTimeout(() => {
      if (showsHan(body)) seen()
    }),
  }
}

/** Loads, once, the typefaces a page in this language needs beyond those above. */
export function loadFontsFor(locale: string): void {
  stopWatching()
  if (locale !== 'en') load(locale)
  else if (!loading.has('zh-Hant')) watchForHan(() => load('zh-Hant'))
}
