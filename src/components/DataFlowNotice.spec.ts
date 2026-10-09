import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataFlowNotice from './DataFlowNotice.vue'

// Every template, as written, to find where it says data leaves the site.
const templates = import.meta.glob<string>('/src/**/*.vue', { query: '?raw', import: 'default', eager: true })

/**
 * What says where data goes, as the templates write it: a message's key, quoted, or what the
 * chat's notice is made of (privacy.ts, whose sentences are keys the template puts together).
 */
const SAYS_WHERE_DATA_GOES = [
  // A model's provider, to administrators (the runtime's offer) and owners (the school's plan, their own key).
  "'runtimeAdmin.offer.warning'",
  "'hosting.model.warning'",
  "'hosting.school.warning'",
  // Files of personal data, to administrators who export conversations.
  "'auditExport.privacy.title'",
  // A file of each member's peer evaluation, to those who grade.
  "'peer.results.csvNotice'",
  // To those who ask, in the chat: the first time's points, the line under the composer, and where it
  // goes to be answered in the whole notice.
  "'chat.privacy.firstTitle'",
  'privacy.points',
  "'chat.privacy.moreLabel'",
  'privacy.line.key',
  "'chat.privacy.routeTitle'",
  'notice.route',
]

/** Where each is written: every place in every template. */
function placesOf(what: string): [file: string, src: string, at: number][] {
  const places: [string, string, number][] = []
  for (const [file, src] of Object.entries(templates)) {
    for (let at = src.indexOf(what); at !== -1; at = src.indexOf(what, at + 1)) places.push([file, src, at])
  }
  return places
}

describe('DataFlowNotice', () => {
  it('is a note with a shield before its words, and a title above them where it has one', () => {
    const w = mount(DataFlowNotice, { props: { title: 'These files hold personal data' }, slots: { default: 'Keep them.' } })
    expect(w.attributes('role')).toBe('note')
    expect(w.find('svg.data-flow__icon').attributes('aria-hidden')).toBe('true')
    expect(w.find('.data-flow__title').text()).toBe('These files hold personal data')
    expect(w.find('p.data-flow__title').exists()).toBe(true)
    expect(w.find('.data-flow__body').text()).toBe('Keep them.')
    expect(w.find('.el-alert').exists()).toBe(false)
    expect(w.classes()).not.toContain('is-compact')
  })

  it('heads a part of a dialog or a page with a title of the level given, which can name it', () => {
    const w = mount(DataFlowNotice, {
      props: { title: 'Before you ask', heading: 'h3', titleId: 'first' },
      slots: { default: '<ul><li>Staff read this.</li></ul>' },
    })
    const title = w.find('h3.data-flow__title')
    expect(title.text()).toBe('Before you ask')
    expect(title.attributes('id')).toBe('first')
    expect(w.find('p.data-flow__title').exists()).toBe(false)
  })

  it('is one line where it says so under the chat’s composer: the shield, the words, no title', () => {
    const w = mount(DataFlowNotice, { props: { compact: true }, slots: { default: 'It goes to its model. More' } })
    expect(w.classes()).toContain('is-compact')
    expect(w.attributes('role')).toBe('note')
    expect(w.find('svg.data-flow__icon').exists()).toBe(true)
    expect(w.find('.data-flow__title').exists()).toBe(false)
    expect(w.text()).toBe('It goes to its model. More')
  })

  it('is how every page says where data leaves the site, administrators’, owners’ and the chat’s, never an alert of its own', () => {
    for (const what of SAYS_WHERE_DATA_GOES) {
      const places = placesOf(what)
      expect(places.length, what).toBeGreaterThan(0)
      for (const [file, src, at] of places) {
        const open = src.lastIndexOf('<DataFlowNotice', at)
        const close = src.lastIndexOf('</DataFlowNotice>', at)
        expect(open > close && open > src.lastIndexOf('<el-alert', at), `${what} in ${file}`).toBe(true)
      }
    }
  })
})
