import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { defineComponent, h, ref } from 'vue'
import type { Mention } from './mentions'

const { i18n, setLocale } = await import('@/i18n')
const { default: ChatComposer } = await import('./ChatComposer.vue')

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
