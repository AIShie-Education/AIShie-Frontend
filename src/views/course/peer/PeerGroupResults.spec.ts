import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import PeerGroupResults from './PeerGroupResults.vue'
import FairShareExplainer from './FairShareExplainer.vue'
import type { FormLike, PeerGroupResult } from './peer'

const FORM: FormLike = {
  kind: 'share',
  self_evaluation: false,
  opens: 'on_hand_in',
  closes_at: '2026-10-05T12:00:00Z',
  weight: 20,
  share_with_students: 'none',
  enabled: true,
}
const GROUP = {
  group_id: 'g1',
  name: 'Alpha',
  submission_id: 's1',
  window: { state: 'closed', opens: 'on_hand_in', closes_at: '2026-10-05T12:00:00Z' },
  group_score: 80,
  points_possible: 100,
  flags: [],
  members: [
    {
      member_id: 'm-ken',
      display_name: 'Ken Wong',
      submitted: true,
      submitted_at: '2026-10-05T11:00:00Z',
      rated_by: ['m-yuki', 'm-mei'],
      shares: [
        { rater_member_id: 'm-yuki', share: 60 },
        { rater_member_id: 'm-mei', share: 30 },
      ],
      factor: 0.9,
      score: 78.4,
      grade: { grade_id: 'gr-ken', score: 80, state: 'draft' },
      flags: ['uniform'],
    },
    {
      member_id: 'm-mei',
      display_name: 'Mei Chan',
      submitted: false,
      rated_by: ['m-yuki', 'm-ken'],
      shares: [
        { rater_member_id: 'm-yuki', share: 40 },
        { rater_member_id: 'm-ken', share: 50 },
      ],
      factor: 0.9,
      score: 78.4,
      grade: { grade_id: 'gr-mei', score: 75, state: 'posted', adjustment_kind: 'replace' },
      flags: ['missing'],
    },
    {
      member_id: 'm-yuki',
      display_name: 'Yuki Tanaka',
      submitted: true,
      submitted_at: '2026-10-05T11:30:00Z',
      rated_by: ['m-ken', 'm-mei'],
      shares: [
        { rater_member_id: 'm-ken', share: 50 },
        { rater_member_id: 'm-mei', share: 70 },
      ],
      factor: 1.2,
      score: 83.2,
      grade: { grade_id: 'gr-yuki', score: 83.2, state: 'posted', adjustment_kind: 'peer' },
      flags: ['high'],
    },
  ],
  sheets: [
    {
      review_id: 'r1',
      rater_member_id: 'm-yuki',
      rater_name: 'Yuki Tanaka',
      group_id: 'g1',
      comment: 'We worked well',
      submitted_at: '2026-10-05T11:30:00Z',
      entries: [
        { student_member_id: 'm-ken', share: 60, comment: 'Did the most' },
        { student_member_id: 'm-mei', share: 40 },
      ],
    },
  ],
} as unknown as PeerGroupResult

beforeEach(() => {
  setLocale('en')
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
})

function mountIt<T>(component: T, props: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', name: 'course-submission', component: { render: () => null } }],
  })
  return mount(component as never, {
    props: props as never,
    global: { plugins: [pinia, i18n, ElementPlus, router], components: icons },
  })
}
const member = (w: ReturnType<typeof mountIt>, id: string) => w.find(`[data-test="peer-member-${id}"]`)

describe('PeerGroupResults', () => {
  it('says each member’s factor in words, with the score it gives beside the group’s', () => {
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form: FORM, group: GROUP })
    expect(w.text()).toContain('Group score 80 of 100')
    const yuki = member(w, 'm-yuki').text()
    expect(yuki).toContain('120% of an even share, from 2 peers')
    expect(yuki).toContain('Score at 20%')
    expect(yuki).toContain('83.2')
    expect(yuki).toContain('3.2 above the group’s')
    expect(yuki).toContain('50 points from Ken Wong')
    expect(yuki).toContain('70 points from Mei Chan')
    expect(yuki).toContain('Moved by peer evaluation')
    expect(member(w, 'm-ken').text()).toContain('1.6 below the group’s')
    w.unmount()
  })

  it('marks who wrote nothing, Core’s flags, and that a grader’s own adjustment is left as it is', () => {
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form: FORM, group: GROUP })
    expect(w.text()).toContain('No evaluation yet from Mei Chan')
    const mei = member(w, 'm-mei').text()
    expect(mei).toContain('No evaluation')
    expect(mei).toContain('Not written')
    expect(mei).toContain('Your adjustment: peer evaluation leaves it as it is')
    expect(member(w, 'm-ken').text()).toContain('Rated everyone the same')
    expect(member(w, 'm-yuki').text()).toContain('High')
    w.unmount()
  })

  it('lists every evaluation written, with who wrote it and their comments', () => {
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form: FORM, group: GROUP })
    expect(w.text()).toContain('Evaluations written (1)')
    const sheets = w.find('.peer-sheets').text()
    expect(sheets).toContain('Yuki Tanaka')
    expect(sheets).toContain('Ken Wong: 60 points')
    expect(sheets).toContain('“Did the most”')
    expect(sheets).toContain('On the group’s work: “We worked well”')
    w.unmount()
  })

  it('says, with self-evaluation on, that a factor counts what the member gave themselves', () => {
    // As Core b5d6b43 answered: a share form at 50 %, a group of three graded
    // 80. Amy rated herself 50 and the others 25 each; Bo rated Amy 40, Cy 40
    // and himself 20; Cy wrote nothing.
    const form: FormLike = { ...FORM, self_evaluation: true, weight: 50 }
    const group = {
      ...GROUP,
      members: [
        {
          member_id: 'm-amy',
          display_name: 'Amy',
          submitted: true,
          submitted_at: '2026-10-05T11:00:00Z',
          rated_by: ['m-amy', 'm-bo'],
          shares: [{ rater_member_id: 'm-bo', share: 40 }],
          self: { student_member_id: 'm-amy', share: 50 },
          factor: '1.35',
          peer_factor: '1.2',
          self_factor: '1.5',
          score: '94',
          flags: ['high'],
        },
        {
          member_id: 'm-bo',
          display_name: 'Bo',
          submitted: true,
          submitted_at: '2026-10-05T11:10:00Z',
          rated_by: ['m-amy', 'm-bo'],
          shares: [{ rater_member_id: 'm-amy', share: 25 }],
          self: { student_member_id: 'm-bo', share: 20 },
          factor: '0.675',
          peer_factor: '0.75',
          self_factor: '0.6',
          score: '67',
          flags: ['low'],
        },
        {
          member_id: 'm-cy',
          display_name: 'Cy',
          submitted: false,
          rated_by: ['m-amy', 'm-bo'],
          shares: [
            { rater_member_id: 'm-amy', share: 25 },
            { rater_member_id: 'm-bo', share: 40 },
          ],
          factor: '0.975',
          peer_factor: '0.975',
          score: '79',
          flags: ['missing'],
        },
      ],
    } as unknown as PeerGroupResult
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form, group })
    const amy = member(w, 'm-amy').text()
    expect(amy).toContain('135% of an even share, from 1 peer and themselves')
    expect(amy).toContain('From their peers alone: 120% of an even share')
    expect(amy).toContain('50 points')
    expect(member(w, 'm-cy').text()).toContain('98% of an even share, from 2 peers')
    expect(member(w, 'm-cy').text()).not.toContain('and themselves')
    expect(member(w, 'm-cy').text()).not.toContain('From their peers alone')
    w.unmount()

    // Amy alone wrote one: herself 50, the others 25. Her factor is her own share alone.
    const alone = {
      ...group,
      members: [
        {
          member_id: 'm-amy',
          display_name: 'Amy',
          submitted: true,
          submitted_at: '2026-10-05T11:00:00Z',
          rated_by: ['m-amy'],
          self: { student_member_id: 'm-amy', share: 50 },
          factor: '1.5',
          self_factor: '1.5',
          score: '100',
          flags: ['high'],
        },
      ],
    } as unknown as PeerGroupResult
    const v = mountIt(PeerGroupResults, { courseId: 'c1', form, group: alone })
    const text = member(v, 'm-amy').text()
    expect(text).toContain('150% of an even share, from their own evaluation alone')
    expect(text).toContain('No peer has rated them')
    expect(text).not.toContain('Nobody has rated them')
    expect(text).toContain('Score at 50%')
    expect(text).toContain('20 above the group’s')
    v.unmount()
  })

  it('says nobody rated a member whom nobody, themselves included, rated', () => {
    const group = {
      ...GROUP,
      members: [{ ...GROUP.members![0], rated_by: [], shares: [], factor: 1, score: 80, flags: [] }],
    } as unknown as PeerGroupResult
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form: FORM, group })
    expect(member(w, 'm-ken').text()).toContain('Nobody has rated them')
    w.unmount()
  })

  it('shows no score on a form for reference only, and the score at its weight on one switched off', () => {
    const reference = mountIt(PeerGroupResults, { courseId: 'c1', form: { ...FORM, weight: 0 }, group: GROUP })
    const ken = member(reference, 'm-ken').text()
    expect(ken).not.toContain('Score')
    expect(ken).not.toContain('the group’s score')
    expect(ken).toContain('90% of an even share, from 2 peers')
    reference.unmount()
    const off = mountIt(PeerGroupResults, { courseId: 'c1', form: { ...FORM, enabled: false }, group: GROUP })
    expect(member(off, 'm-ken').text()).toContain('Score at 20% if it counted')
    expect(member(off, 'm-ken').text()).toContain('1.6 below the group’s')
    off.unmount()
  })

  it('says a pair without self-evaluation is never moved', () => {
    const pair = { ...GROUP, flags: ['pair_without_self_evaluation'] } as PeerGroupResult
    const w = mountIt(PeerGroupResults, { courseId: 'c1', form: FORM, group: pair })
    expect(w.text()).toContain('peer evaluation cannot move their scores')
    w.unmount()
  })
})

describe('FairShareExplainer', () => {
  it('explains the factor and the weight in plain words, with the group’s own figures', () => {
    const w = mountIt(FairShareExplainer, { form: FORM, groupScore: 80, points: 100 })
    const text = w.text()
    expect(text).toContain('1 is an even share, 1.2 is 20% more than even, 0.8 is 20% less.')
    expect(text).toContain('Counted at 20%')
    expect(text).toContain('With the group at 80, a factor of 1.2 gives 83.2, and 0.8 gives 76.8.')
    expect(text).toContain('your adjustment wins')
    expect(text).toContain('Received less than 80% of an even share.')
    w.unmount()
  })

  it('says a weight of 0 is for reference only', () => {
    const w = mountIt(FairShareExplainer, { form: { ...FORM, weight: 0 } })
    expect(w.text()).toContain('With a weight of 0 it is for reference only: no score changes.')
    w.unmount()
  })
})
