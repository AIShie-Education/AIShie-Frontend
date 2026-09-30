import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { TextVersion } from '@/api/types'

/** Core's text version of the file, as document.text reads it; a test changes it. */
let server: { text: TextVersion | null; parts: string[] }
/** What document.text was asked, each time. */
const reads: Record<string, unknown>[] = []
const writes: { tool: string; args: Record<string, unknown> }[] = []
let writeAnswer: (tool: string, args: Record<string, unknown>) => unknown

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string, args: { part?: number; file_id?: string }) => {
      if (tool !== 'document.text') throw new Error(`no answer for ${tool}`)
      reads.push({ ...args })
      if (!server.text)
        throw new real.ApiError({ status: 404, code: 'not_found', message: 'none', details: { reason: 'no_text' } })
      const done = server.text.status === 'done'
      const n = args.part ?? 1
      return {
        document_id: 'd-1',
        version_id: 'v-2',
        seq: 2,
        published: true,
        file_id: args.file_id ?? 'f-1',
        position: 1,
        filename: 'slides.pdf',
        parts: done ? server.parts.length : 0,
        ...(done ? { part: n } : {}),
        text: { ...server.text, body: done ? server.parts[n - 1] : undefined },
      }
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      const out = writeAnswer(tool, args)
      if (out instanceof Error) throw out
      return out
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return {
    ...real,
    ElMessage: vi.fn(),
    ElNotification: vi.fn(),
    ElMessageBox: Object.assign(vi.fn(), { confirm: vi.fn() }),
  }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { default: TextVersionPane } = await import('./TextVersionPane.vue')

const confirm = vi.mocked(ElMessageBox.confirm)

function text(over: Partial<TextVersion> = {}): TextVersion {
  return {
    status: 'done',
    source: 'ai',
    model: 'Gemini 3.1 Flash-Lite',
    pages: 2,
    produced_at: '2026-09-30T08:00:00Z',
    revision: 3,
    bytes: 40,
    updated_at: '2026-09-30T08:00:00Z',
    ...over,
  }
}
const TWO_PAGES = '## 第 1 頁\n\nOhm’s law: $V = IR$\n\n## 第 2 頁\n\n```python\nprint(1)\n```\n'

function executed(result: unknown) {
  return { status: 'executed', actionId: 'act-1', reviewState: 'none', result, replayed: false }
}

beforeEach(() => {
  // jsdom has no matchMedia, which the UI store (for the theme) asks.
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
  setActivePinia(createPinia())
  setLocale('en')
  server = { text: text(), parts: [TWO_PAGES] }
  writes.length = 0
  reads.length = 0
  writeAnswer = (tool) =>
    executed({
      version_id: 'v-2',
      changed: true,
      status: tool === 'document.text_update' ? 'done' : 'pending',
      revision: 4,
    })
  confirm.mockReset()
  confirm.mockResolvedValue('confirm' as never)
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  setLocale('en')
  document.body.innerHTML = ''
})

async function pane(props: Record<string, unknown> = {}) {
  const w = mount(TextVersionPane, {
    props: {
      courseId: 'c-1',
      documentId: 'd-1',
      versionId: 'v-2',
      seq: 2,
      fileId: 'f-1',
      fileName: 'slides.pdf',
      position: 1,
      initial: server.text,
      hasFile: true,
      active: true,
      canWrite: false,
      writeDisabled: false,
      needsApproval: false,
      transcriptionOn: true,
      ...props,
    },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}
const staff = (props: Record<string, unknown> = {}) => pane({ canWrite: true, ...props })
const button = (w: VueWrapper, cls: string) => w.find(`.text-pane__${cls}`)

describe('TextVersionPane, reading', () => {
  it('shows a transcription as Markdown, with its model, its pages, and anchors for them', async () => {
    const w = await pane()
    expect(w.find('.text-pane__status').text()).toBe('Done')
    expect(w.find('.text-pane__source').text()).toContain('AI transcription (Gemini 3.1 Flash-Lite)')
    expect(w.find('.text-pane__pages').text()).toBe('2 pages')
    const body = w.find('.text-pane__body')
    expect(body.find('h2#text-page-1').text()).toBe('第 1 頁')
    expect(body.find('h2#text-page-2').exists()).toBe(true)
    // Formulas typeset, code highlighted in the chat's box.
    expect(body.find('.katex').exists()).toBe(true)
    expect(body.find('.md-code__lang').text()).toBe('python')
    expect(w.find('.text-pane__jump').exists()).toBe(true)
    // A reader is offered nothing to write.
    expect(button(w, 'edit').exists()).toBe(false)
    expect(button(w, 'retranscribe').exists()).toBe(false)
  })

  it('says who edited a text staff wrote, and when', async () => {
    server.text = text({ source: 'staff', edited_by_name: 'Ada Lovelace', edited_at: '2026-09-30T09:00:00Z' })
    const w = await pane()
    expect(w.find('.text-pane__source').text()).toMatch(/^Edited by Ada Lovelace \(.+\)$/)
  })

  it('reads a long text part by part, whole', async () => {
    server.parts = ['## 第 1 頁\n\nA\n', '## 第 2 頁\n\nB\n', '## 第 3 頁\n\nC\n']
    const w = await pane()
    expect(w.findAll('.text-pane__body h2').map((h) => h.text())).toEqual(['第 1 頁', '第 2 頁', '第 3 頁'])
  })

  it('shows a place in the queue only while the transcriber is on', async () => {
    server.text = text({ status: 'working', source: null, bytes: 0, model: null, pages: null })
    let w = await pane()
    expect(w.find('.text-pane__status').text()).toBe('Transcribing')
    expect(w.find('.text-pane__queued-text').text()).toContain('AI is writing this file out as text')
    w.unmount()

    w = await pane({ transcriptionOn: false })
    expect(w.find('.text-pane__status').exists()).toBe(false)
    expect(w.find('.text-pane__queued').exists()).toBe(false)
    expect(w.find('.text-pane__none').text()).toContain('This file has no text version.')
  })

  it('says why one failed or was skipped, in the reader’s words', async () => {
    server.text = text({ status: 'skipped', source: null, reason: 'too_many_pages', bytes: 0 })
    let w = await pane()
    expect(w.find('.text-pane__failed').text()).toContain('Not transcribed: More pages than the limit')
    w.unmount()
    server.text = text({ status: 'failed', source: null, reason: 'The PDF could not be read', bytes: 0 })
    w = await pane()
    expect(w.find('.text-pane__failed').text()).toContain('Transcription failed: The PDF could not be read')
  })

  it('reads in Traditional Chinese', async () => {
    setLocale('zh-Hant')
    server.text = text({ status: 'pending', source: null, bytes: 0 })
    const w = await pane()
    expect(w.find('.text-pane__status').text()).toBe('排隊中')
    expect(w.find('.text-pane__queued-text').text()).toBe('排隊中：這個檔案正等候 AI 轉寫成文字版。')
  })
})

describe('TextVersionPane, writing', () => {
  async function edit(w: VueWrapper, body: string) {
    await button(w, 'edit').trigger('click')
    await w.find('.text-pane__editor textarea').setValue(body)
  }

  it('saves an edit from the revision it was read at', async () => {
    const w = await staff()
    await edit(w, '## 第 1 頁\n\nCorrected')
    await button(w, 'save').trigger('click')
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'document.text_update',
        args: {
          course_id: 'c-1',
          document_id: 'd-1',
          version_id: 'v-2',
          file_id: 'f-1',
          body: '## 第 1 頁\n\nCorrected',
          base_revision: 3,
        },
      },
    ])
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.find('.text-pane__editor').exists()).toBe(false)
  })

  it('keeps the draft when the text changed meanwhile, and saves it over the latest once that is loaded', async () => {
    const w = await staff()
    await edit(w, 'My draft')
    writeAnswer = () =>
      new ApiError({
        status: 409,
        code: 'conflict',
        message: 'changed',
        details: { reason: 'text_changed', revision: 5 },
      })
    await button(w, 'save').trigger('click')
    await flushPromises()
    expect(w.find('.text-pane__conflict').text()).toContain('it is at revision 5 now')
    expect((w.find('.text-pane__editor textarea').element as HTMLTextAreaElement).value).toBe('My draft')

    server.text = text({ revision: 5 })
    server.parts = ['## 第 1 頁\n\nSomeone else’s\n']
    await w.find('.text-pane__reload').trigger('click')
    await flushPromises()
    expect(w.find('.text-pane__conflict').text()).toContain('The latest text version is loaded')
    expect((w.find('.text-pane__editor textarea').element as HTMLTextAreaElement).value).toBe('My draft')

    writeAnswer = () => executed({ version_id: 'v-2', changed: true, status: 'done', revision: 6 })
    await button(w, 'save').trigger('click')
    await flushPromises()
    expect(writes.map((x) => x.args.base_revision)).toEqual([3, 5])
    expect(w.find('.text-pane__editor').exists()).toBe(false)
  })

  it('says a proposal is waiting, as the page says its other writes’', async () => {
    writeAnswer = () => ({ status: 'proposed', actionId: 'act-9', reviewState: 'none', replayed: false })
    const w = await staff({ needsApproval: true })
    await edit(w, 'Proposed text')
    await button(w, 'save').trigger('click')
    await flushPromises()
    expect(w.emitted('proposed')?.[0]).toEqual([
      'Your text version of “slides.pdf” (version 2) was sent for approval. The text version stays as it is until someone approves it.',
    ])
    expect(w.emitted('changed')).toBeUndefined()
  })

  it('edits a long text only once it has been read whole', async () => {
    server.text = text({ bytes: 200_000 })
    const initial = server.text
    const { read } = await import('@/api/http')
    vi.mocked(read).mockRejectedValueOnce(new ApiError({ status: 503, code: 'unavailable', message: 'down' }))
    const w = await staff({ initial })
    expect(button(w, 'edit').attributes('disabled')).toBeDefined()
    await w.find('.text-pane__refresh').trigger('click')
    await flushPromises()
    expect(button(w, 'edit').attributes('disabled')).toBeUndefined()
  })

  it('lets staff write one by hand, from nothing, with the transcriber off', async () => {
    server.text = null
    const w = await staff({ transcriptionOn: false, initial: null })
    expect(w.find('.text-pane__none').text()).toContain('Transcription is not turned on for this site')
    expect(button(w, 'transcribe').exists()).toBe(false)
    expect(button(w, 'edit').text()).toBe('Write the text version')
    await edit(w, 'By hand')
    await button(w, 'save').trigger('click')
    await flushPromises()
    expect(writes[0].args).toEqual({
      course_id: 'c-1',
      document_id: 'd-1',
      version_id: 'v-2',
      file_id: 'f-1',
      body: 'By hand',
    })
  })
})

describe('TextVersionPane, transcribing again', () => {
  it('asks once for a transcription, and sends it from the revision read', async () => {
    const w = await staff()
    await button(w, 'retranscribe').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(writes).toEqual([
      {
        tool: 'document.text_retranscribe',
        args: { course_id: 'c-1', document_id: 'd-1', version_id: 'v-2', file_id: 'f-1', base_revision: 3 },
      },
    ])
  })

  it('asks twice for a text staff wrote, and discards their changes only then', async () => {
    server.text = text({ source: 'staff', edited_by_name: 'Ada Lovelace', edited_at: '2026-09-30T09:00:00Z' })
    const w = await staff()
    confirm.mockResolvedValueOnce('confirm' as never).mockRejectedValueOnce('cancel')
    await button(w, 'retranscribe').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(String(confirm.mock.calls[1][0])).toContain('written or corrected by Ada Lovelace')
    expect(confirm.mock.calls[1][1]).toBe('Discard the changes?')
    expect(writes).toEqual([])

    await button(w, 'retranscribe').trigger('click')
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'document.text_retranscribe',
        args: {
          course_id: 'c-1',
          document_id: 'd-1',
          version_id: 'v-2',
          file_id: 'f-1',
          base_revision: 3,
          discard_edit: true,
        },
      },
    ])
  })

  it('transcribes a version from before text versions, without asking', async () => {
    server.text = null
    const w = await staff({ initial: null })
    expect(w.find('.text-pane__none').text()).toContain('added before there were text versions')
    server.text = text({ status: 'pending', source: null, bytes: 0, revision: 1 })
    await button(w, 'transcribe').trigger('click')
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(writes[0].args).toEqual({ course_id: 'c-1', document_id: 'd-1', version_id: 'v-2', file_id: 'f-1' })
    expect(w.find('.text-pane__status').text()).toBe('Queued')
  })

  it('offers nothing only the transcriber would do while it is off', async () => {
    const w = await staff({ transcriptionOn: false })
    expect(button(w, 'edit').exists()).toBe(true)
    expect(button(w, 'retranscribe').exists()).toBe(false)
  })
})

describe('TextVersionPane, one file of several', () => {
  it('reads the text version of its own file, in every part', async () => {
    server.parts = ['## 第 1 頁\n\nA\n', '## 第 2 頁\n\nB\n']
    const w = await pane({ fileId: 'f-2', fileName: 'handout.docx', position: 2 })
    expect(reads.map((r) => [r.file_id, r.part])).toEqual([
      ['f-2', 1],
      ['f-2', 2],
    ])
    expect(w.find('.text-pane').attributes('data-file')).toBe('handout.docx')
    // Its pages' anchors are its own: another file's pane is on the page too.
    expect(w.find('h2#text-f2-page-1').exists()).toBe(true)
    expect(w.find('h2#text-page-1').exists()).toBe(false)
  })

  it('reads another file afresh when it is given one, and names it when it writes', async () => {
    const w = await pane({ canWrite: true })
    reads.length = 0
    await w.setProps({ fileId: 'f-3', fileName: 'loops.py', position: 3 })
    await flushPromises()
    expect(reads.map((r) => r.file_id)).toEqual(['f-3'])
    await button(w, 'retranscribe').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]![1]).toBe('Transcribe “loops.py” again?')
    expect(writes[0]!.args).toMatchObject({ version_id: 'v-2', file_id: 'f-3' })
  })

  it('says Core’s refusal to guess which file, in words', async () => {
    writeAnswer = () =>
      new ApiError({
        status: 400,
        code: 'invalid_argument',
        message: 'file_id is required',
        details: { reason: 'file_id_required', files: 3 },
      })
    const { ElMessage } = await import('element-plus')
    const w = await staff()
    await button(w, 'retranscribe').trigger('click')
    await flushPromises()
    const said = vi.mocked(ElMessage).mock.calls.map((c) => (c[0] as { message: string }).message)
    expect(said.some((m) => m.includes('This version holds 3 files: name the file whose text version this is'))).toBe(
      true,
    )
  })
})
