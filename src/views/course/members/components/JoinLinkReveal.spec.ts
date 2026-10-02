import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { i18n, setLocale } from '@/i18n'
import JoinLinkReveal from './JoinLinkReveal.vue'
import JoinLinkFullscreen from './JoinLinkFullscreen.vue'

const download = vi.fn(async () => undefined)
vi.mock('@/utils/qr', async (orig) => ({
  ...(await orig<typeof import('@/utils/qr')>()),
  downloadQrPng: (...a: unknown[]) => download(...(a as [])),
}))

const URL_ = 'https://lms.example.edu/join/aisjoin_abcdefghijkl_secret'
const props = {
  url: URL_,
  expiresAt: '2026-09-28T10:10:00Z',
  code: 'CS101',
  section: 'A',
  title: 'Introduction to Programming',
  maxUses: 40,
  domains: ['campus.example.edu'],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
  download.mockClear()
})
const mounted: { unmount: () => void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) {
    try {
      w.unmount()
    } catch {
      /* unmounted by the test already */
    }
  }
  vi.useRealTimers()
  setLocale('en')
  document.body.innerHTML = ''
})

function mountReveal(over: Record<string, unknown> = {}) {
  const w = mount(JoinLinkReveal, {
    props: { ...props, ...over },
    attachTo: document.body,
    global: { plugins: [createPinia(), i18n, ElementPlus] },
  })
  mounted.push(w)
  return w
}

describe('JoinLinkReveal', () => {
  it('shows the link, its QR code and the ten minutes it has left, counting down', async () => {
    const w = mountReveal()
    expect((w.get('.join-reveal__url input').element as HTMLInputElement).value).toBe(URL_)
    expect(w.get('svg.qr-code').attributes('aria-label')).toBe('QR code of the invite link to CS101 · A')
    expect(w.get('.join-reveal__clock').text()).toBe('10:00')
    expect(w.get('[role="timer"]').attributes('aria-label')).toBe('10 min 0 s left')
    expect(w.text()).toContain('Up to 40 people')
    expect(w.text()).toContain('@campus.example.edu')

    vi.advanceTimersByTime(61_000)
    await flushPromises()
    expect(w.get('.join-reveal__clock').text()).toBe('08:59')
    w.unmount()
  })

  it('copies the link, saves the QR code as a PNG named for the course, and asks for full screen', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const w = mountReveal()
    await w.findAll('button').find((b) => b.text() === 'Copy')!.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(URL_)
    expect(w.text()).toContain('Copied')

    await w.findAll('button').find((b) => b.text() === 'Download QR (PNG)')!.trigger('click')
    await flushPromises()
    expect(download).toHaveBeenCalledWith(URL_, 'CS101-A-invite-qr.png')

    await w.findAll('button').find((b) => b.text() === 'Show full screen')!.trigger('click')
    expect(w.emitted('fullscreen')).toHaveLength(1)
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('says the link has expired when its time is up, and offers a new one', async () => {
    const w = mountReveal()
    vi.advanceTimersByTime(600_000)
    await flushPromises()
    expect(w.find('.join-reveal__clock').exists()).toBe(false)
    expect(w.text()).toContain('This link has expired')
    expect(w.text()).toContain('Nobody can join through it any more.')
    const buttons = () => w.findAll('button')
    expect(buttons().find((b) => b.text() === 'Copy')!.attributes('disabled')).toBeDefined()
    expect(buttons().find((b) => b.text() === 'Show full screen')!.attributes('disabled')).toBeDefined()
    await buttons().find((b) => b.text() === 'Create a new link')!.trigger('click')
    expect(w.emitted('renew')).toHaveLength(1)
    w.unmount()
  })

  it('is in Traditional Chinese, 二維碼 and all', async () => {
    setLocale('zh-Hant')
    const w = mountReveal()
    expect(w.text()).toContain('剩餘時間')
    expect(w.text()).toContain('下載二維碼（PNG）')
    expect(w.text()).toContain('全螢幕顯示')
    w.unmount()
  })

  it('says in words, in the page’s language, that the QR code could not be saved, not what the browser said', async () => {
    setLocale('zh-Hant')
    download.mockRejectedValueOnce(new Error('the image could not be made'))
    const w = mountReveal()
    await w.findAll('button').find((b) => b.text() === '下載二維碼（PNG）')!.trigger('click')
    await flushPromises()
    const shown = document.body.querySelector('.el-message')!.textContent
    expect(shown).toContain('這個瀏覽器無法把二維碼存成圖片')
    expect(shown).not.toContain('the image could not be made')
    w.unmount()
  })
})

describe('JoinLinkFullscreen', () => {
  it('puts the course, a large QR code and the countdown over the whole page, and Escape takes it down', async () => {
    const w = mount(JoinLinkFullscreen, {
      props: { url: URL_, expiresAt: props.expiresAt, code: 'CS101', section: 'A', title: props.title },
      attachTo: document.body,
      global: { plugins: [createPinia(), i18n, ElementPlus] },
    })
    mounted.push(w)
    await flushPromises()
    const page = document.body.querySelector('.join-fs')!
    expect(page.getAttribute('role')).toBe('dialog')
    expect(page.textContent).toContain('CS101 · A')
    expect(page.textContent).toContain('Introduction to Programming')
    expect(page.textContent).toContain('Scan to join')
    expect(page.querySelector('.join-fs__clock')!.textContent).toContain('10:00')
    expect(Number(page.querySelector('svg.qr-code')!.getAttribute('width'))).toBeGreaterThanOrEqual(160)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('says the link has expired when its time is up, and puts up a new one on request', async () => {
    const w = mount(JoinLinkFullscreen, {
      props: { url: URL_, expiresAt: props.expiresAt, code: 'CS101' },
      attachTo: document.body,
      global: { plugins: [createPinia(), i18n, ElementPlus] },
    })
    mounted.push(w)
    vi.advanceTimersByTime(600_000)
    await flushPromises()
    const page = document.body.querySelector('.join-fs')!
    expect(page.textContent).toContain('This link has expired')
    const renew = [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Create a new link'))!
    renew.click()
    expect(w.emitted('renew')).toHaveLength(1)
    w.unmount()
  })
})
