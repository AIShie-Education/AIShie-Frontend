// The app's typefaces, served from its own origin (@fontsource): no page
// asks a font service for anything, which a school may not want its pages to
// do and which some readers cannot reach. Each face comes in pieces by
// unicode-range, and a browser fetches only the pieces the page's text uses.
//
// IBM Plex Sans (400, 500, 600) and Source Serif 4 (600) set English text and
// headings, and load with the app. Noto Sans TC (400, 500, 700) and Noto
// Serif TC (700) set Traditional Chinese; their style sheets alone outweigh
// the rest of the app's, so they load the first time the page is in Chinese
// (setLocale), and never for a reader who does not switch to it. Which stack
// applies is chosen by <html lang> (styles/tokens.css).
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/source-serif-4/600.css'

let chinese: Promise<unknown> | null = null

/** Loads, once, the typefaces a page in this language needs beyond those above. */
export function loadFontsFor(locale: string): void {
  if (locale !== 'zh-Hant' || chinese) return
  chinese = import('./fonts-zh').catch(() => {
    // Until they come, the system's Chinese fonts stand in; the next change of language tries again.
    chinese = null
  })
}
