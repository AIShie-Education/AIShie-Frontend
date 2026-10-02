import { describe, expect, it } from 'vitest'
import { agentInitials } from './initials'

describe('agentInitials', () => {
  it.each([
    ['Course TA agent', 'CT'],
    ['Grader', 'GR'],
    ['grader-v2', 'GV'],
    ['tutor-yuki', 'TY'],
    ['  Q  ', 'Q'],
    ['小明的溫習助手', '小'],
    ['林老師的助教代理', '林'],
    ['「溫習」小幫手', '溫'],
    ['CS101 課程小幫手', 'CS'],
    ['CS101 Course helper', 'CC'],
    ['ゆきのノート', 'ゆ'],
    ['', ''],
    [null, ''],
    ['— · —', ''],
  ])('%j → %j', (name, want) => {
    expect(agentInitials(name)).toBe(want)
  })
})
