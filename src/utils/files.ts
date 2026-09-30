// Files as the app shows and names them, wherever they are: a document
// version's files, and a message's.
//
// What a file is (fileKind), for its icon and its word, is told by the type
// its uploader declared or, failing that, its name. A file's name is what
// Core keeps and serves it as: 1 to 255 characters on one line, a name and
// not a path (safeFileName makes one of any name, as Core makes one of a
// title).

/** What a file is, by its type (as its uploader declared it) or, failing that, its name: for its icon and its word. */
export type FileKind = 'image' | 'pdf' | 'word' | 'sheet' | 'slides' | 'text' | 'archive' | 'audio' | 'video' | 'other'

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  pages: 'word',
  xls: 'sheet',
  xlsx: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  numbers: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  key: 'slides',
  txt: 'text',
  md: 'text',
  json: 'text',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tar: 'archive',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  svg: 'image',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
}

export function fileKind(contentType: string | null | undefined, filename = ''): FileKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.startsWith('video/')) return 'video'
  if (ct === 'application/pdf') return 'pdf'
  if (/(msword|wordprocessingml|opendocument\.text|rtf)/.test(ct)) return 'word'
  if (/(ms-excel|spreadsheetml|opendocument\.spreadsheet)/.test(ct) || ct === 'text/csv') return 'sheet'
  if (/(ms-powerpoint|presentationml|opendocument\.presentation)/.test(ct)) return 'slides'
  if (/(zip|x-7z|x-rar|gzip|x-tar|compressed)/.test(ct)) return 'archive'
  if (ct.startsWith('text/') || ct === 'application/json') return 'text'
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1]?.toLowerCase()
  return (ext && BY_EXTENSION[ext]) || 'other'
}

/** Each kind's icon (Element Plus's, by name). */
export const FILE_ICON: Record<FileKind, string> = {
  image: 'Picture',
  pdf: 'Document',
  word: 'Notebook',
  sheet: 'Grid',
  slides: 'DataBoard',
  text: 'Tickets',
  archive: 'Box',
  audio: 'Headset',
  video: 'VideoCamera',
  other: 'Paperclip',
}

/** The most characters a file's name has in Core (its database's limit). */
export const MAX_FILENAME_CHARS = 255

/**
 * A character with no place in a file's name, as Core holds names: a control
 * character, or one that turns the direction of the text round (which would
 * show a name that ends in .exe as one that ends in .jpg).
 */
function hidden(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)
}

/** Whether Core takes this as a file's name as it is: 1 to 255 characters on one line, a name and not a path. */
export function isSafeFileName(name: string): boolean {
  const n = name.trim()
  if (!n || n !== name) return false
  const chars = [...n]
  if (chars.length > MAX_FILENAME_CHARS) return false
  return !chars.some((c) => c === '/' || c === '\\' || hidden(c.codePointAt(0)!))
}

/**
 * A name Core takes for a file called `name`, as Core makes one of a title:
 * each run of control characters, characters that turn the text round, and
 * slashes made one space, trimmed; "file" if nothing is left; cut to 255
 * characters, keeping its extension. A name Core takes already comes back as
 * it is.
 */
export function safeFileName(name: string): string {
  let out = ''
  let gap = false
  for (const c of name) {
    if (c === '/' || c === '\\' || hidden(c.codePointAt(0)!)) {
      gap = true
      continue
    }
    if (gap && out) out += ' '
    gap = false
    out += c
  }
  out = out.trim() || 'file'
  const chars = [...out]
  if (chars.length <= MAX_FILENAME_CHARS) return out
  const ext = /\.[^.\s]{1,16}$/.exec(out)?.[0] ?? ''
  const extChars = [...ext].length
  return chars.slice(0, MAX_FILENAME_CHARS - extChars).join('').trimEnd() + ext
}
