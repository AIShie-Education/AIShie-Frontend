import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TextVersion } from '@/api/types'

/** What Core answers document.text with, part by part; a test sets it. */
let answer: (part: number, call: number) => unknown
const asked: { part: number; version_id: string }[] = []

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: { part: number; version_id: string }) => {
      if (tool !== 'document.text') throw new Error(`no answer for ${tool}`)
      asked.push({ part: args.part, version_id: args.version_id })
      const out = answer(args.part, asked.length)
      if (out instanceof Error) throw out
      return out
    }),
  }
})

const { ApiError } = await import('@/api/http')
const {
  changedRevision,
  isNoText,
  readWholeText,
  textReasonText,
  textShown,
  textStatus,
  textTabShown,
  TEXT_READ_RESTARTS,
} = await import('./textVersion')

const REF = { course_id: 'c-1', document_id: 'd-1', version_id: 'v-1' }

function text(over: Partial<TextVersion> = {}): TextVersion {
  return {
    status: 'done',
    source: 'ai',
    model: 'Gemini Flash-Lite',
    pages: 3,
    revision: 4,
    bytes: 100,
    updated_at: '2026-09-30T08:00:00Z',
    ...over,
  }
}
function part(body: string, parts: number, n: number, over: Partial<TextVersion> = {}) {
  return {
    document_id: 'd-1',
    version_id: 'v-1',
    seq: 2,
    published: true,
    parts,
    part: n,
    text: text({ body, ...over }),
  }
}

beforeEach(() => {
  asked.length = 0
})

describe('readWholeText', () => {
  it('reads a short text in one part', async () => {
    answer = (p) => part('## 第 1 頁\n\nHello', 1, p)
    const whole = await readWholeText(REF)
    expect(whole.body).toBe('## 第 1 頁\n\nHello')
    expect(whole.text.body).toBe(whole.body)
    expect(whole.parts).toBe(1)
    expect(asked).toEqual([{ part: 1, version_id: 'v-1' }])
  })

  it('reads every part of a long one, in order, and joins them', async () => {
    const bodies = ['## 第 1 頁\n\nA\n', '## 第 2 頁\n\nB\n', '## 第 3 頁\n\nC\n']
    answer = (p) => part(bodies[p - 1], 3, p)
    const progress: [number, number][] = []
    const whole = await readWholeText(REF, { onProgress: (r, n) => progress.push([r, n]) })
    expect(whole.body).toBe(bodies.join(''))
    expect(asked.map((a) => a.part)).toEqual([1, 2, 3])
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('starts again from the first part when the text changes between two parts', async () => {
    // The second part is read at another revision: an edit landed meanwhile.
    answer = (p, call) => {
      const revision = call >= 2 ? 5 : 4
      return part(`r${revision}p${p};`, 2, p, { revision })
    }
    const whole = await readWholeText(REF)
    expect(asked.map((a) => a.part)).toEqual([1, 2, 1, 2])
    expect(whole.body).toBe('r5p1;r5p2;')
    expect(whole.text.revision).toBe(5)
  })

  it('starts again when the text was made shorter and has no such part now', async () => {
    answer = (p, call) => {
      if (call === 2)
        return new ApiError({
          status: 400,
          code: 'invalid_argument',
          message: 'no part 2',
          details: { parts: 1 },
        })
      return call === 1 ? part('long;', 2, p) : part('short', 1, p, { revision: 5 })
    }
    const whole = await readWholeText(REF)
    expect(whole.body).toBe('short')
    expect(asked.map((a) => a.part)).toEqual([1, 2, 1])
  })

  it('gives up, as a conflict, when the text keeps changing', async () => {
    answer = (p, call) => part(`c${call}`, 2, p, { revision: call })
    const e = await readWholeText(REF).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(409)
    expect(asked).toHaveLength(2 * (TEXT_READ_RESTARTS + 1))
  })

  it('has no body while the text is not done', async () => {
    answer = () => ({
      document_id: 'd-1',
      version_id: 'v-1',
      seq: 2,
      published: false,
      parts: 0,
      text: text({ status: 'pending', source: null, bytes: 0 }),
    })
    const whole = await readWholeText(REF)
    expect(whole).toMatchObject({ body: '', parts: 0, text: { status: 'pending' } })
    expect(asked).toHaveLength(1)
  })

  it('passes on Core’s refusal, a version without a text version among them', async () => {
    answer = () =>
      new ApiError({ status: 404, code: 'not_found', message: 'no text version', details: { reason: 'no_text' } })
    const e = await readWholeText(REF).catch((x) => x)
    expect(isNoText(e)).toBe(true)
  })
})

describe('what is shown', () => {
  it('shows a done text whether the transcriber is on or not, and the queue only while it is on', () => {
    expect(textShown(text(), false)).toBe('text')
    expect(textShown(text({ status: 'pending' }), true)).toBe('queued')
    expect(textShown(text({ status: 'working' }), true)).toBe('queued')
    expect(textShown(text({ status: 'pending' }), false)).toBe('none')
    expect(textShown(text({ status: 'failed', reason: 'model_error' }), false)).toBe('failed')
    expect(textShown(null, true)).toBe('none')
    // A status this app does not know waits.
    expect(textStatus(text({ status: 'resting' }))).toBe('pending')
  })

  const base = { courseLevel: true, purged: false, hasFile: true, canWrite: false, transcriptionOn: false }
  it('gives readers the tab where there is a text, or a place in the queue of a transcriber that is on', () => {
    expect(textTabShown({ ...base, text: text() })).toBe(true)
    expect(textTabShown({ ...base, text: text({ status: 'pending' }) })).toBe(false)
    expect(textTabShown({ ...base, text: text({ status: 'pending' }), transcriptionOn: true })).toBe(true)
    expect(textTabShown({ ...base, text: null, transcriptionOn: true })).toBe(false)
  })

  it('gives staff the tab for every version with a file, to transcribe it or write it by hand', () => {
    const staff = { ...base, canWrite: true }
    expect(textTabShown({ ...staff, text: null })).toBe(true)
    expect(textTabShown({ ...staff, text: text({ status: 'pending' }) })).toBe(true)
    expect(textTabShown({ ...staff, text: null, hasFile: false })).toBe(false)
    // Never for a submitted file or a purged version.
    expect(textTabShown({ ...staff, text: text(), courseLevel: false })).toBe(false)
    expect(textTabShown({ ...staff, text: text(), purged: true })).toBe(false)
  })

  it('says why in the reader’s words where it knows the reason, and as written otherwise', () => {
    const words: Record<string, string> = { 'enums.textReason.too_many_pages': '頁數超過上限' }
    const t = (k: string) => words[k] ?? k
    const te = (k: string) => k in words
    expect(textReasonText('too_many_pages', t, te)).toBe('頁數超過上限')
    expect(textReasonText('The PDF had no pages', t, te)).toBe('The PDF had no pages')
    expect(textReasonText('odd_code', t, te)).toBe('odd_code')
    expect(textReasonText(null, t, te)).toBe('')
  })

  it('reads the revision Core has now from a refusal because the text changed', () => {
    const e = new ApiError({
      status: 409,
      code: 'conflict',
      message: 'changed',
      details: { reason: 'text_changed', revision: 7 },
    })
    expect(changedRevision(e)).toBe(7)
    expect(changedRevision(new Error('x'))).toBeNull()
  })
})
