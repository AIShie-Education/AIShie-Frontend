import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import AnswerSources from './AnswerSources.vue'

const source = { document_id: 'd1', version_id: 'v1' }
const render = (payload: Record<string, unknown>) =>
  mount(AnswerSources, { props: { payload }, global: { plugins: [i18n, ElementPlus] } })

afterEach(() => setLocale('en'))
enableAutoUnmount(afterEach)

describe('AnswerSources', () => {
  it('counts the course materials a proposed answer names, by id alone', () => {
    const w = render({ body: 'x', sources: [source, { ...source, document_id: 'd2' }] })
    expect(w.get('p.answer-sources').text()).toBe('Based on 2 course materials')
  })

  it('counts a material once however many of its pages, files or versions it names', () => {
    const page = (n: number, over: Record<string, unknown> = {}) => ({ ...source, file_id: 'f1', page: n, ...over })
    expect(
      render({ body: 'x', sources: [page(2), page(3)] })
        .get('p.answer-sources')
        .text(),
    ).toBe('Based on 1 course material')
    expect(
      render({ body: 'x', sources: [page(2), { ...source, document_id: 'd2' }, page(3, { version_id: 'v0' })] })
        .get('p.answer-sources')
        .text(),
    ).toBe('Based on 2 course materials')
  })

  it('says that each is checked again when it is approved on focus, as a tap gives it, not only on hover', async () => {
    const line = render({ body: 'x', sources: [source] }).get('p.answer-sources')
    expect(line.attributes('tabindex')).toBe('0')
    expect(line.attributes('title')).toBeUndefined()
    expect(document.body.textContent).not.toContain('checked again when the reply is approved')
    await line.trigger('focus')
    await vi.waitFor(() => expect(document.body.textContent).toContain('checked again when the reply is approved'))
  })

  it.each([
    ['en', 'No course material cited'],
    ['zh-Hant', '未引用課程教材'],
    ['zh-Hans', '未引用课程教材'],
  ] as const)('shows a neutral pill where it relied on none (%s)', (locale, text) => {
    setLocale(locale)
    const pill = render({ body: 'x', sources: [] }).get('.answer-sources')
    expect(pill.classes()).toContain('el-tag--info')
    expect(pill.text()).toBe(text)
  })

  it.each([
    ['zh-Hant', '依據1項課程教材'],
    ['zh-Hans', '依据1项课程教材'],
  ] as const)('counts them in %s', (locale, text) => {
    setLocale(locale)
    expect(render({ body: 'x', sources: [source] }).text()).toBe(text)
  })

  it('says nothing where the answer does not say what it relied on', () => {
    expect(render({ body: 'x' }).find('.answer-sources').exists()).toBe(false)
  })
})
