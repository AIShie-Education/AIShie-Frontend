import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n } from '@/i18n'
import AgentBadge from './AgentBadge.vue'

const global = { plugins: [i18n, ElementPlus] }

describe('AgentBadge', () => {
  it('marks a Chinese owner’s name in the small owner chip, and leaves Latin data unmarked', () => {
    const chinese = mount(AgentBadge, { props: { ownerName: '林家明' }, global })
    expect(chinese.find('.agent-badge__owner').attributes('lang')).toBe('zh-Hant')
    const latin = mount(AgentBadge, { props: { ownerName: 'Nguyễn Văn An' }, global })
    expect(latin.find('.agent-badge__owner').attributes('lang')).toBeUndefined()
  })
})
