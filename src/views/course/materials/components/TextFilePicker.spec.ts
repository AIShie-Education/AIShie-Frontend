import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { DocumentFile, TextVersion } from '@/api/types'
import { i18n, setLocale } from '@/i18n'
import TextFilePicker from './TextFilePicker.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
})
enableAutoUnmount(afterEach)

const text = (status: string): TextVersion => ({ status, revision: 1, bytes: 0, updated_at: '2026-09-30T00:00:00Z' })
const f = (n: number, filename: string, status?: string): DocumentFile => ({
  id: `f-${n}`,
  position: n,
  filename,
  content_type: 'application/pdf',
  byte_size: 10,
  text: status ? text(status) : null,
})
const FILES = [f(1, 'slides.pdf', 'done'), f(2, 'handout.pdf', 'working'), f(3, 'scan.pdf', 'failed')]

function picker(props: Record<string, unknown> = {}) {
  return mount(TextFilePicker, {
    props: { files: FILES, selected: FILES[0], transcriptionOn: true, ...props },
    global: { plugins: [createPinia(), i18n, ElementPlus], components: icons },
  })
}

describe('TextFilePicker', () => {
  it('offers each file of several, numbered, the one shown pressed, each saying where its text stands', () => {
    const w = picker({ selected: FILES[1] })
    expect(w.find('[role=group]').attributes('aria-label')).toBe('Whose text version to show')
    const buttons = w.findAll('.text-file')
    expect(buttons.map((b) => b.find('.text-file__n').text())).toEqual(['1', '2', '3'])
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(buttons.map((b) => b.find('.text-file__status').text())).toEqual(['Done', 'Transcribing', 'Failed'])
  })

  it('says a file picked, and hides a wait for a transcriber that is off', async () => {
    const w = picker({ transcriptionOn: false })
    expect(w.findAll('.text-file__status').map((c) => c.text())).toEqual(['Done', 'Failed'])
    await w.findAll('.text-file')[2]!.trigger('click')
    expect(w.emitted('pick')?.[0]?.[0]).toMatchObject({ id: 'f-3' })
  })

  it('names the one file of a version of one', () => {
    const w = picker({ files: [FILES[0]], selected: FILES[0] })
    expect(w.find('[role=group]').exists()).toBe(false)
    expect(w.find('.text-files__one').text()).toBe('slides.pdf')
  })
})
