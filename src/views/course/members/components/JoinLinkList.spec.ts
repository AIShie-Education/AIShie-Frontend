import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import type { JoinLink } from '@/api/types'
import JoinLinkList from './JoinLinkList.vue'

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const link = (over: Partial<JoinLink>): JoinLink =>
  ({
    id: 'l-1',
    status: 'live',
    joinable: true,
    role: 'student',
    preset_id: 'p-1',
    created_by_member_id: 'm-1',
    created_by_name: 'Ada Instructor',
    created_at: '2026-09-28T09:58:00Z',
    expires_at: '2026-09-28T10:08:00Z',
    uses: 3,
    max_uses: 30,
    ...over,
  }) as JoinLink

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'))
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
  vi.unstubAllGlobals()
  setLocale('en')
})

async function mountList(links: JoinLink[], canRevoke = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/courses/:courseId/members', name: 'course-members', component: { render: () => null } }],
  })
  const w = mount(JoinLinkList, {
    props: { courseId: COURSE, links, canRevoke, currentId: 'l-1' },
    global: { plugins: [createPinia(), i18n, ElementPlus, router] },
  })
  mounted.push(w)
  await flushPromises()
  return w
}

describe('JoinLinkList', () => {
  it('shows a working link with the time it has left, who joined of how many, whom it lets in and who created it', async () => {
    const w = await mountList([link({ allowed_email_domains: ['hainanu.edu.cn'] })])
    const row = w.get('.join-link')
    expect(row.text()).toContain('Working')
    expect(row.text()).toContain('Shown above')
    expect(row.get('.join-link__clock').text()).toBe('08:00')
    expect(row.text()).toContain('3 of 30 joined')
    expect(row.text()).toContain('@hainanu.edu.cn')
    expect(row.text()).toContain('Ada Instructor')
    expect(row.text()).not.toContain('aisjoin_')
    const who = row.findAll('a').find((a) => a.text() === 'See who')!
    expect(who.attributes('href')).toBe(`/courses/${COURSE}/members?link=l-1`)

    vi.advanceTimersByTime(30_000)
    await flushPromises()
    expect(row.get('.join-link__clock').text()).toBe('07:30')
    w.unmount()
  })

  it('moves a link to the ended ones when its time is up, and offers no revoking of it', async () => {
    const w = await mountList([link({ uses: 0, max_uses: null })])
    expect(w.text()).toContain('0 joined')
    expect(w.findAll('button').some((b) => b.text() === 'Revoke')).toBe(true)
    vi.advanceTimersByTime(8 * 60_000)
    await flushPromises()
    expect(w.find('.join-link').exists()).toBe(false)
    expect(w.text()).toContain('No link works right now.')
    await w.get('.el-switch').trigger('click')
    await flushPromises()
    expect(w.get('.join-link').text()).toContain('Expired')
    expect(w.get('.join-link').text()).toContain('Ended')
    expect(w.findAll('button').some((b) => b.text() === 'Revoke')).toBe(false)
    w.unmount()
  })

  it('says each state, and why a link that has not ended lets nobody in', async () => {
    const w = await mountList([
      link({ id: 'a', status: 'revoked', revoked_at: '2026-09-28T09:59:00Z', revoked_by_name: 'Ben TA' }),
      link({ id: 'b', status: 'used_up', uses: 30 }),
      link({ id: 'c', joinable: false, reason: 'creator_lost_authority' }),
    ])
    await w.get('.el-switch').trigger('click')
    await flushPromises()
    const text = w.text()
    expect(text).toContain('Revoked')
    expect(text).toContain('Ben TA')
    expect(text).toContain('Used up')
    expect(text).toContain('Works for nobody: whoever created it can no longer add students')
    w.unmount()
  })

  it('asks the dialog to revoke a link, and offers no revoking where it may not', async () => {
    const l = link({})
    const w = await mountList([l])
    await w.findAll('button').find((b) => b.text() === 'Revoke')!.trigger('click')
    expect(w.emitted('revoke')).toEqual([[l]])
    w.unmount()
    const r = await mountList([l], false)
    expect(r.findAll('button').some((b) => b.text() === 'Revoke')).toBe(false)
    r.unmount()
  })

  it('is in Simplified Chinese too', async () => {
    setLocale('zh-Hans')
    const w = await mountList([link({})])
    expect(w.text()).toContain('剩余时间')
    expect(w.text()).toContain('已有 3 人加入（上限 30 人）')
    w.unmount()
  })
})
