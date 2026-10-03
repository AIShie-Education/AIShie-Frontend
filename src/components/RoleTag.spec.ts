import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import RoleTag from './RoleTag.vue'

const global = { plugins: [i18n, ElementPlus] }
beforeEach(() => setLocale('en'))

describe('RoleTag', () => {
  const agent = { role: 'assistant', kind: 'agent' }
  it('says which kind of agent a delegate is, a dash for an agent nobody owns, and a role for anyone else', () => {
    const tag = (member: Record<string, unknown>) =>
      mount(RoleTag, { props: { member: member as never }, global }).text()
    expect(tag({ ...agent, principal_member_id: 'm-yuki', answers_course: false })).toBe('Personal agent')
    expect(tag({ ...agent, principal_member_id: 'm-sato', answers_course: true })).toBe('Course agent')
    expect(tag(agent)).toBe('—')
    expect(tag({ role: 'assistant', kind: 'human' })).toBe('Assistant')
  })

  it('is an outline with its icon, and without it where its row shows the icon already', () => {
    const ta = { role: 'ta', kind: 'human' }
    const delegate = { ...agent, principal_member_id: 'm-sato', answers_course: true }
    for (const member of [ta, delegate]) {
      const w = mount(RoleTag, { props: { member }, global })
      expect(w.find('.app-tag--outline').exists()).toBe(true)
      expect(w.find('.app-tag__icon').exists()).toBe(true)
      w.unmount()
      const bare = mount(RoleTag, { props: { member, noIcon: true }, global })
      expect(bare.find('.app-tag--outline').exists()).toBe(true)
      expect(bare.find('.app-tag__icon').exists()).toBe(false)
      expect(bare.text()).toBe(member === ta ? 'Teaching assistant' : 'Course agent')
      bare.unmount()
    }
  })

  it('leaves the dash out among a page header’s tags, where it would read as a separator', () => {
    const w = mount(RoleTag, { props: { member: agent, hideNone: true }, global })
    expect(w.text()).toBe('')
    expect(w.find('.role-tag__none').exists()).toBe(false)
  })
})
