import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import StatusTag, { type Vocabulary } from './StatusTag.vue'

const global = { plugins: [i18n, ElementPlus] }

const mounted = (vocab: Vocabulary, value: string) => mount(StatusTag, { props: { vocab, value }, global })
const tag = (vocab: Vocabulary, value: string) => mounted(vocab, value).find('.el-tag')

beforeEach(() => setLocale('en'))

describe('StatusTag', () => {
  it('says an outcome in its colour: done in green, refused or failed in red, waiting in amber', () => {
    expect(tag('actionStatus', 'executed').classes()).toContain('el-tag--success')
    expect(tag('actionStatus', 'approved').classes()).toContain('el-tag--success')
    expect(tag('actionStatus', 'denied').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'rejected').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'failed').classes()).toContain('el-tag--danger')
    expect(tag('submissionState', 'missing').classes()).toContain('el-tag--danger')
    expect(tag('actionStatus', 'proposed').classes()).toContain('el-tag--warning')
    expect(tag('submissionState', 'late').classes()).toContain('el-tag--warning')
    // Sent back for changes: not refused, it waits on its proposer to propose again.
    expect(tag('actionStatus', 'changes_requested').classes()).toContain('el-tag--warning')
    // A grade not yet posted waits on its grader; a student's draft of her own work does not.
    expect(tag('gradeState', 'draft').classes()).toContain('el-tag--warning')
    expect(tag('submissionState', 'draft').classes()).toContain('el-tag--info')
  })

  it('draws every state as a tinted pill, never an outline or a dark one', () => {
    for (const [vocab, value] of [
      ['actionStatus', 'executed'],
      ['memberStatus', 'paused'],
      ['courseStatus', 'archived'],
    ] as const) {
      const t = tag(vocab, value)
      expect(t.classes()).toEqual(expect.arrayContaining(['app-tag--pill', 'el-tag--light']))
    }
  })

  it('says the usual state quietly, in plain text, so that only what departs from it is coloured', () => {
    for (const [vocab, value, text] of [
      ['memberStatus', 'active', 'Active'],
      ['courseStatus', 'active', 'Active'],
      ['submissionState', 'submitted', 'Submitted'],
      ['gradeState', 'posted', 'Posted'],
      ['conversationStatus', 'open', 'Open'],
    ] as const) {
      const w = mounted(vocab, value)
      expect(w.find('.el-tag').exists()).toBe(false)
      expect(w.find('.app-tag--quiet').text()).toBe(text)
    }
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

  it('shows a category as an identity: outlined, with its icon, in no colour of an outcome', () => {
    for (const [vocab, value] of [
      ['platformRole', 'root'],
      ['actorKind', 'agent'],
      ['role', 'instructor'],
      ['seatPurpose', 'course'],
      ['documentKind', 'material'],
    ] as const) {
      const t = tag(vocab, value)
      expect(t.classes()).toEqual(expect.arrayContaining(['app-tag--outline', 'el-tag--info']))
      expect(t.find('.app-tag__icon svg').exists()).toBe(true)
    }
    // An agent is drawn as aishie.app's person beside a seat, a person as a person.
    expect(tag('actorKind', 'agent').find('svg.agent-seat-icon').exists()).toBe(true)
    expect(tag('actorKind', 'human').find('svg.agent-seat-icon').exists()).toBe(false)
  })
})
