import { describe, expect, it } from 'vitest'
import { consulted, stepDone, stepKind, stepMessage } from './draft'

describe('the draft’s steps', () => {
  it('reads a kind the app does not know as a tool', () => {
    expect(stepKind({ kind: 'reading_document' })).toBe('reading_document')
    expect(stepKind({ kind: 'browsing_the_web' })).toBe('tool')
  })

  it('names the message for a step, running or done, with its target or without', () => {
    expect(stepMessage({ kind: 'reading_document', target: 'HW1.pdf', state: 'done' })).toEqual({
      key: 'chat.draft.steps.reading_document.doneTarget',
      target: 'HW1.pdf',
    })
    expect(stepMessage({ kind: 'thinking', state: 'running' })).toEqual({ key: 'chat.draft.steps.thinking.running' })
    expect(stepMessage({ kind: 'tool', target: '  ', state: 'done' })).toEqual({ key: 'chat.draft.steps.tool.done' })
    expect(stepMessage({ kind: 'mystery', state: 'running' }).key).toBe('chat.draft.steps.tool.running')
  })

  it('counts what was consulted: steps done, not thinking or writing', () => {
    const steps = [
      { kind: 'thinking', state: 'done' },
      { kind: 'reading_document', target: 'HW1.pdf', state: 'done' },
      { kind: 'listing_documents', state: 'done' },
      { kind: 'searching_memory', state: 'running' },
      { kind: 'writing', state: 'running' },
    ]
    expect(consulted(steps).map((s) => s.kind)).toEqual(['reading_document', 'listing_documents'])
    expect(consulted(null)).toEqual([])
    expect(stepDone({ state: 'done' })).toBe(true)
    expect(stepDone({ state: 'running' })).toBe(false)
  })
})
