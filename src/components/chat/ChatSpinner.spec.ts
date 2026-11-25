import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ChatSpinner from './ChatSpinner.vue'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ChatSpinner', () => {
  it('stays still when reduced motion is requested, including a change while shown', async () => {
    vi.useFakeTimers()
    let reduced = false
    let changed: ((event: MediaQueryListEvent) => void) | undefined
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced,
      media: query,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => (changed = listener),
      removeEventListener: () => undefined,
    }))
    const w = mount(ChatSpinner)
    try {
      expect(w.text()).toBe('·')
      await vi.advanceTimersByTimeAsync(130)
      expect(w.text()).toBe('✢')

      reduced = true
      changed!({ matches: true } as MediaQueryListEvent)
      await nextTick()
      expect(w.text()).toBe('✻')
      await vi.advanceTimersByTimeAsync(1000)
      expect(w.text()).toBe('✻')
    } finally {
      w.unmount()
    }
  })
})
