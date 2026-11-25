import { describe, expect, it } from 'vitest'

// Guards for the shared view conventions which jsdom does not paint. Browser
// tests measure the responsive cases; these read the templates themselves so
// a hand-written empty place, explanation or status pill cannot slip back in.
const vue = import.meta.glob<string>('/src/**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const read = (path: string) => {
  const source = vue[path]
  expect(source, path).toBeTruthy()
  return source!
}
// Greedy through the last closing tag: nested Vue slots also use <template>.
const template = (path: string) => read(path).match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''

describe('shared empty places, explanations and row states', () => {
  it('has no solid information glyph or hand-set confirmation leading in a component', () => {
    for (const [path, source] of Object.entries(vue)) {
      expect(template(path), path).not.toContain('InfoFilled')
      expect(source, path).not.toMatch(/line-height:\s*1\.55/)
    }
  })

  it.each([
    '/src/views/course/assignments/AssignmentView.vue',
    '/src/views/course/assignments/components/WorkSummary.vue',
    '/src/views/course/scheme/SchemeView.vue',
    '/src/views/admin/CourseAdminView.vue',
    '/src/views/account/components/SeatsCard.vue',
    '/src/views/account/components/agents/AgentTokensCard.vue',
    '/src/views/account/components/agents/AgentSeatsCard.vue',
    '/src/components/preview/TextView.vue',
  ])('uses AppEmpty or MarkdownView’s AppEmpty for the empty cases in %s', (path) => {
    const source = template(path)
    expect(source.includes('<AppEmpty') || /<MarkdownView[^>]*:empty=/.test(source)).toBe(true)
  })

  it.each([
    '/src/views/course/submissions/SubmissionsView.vue',
    '/src/views/course/scheme/SchemeView.vue',
    '/src/views/admin/runtime/RuntimeAsync.vue',
    '/src/views/admin/runtime/TranscriptionCard.vue',
    '/src/components/preview/FileViewer.vue',
    '/src/views/admin/components/ActorCredentialsCard.vue',
  ])('uses AppNote for explanations in %s', (path) => {
    expect(template(path)).toContain('<AppNote')
  })

  it.each([
    '/src/views/course/overview/components/AssignmentsCard.vue',
    '/src/views/course/scheme/components/SchemeTree.vue',
    '/src/views/course/scheme/SchemeView.vue',
  ])('marks every unpublished assignment row in %s', (path) => {
    expect(template(path)).toMatch(/'app-row-unpublished':\s*!/)
  })

  it('keeps a published version quiet and says only when one is not published', () => {
    expect(template('/src/views/course/materials/DocumentView.vue')).not.toMatch(/shown\.published" tone="done"/)
    const history = template('/src/views/course/materials/components/VersionHistory.vue')
    expect(history).not.toMatch(/v\.published" tone="done"/)
    expect(history).toContain('v-if="!v.published" tone="wait"')
  })

  it('makes the course-agent request count an indigo note, not an amber alert', () => {
    const source = template('/src/views/course/agents/CourseAgentsView.vue')
    expect(source).toContain('<AppNote v-if="requests.data.value"')
    expect(source).not.toMatch(/<el-alert[^>]*requests\.data\.value/)
  })

  it('keeps a retracted chat line upright in every script', () => {
    const source = read('/src/components/chat/ChatMessage.vue')
    expect(source).toMatch(/\.chat-msg__retracted\s*{[^}]*font-style:\s*normal/)
  })
})
