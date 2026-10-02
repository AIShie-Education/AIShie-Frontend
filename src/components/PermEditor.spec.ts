import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import type { PermLevels } from '@/api/types'
import { ceilingsOf } from '@/utils/ceilings'
import PermEditor from './PermEditor.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  setLocale('en')
  document.body.innerHTML = ''
})

// An agent's seat as member.get says it: it decides only by proposal, and
// brings no agents of its own.
const agentSeat = ceilingsOf({
  perm_ceilings: { action_decide: 'confirm_required', agent_delegate: 'denied', grade_submit: 'autonomous' },
  perm_ceiling_reasons: { action_decide: 'agent_decides_by_proposal', agent_delegate: 'agent_never' },
})

// A person's seat as member.get says it: a person answers no conversation.
const personSeat = ceilingsOf({
  perm_ceilings: { conversation_answer: 'denied', conversation_ask: 'autonomous' },
  perm_ceiling_reasons: { conversation_answer: 'conversations_are_with_agents' },
})

function mountEditor(props: { modelValue: PermLevels; readonly?: boolean }, ceilings = agentSeat) {
  const w = mount(PermEditor, {
    props: { ...props, ceilings },
    attachTo: document.body,
    global: {
      plugins: [
        i18n,
        ElementPlus,
        { install: (app) => Object.entries(Icons).forEach(([n, c]) => app.component(n, c)) },
      ],
    },
  })
  mounted.push(w)
  return w
}

/** The row of one permission, found by its key. */
function row(w: ReturnType<typeof mountEditor>, perm: string) {
  return w.findAll('.perm-editor__row').find((r) => r.find('.perm-editor__key').text() === perm)!
}

// Each test renders the editor once, and no more: its 17 rows are each a
// real Element Plus select, with its dropdown's four options and their
// tooltips rendered too, which take some 0.6 s of CPU in jsdom (1 s for the
// first, while the modules warm up). A busy machine stretches that many
// times over: with a load near 15 the first test took up to 19 s and the
// others up to 14 s. That is near the suite's 30 s (vite.config.ts) for
// one test; these have 60 s.
describe('PermEditor with a seat’s ceilings', { timeout: 60_000 }, () => {
  it('greys out the levels above a ceiling, each saying why, and leaves the rest', () => {
    const w = mountEditor({ modelValue: { action_decide: 'denied', grade_submit: 'confirm_required' } })
    const decide = row(w, 'action_decide').findComponent({ name: 'LevelSelect' })
    const options = decide.findAllComponents({ name: 'ElOption' })
    const disabled = Object.fromEntries(options.map((o) => [o.props('value'), !!o.props('disabled')]))
    expect(disabled).toEqual({ denied: false, confirm_required: false, pending_review: true, autonomous: true })
    // The select's own dropdown is a tooltip too, with no content of its own.
    const tips = decide
      .findAllComponents({ name: 'ElTooltip' })
      .filter((tip) => !tip.props('disabled') && tip.props('content'))
      .map((tip) => tip.props('content'))
    expect(tips.length).toBe(2)
    for (const tip of tips) {
      expect(tip).toBe(
        'At most “Needs approval” here: an agent decides and reviews only by proposal, which a person then confirms.',
      )
    }
    // A permission nothing caps offers every level.
    const grade = row(w, 'grade_submit').findComponent({ name: 'LevelSelect' })
    expect(grade.findAllComponents({ name: 'ElOption' }).some((o) => o.props('disabled'))).toBe(false)
  })

  it('marks a capped row with how far it may go, and locks one capped at denied', () => {
    const w = mountEditor({ modelValue: {} })
    expect(row(w, 'action_decide').find('.perm-editor__ceiling').text()).toBe('At most: Needs approval')
    expect(row(w, 'agent_delegate').find('.perm-editor__ceiling').text()).toBe('Never here')
    const locked = row(w, 'agent_delegate').findComponent({ name: 'ElSelect' })
    expect(locked.props('disabled')).toBe(true)
    expect(row(w, 'grade_submit').find('.perm-editor__ceiling').exists()).toBe(false)
  })

  it('says of a level set above its ceiling that it works at the ceiling, read-only too', () => {
    const w = mountEditor({ modelValue: { action_decide: 'autonomous' }, readonly: true })
    expect(row(w, 'action_decide').find('.perm-editor__over').text()).toBe(
      'Set higher than it may hold: it works as “Needs approval” at most.',
    )
    expect(row(w, 'action_decide').find('.perm-editor__ceiling').exists()).toBe(true)
  })

  it('says it in the reader’s language', () => {
    setLocale('zh-Hant')
    const w = mountEditor({ modelValue: {} })
    expect(row(w, 'action_decide').find('.perm-editor__ceiling').text()).toBe('最多：需批准')
  })

  it('locks a person’s answering of conversations, saying that conversations are with agents', () => {
    const w = mountEditor({ modelValue: { conversation_ask: 'autonomous' } }, personSeat)
    const answer = row(w, 'conversation_answer')
    expect(answer.find('.perm-editor__ceiling').text()).toBe('Never here')
    expect(answer.findComponent({ name: 'ElSelect' }).props('disabled')).toBe(true)
    const note = w
      .findAllComponents({ name: 'ElTooltip' })
      .map((tip) => tip.props('content') as unknown)
      .find((c) => typeof c === 'string' && c.startsWith('Never held here'))
    expect(note).toBe('Never held here: conversations are with agents, and a person answers none of them.')
    // Asking is theirs as ever.
    expect(row(w, 'conversation_ask').find('.perm-editor__ceiling').exists()).toBe(false)
  })

  it('says a person’s lock in the reader’s language', () => {
    setLocale('zh-Hans')
    const w = mountEditor({ modelValue: {} }, personSeat)
    expect(row(w, 'conversation_answer').find('.perm-editor__ceiling').text()).toBe('此处不可拥有')
  })
})
