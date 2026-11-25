import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { i18n, setLocale } from '@/i18n'
import TextView from './TextView.vue'

describe('TextView', () => {
  it('shows an empty CSV as an AppEmpty, not a browser-sized paragraph', () => {
    setLocale('en')
    const w = mount(TextView, {
      props: { text: '', kind: 'csv', name: 'empty.csv' },
      global: { plugins: [i18n] },
    })
    expect(w.get('.app-empty').text()).toBe('This file is empty.')
    expect(w.find('.text-view__empty').exists()).toBe(false)
  })
})
