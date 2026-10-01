import { describe, expect, it } from 'vitest'
import {
  codeAsMarkdown,
  codeLanguageOf,
  CSV_MAX_ROWS,
  decodeText,
  extensionOf,
  fetchesBytes,
  guessDelimiter,
  legacyEncodingFor,
  looksBinary,
  parseCsv,
  PREVIEW_MAX_BYTES,
  previewKind,
  previewType,
  tooLargeToPreview,
} from './preview'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

describe('previewKind', () => {
  it.each([
    ['application/pdf', 'week3.pdf', 'pdf'],
    ['application/octet-stream', 'scan.PDF', 'pdf'],
    ['application/pdf', 'no-extension', 'pdf'],
    ['image/png', 'shot.png', 'image'],
    ['image/jpeg', 'photo.JPG', 'image'],
    ['image/gif', 'a.gif', 'image'],
    ['image/webp', 'a.webp', 'image'],
    ['image/avif', 'a.avif', 'image'],
    ['image/bmp', 'a.bmp', 'image'],
    ['image/svg+xml', 'diagram.svg', 'image'],
    ['', 'diagram.svg', 'image'],
    ['image/png', 'pasted', 'image'],
    // Shown by no browser: to download.
    ['image/heic', 'IMG_0001.HEIC', 'none'],
    ['image/tiff', 'scan.tif', 'none'],
    ['text/markdown', 'notes.md', 'markdown'],
    ['text/plain', 'README.markdown', 'markdown'],
    ['', 'notes.md', 'markdown'],
    ['text/markdown; charset=utf-8', 'notes', 'markdown'],
    ['text/csv', 'data.csv', 'csv'],
    // Windows declares a .csv as Excel's.
    ['application/vnd.ms-excel', 'marks.csv', 'csv'],
    ['text/tab-separated-values', 'data.tsv', 'csv'],
    ['text/plain', 'essay.txt', 'text'],
    ['application/octet-stream', 'server.log', 'text'],
    ['text/plain', 'loops.py', 'code'],
    ['text/x-python', 'loops.py', 'code'],
    ['', 'Main.java', 'code'],
    ['application/json', 'data.json', 'code'],
    ['application/json', 'no-extension', 'code'],
    // A page is shown as its code, never as a page.
    ['text/html', 'index.html', 'code'],
    ['text/html', 'page', 'code'],
    ['', 'Makefile', 'code'],
    ['application/msword', 'old.doc', 'office'],
    [DOCX, 'essay.docx', 'office'],
    [PPTX, 'slides.pptx', 'office'],
    [XLSX, 'marks.xlsx', 'office'],
    ['application/vnd.oasis.opendocument.text', 'essay.odt', 'office'],
    ['application/octet-stream', 'essay.docx', 'office'],
    ['application/rtf', 'letter', 'office'],
    ['audio/mpeg', 'lecture.mp3', 'audio'],
    ['', 'voice.m4a', 'audio'],
    ['video/mp4', 'demo.mp4', 'video'],
    ['video/webm', 'clip', 'video'],
    ['application/zip', 'project.zip', 'none'],
    ['application/octet-stream', 'program.exe', 'none'],
    ['', '', 'none'],
    [null, 'x', 'none'],
  ])('%s, “%s” → %s', (ct, name, kind) => {
    expect(previewKind(ct, name)).toBe(kind)
  })
})

describe('the type a file is shown as', () => {
  it('names an image by its extension where the declared type says nothing, which an SVG needs', () => {
    expect(previewType('application/octet-stream', 'diagram.svg')).toBe('image/svg+xml')
    expect(previewType('', 'photo.jpg')).toBe('image/jpeg')
    expect(previewType('image/png', 'pasted')).toBe('image/png')
    expect(previewType('application/octet-stream', 'scan.pdf')).toBe('application/pdf')
    expect(previewType('', 'voice.m4a')).toBe('audio/mp4')
    expect(previewType('video/webm', 'clip')).toBe('video/webm')
    expect(previewType('text/plain; charset=utf-8', 'a.txt')).toBe('text/plain')
  })

  it('highlights code in a language the app knows, and shows the rest plain', () => {
    expect(codeLanguageOf('text/plain', 'loops.py')).toBe('python')
    expect(codeLanguageOf('', 'Main.java')).toBe('java')
    expect(codeLanguageOf('text/html', 'index.html')).toBe('xml')
    expect(codeLanguageOf('application/json', 'data')).toBe('json')
    expect(codeLanguageOf('', 'script.rb')).toBe('')
    expect(codeLanguageOf('text/plain', 'notes')).toBe('')
  })

  it('reads an extension from the name alone, lower case', () => {
    expect(extensionOf('Week 3 — Loops.PDF')).toBe('pdf')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('.bashrc')).toBe('bashrc')
    expect(extensionOf('Makefile')).toBe('makefile')
    expect(extensionOf('no extension')).toBe('')
  })
})

describe('how much is fetched to be shown', () => {
  it('fetches text up to 2 MB, and a PDF, an image or a recording up to its own cap', () => {
    expect(PREVIEW_MAX_BYTES.text).toBe(2 * 1024 * 1024)
    expect(tooLargeToPreview('text', 2 * 1024 * 1024)).toBe(false)
    expect(tooLargeToPreview('text', 2 * 1024 * 1024 + 1)).toBe(true)
    expect(tooLargeToPreview('markdown', 3_000_000)).toBe(true)
    expect(tooLargeToPreview('csv', 3_000_000)).toBe(true)
    expect(tooLargeToPreview('code', 3_000_000)).toBe(true)
    expect(tooLargeToPreview('pdf', 50 * 1024 * 1024)).toBe(false)
    expect(tooLargeToPreview('pdf', 101 * 1024 * 1024)).toBe(true)
    expect(tooLargeToPreview('image', 41 * 1024 * 1024)).toBe(true)
    expect(tooLargeToPreview('video', 99 * 1024 * 1024)).toBe(false)
  })

  it('fetches nothing of an Office file, which shows its text version, nor of one it cannot show', () => {
    expect(fetchesBytes('office')).toBe(false)
    expect(fetchesBytes('none')).toBe(false)
    expect(tooLargeToPreview('office', 10 ** 9)).toBe(false)
    expect(fetchesBytes('pdf')).toBe(true)
    expect(fetchesBytes('markdown')).toBe(true)
  })

  it('takes a size it is not told for small enough', () => {
    expect(tooLargeToPreview('pdf', undefined)).toBe(false)
    expect(tooLargeToPreview('pdf', null)).toBe(false)
  })
})

describe('reading text', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  const utf8 = (s: string) => new TextEncoder().encode(s)

  it('reads UTF-8, with its mark or without', () => {
    expect(decodeText(utf8('遞迴 recursion'))).toEqual({ text: '遞迴 recursion', encoding: 'utf-8' })
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('abc')]))).toEqual({ text: 'abc', encoding: 'utf-8' })
  })

  it('reads UTF-16 by its mark', () => {
    // 「中文」, as Notepad saves "Unicode".
    expect(decodeText(bytes(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65))).toEqual({ text: '中文', encoding: 'utf-16le' })
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x41))).toEqual({ text: 'A', encoding: 'utf-16be' })
  })

  it('reads what is not UTF-8 in the legacy encoding of the reader’s script', () => {
    // 「中文」 in Big5, and in GB 18030.
    expect(decodeText(bytes(0xa4, 0xa4, 0xa4, 0xe5), 'big5')).toEqual({ text: '中文', encoding: 'big5' })
    expect(decodeText(bytes(0xd6, 0xd0, 0xce, 0xc4), 'gb18030')).toEqual({ text: '中文', encoding: 'gb18030' })
    expect(legacyEncodingFor('zh-Hant')).toBe('big5')
    expect(legacyEncodingFor('zh-Hans')).toBe('gb18030')
    expect(legacyEncodingFor('en')).toBe('gb18030')
  })

  it('tells bytes that are not text by a NUL among them', () => {
    expect(looksBinary(utf8('plain text\n'))).toBe(false)
    expect(looksBinary(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00))).toBe(true)
    expect(looksBinary(bytes(0xff, 0xfe, 0x41, 0x00))).toBe(false)
  })

  it('makes code one fenced block that nothing in it can close', () => {
    expect(codeAsMarkdown('print(1)\n', 'python')).toBe('```python\nprint(1)\n```\n')
    expect(codeAsMarkdown('a = "```"', '')).toBe('````\na = "```"\n````\n')
  })
})

describe('parseCsv', () => {
  it('reads fields, quoted fields with commas, line breaks and quotes in them', () => {
    const t = parseCsv('name,comment\r\n"Chan, Tai Man","said ""hi""\nand left"\nLee,ok\n')
    expect(t.rows).toEqual([
      ['name', 'comment'],
      ['Chan, Tai Man', 'said "hi"\nand left'],
      ['Lee', 'ok'],
    ])
    expect(t.columns).toBe(2)
    expect(t.truncatedRows).toBe(false)
  })

  it('takes a last line with no break, and empty fields', () => {
    expect(parseCsv('a,,c\n,,\nx').rows).toEqual([['a', '', 'c'], ['', '', ''], ['x']])
    expect(parseCsv('').rows).toEqual([])
    expect(parseCsv('\n').rows).toEqual([['']])
  })

  it('reads CR line ends, and a quote left open to the end', () => {
    expect(parseCsv('a,b\rc,d').rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseCsv('a,"open\nto the end').rows).toEqual([['a', 'open\nto the end']])
  })

  it('guesses a semicolon or a tab from the first line, outside quotes', () => {
    expect(guessDelimiter('a;b;c\n1,5;2,5;3')).toBe(';')
    expect(guessDelimiter('a\tb\n')).toBe('\t')
    expect(guessDelimiter('"x;y;z",b\n')).toBe(',')
    expect(guessDelimiter('single')).toBe(',')
    expect(parseCsv('n;t\n1,5;2').rows).toEqual([
      ['n', 't'],
      ['1,5', '2'],
    ])
  })

  it('stops at the row cap, saying more follow', () => {
    const text = Array.from({ length: 1500 }, (_, i) => `${i},x`).join('\n')
    const t = parseCsv(text)
    expect(t.rows).toHaveLength(CSV_MAX_ROWS)
    expect(t.rows.at(-1)).toEqual([`${CSV_MAX_ROWS - 1}`, 'x'])
    expect(t.truncatedRows).toBe(true)
    expect(parseCsv('a\nb\n', { maxRows: 2 }).truncatedRows).toBe(false)
    expect(parseCsv('a\nb\nc', { maxRows: 2 }).truncatedRows).toBe(true)
  })

  it('cuts rows wider than the column cap, saying so', () => {
    const t = parseCsv('1,2,3,4\n5,6', { maxColumns: 3 })
    expect(t.rows).toEqual([
      ['1', '2', '3'],
      ['5', '6'],
    ])
    expect(t.columns).toBe(3)
    expect(t.truncatedColumns).toBe(true)
  })
})
