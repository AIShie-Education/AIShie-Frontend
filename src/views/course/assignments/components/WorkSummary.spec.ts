import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { i18n, setLocale } from '@/i18n'
import WorkSummary from './WorkSummary.vue'

vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: vi.fn(async () => ({ submissions: [] })) }
})

describe('WorkSummary', () => {
  it('uses AppEmpty when the assignment has no work to summarise', async () => {
    setLocale('en')
    const w = mount(WorkSummary, {
      props: { courseId: 'c1', assignmentId: 'a1' },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    expect(w.get('.app-empty').text()).toBe('No work has been started yet.')
    expect(w.find('.work-summary__empty').exists()).toBe(false)
  })
})
