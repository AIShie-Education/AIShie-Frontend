import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataFlowNotice from './DataFlowNotice.vue'

// Every template, as written, to find where it says data leaves the site.
const templates = import.meta.glob<string>('/src/**/*.vue', { query: '?raw', import: 'default', eager: true })

/** What says where data goes: a model's provider (to administrators and owners), files of personal data. */
const SAYS_WHERE_DATA_GOES = [
  'runtimeAdmin.offer.warning',
  'hosting.model.warning',
  'hosting.school.warning',
  'auditExport.privacy.title',
]

describe('DataFlowNotice', () => {
  it('is a note with a shield before its words, and a title above them where it has one', () => {
    const w = mount(DataFlowNotice, { props: { title: 'These files hold personal data' }, slots: { default: 'Keep them.' } })
    expect(w.attributes('role')).toBe('note')
    expect(w.find('svg.data-flow__icon').attributes('aria-hidden')).toBe('true')
    expect(w.find('.data-flow__title').text()).toBe('These files hold personal data')
    expect(w.find('.data-flow__body').text()).toBe('Keep them.')
    expect(w.find('.el-alert').exists()).toBe(false)
  })

  it('is how every page says where data leaves the site, never an alert of its own', () => {
    for (const key of SAYS_WHERE_DATA_GOES) {
      const uses = Object.entries(templates).filter(([, src]) => src.includes(`'${key}'`))
      expect(uses.length, key).toBeGreaterThan(0)
      for (const [file, src] of uses) {
        const at = src.indexOf(`'${key}'`)
        const open = src.lastIndexOf('<DataFlowNotice', at)
        const close = src.lastIndexOf('</DataFlowNotice>', at)
        expect(open > close && open > src.lastIndexOf('<el-alert', at), `${key} in ${file}`).toBe(true)
      }
    }
  })
})
