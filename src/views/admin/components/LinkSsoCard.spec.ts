import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { setLocale } from '@/i18n'
import type { Actor } from '@/api/types'
import LinkSsoCard from './LinkSsoCard.vue'
import { FakeSsoCore, SSO, executed, operatorProvider, refused, siteProvider } from '../sso/ssoFakes'
import { mountGlobal, settle } from '../runtime/testSetup'

// Linking a person at an identity provider: the providers set up are offered
// to choose from, and the account is asked for as the one chosen knows it.

vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const PERSON = {
  id: '01a0d79f-0000-70da-a7cc-00000000000b',
  kind: 'human',
  display_name: 'Chan Tai Man',
  email: 'chan@example.edu',
  status: 'active',
} as unknown as Actor
const LINK = /^\/v1\/actors\/([^/]+)\/sso$/

let core: FakeSsoCore
beforeEach(() => {
  setLocale('en')
  core = new FakeSsoCore([
    siteProvider({ id: 'lib-keycloak', display_name: 'Library', position: 5, status: 'disabled', enabled: false }),
    operatorProvider(),
    siteProvider(),
  ]).install()
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function card() {
  const { global } = await mountGlobal('/admin/actors/p1')
  const w = mount(LinkSsoCard, { props: { actor: PERSON }, global, attachTo: document.body })
  await settle()
  return w
}
const label = (w: ReturnType<typeof mount>, cls: string) =>
  w.find(cls).element.closest('.el-form-item')!.querySelector('.el-form-item__label')!.textContent

describe('linking a person at a provider', () => {
  it('offers the providers set up, the operator’s first, and asks for the account as the one chosen knows it', async () => {
    const w = await card()
    expect(core.to('GET', SSO.list)).toHaveLength(1)
    const options = Array.from(document.querySelectorAll('.el-select-dropdown__item'), (o) => o.textContent)
    expect(options).toEqual([
      'School NetIDschool-adfs',
      '大學統一認證university-sso',
      'Librarylib-keycloaknot offered now',
    ])
    // The operator's is chosen first; AD FS's upn is said as it always was.
    expect(w.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('school-adfs')
    expect(label(w, '.sso__subject')).toBe('Account (UPN)')
    core.once('POST', LINK, () => executed({ credential_id: 'cred-0' }))
    await w.find('.sso__subject input').setValue('chan@example.edu')
    await w.find('form').trigger('submit')
    await settle()
    expect(JSON.parse(core.to('POST', LINK)[0].body!)).toEqual({ provider: 'school-adfs', subject: 'chan@example.edu' })
    ;(w.vm as unknown as { chooseProvider: (v: string) => void }).chooseProvider('university-sso')
    await flushPromises()
    expect(label(w, '.sso__subject')).toBe('Account (sub)')
    expect(w.text()).toContain('What 大學統一認證 gives as its sub claim for this person.')

    core.once('POST', LINK, () => executed({ credential_id: 'cred-1' }))
    await w.find('.sso__subject input').setValue('20231234@example.edu')
    await w.find('form').trigger('submit')
    await settle()
    const post = core.to('POST', LINK)[1]
    expect(post.url).toBe(`/v1/actors/${PERSON.id}/sso`)
    expect(JSON.parse(post.body!)).toEqual({ provider: 'university-sso', subject: '20231234@example.edu' })
  })

  it('takes the provider’s id as typed where Core gives no list', async () => {
    core.once('GET', SSO.list, () => refused(404, 'not_found', 'no such route; GET /v1/tools lists what there is'))
    const w = await card()
    const input = w.find('input.el-input__inner')
    expect(w.find('.sso__provider').classes()).toContain('el-input')
    // Nothing is filled in for the provider, whose name only the installation knows.
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('placeholder')).toBe('e.g. school-adfs')
    expect(w.find('.sso__subject input').attributes('placeholder')).toBe('name@example.edu')
    expect(label(w, '.sso__subject')).toBe('Account (UPN)')
  })

  it('takes the provider’s id as typed where none is set up', async () => {
    core = new FakeSsoCore([]).install()
    const w = await card()
    expect(core.to('GET', SSO.list)).toHaveLength(1)
    expect(w.find('.sso__provider').classes()).toContain('el-input')
    const input = w.find('.sso__provider input')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('placeholder')).toBe('e.g. school-adfs')
  })
})
