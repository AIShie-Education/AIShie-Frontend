import { describe, expect, it } from 'vitest'
import { MAX_FILENAME_CHARS, fileKind, isSafeFileName, safeFileName } from './files'

describe('safeFileName', () => {
  it('leaves a name Core takes as it is', () => {
    for (const n of ['week3-slides.pdf', '第三週 講義.pptx', 'essay.PDF', 'a b  c.txt']) {
      expect(isSafeFileName(n)).toBe(true)
      expect(safeFileName(n)).toBe(n)
    }
  })

  it('makes a name of one Core would refuse, as Core makes one of a title', () => {
    // A character that turns the text round would show …exe as …pdf.
    expect(safeFileName('invoice‮gpj.exe')).toBe('invoice gpj.exe')
    expect(safeFileName('a/b\\c.txt')).toBe('a b c.txt')
    expect(safeFileName('tab\there\u0000.txt')).toBe('tab here .txt')
    expect(safeFileName('  ⁦  ')).toBe('file')
    for (const bad of ['invoice‮gpj.exe', 'a/b.txt', ' padded.txt', '']) expect(isSafeFileName(bad)).toBe(false)
  })

  it('cuts a name too long, keeping its extension', () => {
    const long = `${'x'.repeat(300)}.pdf`
    const cut = safeFileName(long)
    expect([...cut].length).toBe(MAX_FILENAME_CHARS)
    expect(cut.endsWith('.pdf')).toBe(true)
    expect(isSafeFileName(cut)).toBe(true)
    // Characters, not bytes: 255 CJK characters are a name.
    expect(safeFileName('講'.repeat(255))).toBe('講'.repeat(255))
  })
})

describe('fileKind', () => {
  it('knows a file by its type, and by its name where its type says nothing', () => {
    expect(fileKind('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('slides')
    expect(fileKind('application/octet-stream', 'loops.PY')).toBe('other')
    expect(fileKind('application/octet-stream', 'notes.md')).toBe('text')
  })
})
