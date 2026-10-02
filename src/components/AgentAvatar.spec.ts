import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentAvatar from './AgentAvatar.vue'

describe('AgentAvatar', () => {
  it('shows the initials, with the light at its corner, and hides from a screen reader', () => {
    const w = mount(AgentAvatar, { props: { name: 'Course TA agent' } })
    expect(w.find('.agent-avatar__initials').attributes('data-initials')).toBe('CT')
    // Drawn by CSS: not in the text beside the name.
    expect(w.text()).toBe('')
    expect(w.find('.agent-avatar__light').exists()).toBe(true)
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.classes()).toContain('is-default')
  })

  it('shows one character of a Chinese name', () => {
    const w = mount(AgentAvatar, { props: { name: '小明的溫習助手', size: 'small' } })
    expect(w.find('.agent-avatar__initials').attributes('data-initials')).toBe('小')
  })

  it('shows the agents’ icon where there is no name', () => {
    const w = mount(AgentAvatar, { props: { name: '' } })
    expect(w.find('.agent-avatar__initials').exists()).toBe(false)
    expect(w.find('svg.agent-seat-icon').exists()).toBe(true)
  })
})
