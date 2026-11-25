import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentAvatar from './AgentAvatar.vue'

// Its style as written: the square's corners are the app's at every size.
const style = Object.values(
  import.meta.glob<string>('./AgentAvatar.vue', { query: '?raw', import: 'default', eager: true }),
)[0]!.replace(/^[\s\S]*<style scoped>/, '')

describe('AgentAvatar', () => {
  it('shows the initials and nothing else, no light of the brand’s, and hides from a screen reader', () => {
    const w = mount(AgentAvatar, { props: { name: 'Course TA agent' } })
    expect(w.find('.agent-avatar__initials').attributes('data-initials')).toBe('CT')
    // Drawn by CSS: not in the text beside the name.
    expect(w.text()).toBe('')
    // The amber light is the wordmark's alone.
    expect(w.findAll('.agent-avatar > *')).toHaveLength(1)
    expect(w.find('.agent-avatar__light').exists()).toBe(false)
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.classes()).toContain('is-default')
  })

  it('is a square with the app’s 2 px corners at every size, never a rounder one, nor a person’s circle', () => {
    const radii = [...style.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1])
    expect(radii).toEqual(['var(--app-radius)'])
    expect(style).not.toMatch(/box-shadow|--app-light/)
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
