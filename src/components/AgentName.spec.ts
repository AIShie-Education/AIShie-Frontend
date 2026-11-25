import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n } from '@/i18n'
import AgentName from './AgentName.vue'

const global = { plugins: [i18n, ElementPlus] }

describe('AgentName, cut short', () => {
  it('marks Han data with its language, and leaves a Latin name unmarked', () => {
    const chinese = mount(AgentName, { props: { name: '林家明' }, global })
    expect(chinese.find('.agent-name').attributes('lang')).toBe('zh-Hant')
    const latin = mount(AgentName, { props: { name: 'Nguyễn Văn An' }, global })
    expect(latin.find('.agent-name').attributes('lang')).toBeUndefined()
  })

  it('keeps the whole name on hover, and its “AI” whole', () => {
    const name = 'Introduction to Programming weekly revision and practice tutor'
    const w = mount(AgentName, { props: { name, ellipsis: true }, global })
    expect(w.find('.agent-name__text').attributes('title')).toBe(name)
    expect(w.find('.ai-badge').text()).toBe('AI')
  })
})
