import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import StatusTag, { type Vocabulary } from './StatusTag.vue'

const global = { plugins: [i18n, ElementPlus] }

const tag = (vocab: Vocabulary, value: string) => mount(StatusTag, { props: { vocab, value }, global }).find('.el-tag')

beforeEach(() => setLocale('en'))

describe('StatusTag', () => {
  it('says an outcome in its colour: done in green, refused or failed in red, waiting in amber', () => {
    expect(tag('actionStatus', 'executed').classes()).toContain('el-tag--success')
    expect(tag('actionStatus', 'approved').classes()).toContain('el-tag--success')
    expect(tag('actionStatus', 'denied').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'rejected').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'failed').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'proposed').classes()).toContain('el-tag--warning')
    // Sent back for changes: not refused, it waits on its proposer to propose again.
    expect(tag('actionStatus', 'changes_requested').classes()).toContain('el-tag--warning')
  })

  it('tells a level of autonomy by its mark, not its hue: denied is a neutral lock, not red', () => {
    const denied = tag('level', 'denied')
    expect(denied.classes()).toEqual(expect.arrayContaining(['app-level-tag', 'is-denied']))
    expect(denied.classes()).not.toContain('el-tag--danger')
    expect(denied.find('svg.level-icon rect').exists()).toBe(true)
    const confirm = tag('level', 'confirm_required')
    expect(confirm.classes()).toContain('is-confirm_required')
    expect(confirm.classes()).not.toContain('el-tag--warning')
    expect(confirm.text()).toBe('Needs approval')
  })

  it('shows a category in no colour of an outcome', () => {
    for (const [vocab, value] of [
      ['platformRole', 'root'],
      ['actorKind', 'agent'],
    ] as const)
      expect(tag(vocab, value).classes()).toContain('el-tag--info')
  })
})
