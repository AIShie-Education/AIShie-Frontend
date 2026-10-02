import { afterEach, describe, expect, it } from 'vitest'
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
  it('counts the course materials a proposed answer names, by id alone, saying they are checked when it is approved', () => {
    const w = render({ body: 'x', sources: [source, { ...source, document_id: 'd2' }] })
    const line = w.get('p.answer-sources')
    expect(line.text()).toBe('Based on 2 course materials')
    expect(line.attributes('title')).toContain('checked again when the reply is approved')
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
