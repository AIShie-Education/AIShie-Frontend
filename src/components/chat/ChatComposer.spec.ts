import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h, ref } from 'vue'
import { vi } from 'vitest'
import type { UploadedFile, UploadOptions } from '@/api/http'
import type { UploadFn } from '@/composables/useUploadQueue'
import type { Mention } from './mentions'

const { i18n, setLocale } = await import('@/i18n')
const { default: ChatComposer } = await import('./ChatComposer.vue')
const { ApiError } = await import('@/api/http')
const { createChatAttachments } = await import('./attachments')

const MENTIONS: Mention[] = [
  { kind: 'assignment', id: 'a1', title: 'HW1 — Temperature converter' },
  { kind: 'assignment', id: 'a2', title: 'HW2 — Loops' },
  { kind: 'material', id: 'd1', title: 'Week 1 notes' },
]
let mentionReads = 0

/** The composer in a parent that holds its text, as the pane does. */
function mountComposer(props: Record<string, unknown> = {}) {
  const text = ref('')
  const commands: string[] = []
  const Host = defineComponent({
    setup() {
      return () =>
        h(ChatComposer, {
          modelValue: text.value,
          'onUpdate:modelValue': (v: string) => (text.value = v),
          onCommand: (c: string) => commands.push(c),
          commands: [
            { name: 'new', label: 'New conversation' },
            { name: 'history', label: 'Conversation history' },
            { name: 'close', label: 'End this conversation' },
          ],
          loadMentions: async () => {
            mentionReads++
            return MENTIONS
          },
          ...props,
        })
    },
  })
  const w = mount(Host, { attachTo: document.body, global: { plugins: [i18n, ElementPlus], components: icons } })
  return { w, text, commands }
}

async function typeIn(w: ReturnType<typeof mountComposer>['w'], value: string) {
  const ta = w.get<HTMLTextAreaElement>('textarea')
  ta.element.focus()
  await ta.setValue(value)
  ta.element.setSelectionRange(value.length, value.length)
  await flushPromises()
  return ta
}
const key = (ta: { trigger: (e: string, o: object) => Promise<void> }, k: string, o: object = {}) =>
  ta.trigger('keydown', { key: k, ...o })
const options = () => [...document.querySelectorAll<HTMLElement>('.chat-suggest [role="option"]')]

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  setLocale('en')
  mentionReads = 0
})
enableAutoUnmount(afterEach)
afterEach(() => (document.body.innerHTML = ''))

describe('ChatComposer', () => {
  it('brings back the last message sent with ↑ in an empty box, and only there', async () => {
    const { w, text } = mountComposer({ recall: 'How do I stop a loop?' })
    const ta = await typeIn(w, 'x')
    await key(ta, 'ArrowUp')
    expect(text.value).toBe('x')
    await ta.setValue('')
    await key(ta, 'ArrowUp')
    await flushPromises()
    expect(text.value).toBe('How do I stop a loop?')
  })

  it('leaves the box with Escape', async () => {
    const { w } = mountComposer()
    const ta = await typeIn(w, 'draft')
    expect(document.activeElement).toBe(ta.element)
    await key(ta, 'Escape')
    expect(document.activeElement).not.toBe(ta.element)
  })

  it('opens the commands with a slash at the start, worked with the arrow keys and Enter', async () => {
    const { w, text, commands } = mountComposer()
    const ta = await typeIn(w, '/')
    expect(ta.attributes('aria-expanded')).toBe('true')
    expect(document.querySelector('.chat-suggest')?.getAttribute('role')).toBe('listbox')
    expect(options().map((o) => [...o.querySelectorAll('span')].map((s) => s.textContent?.trim()).join(' '))).toEqual([
      '/new New conversation',
      '/history Conversation history',
      '/close End this conversation',
    ])
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(ta.attributes('aria-activedescendant')).toBe(options()[0]!.id)
    await key(ta, 'ArrowDown')
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true')
    await key(ta, 'Enter')
    await flushPromises()
    expect(commands).toEqual(['history'])
    expect(text.value).toBe('')
    expect(w.emitted()).not.toHaveProperty('send')
  })

  it('narrows the commands as the word is typed, and closes on anything else', async () => {
    const { w, commands } = mountComposer()
    await typeIn(w, '/h')
    expect(options().map((o) => o.querySelector('.chat-suggest__command')?.textContent)).toEqual(['/history'])
    await typeIn(w, '/x')
    expect(document.querySelector('.chat-suggest')).toBeNull()
    await typeIn(w, '/new plan')
    expect(document.querySelector('.chat-suggest')).toBeNull()
    // A click chooses too.
    await typeIn(w, '/cl')
    options()[0]!.click()
    await flushPromises()
    expect(commands).toEqual(['close'])
  })

  it('closes the list with Escape, keeping what is written', async () => {
    const { w, text } = mountComposer()
    const ta = await typeIn(w, '/')
    await key(ta, 'Escape')
    await flushPromises()
    expect(document.querySelector('.chat-suggest')).toBeNull()
    expect(text.value).toBe('/')
    expect(document.activeElement).toBe(ta.element)
  })

  it('offers the course’s assignments and materials at an @, and writes the one chosen in by its title', async () => {
    const { w, text } = mountComposer()
    let ta = await typeIn(w, 'About @')
    await flushPromises()
    expect(mentionReads).toBe(1)
    expect(options().map((o) => o.querySelector('.chat-suggest__label')?.textContent)).toEqual([
      'HW1 — Temperature converter',
      'HW2 — Loops',
      'Week 1 notes',
    ])
    expect(options()[2]!.querySelector('.chat-suggest__kind')?.textContent).toBe('Material')
    ta = await typeIn(w, 'About @temp')
    expect(options()).toHaveLength(1)
    await key(ta, 'Tab')
    await flushPromises()
    expect(text.value).toBe('About “HW1 — Temperature converter” ')
    expect(document.querySelector('.chat-suggest')).toBeNull()
    // Read once.
    await typeIn(w, `${text.value}and @`)
    expect(mentionReads).toBe(1)
  })

  it('says so when nothing matches, and sends as ever on Enter', async () => {
    const { w } = mountComposer()
    const ta = await typeIn(w, '@zzz')
    expect(document.querySelector('.chat-suggest__note')?.textContent).toContain('No assignment or material has “zzz”')
    await key(ta, 'Enter')
    expect(w.findComponent(ChatComposer).emitted('send')).toHaveLength(1)
  })

  it('never takes the Enter an input method uses to pick a word', async () => {
    const { w, text, commands } = mountComposer()
    const ta = await typeIn(w, '/')
    await ta.trigger('compositionstart')
    await key(ta, 'Enter', { isComposing: true })
    await key(ta, 'Enter', { keyCode: 229 })
    await ta.trigger('compositionend')
    expect(commands).toEqual([])
    expect(text.value).toBe('/')
    expect(w.findComponent(ChatComposer).emitted('send')).toBeUndefined()
  })

  it('hints at the slash and the @ while empty', async () => {
    const { w } = mountComposer()
    expect(w.get('.chat-composer__hint').text()).toBe('/ for commands · @ to cite an assignment or material')
    await typeIn(w, 'x')
    expect(w.find('.chat-composer__hint').exists()).toBe(false)
  })
})

// --- Files ------------------------------------------------------------------------

interface Upload {
  file: File
  opts: UploadOptions
  resolve: (v: UploadedFile) => void
}
/** A draft's files, each upload played by the test; Core takes files of 1 000 bytes at most, three to a message. */
function files() {
  const uploads: Upload[] = []
  const upload: UploadFn = (_c, _k, file, opts) => new Promise((resolve) => uploads.push({ file, opts, resolve }))
  const a = createChatAttachments({
    courseId: 'k1',
    upload,
    limits: async () => ({ maxBytes: 1_000, maxFiles: 3, maxConversationBytes: 100_000 }),
  })
  const finish = async (u: Upload) => {
    u.resolve({ uploadToken: `tok-${u.file.name}`, fileName: u.file.name, contentType: u.file.type, size: u.file.size })
    await flushPromises()
  }
  return { a, uploads, finish }
}
const pdf = (name = 'notes.pdf', size = 120) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const flushAll = async () => {
  for (let i = 0; i < 4; i++) await flushPromises()
}

/** A paste in the box, as the browser hands one over: files, and any text. */
function paste(el: Element, list: File[], text = '') {
  const e = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', {
    value: {
      types: ['Files'],
      files: list,
      items: list.map((f) => ({ kind: 'file', getAsFile: () => f, webkitGetAsEntry: () => ({ isDirectory: false }) })),
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  })
  el.dispatchEvent(e)
  return e
}

describe('ChatComposer, with files', () => {
  it('attaches files chosen with the paperclip, each a chip that uploads at once; nothing is sent until they are up', async () => {
    const f = files()
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { w } = mountComposer({ attachments: f.a, name: 'Course tutor' })
    const clip = w.get('button.chat-composer__attach')
    expect(clip.attributes('aria-label')).toBe('Attach files')
    await clip.trigger('click')
    expect(clicked).toHaveBeenCalledTimes(1)
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    expect(input.multiple).toBe(true)
    Object.defineProperty(input, 'files', { value: [pdf('notes.pdf'), pdf('plot.pdf', 2048)], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushAll()
    clicked.mockRestore()

    const chips = w.findAll('.chat-chip')
    expect(chips.map((c) => c.get('.chat-chip__name').text())).toEqual(['notes.pdf', 'plot.pdf'])
    expect(chips[0]!.get('.chat-chip__meta').text()).toContain('120 B')
    expect(chips[0]!.classes()).toContain('is-uploading')
    expect(chips[0]!.find('[role="progressbar"]').exists()).toBe(true)
    // plot.pdf is 2 KB: more than Core takes, refused before anything is sent.
    expect(chips[1]!.classes()).toContain('is-failed')
    expect(f.uploads.map((u) => u.file.name)).toEqual(['notes.pdf'])
    expect(w.get('.chat-chips__error').text()).toBe(
      '“plot.pdf” was not uploaded: Too large to upload: it is 2 KB, and a file can be at most 1,000 B.',
    )
    await chips[1]!.get('button[aria-label="Remove “plot.pdf”"]').trigger('click')

    // Written, but still uploading: the send button waits, and the line says why.
    await typeIn(w, 'Check my notes')
    const send = w.get('button.chat-composer__send')
    expect(send.attributes('disabled')).toBeDefined()
    expect(w.get('.chat-composer__file-line').text()).toBe('Waiting for the files to upload…')
    await key(w.get('textarea'), 'Enter')
    expect(w.findComponent(ChatComposer).emitted('send')).toBeUndefined()

    await f.finish(f.uploads[0]!)
    expect(w.get('.chat-chip').classes()).toContain('is-done')
    expect(w.find('.chat-composer__file-line').exists()).toBe(false)
    expect(w.get('button.chat-composer__send').attributes('disabled')).toBeUndefined()
    await key(w.get('textarea'), 'Enter')
    expect(w.findComponent(ChatComposer).emitted('send')).toHaveLength(1)
    expect(f.a.payload()).toEqual([{ upload_token: 'tok-notes.pdf', filename: 'notes.pdf' }])
  })

  it('with files and nothing written, asks what to do with them, and sending asks for a line rather than refusing', async () => {
    const f = files()
    const { w } = mountComposer({ attachments: f.a, name: 'Course tutor' })
    await f.a.add([pdf()])
    await flushAll()
    await f.finish(f.uploads[0]!)
    const ta = w.get('textarea')
    expect(ta.attributes('placeholder')).toBe('What would you like Course tutor to do with this file?')
    // Not greyed out: pressing it asks for the line.
    expect(w.get('button.chat-composer__send').attributes('disabled')).toBeUndefined()
    ta.element.focus()
    await key(ta, 'Enter')
    await flushPromises()
    expect(w.findComponent(ChatComposer).emitted('send')).toBeUndefined()
    const line = w.get('.chat-composer__file-line')
    expect(line.classes()).toContain('is-ask')
    expect(line.text()).toBe(
      'Add a line to go with the file, so Course tutor knows what you want: a question, or what to look at.',
    )
    expect(document.activeElement).toBe(ta.element)
    await w.get('button.chat-composer__send').trigger('click')
    expect(w.findComponent(ChatComposer).emitted('send')).toBeUndefined()

    await typeIn(w, 'Is my base case right?')
    expect(w.find('.chat-composer__file-line').exists()).toBe(false)
    await key(w.get('textarea'), 'Enter')
    expect(w.findComponent(ChatComposer).emitted('send')).toHaveLength(1)
  })

  it('sends rather than stops while an answer is awaited, once files are attached', async () => {
    const f = files()
    const { w } = mountComposer({ attachments: f.a, stoppable: true })
    expect(w.find('.chat-composer__stop').exists()).toBe(true)
    await f.a.add([pdf()])
    await flushAll()
    expect(w.find('.chat-composer__stop').exists()).toBe(false)
  })

  it('attaches a picture pasted in the box, and leaves a paste with text to be written', async () => {
    const f = files()
    const { w } = mountComposer({ attachments: f.a })
    const ta = w.get('textarea').element
    const shot = new File([new Uint8Array(64)], 'image.png', { type: 'image/png' })
    expect(paste(ta, [shot]).defaultPrevented).toBe(true)
    await flushAll()
    expect(f.a.items.map((i) => i.name)).toEqual(['image.png'])
    // A table copied from a spreadsheet carries a picture of itself too: it is text.
    expect(paste(ta, [shot], 'a\tb').defaultPrevented).toBe(false)
    await flushAll()
    expect(f.a.count.value).toBe(1)
  })

  it('takes no more files than a message carries, and says how many were left out', async () => {
    const f = files()
    const { w } = mountComposer({ attachments: f.a })
    await f.a.add([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf'), pdf('d.pdf')])
    await flushAll()
    expect(w.findAll('.chat-chip')).toHaveLength(3)
    expect(w.get('button.chat-composer__attach').attributes('disabled')).toBeDefined()
    expect(w.get('button.chat-composer__attach').attributes('aria-label')).toBe('A message carries at most 3 files')
    for (const u of [...f.uploads]) await f.finish(u)
    expect(w.get('.chat-composer__file-line').text()).toBe('A message carries at most 3 files: one was left out.')
  })

  it('says a refusal because of the files under the chips, and uploads again what can no longer be attached', async () => {
    const f = files()
    const { w } = mountComposer({ attachments: f.a })
    await f.a.add([pdf()])
    await flushAll()
    await f.finish(f.uploads[0]!)
    f.a.refused(
      new ApiError({
        status: 422,
        code: 'failed_precondition',
        message: 'upload too old',
        details: { reason: 'upload_too_old' },
      }),
    )
    await flushAll()
    expect(f.uploads).toHaveLength(2)
    expect(w.get('.chat-composer__file-line').text()).toBe(
      'The files were uploaded too long ago to wait for approval. They are being uploaded again: send once more when they are.',
    )
    expect(w.get('.chat-composer__file-line').classes()).toContain('is-danger')
  })

  it('offers no paperclip where no files are taken', () => {
    const { w } = mountComposer()
    expect(w.find('button.chat-composer__attach').exists()).toBe(false)
  })
})
