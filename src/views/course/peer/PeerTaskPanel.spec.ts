import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus, { ElMessage, ElNotification } from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { i18n, setLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import PeerTaskPanel from './PeerTaskPanel.vue'

// What Core answers peer_form.get, and every write asked for.
let answer: unknown
let writes: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn(async (tool: string) => {
      if (tool !== 'peer_form.get') throw new Error(`no answer for ${tool}`)
      return answer
    }),
    write: vi.fn(async (tool: string, args: Record<string, unknown>) => {
      writes.push({ tool, args })
      return {
        status: 'executed',
        actionId: 'act-1',
        reviewState: 'none',
        result: { review_id: 'r1' },
        replayed: false,
      }
    }),
  }
})
vi.mock('element-plus', async (orig) => {
  const real = await orig<typeof import('element-plus')>()
  return { ...real, ElMessage: vi.fn(), ElNotification: vi.fn() }
})

const ME = 'm-yuki'
const FORM = {
  assignment_id: 'a1',
  enabled: true,
  kind: 'share',
  self_evaluation: false,
  opens: 'on_hand_in',
  closes_at: '2099-10-20T15:59:00Z',
  weight: 20,
  share_with_students: 'own_average',
  version: 1,
  visible_to: ['graders', 'action_record'],
  students_see: ['own_sheet', 'own_average', 'own_adjustment'],
  updated_at: '2026-10-05T00:00:00Z',
}
const TASK = {
  group_id: 'g1',
  group_name: 'Alpha',
  circle: [
    { member_id: 'm-ken', display_name: 'Ken Wong' },
    { member_id: 'm-mei', display_name: 'Mei Chan' },
    { member_id: ME, display_name: 'Yuki Tanaka' },
  ],
  to_evaluate: ['m-ken', 'm-mei'],
  window: { state: 'open', opens: 'on_hand_in', closes_at: '2099-10-20T15:59:00Z' },
}

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  writes = []
  answer = { form: FORM, task: TASK }
  vi.mocked(ElMessage).mockClear()
  vi.mocked(ElNotification).mockClear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

async function mountPanel(opts: { delegate?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const course = useCourseStore()
  course.permsSource = 'exact'
  course.perms = { submission_write: 'autonomous', document_read: 'autonomous' } as never
  course.membership = {
    member_id: ME,
    role: 'student',
    status: 'active',
    principal_member_id: opts.delegate ? 'm-owner' : null,
  } as never
  const w = mount(PeerTaskPanel, {
    props: { courseId: 'c1', assignment: { id: 'a1', group_set_id: 'set1', points_possible: 100 } as never },
    attachTo: document.body,
    global: { plugins: [pinia, i18n, ElementPlus], components: icons },
  })
  await flushPromises()
  return w
}
const share = (w: ReturnType<typeof mount>, id: string) => w.find(`input[data-test="peer-share-${id}"]`)

describe('PeerTaskPanel, a share form while it is open', () => {
  it('lists the others in the group, says who reads it, and adds the points up', async () => {
    const w = await mountPanel()
    const text = w.text()
    expect(text).toContain('Peer evaluation')
    expect(text).toContain('Open')
    expect(text).toContain(
      'Split 100 points among the other members of Alpha by how much each contributed to the work.',
    )
    expect(text).toContain('Only your teachers read your evaluation, with your name.')
    expect(text).toContain('It counts towards each member’s grade, at 20%.')
    expect(w.findAll('.peer-task__entry').map((e) => e.find('label').text())).toEqual(['Ken Wong', 'Mei Chan'])
    // Nobody evaluates themselves on this form, and nothing of anyone else's evaluation is on the page.
    expect(text).not.toContain('Yuki Tanaka')
    await share(w, 'm-ken').setValue('60')
    expect(w.find('[data-test="peer-total"]').text()).toContain('Total: 60 of 100')
    expect(w.find('[data-test="peer-total"]').text()).toContain('40 left to give')
    await share(w, 'm-mei').setValue('50')
    expect(w.find('[data-test="peer-total"]').text()).toContain('10 too many')
    await share(w, 'm-mei').setValue('40')
    expect(w.find('[data-test="peer-total"]').text()).toContain('Adds up to 100')
    w.unmount()
  })

  it('refuses to send a sheet that does not add up, saying why, and sends one that does', async () => {
    const w = await mountPanel()
    await share(w, 'm-ken').setValue('60')
    await share(w, 'm-mei').setValue('30')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toEqual([])
    expect(w.text()).toContain('The points add up to 90: they must add up to exactly 100.')
    await share(w, 'm-mei').setValue('40')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toEqual([
      {
        tool: 'peer_review.submit',
        args: {
          course_id: 'c1',
          assignment_id: 'a1',
          comment: undefined,
          entries: [
            { student_member_id: 'm-ken', share: 60 },
            { student_member_id: 'm-mei', share: 40 },
          ],
        },
      },
    ])
    w.unmount()
  })

  it('keeps what was typed when the page is read again, and starts from the sheet sent once one is', async () => {
    const w = await mountPanel()
    await share(w, 'm-ken').setValue('70')
    await (w.vm as unknown as { reload: () => Promise<void> }).reload()
    await flushPromises()
    expect((share(w, 'm-ken').element as HTMLInputElement).value).toBe('70')
    answer = {
      form: FORM,
      task: {
        ...TASK,
        sheet: {
          review_id: 'r-other-tab',
          rater_member_id: ME,
          group_id: 'g1',
          submitted_at: '2026-10-06T00:00:00Z',
          entries: [
            { student_member_id: 'm-ken', share: 55 },
            { student_member_id: 'm-mei', share: 45 },
          ],
        },
      },
    }
    await (w.vm as unknown as { reload: () => Promise<void> }).reload()
    await flushPromises()
    expect((share(w, 'm-ken').element as HTMLInputElement).value).toBe('55')
    w.unmount()
  })

  it('splits evenly at a press', async () => {
    const w = await mountPanel()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Split evenly')!
      .trigger('click')
    expect((share(w, 'm-ken').element as HTMLInputElement).value).toBe('50')
    expect((share(w, 'm-mei').element as HTMLInputElement).value).toBe('50')
    w.unmount()
  })

  it('is not written by an agent, the student’s own included', async () => {
    const w = await mountPanel({ delegate: true })
    expect(w.text()).toContain('only you write it, never an agent')
    expect(w.find('[data-test="peer-submit"]').exists()).toBe(false)
    expect(share(w, 'm-ken').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})

describe('PeerTaskPanel, once it has closed', () => {
  it('shows the sheet sent, read only, and their own average where the form shares it', async () => {
    answer = {
      form: { ...FORM, closes_at: '2026-10-01T00:00:00Z' },
      task: {
        ...TASK,
        window: { ...TASK.window, state: 'closed', closes_at: '2026-10-01T00:00:00Z' },
        sheet: {
          review_id: 'r1',
          rater_member_id: ME,
          group_id: 'g1',
          submitted_at: '2026-09-30T00:00:00Z',
          entries: [
            { student_member_id: 'm-ken', share: 60 },
            { student_member_id: 'm-mei', share: 40 },
          ],
        },
        own_average: { share_percent: 120 },
      },
    }
    const w = await mountPanel()
    expect(w.text()).toContain('Closed')
    expect(w.find('[data-test="peer-own-average"]').text()).toContain(
      'On average, your peers gave you 120% of an even share (100% is an even share).',
    )
    expect((share(w, 'm-ken').element as HTMLInputElement).value).toBe('60')
    expect(share(w, 'm-ken').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="peer-submit"]').exists()).toBe(false)
    w.unmount()
  })

  it('says the average is withheld where fewer than two peers rated them', async () => {
    answer = {
      form: { ...FORM, closes_at: '2026-10-01T00:00:00Z' },
      task: { ...TASK, window: { ...TASK.window, state: 'closed', closes_at: '2026-10-01T00:00:00Z' } },
    }
    const w = await mountPanel()
    expect(w.find('[data-test="peer-own-average"]').exists()).toBe(false)
    expect(w.text()).toContain('Your average is shown only where two or more peers rated you.')
    expect(w.text()).toContain('You did not submit an evaluation.')
    w.unmount()
  })
})

describe('PeerTaskPanel, a rating form with self-evaluation', () => {
  it('rates every member, the student last, on each criterion of the scale', async () => {
    answer = {
      form: {
        ...FORM,
        kind: 'rating',
        self_evaluation: true,
        criteria: [
          { key: 'contribution', label: 'Contribution', weight: 1 },
          { key: 'teamwork', label: 'Teamwork', description: 'Talks to the group', weight: 1 },
        ],
        scale_min: 1,
        scale_max: 5,
      },
      task: { ...TASK, to_evaluate: ['m-ken', 'm-mei', ME] },
    }
    const w = await mountPanel()
    expect(w.text()).toContain(
      'Rate each member of Alpha, yourself included, on each criterion, from 1 (lowest) to 5 (highest).',
    )
    expect(w.findAll('.peer-task__rated h3').map((h) => h.text())).toEqual(['Ken Wong', 'Mei Chan', 'Yuki Tanaka(you)'])
    expect(w.findAll('.peer-task__rated').at(0)!.findAll('.el-radio-button')).toHaveLength(10)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(writes).toEqual([])
    expect(w.text()).toContain('Rate Ken Wong on Contribution.')
    w.unmount()
  })
})

describe('PeerTaskPanel, a student in no group’s circle', () => {
  it('shows nothing', async () => {
    answer = { form: FORM }
    const w = await mountPanel()
    expect(w.find('[data-test="peer-task"]').exists()).toBe(false)
    w.unmount()
  })
})
