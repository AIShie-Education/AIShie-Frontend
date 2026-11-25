import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { i18n, setLocale } from '@/i18n'
import InviteCard from './InviteCard.vue'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }))
  setActivePinia(createPinia())
  setLocale('en')
  vi.stubEnv('TZ', 'Asia/Hong_Kong')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  setLocale('en')
})

describe('InviteCard', () => {
  it('names the invitation cut-off’s time zone', () => {
    const w = mount(InviteCard, {
      props: {
        actor: {
          id: 'a-invited',
          kind: 'human',
          display_name: 'Invited Person',
          email: 'person@example.edu',
          status: 'active',
          has_password: false,
          has_sso: false,
          invite_expires_at: '2026-10-08T15:59:00Z',
        } as never,
      },
      global: { plugins: [i18n, ElementPlus], stubs: { InviteRevealDialog: true, RouterLink: true } },
    })
    expect(w.find('.invite__facts time').text()).toBe('2026-10-08 23:59 (Hong Kong Standard Time)')
    expect(w.find('.invite__facts time').attributes('tabindex')).toBe('0')
  })
})
