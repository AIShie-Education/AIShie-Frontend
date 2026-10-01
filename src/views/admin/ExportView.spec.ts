import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale, type Locale } from '@/i18n'
import { useSessionStore } from '@/stores/session'
import ExportView from './ExportView.vue'
import CoursePicker from './export/CoursePicker.vue'
import {
  CONVERSATION_EXPORTS_PREFIX,
  CONVERSATION_EXPORT_PENDING_PREFIX,
  emptyForm,
  lastRun,
  settleKey,
  type ExportResult,
  type RememberedExport,
} from './export/conversationExport'

// 匯出對話: the page offers each administrator what they may export, sends
// what the form chooses under a key kept until Core answers (through a
// reload too), and shows what came of it: the counts, the notice that the
// files hold personal data, the two downloads with new links once the ones
// held expire, or Core's refusal in the reader's words. The exports this
// browser remembers are each administrator's own.

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn() }
})

const ME = '01a0f4cc-7ed8-7000-8000-00000000000a'
const OTHER = '01a0f4cc-7ed8-7000-8000-00000000000b'
const COURSE = '01a0f4cc-7f09-7726-82cd-aa9684dfa65b'
const TERM = '01a0f4cc-7ef8-7572-b0b2-d5964eb00c16'

type Who = 'root' | 'admin' | 'deptAdmin'

interface Call {
  method: string
  path: string
  query: URLSearchParams
  headers: Record<string, string>
  body?: Record<string, unknown>
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const read = (result: unknown) => json(200, { status: 'executed', result })

function exportResult(over: Partial<ExportResult> = {}): ExportResult {
  const id = over.export_id ?? '01a0f4da-dd6c-78eb-b378-7d6c825ffffd'
  const soon = new Date(Date.now() + 15 * 60_000).toISOString()
  return {
    export_id: id,
    as_of: new Date().toISOString(),
    conversations: 2,
    messages: 5,
    retracted: 1,
    attachments: 2,
    proposals: 1,
    text_bytes: 2120,
    files: [
      {
        format: 'jsonl',
        filename: `conversations-${id}.jsonl`,
        content_type: 'application/x-ndjson',
        byte_size: 4210,
        checksum: 'sha256:7f94aa',
      },
      {
        format: 'csv',
        filename: `messages-${id}.csv`,
        content_type: 'text/csv; charset=utf-8',
        byte_size: 1980,
        checksum: 'sha256:0c8bbb',
      },
    ],
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    downloads: [
      { format: 'jsonl', download_url: '/v1/blobs/jsonl-token', expires_at: soon },
      { format: 'csv', download_url: '/v1/blobs/csv-token', expires_at: soon },
    ],
    ...over,
  }
}

/** Core, as far as the page uses it; `exports` answers each POST in turn. */
class FakeCore {
  calls: Call[] = []
  exports: (() => Response)[] = []
  install(): this {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const u = new URL(url, 'http://localhost')
      const call: Call = {
        method: init.method ?? 'GET',
        path: u.pathname,
        query: u.searchParams,
        headers: { ...(init.headers as Record<string, string>) },
        body: init.body ? JSON.parse(init.body as string) : undefined,
      }
      this.calls.push(call)
      return this.answer(call)
    })
    return this
  }
  posts() {
    return this.calls.filter((c) => c.method === 'POST' && c.path === '/v1/conversation-exports')
  }
  private answer(c: Call): Response {
    if (c.path === '/v1/departments/tree') {
      return read({
        departments: [
          {
            id: 'eng',
            name: 'Engineering',
            parent_id: null,
            administers: true,
            manages: false,
            appointed: true,
            depth: 1,
          },
          {
            id: 'cs',
            name: 'Computing',
            parent_id: 'eng',
            administers: true,
            manages: true,
            appointed: false,
            depth: 2,
          },
        ],
        max_depth: 8,
      })
    }
    if (c.path === '/v1/courses') {
      return read({
        courses: [
          {
            id: COURSE,
            code: 'CS101',
            section: 'A',
            title: 'Introduction to Computing',
            dept_id: 'cs',
            term_id: TERM,
            status: 'active',
            created_at: '2026-09-01T00:00:00Z',
          },
        ],
      })
    }
    if (c.path === '/v1/terms')
      return read({ terms: [{ id: TERM, name: '2026 Fall', starts_on: '2026-09-01', ends_on: '2026-12-31' }] })
    if (c.path === '/v1/actors') return read({ actors: [] })
    if (c.method === 'POST' && c.path === '/v1/conversation-exports') {
      if (!c.headers['Idempotency-Key']) throw new Error('an export without an idempotency key')
      const next = this.exports.shift()
      if (!next) throw new Error('no answer for this export')
      return next()
    }
    const file = c.path.match(/^\/v1\/conversation-exports\/([^/]+)\/(jsonl|csv)$/)
    if (file) {
      const [, id, format] = file
      return read({
        export_id: id,
        format,
        filename: format === 'csv' ? `messages-${id}.csv` : `conversations-${id}.jsonl`,
        content_type: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson',
        byte_size: 100,
        checksum: 'sha256:00',
        download_url: `/v1/blobs/fresh-${format}`,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        export_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
    }
    throw new Error(`no route for ${c.method} ${c.path}`)
  }
}

let core: FakeCore

beforeEach(() => {
  vi.stubEnv('TZ', 'Asia/Hong_Kong')
  setLocale('en')
  localStorage.clear()
  sessionStorage.clear()
  lastRun.value = null
  settleKey(ME)
  settleKey(OTHER)
  core = new FakeCore().install()
  vi.mocked(ElMessage).mockReset()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setLocale('en')
  document.body.innerHTML = ''
})

async function page(who: Who = 'root', locale: Locale = 'en', id = ME) {
  setLocale(locale)
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.me = {
    id,
    kind: 'human',
    display_name: 'Admin',
    platform_role: who === 'deptAdmin' ? null : who,
    administers: who === 'deptAdmin' ? ['eng'] : [],
  } as never
  session.status = 'signedIn'
  const View = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: View },
      { path: '/admin/conversation-exports', name: 'admin-export', component: View },
    ],
  })
  await router.push('/admin/conversation-exports')
  const w = mount(ExportView, {
    global: { plugins: [pinia, router, i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}

/** Chooses the course as the picker would. */
async function chooseCourse(w: VueWrapper) {
  const picker = w.findComponent(CoursePicker)
  picker.vm.$emit('update:modelValue', COURSE)
  picker.vm.$emit('update:label', 'CS101 · A Introduction to Computing (2026 Fall)')
  await flushPromises()
}

/** Sets the days of the span as the date pickers would, YYYY-MM-DD. */
async function chooseDays(w: VueWrapper, from: string, to: string) {
  const [a, b] = w.findAllComponents({ name: 'ElDatePicker' })
  a!.vm.$emit('update:modelValue', from)
  b!.vm.$emit('update:modelValue', to)
  await flushPromises()
}

async function exportNow(w: VueWrapper) {
  await w.get('.export-form__submit').trigger('click')
  await flushPromises()
}

const scopes = (w: VueWrapper) => w.findAll('.export-form__scopes .el-radio-button').map((r) => r.text())

describe('what each administrator is offered', () => {
  // One page a test, so that each renders it once.
  it.each(['root', 'admin'] as const)(
    'offers a platform administrator (%s) a course, a department or the whole site, and the directory to find anyone',
    async (who) => {
      const w = await page(who)
      expect(w.get('.page-header').text()).toContain('Export conversations')
      expect(scopes(w)).toEqual(['A course', 'A department', 'The whole site'])
      expect(w.find('.participant-picker__select').exists()).toBe(true)
    },
  )

  it('offers a department’s administrator a course or a department of theirs, and a person by whole email or number', async () => {
    const w = await page('deptAdmin')
    expect(w.get('.page-header').text()).toContain('those of a course or department you administer')
    expect(scopes(w)).toEqual(['A course', 'A department'])
    expect(w.find('.participant-picker__select').exists()).toBe(false)
    expect(w.find('.participant-picker__input').exists()).toBe(true)
    // Nobody reads the directory, which is a platform administrator's.
    expect(core.calls.some((c) => c.path === '/v1/actors')).toBe(false)
  })

  it.each([
    ['zh-Hant', '匯出對話', '整個網站'],
    ['zh-Hans', '导出对话', '整个网站'],
  ] as const)('says it in %s', async (locale, title, scope) => {
    const w = await page('root', locale)
    expect(w.get('.page-header').text()).toContain(title)
    expect(scopes(w)).toContain(scope)
  })
})

describe('exporting', () => {
  it('sends nothing until a course is chosen, then the course and the days with their offset, under a key', async () => {
    const w = await page()
    await exportNow(w)
    expect(core.posts()).toHaveLength(0)
    // Element Plus shows a field's error a moment after it is given.
    await new Promise((r) => setTimeout(r, 150))
    expect(w.get('.el-form-item__error').text()).toBe('Choose a course.')

    await chooseCourse(w)
    await chooseDays(w, '2026-09-01', '2026-09-30')
    // Up to and including the last day: sent as before midnight as the day after it starts.
    expect(w.get('.export-form__span').text()).toContain(
      'What was written from September 1, 2026 up to and including September 30, 2026.',
    )
    expect(w.get('.export-form__span').text()).toContain('in Asia/Hong_Kong (UTC+08:00)')
    expect(w.findAll('.export-form__sent code').map((c) => c.text())).toEqual([
      'from 2026-09-01T00:00:00+08:00',
      'before 2026-10-01T00:00:00+08:00',
    ])

    core.exports.push(() =>
      json(200, { status: 'executed', action_id: exportResult().export_id, result: exportResult() }),
    )
    await exportNow(w)
    const [post] = core.posts()
    expect(post!.body).toEqual({
      course_id: COURSE,
      from: '2026-09-01T00:00:00+08:00',
      before: '2026-10-01T00:00:00+08:00',
    })
    expect(post!.headers['Idempotency-Key']).toBeTruthy()

    // What it holds, the notice beside the downloads, and the two files.
    const outcome = w.get('.export-outcome')
    expect(outcome.get('[data-count="conversations"]').text()).toBe('2')
    expect(outcome.get('[data-count="messages"]').text()).toContain('5')
    expect(outcome.get('[data-count="messages"]').text()).toContain('1 withdrawn')
    expect(outcome.get('[data-count="proposals"]').text()).toBe('1')
    expect(outcome.get('[data-count="text"]').text()).toBe('2.1 KB')
    expect(outcome.get('.export-summary__about').text()).toContain(
      'A course: CS101 · A Introduction to Computing (2026 Fall)',
    )
    expect(outcome.get('.export-summary__times').text()).toContain('Files deleted')
    const privacy = outcome.get('.export-outcome__privacy').text()
    expect(privacy).toContain('These files hold personal data')
    expect(privacy).toContain('about 15 minutes')
    expect(privacy).toContain('deleted from the server at')
    expect(outcome.findAll('.export-file__download').map((b) => b.text())).toEqual([
      'Download JSON Lines',
      'Download CSV',
    ])
    expect(outcome.get('.export-files__countdown').text()).toMatch(/The download links work for another 14:\d\d\./)

    // Remembered for this administrator, without its links.
    const kept = localStorage.getItem(CONVERSATION_EXPORTS_PREFIX + ME)!
    expect(JSON.parse(kept)[0].export_id).toBe(exportResult().export_id)
    expect(kept).not.toContain('blobs')
    expect(sessionStorage.getItem(CONVERSATION_EXPORT_PENDING_PREFIX + ME)).toBeNull()
  })

  it('downloads a file from the link the export came with, and from a new one once it has expired', async () => {
    const clicked: { href: string; download: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })
    const w = await page()
    await chooseCourse(w)
    const past = new Date(Date.now() - 60_000).toISOString()
    core.exports.push(() =>
      json(200, {
        status: 'executed',
        action_id: 'e1',
        result: exportResult({
          export_id: 'e1',
          downloads: [
            {
              format: 'jsonl',
              download_url: '/v1/blobs/jsonl-token',
              expires_at: new Date(Date.now() + 600_000).toISOString(),
            },
            { format: 'csv', download_url: '/v1/blobs/csv-token', expires_at: past },
          ],
        }),
      }),
    )
    await exportNow(w)
    const files = w.findAll('.export-file__download')
    await files[0]!.trigger('click')
    await flushPromises()
    expect(clicked.at(-1)).toEqual({ href: '/v1/blobs/jsonl-token', download: 'conversations-e1.jsonl' })
    expect(core.calls.some((c) => c.path.startsWith('/v1/conversation-exports/e1/'))).toBe(false)

    // The CSV's link has expired: a new one is asked for, and the file saved from it.
    await files[1]!.trigger('click')
    await flushPromises()
    expect(core.calls.filter((c) => c.path === '/v1/conversation-exports/e1/csv')).toHaveLength(1)
    expect(clicked.at(-1)).toEqual({ href: '/v1/blobs/fresh-csv', download: 'messages-e1.csv' })
  })

  it('offers new links once those held have expired', async () => {
    const w = await page()
    await chooseCourse(w)
    const past = new Date(Date.now() - 60_000).toISOString()
    core.exports.push(() =>
      json(200, {
        status: 'executed',
        action_id: 'e2',
        result: exportResult({
          export_id: 'e2',
          downloads: [
            { format: 'jsonl', download_url: '/v1/blobs/j', expires_at: past },
            { format: 'csv', download_url: '/v1/blobs/c', expires_at: past },
          ],
        }),
      }),
    )
    await exportNow(w)
    expect(w.get('.export-files__stale').text()).toBe('The download links have expired.')
    await w.get('.export-files__refresh').trigger('click')
    await flushPromises()
    expect(
      core.calls.filter((c) => /^\/v1\/conversation-exports\/e2\/(jsonl|csv)$/.test(c.path)).map((c) => c.path),
    ).toEqual(['/v1/conversation-exports/e2/jsonl', '/v1/conversation-exports/e2/csv'])
    expect(w.get('.export-files__countdown').text()).toContain('The download links work for another')
  })

  it('sends an export that got no answer again under the same key, and a new one under another', async () => {
    const w = await page()
    await chooseCourse(w)
    core.exports.push(() => json(500, { error: { code: 'internal', message: 'the server fell over' } }))
    await exportNow(w)
    expect(w.get('.export-refusal').text()).toContain('No answer from the server')
    expect(w.get('.export-refusal').text()).toContain('rather than exporting twice')

    core.exports.push(() =>
      json(200, { status: 'executed', action_id: 'e3', result: exportResult({ export_id: 'e3' }) }),
    )
    await exportNow(w)
    const [first, second] = core.posts()
    expect(second!.headers['Idempotency-Key']).toBe(first!.headers['Idempotency-Key'])
    expect(w.find('.export-outcome').exists()).toBe(true)

    core.exports.push(() =>
      json(200, { status: 'executed', action_id: 'e4', result: exportResult({ export_id: 'e4' }) }),
    )
    await exportNow(w)
    expect(core.posts()[2]!.headers['Idempotency-Key']).not.toBe(first!.headers['Idempotency-Key'])
  })

  it('shows again, after a reload, the export asked and not answered, and sends it under its key', async () => {
    const form = { ...emptyForm(), courseId: COURSE }
    sessionStorage.setItem(
      CONVERSATION_EXPORT_PENDING_PREFIX + ME,
      JSON.stringify({
        key: 'kept-key-1',
        args: JSON.stringify({ course_id: COURSE }),
        form,
        labels: { scope: 'CS101 · A Introduction to Computing (2026 Fall)' },
        at: '2026-09-30T08:00:00Z',
      }),
    )
    const w = await page()
    expect(w.get('.export-form__pending').text()).toContain('got no answer')
    core.exports.push(() => {
      const r = exportResult({ export_id: 'e5' })
      delete r.downloads
      return new Response(JSON.stringify({ status: 'executed', action_id: 'e5', result: r }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Replayed': 'true' },
      })
    })
    await exportNow(w)
    expect(core.posts()[0]!.headers['Idempotency-Key']).toBe('kept-key-1')
    // Given again by Core, without links: each download asks for one.
    expect(w.get('.export-outcome .app-card__title').text()).toContain('Given again')
    expect(w.get('.export-files__stale').text()).toBe('Each download asks the server for a new link.')
    expect(w.find('.export-form__pending').exists()).toBe(false)
  })

  it('exports where the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const w = await page('root', 'en', '01a0f4cc-7ed8-7000-8000-0000000000ff')
    await chooseCourse(w)
    core.exports.push(() =>
      json(200, { status: 'executed', action_id: 'e6', result: exportResult({ export_id: 'e6' }) }),
    )
    await exportNow(w)
    expect(w.get('.export-outcome [data-count="conversations"]').text()).toBe('2')
  })
})

describe('refusals', () => {
  it('says how much an export too large would hold, and how to narrow it', async () => {
    const w = await page()
    await chooseCourse(w)
    core.exports.push(() =>
      json(422, {
        status: 'failed',
        action_id: '01a0f4da-0000-7000-8000-00000000beef',
        error: {
          code: 'failed_precondition',
          message: 'too large',
          details: {
            reason: 'export_too_large',
            conversations: 4210,
            messages: 120000,
            text_bytes: 300 * 1024 * 1024,
            max_messages: 100000,
            max_bytes: 256 * 1024 * 1024,
          },
        },
      }),
    )
    await exportNow(w)
    const text = w.get('.export-refusal').text()
    expect(text).toContain('Not exported')
    expect(text).toContain(
      'This export would hold 120,000 messages and 300 MB of text in 4,210 conversations, past the limits of 100,000 messages and 256 MB. Narrow it:',
    )
    // A course is chosen already: a participant, or fewer days.
    expect(w.findAll('.export-refusal__narrow li').map((l) => l.text())).toEqual([
      'Keep to one participant.',
      'Keep to fewer days.',
    ])
    expect(text).toContain('Recorded as action 0000beef')
  })

  it('says why in the reader’s language: a department not theirs, in Traditional Chinese', async () => {
    const w = await page('deptAdmin', 'zh-Hant')
    await chooseCourse(w)
    core.exports.push(() =>
      json(403, {
        status: 'denied',
        action_id: 'denied-1',
        error: { code: 'forbidden', message: 'no', details: { reason: 'department_out_of_scope' } },
      }),
    )
    await exportNow(w)
    expect(w.get('.export-refusal').text()).toContain('未能匯出')
    expect(w.get('.export-refusal').text()).toContain('該課程或部門不在（或已不在）你所管理的部門之內')
  })
})

describe('recent exports', () => {
  function remembered(id: string, over: Partial<RememberedExport> = {}): RememberedExport {
    const r = exportResult({ export_id: id })
    return {
      export_id: id,
      as_of: r.as_of,
      expires_at: r.expires_at,
      conversations: 1,
      messages: 3,
      retracted: 1,
      attachments: 0,
      proposals: 0,
      text_bytes: 120,
      files: r.files!,
      scope: 'course',
      scope_label: `Course of ${id}`,
      ...over,
    }
  }

  it('lists this administrator’s exports whose files are kept, and not another’s; one taken off is forgotten', async () => {
    localStorage.setItem(
      CONVERSATION_EXPORTS_PREFIX + ME,
      JSON.stringify([
        remembered('mine-1'),
        remembered('mine-old', { expires_at: new Date(Date.now() - 1000).toISOString() }),
      ]),
    )
    localStorage.setItem(CONVERSATION_EXPORTS_PREFIX + OTHER, JSON.stringify([remembered('theirs')]))
    const w = await page()
    const items = w.findAll('.recent-export')
    expect(items.map((i) => i.attributes('data-export'))).toEqual(['mine-1'])
    expect(items[0]!.text()).toContain('Course of mine-1')
    expect(items[0]!.get('.export-files__stale').text()).toBe('Each download asks the server for a new link.')

    await items[0]!.get('.recent-export__forget').trigger('click')
    await flushPromises()
    expect(w.findAll('.recent-export')).toHaveLength(0)
    expect(localStorage.getItem(CONVERSATION_EXPORTS_PREFIX + ME)).toBeNull()
    expect(localStorage.getItem(CONVERSATION_EXPORTS_PREFIX + OTHER)).toContain('theirs')
  })

  it('takes an export whose files are gone off the list, and says so', async () => {
    localStorage.setItem(CONVERSATION_EXPORTS_PREFIX + ME, JSON.stringify([remembered('gone-1')]))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = await page()
    const real = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      String(url).includes('/v1/conversation-exports/gone-1/')
        ? json(404, { error: { code: 'not_found', message: 'gone', details: { reason: 'export_expired' } } })
        : real(url, init),
    )
    await w.get('.recent-export .export-file__download').trigger('click')
    await flushPromises()
    expect(w.findAll('.recent-export')).toHaveLength(0)
    expect(vi.mocked(ElMessage).mock.calls.at(-1)?.[0]).toMatchObject({
      message: 'That export’s files have been deleted, so it is off the list.',
    })
  })
})
