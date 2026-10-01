// What a file is shown as when it is previewed (預覽, the file viewer,
// components/preview): how it is told what it is, how much of it is fetched
// to be shown, and how the text of a text file is read.
//
// What a file is (previewKind) is told by its name's extension first, then
// by the type its uploader declared: browsers declare a .csv as Excel's on
// Windows, a .md and a .py as nothing or as plain text, and the name says
// more than that. Whatever is said, nothing a file holds is ever run: an SVG
// is shown as an image (an <img>, where it runs no script and loads nothing),
// an HTML page as its code, and an Office file as its text version (文字版)
// where there is one, since no browser shows one itself.
//
// Each kind is fetched whole, as bytes, up to a size (PREVIEW_MAX_BYTES);
// a larger file is offered to download instead. Text is read as UTF-8, or
// failing that in the legacy encoding of the reader's script (Big5 for
// Traditional Chinese, GB 18030 otherwise), as a file saved by an older
// Windows program would be.

/** How a file is shown. */
export type PreviewKind = 'pdf' | 'image' | 'markdown' | 'csv' | 'code' | 'text' | 'office' | 'audio' | 'video' | 'none'

/** The kinds whose bytes are read as text. */
export const TEXT_KINDS: ReadonlySet<PreviewKind> = new Set(['markdown', 'csv', 'code', 'text'])

/** The most of a file fetched to be shown, by kind; a larger one is to download. */
export const PREVIEW_MAX_BYTES: Record<PreviewKind, number> = {
  pdf: 100 << 20,
  image: 40 << 20,
  markdown: 2 << 20,
  csv: 2 << 20,
  code: 2 << 20,
  text: 2 << 20,
  audio: 100 << 20,
  video: 100 << 20,
  // Not fetched: an Office file shows its text version, read from Core.
  office: 0,
  none: 0,
}

/** The most rows of a CSV file shown as a table; the rest is to download. */
export const CSV_MAX_ROWS = 1000
/** The most columns of a CSV file shown. */
export const CSV_MAX_COLUMNS = 100
/** The most of a code file highlighted; a longer one is shown plain, which is quicker. */
export const HIGHLIGHT_MAX_BYTES = 256 << 10

/** Images every browser this app runs in shows: an SVG among them, as an image alone. */
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/svg+xml': 'svg',
}
/** The type an image is shown as, by its extension: an SVG needs it said to be shown at all. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/** Code, by extension, and the language highlight.js knows it as (utils/markdownCode.ts), where it knows it. */
const CODE_EXTENSIONS: Record<string, string> = {
  py: 'python',
  pyw: 'python',
  ipynb: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  php: 'php',
  r: 'r',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  xhtml: 'xml',
  vue: 'xml',
  css: 'css',
  diff: 'diff',
  patch: 'diff',
  // Known as code, shown plain.
  rb: '',
  swift: '',
  m: '',
  scala: '',
  lua: '',
  pl: '',
  hs: '',
  jl: '',
  dart: '',
  tex: '',
  bib: '',
  toml: '',
  ini: '',
  cfg: '',
  conf: '',
  properties: '',
  gradle: '',
  makefile: '',
  dockerfile: '',
  bat: '',
  ps1: '',
  asm: '',
  s: '',
  v: '',
  vhd: '',
  f90: '',
}

/** Code by its declared type, where the name says nothing. */
const CODE_TYPES: Record<string, string> = {
  'application/json': 'json',
  'text/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'xml',
  'application/xhtml+xml': 'xml',
  'text/css': 'css',
  'text/javascript': 'javascript',
  'application/javascript': 'javascript',
  'application/x-javascript': 'javascript',
  'text/x-python': 'python',
  'text/x-script.python': 'python',
  'application/x-python-code': 'python',
  'text/x-java-source': 'java',
  'text/x-java': 'java',
  'text/x-c': 'c',
  'text/x-csrc': 'c',
  'text/x-chdr': 'c',
  'text/x-c++src': 'cpp',
  'text/x-c++': 'cpp',
  'text/x-go': 'go',
  'text/x-rust': 'rust',
  'text/x-sql': 'sql',
  'application/sql': 'sql',
  'application/x-sh': 'bash',
  'text/x-sh': 'bash',
  'text/x-shellscript': 'bash',
  'application/x-yaml': 'yaml',
  'application/yaml': 'yaml',
  'text/yaml': 'yaml',
  'text/x-yaml': 'yaml',
  'text/x-diff': 'diff',
  'text/x-patch': 'diff',
}

const OFFICE_EXTENSIONS = new Set([
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'odt',
  'rtf',
  'pages',
  'xls',
  'xlsx',
  'xlsm',
  'ods',
  'numbers',
  'ppt',
  'pptx',
  'pptm',
  'pps',
  'ppsx',
  'odp',
  'key',
])
const OFFICE_TYPE =
  /(msword|ms-word|wordprocessingml|opendocument\.(text|spreadsheet|presentation)|ms-excel|spreadsheetml|ms-powerpoint|presentationml|^application\/rtf$|^text\/rtf$|apple\.(pages|numbers|keynote))/

const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  weba: 'audio/webm',
}
const VIDEO_EXTENSIONS: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
}

/** A file's extension, lower case, without its dot; '' for none. Makefile and Dockerfile are their own. */
export function extensionOf(filename: string): string {
  const name = (filename ?? '').trim().toLowerCase()
  const base = name.slice(name.lastIndexOf('/') + 1)
  if (base === 'makefile' || base === 'dockerfile') return base
  return /\.([a-z0-9+]{1,12})$/.exec(base)?.[1] ?? ''
}

/** A declared type, its parameters and case aside. */
export function baseType(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]!.trim().toLowerCase()
}

/** What a file is shown as, by its name and its declared type. */
export function previewKind(contentType: string | null | undefined, filename = ''): PreviewKind {
  const ext = extensionOf(filename)
  const ct = baseType(contentType)
  // The name first: it is what the person who made the file chose.
  if (ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'markdown' || ext === 'mdown' || ext === 'mkd') return 'markdown'
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  if (ext === 'txt' || ext === 'text' || ext === 'log') return 'text'
  if (ext in IMAGE_EXTENSIONS) return 'image'
  if (ext in CODE_EXTENSIONS) return 'code'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (ext in AUDIO_EXTENSIONS) return 'audio'
  if (ext in VIDEO_EXTENSIONS) return 'video'
  // Then the type its uploader declared.
  if (ct === 'application/pdf' || ct === 'application/x-pdf') return 'pdf'
  if (ct in IMAGE_TYPES) return 'image'
  if (ct === 'text/markdown' || ct === 'text/x-markdown') return 'markdown'
  if (ct === 'text/csv' || ct === 'text/tab-separated-values') return 'csv'
  if (ct in CODE_TYPES) return 'code'
  if (OFFICE_TYPE.test(ct)) return 'office'
  if (ct.startsWith('text/')) return 'text'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.startsWith('video/')) return 'video'
  return 'none'
}

/**
 * The type a file's bytes are shown as: the one its kind is shown by (an
 * image's by its name where the declared one says nothing, which an SVG
 * needs to be drawn at all), else the declared one.
 */
export function previewType(contentType: string | null | undefined, filename = ''): string {
  const ext = extensionOf(filename)
  const ct = baseType(contentType)
  const kind = previewKind(contentType, filename)
  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'image') return IMAGE_EXTENSIONS[ext] ?? (ct in IMAGE_TYPES ? ct : 'application/octet-stream')
  if (kind === 'audio') return ct.startsWith('audio/') ? ct : (AUDIO_EXTENSIONS[ext] ?? 'audio/mpeg')
  if (kind === 'video') return ct.startsWith('video/') ? ct : (VIDEO_EXTENSIONS[ext] ?? 'video/mp4')
  return ct || 'application/octet-stream'
}

/** The language a code file is highlighted in (a highlight.js name), or '' to show it plain. */
export function codeLanguageOf(contentType: string | null | undefined, filename = ''): string {
  const ext = extensionOf(filename)
  if (ext in CODE_EXTENSIONS) return CODE_EXTENSIONS[ext]!
  return CODE_TYPES[baseType(contentType)] ?? ''
}

/** Whether a file of this kind and size is too large to fetch and show: it is offered to download instead. */
export function tooLargeToPreview(kind: PreviewKind, byteSize: number | null | undefined): boolean {
  const max = PREVIEW_MAX_BYTES[kind]
  return max > 0 && typeof byteSize === 'number' && byteSize > max
}

/** Whether the viewer fetches a file of this kind to show it (an Office file shows its text version instead). */
export function fetchesBytes(kind: PreviewKind): boolean {
  return PREVIEW_MAX_BYTES[kind] > 0
}

// --- Reading text ----------------------------------------------------------------------

/** The legacy encoding a text that is not UTF-8 is read in: the one the reader's script was written in. */
export function legacyEncodingFor(locale: string): 'big5' | 'gb18030' {
  return locale === 'zh-Hant' ? 'big5' : 'gb18030'
}

/** A file's text, and the encoding it was read in. */
export interface DecodedText {
  text: string
  encoding: string
}

/**
 * Reads bytes as text: by their byte order mark where they have one (UTF-8,
 * UTF-16), as UTF-8 where they are that, and otherwise in `legacy`, the
 * encoding older programs saved the reader's script in. The mark itself is
 * not part of the text.
 */
export function decodeText(bytes: Uint8Array, legacy: 'big5' | 'gb18030' = 'big5'): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    try {
      return { text: new TextDecoder(legacy).decode(bytes), encoding: legacy }
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' }
    }
  }
}

/**
 * Whether bytes are not text at all (a program, an archive, a picture named
 * .txt): a NUL among the first few kilobytes, which no text in UTF-8, Big5 or
 * GB 18030 holds. UTF-16, which is full of them, is told by its mark first.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return false
  const n = Math.min(bytes.length, 8192)
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true
  return false
}

/**
 * Code as Markdown, to be shown by the app's Markdown renderer: one fenced
 * block in its language, fenced with more backticks than any run in the code
 * holds, so that nothing in it closes the fence.
 */
export function codeAsMarkdown(code: string, language: string): string {
  let longest = 0
  for (const m of code.matchAll(/`+/g)) longest = Math.max(longest, m[0].length)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n`
}

// --- CSV ---------------------------------------------------------------------------------

/** A CSV file's rows, as many as are shown. */
export interface CsvTable {
  rows: string[][]
  /** The widest row's number of cells, at most CSV_MAX_COLUMNS. */
  columns: number
  /** More rows follow those shown. */
  truncatedRows: boolean
  /** Some row has more cells than are shown. */
  truncatedColumns: boolean
  delimiter: string
}

/**
 * The delimiter a CSV file's first line uses: a comma, a semicolon (as
 * spreadsheets save where a comma is the decimal point) or a tab, whichever
 * it holds most of outside quotes; a comma when it holds none.
 */
export function guessDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') quoted = !quoted
    else if (!quoted && (c === '\n' || c === '\r')) break
    else if (!quoted && c in counts) counts[c]!++
  }
  let best = ','
  for (const d of [';', '\t']) if (counts[d]! > counts[best]!) best = d
  return best
}

/**
 * Reads CSV (RFC 4180): fields in double quotes may hold the delimiter, line
 * breaks and quotes written twice; lines end in CRLF, LF or CR; the last
 * line's break, if any, ends no row of its own. Reading stops after maxRows
 * rows, saying more follow.
 */
export function parseCsv(
  text: string,
  opts: { delimiter?: string; maxRows?: number; maxColumns?: number } = {},
): CsvTable {
  const delimiter = opts.delimiter ?? guessDelimiter(text)
  const maxRows = opts.maxRows ?? CSV_MAX_ROWS
  const maxColumns = opts.maxColumns ?? CSV_MAX_COLUMNS
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let truncatedRows = false
  let truncatedColumns = false
  let i = 0
  /** Whether anything of the row being read has been seen (a line of nothing but its break is a row of one empty field). */
  let started = false
  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = (): boolean => {
    endField()
    if (row.length > maxColumns) {
      truncatedColumns = true
      row = row.slice(0, maxColumns)
    }
    rows.push(row)
    row = []
    started = false
    return rows.length < maxRows
  }
  const n = text.length
  while (i < n) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    started = true
    if (c === '"' && field === '') {
      quoted = true
      i++
    } else if (c === delimiter) {
      endField()
      i++
    } else if (c === '\r' || c === '\n') {
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      if (!endRow()) {
        truncatedRows = i < n
        break
      }
    } else {
      field += c
      i++
    }
  }
  // The last row, where no line break ends it.
  if (!truncatedRows && started) endRow()
  const columns = rows.reduce((m, r) => Math.max(m, r.length), 0)
  return { rows, columns, truncatedRows, truncatedColumns, delimiter }
}
