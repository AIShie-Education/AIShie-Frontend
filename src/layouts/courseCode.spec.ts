// A course's code looks the same wherever it is written: the side bar's row, the crumbs, the course's line of
// context, a conversation in the chat's history and the chat's head. None is tracked out (letter-spacing) where
// the others are not. Read as written: jsdom lays nothing out.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(
  [
    '../components/sidebar/SideCourses.vue',
    './CourseCrumbs.vue',
    './CourseLayout.vue',
    '../components/chat/ChatHistory.vue',
    '../components/chat/ChatPane.vue',
  ],
  { query: '?raw', import: 'default', eager: true },
)
const CODES: [string, string][] = [
  ['../components/sidebar/SideCourses.vue', '.side-course__code'],
  ['./CourseCrumbs.vue', '.course-crumbs__code'],
  ['./CourseLayout.vue', '.course-head__code'],
  ['../components/chat/ChatHistory.vue', '.hist-row__course'],
  ['../components/chat/ChatPane.vue', '.chat-pane__course'],
]

describe('a course’s code', () => {
  it('is never tracked out, in any of the places it is written', () => {
    for (const [file, selector] of CODES) {
      const style = sources[file]!.replace(/^[\s\S]*?<style scoped>/, '')
      const at = style.indexOf(`\n${selector} {`)
      expect(at, `${file} ${selector}`).toBeGreaterThanOrEqual(0)
      const rule = style.slice(at, style.indexOf('}', at))
      expect(rule, `${file} ${selector}`).toMatch(/font-weight: var\(--app-weight-strong\);/)
      expect(rule, `${file} ${selector}`).not.toMatch(/letter-spacing/)
    }
  })
})
