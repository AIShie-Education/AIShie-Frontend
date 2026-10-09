import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import PeerFormDialog from './PeerFormDialog.vue'
import type { PeerFormView } from './peer'

let writes: { tool: string; args: Record<string, unknown> }[] = []
let answer: unknown
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      if (answer instanceof real.ApiError) throw answer
      return answer
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const FORM: PeerFormView = {
  assignment_id: 'a1',
  enabled: true,
  kind: 'rating',
  criteria: [{ key: 'contribution', label: 'Contribution', weight: 1 }],
  scale_min: 1,
  scale_max: 5,
  self_evaluation: false,
  opens: 'on_hand_in',
  closes_at: '2099-10-20T15:59:00Z',
  weight: 20,
  share_with_students: 'none',
  version: 4,
  in_use: true,
  visible_to: ['graders', 'action_record'],
  students_see: ['own_sheet', 'own_adjustment'],
  updated_at: '2026-10-05T00:00:00Z',
}

beforeEach(() => {
  setLocale('en')
  writes = []
  answer = { status: 'executed', actionId: 'act-1', reviewState: 'none', result: {}, replayed: false }
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountDialog(form: PeerFormView | null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { assignment_write: 'autonomous' } as never
  const w = mount(PeerFormDialog, {
    props: { courseId: 'c1', assignmentId: 'a1', dueAt: '2099-10-13T15:59:00Z', form, visible: true },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return w
}
const dialog = () => document.querySelector('.peer-form') as HTMLElement
const button = (label: string) =>
  [...dialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement

describe('PeerFormDialog, a new form', () => {
  it('starts as 100 points split, for reference only, and says who sees what', async () => {
    const w = await mountDialog(null)
    const text = dialog().textContent ?? ''
    expect(text).toContain('Set up peer evaluation')
    expect(text).toContain('Who sees what')
    expect(text).toContain('Those who grade read every evaluation, with who wrote it and their comments.')
    expect(text).toContain('Each student reads their own evaluation')
    expect(text).not.toContain('Once it closes, each student sees the average')
    button('Save').click()
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0].tool).toBe('peer_form.set')
    expect(writes[0].args).toMatchObject({
      course_id: 'c1',
      assignment_id: 'a1',
      kind: 'share',
      opens: 'on_hand_in',
      weight: 0,
      self_evaluation: false,
      share_with_students: 'none',
      enabled: true,
      version: 0,
    })
    expect(writes[0].args.criteria).toBeUndefined()
    expect(w.emitted('saved')?.[0]?.[0]).toEqual({ status: 'executed' })
    w.unmount()
  })

  it('offers starter criteria for a rating form', async () => {
    const w = await mountDialog(null)
    const rating = [...dialog().querySelectorAll('input[type=radio]')].find(
      (r) => (r as HTMLInputElement).value === 'rating',
    ) as HTMLInputElement
    rating.click()
    await flushPromises()
    const labels = [...dialog().querySelectorAll('.peer-form__criterion input')].map(
      (i) => (i as HTMLInputElement).value,
    )
    expect(labels).toContain('Contribution to the work')
    expect(labels).toContain('Communication and teamwork')
    w.unmount()
  })
})

describe('PeerFormDialog, a form in use', () => {
  it('keeps what is evaluated fixed, and sends a change of weight over the version read', async () => {
    const w = await mountDialog(FORM)
    const text = dialog().textContent ?? ''
    expect(text).toContain('Evaluations have been written, so what is evaluated')
    const kinds = [...dialog().querySelectorAll('.peer-form__kinds input[type=radio]')] as HTMLInputElement[]
    expect(kinds.every((k) => k.disabled)).toBe(true)
    button('Save').click()
    await flushPromises()
    expect(writes[0].args).toMatchObject({ kind: 'rating', version: 4, weight: 20, scale_min: 1, scale_max: 5 })
    expect(writes[0].args.criteria).toEqual([{ key: 'contribution', label: 'Contribution', weight: '1' }])
    w.unmount()
  })

  it('reads the form again where it was changed elsewhere, keeping what was typed', async () => {
    const { ApiError } = await import('@/api/http')
    answer = new ApiError({
      status: 409,
      code: 'conflict',
      message: 'the peer form has changed since you read it',
      details: { reason: 'version_mismatch', current_version: 5 },
    })
    const w = await mountDialog(FORM)
    button('Save').click()
    await flushPromises()
    expect(w.emitted('stale')).toHaveLength(1)
    expect(dialog().textContent).toContain('Someone changed the peer evaluation since you opened it.')
    w.unmount()
  })
})
