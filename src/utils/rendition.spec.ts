import { afterEach, describe, expect, it, vi } from 'vitest'

const fetched: string[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    fetchBlob: vi.fn(async (url: string) => {
      fetched.push(url)
      return new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    }),
  }
})

const {
  pdfNameOf,
  RENDITION_POLL_FIRST_MS,
  RENDITION_POLL_MAX_MS,
  renditionPollDelay,
  renditionReason,
  renditionStage,
  retryPermOf,
  RETRY_READS_AGAIN,
  savePdf,
} = await import('./rendition')

afterEach(() => {
  vi.restoreAllMocks()
  fetched.length = 0
})

describe('renditionStage', () => {
  it('waits for a queued one and one being converted, shows a done one, and has none to show otherwise', () => {
    expect(renditionStage({ state: 'queued' })).toBe('waiting')
    expect(renditionStage({ state: 'claimed' })).toBe('waiting')
    expect(renditionStage({ state: 'done' })).toBe('done')
    expect(renditionStage({ state: 'failed' })).toBe('none')
    expect(renditionStage({ state: 'skipped' })).toBe('none')
    // A state this app does not know yet: nothing to wait for, nothing to show.
    expect(renditionStage({ state: 'withdrawn' })).toBe('none')
  })

  it('says nothing of a file with no rendition (one Core does not convert, or a Core before renditions)', () => {
    expect(renditionStage(null)).toBeNull()
    expect(renditionStage(undefined)).toBeNull()
  })
})

describe('renditionReason', () => {
  it('knows every reason Core and the runtime give, and calls any other one other', () => {
    for (const r of [
      'password_protected',
      'unsupported',
      'too_large',
      'conversion_failed',
      'timeout',
      'attempts_exhausted',
    ]) {
      expect(renditionReason({ reason: r })).toBe(r)
    }
    expect(renditionReason({ reason: 'cosmic_rays' })).toBe('other')
    expect(renditionReason({ reason: null })).toBe('other')
    expect(renditionReason({})).toBe('other')
    expect(renditionReason(null)).toBe('other')
  })
})

describe('renditionPollDelay', () => {
  it('asks 2 s after, then twice as long each time, up to 30 s', () => {
    expect(RENDITION_POLL_FIRST_MS).toBe(2_000)
    expect(RENDITION_POLL_MAX_MS).toBe(30_000)
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(renditionPollDelay)).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000,
    ])
    expect(renditionPollDelay(-3)).toBe(2_000)
  })
})

describe('pdfNameOf', () => {
  it('puts .pdf in place of the file’s extension, as Core names the PDF', () => {
    expect(pdfNameOf('第四週 handout.docx')).toBe('第四週 handout.pdf')
    expect(pdfNameOf('Lecture 3.PPTX')).toBe('Lecture 3.pdf')
    expect(pdfNameOf('marks.v2.xlsx')).toBe('marks.v2.pdf')
    expect(pdfNameOf('README')).toBe('README.pdf')
    expect(pdfNameOf('')).toBe('file.pdf')
  })
})

describe('retryPermOf', () => {
  it('is the document’s kind’s own write permission', () => {
    expect(retryPermOf('material')).toBe('document_write')
    expect(retryPermOf('instructions')).toBe('document_write')
    expect(retryPermOf('rubric')).toBe('document_write')
    expect(retryPermOf('submission')).toBe('submission_write')
    expect(retryPermOf('feedback')).toBe('grade_submit')
    expect(retryPermOf('scroll')).toBeNull()
    expect(retryPermOf(undefined)).toBeNull()
  })
})

describe('retries Core refuses', () => {
  it('reads again what is done already or has no rendition', () => {
    expect([...RETRY_READS_AGAIN].sort()).toEqual(['no_rendition', 'rendition_done'])
  })
})

describe('savePdf', () => {
  it('fetches the PDF from its URL and saves it under its name, from an object URL', async () => {
    const saved: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ href: this.href, download: this.download })
    })
    URL.createObjectURL = vi.fn(() => 'blob:local/pdf')
    URL.revokeObjectURL = vi.fn()
    await savePdf('https://store.test/renditions/x', 'handout.pdf')
    expect(fetched).toEqual(['https://store.test/renditions/x'])
    expect(saved).toEqual([{ href: 'blob:local/pdf', download: 'handout.pdf' }])
    const made = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Blob
    expect(made.type).toBe('application/pdf')
    // Nothing is left on the page.
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
