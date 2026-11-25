import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { ApiError } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import AsyncState from './AsyncState.vue'

enableAutoUnmount(afterEach)

describe('AsyncState', () => {
  it.each([
    ['en', 'This page or section is outside what your current seat may read.'],
    ['zh-Hant', '你目前的席位無法檢視這個頁面或區塊。'],
    ['zh-Hans', '你当前的席位无法查看这个页面或区块。'],
  ] as const)('keeps a forbidden page in the reader’s language (%s)', (locale, detail) => {
    setLocale(locale)
    const w = mount(AsyncState, {
      props: { error: new ApiError({ status: 403, code: 'forbidden', message: 'Core raw English refusal' }) },
      global: { plugins: [i18n, ElementPlus] },
    })
    expect(w.get('.app-result--forbidden').text()).toContain(detail)
    expect(w.text()).not.toContain('Core raw English refusal')
  })
})
