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
// a reader who does not switch to it. Which stack applies is chosen by
// <html lang> (styles/tokens.css).
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

/** Loads, once, the typefaces a page in this language needs beyond those above. */
export function loadFontsFor(locale: string): void {
  const load = CHINESE[locale]
  if (!load || loading.has(locale)) return
  loading.set(
    locale,
    load().catch(() => {
      // Until they come, the system's Chinese fonts stand in; the next change of language tries again.
      loading.delete(locale)
    }),
  )
}
