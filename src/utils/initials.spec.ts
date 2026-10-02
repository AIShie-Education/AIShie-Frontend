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
    ['Introduction to Programming tutor', 'Introduction to Programming tuto', 'r'],
    ['grader-v2', 'grader-v', '2'],
    // No spaces: all of it but its last letter may still break.
    [
      'cs101-introduction-to-programming-weekly-revision-tutor',
      'cs101-introduction-to-programming-weekly-revision-tuto',
      'r',
    ],
    ['Course tutor (beta)', 'Course tutor (bet', 'a)'],
    ['小明的溫習助手', '小明的溫習助', '手'],
    ['CS101 課程小幫手', 'CS101 課程小幫', '手'],
    ['「溫習」小幫手」', '「溫習」小幫', '手」'],
    ['Café', 'Caf', 'é'],
    ['Cafe\u0301', 'Caf', 'e\u0301'],
    ['Tutor  ', 'Tuto', 'r'],
    ['— · —', '— · ', '—'],
    ['', '', ''],
    [null, '', ''],
  ])('%j → %j + %j', (name, head, end) => {
    expect(splitNameEnd(name)).toEqual({ head, end })
  })
})
