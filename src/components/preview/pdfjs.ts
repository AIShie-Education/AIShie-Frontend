// pdf.js (pdfjs-dist), as the file viewer uses it: this module is imported
// only by PdfView, which the viewer loads only when a PDF is opened, so none
// of it is in the app's main chunk (vite.config.ts leaves pdfjs-dist out of
// the shared vendor chunk).
//
// Its legacy build, the one pdf.js makes for browsers that are not the very
// latest: the modern one needs what browsers only began to have in 2026
// (Map.prototype.getOrInsertComputed, among others), which a school's
// tablets and a browser a release or two behind lack; the legacy one brings
// them along.
//
// Everything pdf.js fetches comes from this origin, as files of the build:
// its worker (a module worker, /assets/pdf.worker-<hash>.mjs), and the data
// it asks for as it needs it, each an asset of its own under /assets/:
// - the character maps (cmaps) a PDF names for text in Chinese, Japanese or
//   Korean whose font is not embedded, without which such text is not drawn;
// - the WebAssembly decoders of JBIG2 and CCITT fax images (scans) and of
//   JPEG 2000 images;
// - the two standard fonts a browser has no font for, Symbol and Dingbats
//   (the other standard fonts are the system's).
// They are handed to the worker by AssetData, from the main thread
// (useWorkerFetch: false), by their file names. Nothing in a PDF runs: no
// scripting, no XFA forms, and pdf.js evaluates no code to draw fonts.
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export { TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = workerUrl

// Each file as an asset of the build, never inlined (a data: URL in this chunk), by its path.
const CMAPS = import.meta.glob<string>('/node_modules/pdfjs-dist/cmaps/*.bcmap', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
const WASM = import.meta.glob<string>('/node_modules/pdfjs-dist/wasm/{jbig2,openjpeg,qcms_bg}.wasm', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})
const FONTS = import.meta.glob<string>('/node_modules/pdfjs-dist/standard_fonts/Foxit{Symbol,Dingbats}.pfb', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
})

/** A table of files by path, as one by file name. */
function byName(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]))
}
const TABLES: Record<string, Map<string, string>> = {
  cMapUrl: byName(CMAPS),
  wasmUrl: byName(WASM),
  standardFontDataUrl: byName(FONTS),
}

/** The data pdf.js's worker asks for, fetched from the build's own assets by file name (getDocument's BinaryDataFactory). */
export class AssetData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = TABLES[kind]?.get(filename)
    if (!url) throw new Error(`pdf.js asked for ${kind} ${filename}, which this build does not carry`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`pdf.js data ${filename}: HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }
}

/** The names of the files AssetData serves, by kind (tests). */
export function assetNames(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(TABLES).map(([k, m]) => [k, [...m.keys()].sort()]))
}

/** Opens a PDF from its bytes, which go to the worker (the array is handed over, and empty afterwards). */
export function openPdf(data: Uint8Array): PDFDocumentLoadingTask {
  return getDocument({
    data,
    BinaryDataFactory: AssetData,
    useWorkerFetch: false,
    enableXfa: false,
    // What a damaged file holds is drawn as far as it can be.
    stopAtErrors: false,
  })
}
