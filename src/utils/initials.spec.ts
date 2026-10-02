import { describe, expect, it } from 'vitest'
import { agentInitials, splitNameEnd } from './initials'

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

describe('splitNameEnd', () => {
  it.each([
    ['Introduction to Programming tutor', 'Introduction to Programming ', 'tutor'],
    ['grader-v2', '', 'grader-v2'],
    ['小明的溫習助手', '小明的溫習助', '手'],
    ['CS101 課程小幫手', 'CS101 課程小幫', '手'],
    ['「溫習」小幫手」', '「溫習」小幫', '手」'],
    ['Tutor  ', '', 'Tutor'],
    ['', '', ''],
    [null, '', ''],
  ])('%j → %j + %j', (name, head, end) => {
    expect(splitNameEnd(name)).toEqual({ head, end })
  })
})
