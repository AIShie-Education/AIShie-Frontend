import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { resetCoreClock } from '@/api/clock'
import { setLocale } from '@/i18n'
import type { DepartmentNode } from '@/api/types'
import { indexTree } from '@/utils/departmentTree'
import {
  CONVERSATION_EXPORTS_PREFIX,
  CONVERSATION_EXPORT_PENDING_PREFIX,
  LINK_MARGIN_MS,
  REMEMBERED_MAX,
  departmentChoices,
  emptyForm,
  endOfDayExclusive,
  exportArgs,
  exportErrorText,
  forgetExport,
  formProblems,
  freshLink,
  heldLink,
  holdLinks,
  keyFor,
  linkLive,
  liveLink,
  pendingExport,
  rememberExport,
  rememberedExports,
  runExport,
  scopeChoices,
  settleKey,
  spanWords,
  startOfDay,
  tooLargeOf,
  type ExportForm,
  type ExportResult,
} from './conversationExport'

// Exporting conversations for audit: who is offered what, what the form
// sends (its days as instants with their offsets, the end exclusive), the
// idempotency key kept until Core answers, the links to the files, the
// exports this browser remembers for each administrator, and Core's
// refusals in each language.

const ME = 'actor-me'
const OTHER = 'actor-other'

function dept(id: string, name: string, parent: string | null, administers: boolean, depth: number): DepartmentNode {
  return { id, name, parent_id: parent, administers, manages: administers, appointed: false, depth } as DepartmentNode
}

function result(over: Partial<ExportResult> = {}): ExportResult {
  const id = over.export_id ?? '01a0f4da-dd6c-78eb-b378-7d6c825ffffd'
  return {
    export_id: id,
    as_of: '2026-09-30T08:15:02.123456Z',
    conversations: 2,
    messages: 5,
    retracted: 1,
    attachments: 2,
    proposals: 0,
    text_bytes: 212,
    files: [
      {
        format: 'jsonl',
        filename: `conversations-${id}.jsonl`,
        content_type: 'application/x-ndjson',
        byte_size: 4210,
        checksum: 'sha256:7f94',
      },
      {
        format: 'csv',
        filename: `messages-${id}.csv`,
        content_type: 'text/csv; charset=utf-8',
        byte_size: 1980,
        checksum: 'sha256:0c8b',
      },
    ],
    expires_at: '2026-10-01T08:15:02.123456Z',
    downloads: [
      { format: 'jsonl', download_url: 'https://lms.example.edu/v1/blobs/j', expires_at: '2026-09-30T08:30:02Z' },
      { format: 'csv', download_url: 'https://lms.example.edu/v1/blobs/c', expires_at: '2026-09-30T08:30:02Z' },
    ],
    ...over,
  }
}

const AT = Date.parse('2026-09-30T08:16:00Z')
const course = (over: Partial<ExportForm> = {}): ExportForm => ({ ...emptyForm(), courseId: 'c1', ...over })

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  setLocale('en')
  localStorage.clear()
  sessionStorage.clear()
  settleKey(ME)
  settleKey(OTHER)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetCoreClock()
})

describe('who is offered what', () => {
  it('offers a course, a department or the whole site to a platform administrator, never the site to a department’s, and nothing to anyone else', () => {
    expect(scopeChoices({ isAdmin: true, isDeptAdmin: false })).toEqual(['course', 'department', 'site'])
    expect(scopeChoices({ isAdmin: true, isDeptAdmin: true })).toEqual(['course', 'department', 'site'])
    expect(scopeChoices({ isAdmin: false, isDeptAdmin: true })).toEqual(['course', 'department'])
    expect(scopeChoices({ isAdmin: false, isDeptAdmin: false })).toEqual([])
  })

  it('offers a department’s administrator the departments from their appointment down, and none beside it', () => {
    const tree = indexTree([
      dept('uni', 'University', null, false, 1),
      dept('eng', 'Engineering', 'uni', true, 2),
      dept('cs', 'Computing', 'eng', true, 3),
      dept('ai', 'AI', 'cs', true, 4),
      dept('des', 'Design', 'eng', true, 3),
      dept('hum', 'Humanities', 'uni', false, 2),
      dept('his', 'History', 'hum', false, 3),
    ])
    const choices = departmentChoices(tree)
    expect(choices.map((d) => d.label)).toEqual(['Engineering'])
    const flat = (ds: typeof choices): string[] => ds.flatMap((d) => [d.label, ...flat(d.children ?? [])])
    expect(flat(choices)).toEqual(['Engineering', 'Computing', 'AI', 'Design'])
    expect(flat(choices).every((n) => !['University', 'Humanities', 'History'].includes(n))).toBe(true)
    expect(choices[0]!.disabled).toBe(false)
  })

  it('holds the form back until what it is about is chosen, the scope is the caller’s, and the days are in order', () => {
    const platform = scopeChoices({ isAdmin: true, isDeptAdmin: false })
    const dept = scopeChoices({ isAdmin: false, isDeptAdmin: true })
    expect(formProblems(emptyForm(), platform)).toEqual(['course'])
    expect(formProblems(course(), platform)).toEqual([])
    expect(formProblems({ ...emptyForm('department') }, dept)).toEqual(['department'])
    expect(formProblems({ ...emptyForm('department'), deptId: 'eng' }, dept)).toEqual([])
    expect(formProblems(emptyForm('site'), platform)).toEqual([])
    expect(formProblems(emptyForm('site'), dept)).toEqual(['scope'])
    expect(formProblems(course({ fromDate: '2026-09-10', toDate: '2026-09-09' }), platform)).toEqual(['dates'])
    // One day alone is a span: from its start to its end.
    expect(formProblems(course({ fromDate: '2026-09-10', toDate: '2026-09-10' }), platform)).toEqual([])
  })
})

describe('the days, as Core is sent them', () => {
  it('sends midnight at the start of the first day and of the day after the last, with the browser’s offset', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    expect(startOfDay('2026-09-01')).toBe('2026-09-01T00:00:00+08:00')
    // Up to and including 30 September: before is exclusive, so it is midnight as 1 October starts.
    expect(endOfDayExclusive('2026-09-30')).toBe('2026-10-01T00:00:00+08:00')
    expect(exportArgs(course({ fromDate: '2026-09-01', toDate: '2026-09-30' }))).toEqual({
      course_id: 'c1',
      from: '2026-09-01T00:00:00+08:00',
      before: '2026-10-01T00:00:00+08:00',
    })
  })

  it('gives each end the offset of its own day where the clocks change between them', () => {
    vi.stubEnv('TZ', 'America/New_York')
    // Summer time ends on 1 November 2026.
    expect(startOfDay('2026-10-31')).toBe('2026-10-31T00:00:00-04:00')
    expect(endOfDayExclusive('2026-11-01')).toBe('2026-11-02T00:00:00-05:00')
    // Across the end of a month and of a year.
    expect(endOfDayExclusive('2026-12-31')).toBe('2027-01-01T00:00:00-05:00')
  })

  it('sends only what was chosen: a course or a department or neither, a participant, either end', () => {
    vi.stubEnv('TZ', 'UTC')
    expect(exportArgs(course())).toEqual({ course_id: 'c1' })
    expect(exportArgs({ ...emptyForm('department'), deptId: 'eng', courseId: 'stale' })).toEqual({
      within_dept_id: 'eng',
    })
    expect(exportArgs({ ...emptyForm('site'), courseId: 'stale', deptId: 'stale' })).toEqual({})
    expect(exportArgs(course({ participantId: 'a1', toDate: '2026-09-30' }))).toEqual({
      course_id: 'c1',
      participant_actor_id: 'a1',
      before: '2026-10-01T00:00:00+00:00',
    })
    expect(() => startOfDay('30/09/2026')).toThrow()
  })

  it('says the span as the reader reads it: up to and including the last day', () => {
    vi.stubEnv('TZ', 'Asia/Hong_Kong')
    const from = startOfDay('2026-09-01')
    const before = endOfDayExclusive('2026-09-30')
    expect(spanWords(from, before)).toBe(
      'What was written from September 1, 2026 up to and including September 30, 2026.',
    )
    expect(spanWords(null, before)).toBe('What was written up to and including September 30, 2026.')
    expect(spanWords(from, null)).toBe('What was written from September 1, 2026 on.')
    expect(spanWords(null, null)).toBe('Everything written, whenever it was.')
    setLocale('zh-Hant')
    expect(spanWords(from, before)).toContain('截至並包括')
    setLocale('zh-Hans')
    expect(spanWords(from, before)).toContain('截至并包括')
  })
})

describe('the idempotency key', () => {
  const from = { form: course(), labels: { scope: 'CS101 · A' } }

  it('is the same for the same export until Core answers, and new for another', () => {
    const a = keyFor(ME, { course_id: 'c1' }, from)
    expect(keyFor(ME, { course_id: 'c1' }, from)).toBe(a)
    // A network failure, a gateway, the server, a rate limit: not an answer.
    settleKey(ME, new ApiError({ status: 0, code: 'network', message: 'offline' }))
    settleKey(ME, new ApiError({ status: 504, code: 'internal', message: 'gateway' }))
    settleKey(ME, new ApiError({ status: 429, code: 'rate_limited', message: 'slow down' }))
    expect(keyFor(ME, { course_id: 'c1' }, from)).toBe(a)
    // Another export is another key, which replaces it.
    const b = keyFor(ME, { course_id: 'c2' }, from)
    expect(b).not.toBe(a)
    // A refusal is an answer: the same key would only say it again.
    settleKey(ME, new ApiError({ status: 422, code: 'failed_precondition', message: 'too large', actionId: 'x' }))
    expect(keyFor(ME, { course_id: 'c2' }, from)).not.toBe(b)
  })

  it('is kept in this tab through a reload, with the form it was asked from, and is each caller’s', async () => {
    const key = keyFor(ME, { course_id: 'c1' }, from)
    expect(sessionStorage.getItem(CONVERSATION_EXPORT_PENDING_PREFIX + ME)).toContain(key)
    vi.resetModules()
    const fresh = await import('./conversationExport')
    const kept = fresh.pendingExport(ME)
    expect(kept?.key).toBe(key)
    expect(kept?.form.courseId).toBe('c1')
    expect(kept?.labels.scope).toBe('CS101 · A')
    expect(fresh.keyFor(ME, { course_id: 'c1' }, from)).toBe(key)
    expect(fresh.pendingExport(OTHER)).toBeNull()
    fresh.settleKey(ME)
    expect(sessionStorage.getItem(CONVERSATION_EXPORT_PENDING_PREFIX + ME)).toBeNull()
  })

  it('is kept in memory where the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const key = keyFor(ME, { course_id: 'c1' }, from)
    expect(keyFor(ME, { course_id: 'c1' }, from)).toBe(key)
    expect(pendingExport(ME)?.key).toBe(key)
  })

  it('is sent again when Core gave no answer, and not once it has', async () => {
    const keys: string[] = []
    const answers = [
      () => json(500, { error: { code: 'internal', message: 'the server fell over' } }),
      () => json(200, { status: 'executed', action_id: result().export_id, result: result() }),
      () => json(200, { status: 'executed', action_id: 'second', result: result({ export_id: 'second' }) }),
    ]
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']!)
      return answers.shift()!()
    })
    await expect(runExport(ME, { course_id: 'c1' }, from)).rejects.toMatchObject({ status: 500 })
    // The user tries again: the same key, so Core cannot export twice.
    const done = await runExport(ME, { course_id: 'c1' }, from)
    expect(done.result.export_id).toBe(result().export_id)
    expect(keys[1]).toBe(keys[0])
    // Done with: the same choices once more are a new export.
    await runExport(ME, { course_id: 'c1' }, from)
    expect(keys[2]).not.toBe(keys[0])
    expect(pendingExport(ME)).toBeNull()
  })

  it('takes the answer to an ask made before, which comes without links, as the export', async () => {
    vi.stubGlobal('fetch', async () => {
      const r = result({ export_id: 'replayed-1' })
      delete r.downloads
      return new Response(JSON.stringify({ status: 'executed', action_id: 'replayed-1', result: r }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Replayed': 'true' },
      })
    })
    const done = await runExport(ME, { course_id: 'c1' }, from)
    expect(done.replayed).toBe(true)
    expect(heldLink('replayed-1', 'csv')).toBeNull()
  })
})

describe('links to the files', () => {
  it('holds the links an export comes with, and takes one for gone a little before Core says', () => {
    holdLinks(result({ export_id: 'e-links' }))
    const link = heldLink('e-links', 'csv')!
    expect(link.url).toBe('https://lms.example.edu/v1/blobs/c')
    const end = Date.parse(link.expiresAt)
    expect(linkLive(link, end - LINK_MARGIN_MS - 1)).toBe(true)
    expect(linkLive(link, end - LINK_MARGIN_MS)).toBe(false)
    expect(linkLive(null, 0)).toBe(false)
  })

  it('asks Core for a new link once the one held has expired, and keeps using a live one', async () => {
    holdLinks(result({ export_id: 'e-fresh' }))
    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return json(200, {
        status: 'executed',
        result: {
          export_id: 'e-fresh',
          format: 'csv',
          filename: 'messages-e-fresh.csv',
          content_type: 'text/csv; charset=utf-8',
          byte_size: 1980,
          checksum: 'sha256:0c8b',
          download_url: 'https://lms.example.edu/v1/blobs/new',
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          export_expires_at: '2026-10-01T08:15:02Z',
        },
      })
    })
    // The links held expired at 08:30 on 30 September; it is later now.
    const link = await liveLink('e-fresh', 'csv')
    expect(asked).toEqual(['/v1/conversation-exports/e-fresh/csv'])
    expect(link.url).toBe('https://lms.example.edu/v1/blobs/new')
    await liveLink('e-fresh', 'csv')
    expect(asked).toHaveLength(1)
  })

  it('says when the export’s files have been deleted', async () => {
    vi.stubGlobal('fetch', async () =>
      json(404, { error: { code: 'not_found', message: 'gone', details: { reason: 'export_expired' } } }),
    )
    const e = await freshLink('e-old', 'jsonl').catch((x) => x)
    expect(exportErrorText(e, 'file')).toBe(
      'This export’s files have been deleted, as every export’s are a while after it is made. Export again.',
    )
  })
})

describe('the exports this browser remembers', () => {
  const about = { scope: 'course' as const, labels: { scope: 'CS101 · A Programming' }, args: { course_id: 'c1' } }

  it('remembers each export for its maker alone, newest first, never a link, until its files are deleted', () => {
    rememberExport(
      ME,
      result({ export_id: 'a', as_of: '2026-09-30T08:00:00Z', expires_at: '2026-10-01T08:00:00Z' }),
      about,
      AT,
    )
    rememberExport(
      ME,
      result({ export_id: 'b', as_of: '2026-09-30T09:00:00Z', expires_at: '2026-10-01T09:00:00Z' }),
      about,
      AT,
    )
    const raw = localStorage.getItem(CONVERSATION_EXPORTS_PREFIX + ME)!
    expect(raw).not.toContain('blobs')
    expect(raw).not.toContain('download_url')
    expect(rememberedExports(ME, AT).map((r) => r.export_id)).toEqual(['b', 'a'])
    expect(rememberedExports(ME, AT)[0]).toMatchObject({
      scope: 'course',
      scope_label: 'CS101 · A Programming',
      messages: 5,
    })
    expect(rememberedExports(OTHER, AT)).toEqual([])
    // A day on, the first one's files are gone, and so is it.
    expect(rememberedExports(ME, Date.parse('2026-10-01T08:30:00Z')).map((r) => r.export_id)).toEqual(['b'])
    // Given again (a replay), it is still one.
    rememberExport(
      ME,
      result({ export_id: 'a', as_of: '2026-09-30T08:00:00Z', expires_at: '2026-10-01T08:00:00Z' }),
      about,
      AT,
    )
    expect(rememberedExports(ME, AT)).toHaveLength(2)
    expect(forgetExport(ME, 'a', AT).map((r) => r.export_id)).toEqual(['b'])
  })

  it('remembers the newest few', () => {
    for (let i = 0; i < REMEMBERED_MAX + 3; i++) {
      const at = new Date(AT - (REMEMBERED_MAX + 3 - i) * 60_000).toISOString()
      rememberExport(ME, result({ export_id: `e${i}`, as_of: at, expires_at: '2026-10-01T08:15:02Z' }), about, AT)
    }
    const list = rememberedExports(ME, AT)
    expect(list).toHaveLength(REMEMBERED_MAX)
    expect(list[0]!.export_id).toBe(`e${REMEMBERED_MAX + 2}`)
  })

  it('keeps what it made in memory once storage is full, rather than read back the list before it', () => {
    rememberExport('actor-full', result({ export_id: 'first' }), about, AT)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    rememberExport('actor-full', result({ export_id: 'second', as_of: '2026-09-30T08:16:00Z' }), about, AT)
    expect(rememberedExports('actor-full', AT).map((r) => r.export_id)).toEqual(['second', 'first'])
  })

  it('takes nothing it cannot read from storage, and keeps what it made where storage is refused', () => {
    localStorage.setItem(CONVERSATION_EXPORTS_PREFIX + ME, '{not json')
    expect(rememberedExports(ME, AT)).toEqual([])
    localStorage.setItem(CONVERSATION_EXPORTS_PREFIX + ME, JSON.stringify([{ export_id: 'x' }, 'nonsense', null]))
    expect(rememberedExports(ME, AT)).toEqual([])

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    // Someone who has made nothing else on this page.
    expect(() => rememberExport('actor-new', result({ export_id: 'mem' }), about, AT)).not.toThrow()
    expect(rememberedExports('actor-new', AT).map((r) => r.export_id)).toEqual(['mem'])
  })
})

describe('refusals', () => {
  const refusal = (status: number, code: string, reason?: string, details: Record<string, unknown> = {}) =>
    new ApiError({
      status,
      code,
      message: 'Core says no',
      details: reason ? { reason, ...details } : details,
      actionId: status === 403 || status === 422 ? 'rec' : undefined,
      actionStatus: status === 403 ? 'denied' : status === 422 ? 'failed' : undefined,
    })
  const tooLarge = refusal(422, 'failed_precondition', 'export_too_large', {
    conversations: 4210,
    messages: 120000,
    text_bytes: 300 * 1024 * 1024,
    max_messages: 100000,
    max_bytes: 256 * 1024 * 1024,
  })

  it('says how much an export too large would hold, and the limits, and asks to narrow it', () => {
    expect(tooLargeOf(tooLarge)).toEqual({
      conversations: 4210,
      messages: 120000,
      textBytes: 300 * 1024 * 1024,
      maxMessages: 100000,
      maxBytes: 256 * 1024 * 1024,
    })
    expect(exportErrorText(tooLarge)).toBe(
      'This export would hold 120,000 messages and 300 MB of text in 4,210 conversations, past the limits of 100,000 messages and 256 MB. Narrow it:',
    )
    setLocale('zh-Hant')
    expect(exportErrorText(tooLarge)).toBe(
      '此匯出將包含4,210段對話中的120,000則訊息及300 MB文字，超出上限（100,000則訊息、256 MB）。請縮小範圍：',
    )
    setLocale('zh-Hans')
    expect(exportErrorText(tooLarge)).toContain('请缩小范围')
    expect(tooLargeOf(refusal(403, 'forbidden', 'department_out_of_scope'))).toBeNull()
  })

  it('words each of Core’s reasons in each language', () => {
    const cases: [ApiError, string, string, string][] = [
      [
        refusal(403, 'forbidden', 'department_out_of_scope'),
        'not in the departments you administer',
        '不在（或已不在）你所管理的部門之內',
        '不在（或已不在）你管理的部门之内',
      ],
      [
        refusal(403, 'forbidden', 'platform_role_required'),
        'The whole site is a platform administrator’s to export.',
        '整個網站須由平台管理員匯出',
        '整个网站须由平台管理员导出',
      ],
      [
        refusal(403, 'forbidden', 'people_only'),
        'an agent exports none',
        '代理不可匯出任何對話',
        '智能体不能导出任何对话',
      ],
      [refusal(404, 'not_found', 'export_expired'), 'have been deleted', '已被刪除', '已被删除'],
      [refusal(422, 'failed_precondition', 'no_file_storage'), 'keeps no files', '沒有檔案儲存', '没有文件存储'],
    ]
    for (const [e, en, hant, hans] of cases) {
      setLocale('en')
      expect(exportErrorText(e)).toContain(en)
      setLocale('zh-Hant')
      expect(exportErrorText(e)).toContain(hant)
      setLocale('zh-Hans')
      expect(exportErrorText(e)).toContain(hans)
    }
  })

  it('says what was not found: the course, department or participant chosen, or an export of the caller’s', () => {
    const missing = refusal(404, 'not_found')
    expect(exportErrorText(missing)).toBe(
      'The course, department or participant chosen does not exist, or no longer does.',
    )
    expect(exportErrorText(missing, 'file')).toBe('This export is not one of yours, or no longer exists.')
    setLocale('zh-Hant')
    expect(exportErrorText(missing, 'file')).toBe('此匯出不屬於你，或已不存在。')
  })

  it('leaves the rest to the app’s words: a rate limit, bad arguments, no answer', () => {
    expect(exportErrorText(new ApiError({ status: 429, code: 'rate_limited', message: 'slow' }))).toBe(
      'Too many requests. Wait a moment and try again.',
    )
    expect(
      exportErrorText(new ApiError({ status: 400, code: 'invalid_argument', message: 'from must come before before' })),
    ).toContain('from must come before before')
  })
})
