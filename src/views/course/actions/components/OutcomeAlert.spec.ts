import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as Icons from '@element-plus/icons-vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import OutcomeAlert from './OutcomeAlert.vue'
import type { DecideResult, Done } from './decide'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/c/:courseId/actions/:actionId', name: 'course-action', component: { template: '<div />' } },
  ],
})

function shown(done: Done, closable = false, actionType?: string) {
  return mount(OutcomeAlert, {
    props: { courseId: 'k1', done, closable, actionType },
    global: { plugins: [i18n, ElementPlus, router], components: Icons },
  })
}
const decided = (out: Partial<DecideResult>): Done =>
  ({ kind: 'decided', decision: 'approve', out: { action_id: 'p1', ...out } }) as Done
/** How it is drawn: Element Plus's alert of a type, or a note. */
function look(done: Done) {
  const w = shown(done)
  const alert = w.find('.el-alert')
  if (!alert.exists()) return w.find('.app-note').exists() ? 'note' : 'nothing'
  return ['success', 'warning', 'error', 'info', 'primary'].find((k) => alert.classes(`el-alert--${k}`))
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
})

describe('OutcomeAlert', () => {
  it('reports an outcome in its colour: carried out or reviewed green, failed red, cancelled, sent back or escalated amber', () => {
    expect(look(decided({ outcome: 'executed' }))).toBe('success')
    expect(look(decided({ outcome: 'failed', error: { code: 'conflict', message: 'stale' } }))).toBe('error')
    expect(look(decided({ outcome: 'cancelled' }))).toBe('warning')
    expect(look(decided({ outcome: 'changes_requested' }))).toBe('warning')
    expect(look({ kind: 'reviewed', state: 'reviewed' })).toBe('success')
    expect(look({ kind: 'reviewed', state: 'escalated' })).toBe('warning')
  })

  it('says one of no colour in a note, never Element Plus’s grey box: rejected, a decision that waits for approval, taken back', () => {
    expect(look(decided({ outcome: 'rejected' }))).toBe('note')
    expect(look({ kind: 'proposed', decision: 'approve', actionId: 'd1' })).toBe('note')
    expect(look({ kind: 'withdrawn', byOwner: false })).toBe('note')
    // Approving a colleague's rejection: what finally happened is the rejection beneath.
    expect(
      look(decided({ outcome: 'executed', result: { action_id: 'p0', outcome: 'rejected' } as unknown as never })),
    ).toBe('note')
  })

  it('titles the note with the outcome and says the rest under it, closable where the page lets it go', async () => {
    const w = shown({ kind: 'proposed', decision: 'reject', actionId: 'd1' }, true)
    expect(w.find('.app-note__title').text()).toBe('Your decision is waiting for approval')
    expect(w.find('.app-note__body').text()).toContain('View your decision')
    await w.find('.app-note__close').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    const owner = shown({ kind: 'withdrawn', byOwner: true })
    expect(owner.find('.app-note__title').text()).toBe('Withdrawn: nothing of it was carried out')
    expect(owner.find('.outcome-alert__owner').text()).toContain('as its owner')
  })

  it('says why a proposal failed in the app’s words for its kind, and Core’s only where it has none', () => {
    const error = {
      code: 'failed_precondition',
      message: "the group's grade on this work is posted: regrade it with grade.regrade",
      details: { reason: 'group_grade_posted' },
    }
    const worded = shown(decided({ outcome: 'failed', error }), false, 'grade.submit')
    expect(worded.text()).toContain('A grade from this group’s grade has been posted')
    expect(worded.text()).not.toContain('grade.regrade')
    expect(worded.find('.outcome-alert__core').exists()).toBe(false)
    // A kind the app has no words for: Core's, as it said them.
    const bare = shown(decided({ outcome: 'failed', error }), false, 'document.update')
    expect(bare.find('.outcome-alert__core').text()).toContain('grade.regrade')
  })
})
