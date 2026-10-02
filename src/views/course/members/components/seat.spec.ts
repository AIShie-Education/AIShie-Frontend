import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// What Core answers each read with, and what was asked.
let answer: (tool: string, args: Record<string, unknown>) => Promise<unknown>
let asked: { tool: string; args: Record<string, unknown> }[] = []
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: Record<string, unknown>) => {
      asked.push({ tool, args })
      return answer(tool, args)
    }),
  }
})

// Whether this Core has the lookup is kept for the page's life: each test is a new page.
async function page() {
  vi.resetModules()
  const { ApiError } = await import('@/api/http')
  const mod = await import('./seat')
  const err = (status: number, code: string, message = code) => new ApiError({ status, code, message })
  const refuse = (status: number, code: string, message = code) => Promise.reject(err(status, code, message))
  return { ...mod, err, refuse }
}

const COURSE = '01a0d79f-0000-70da-a7cc-f009b1efe423'
const ME = '01a0d79f-13c6-70da-a7cc-f009b1efe423'
const MEI = '01a0d79f-13c6-70da-a7cc-00000000000a'
// What a Core from before member.lookup_actor answers its route with.
const NO_ROUTE = 'no such route; GET /v1/tools lists what there is'
// What the tool answers when nobody has that email or id.
const NOBODY = 'nobody is registered with that email or id'

// The module and what it imports are loaded once, before the tests: the first
// load is most of a test's time (some 0.5 s of CPU, many times that on a busy
// machine), and each test's page() then evaluates them again from that.
beforeAll(() => page())

beforeEach(() => {
  asked = []
  answer = (tool) => Promise.reject(new Error(`no answer for ${tool}`))
})

describe('lacksLookup and foundNobody', () => {
  it('tell a Core without the tool from the tool finding nobody', async () => {
    const { lacksLookup, foundNobody, err } = await page()
    // A Core from before the tool: no route at all.
    expect(lacksLookup(err(404, 'not_found', NO_ROUTE))).toBe(true)
    expect(foundNobody(err(404, 'not_found', NO_ROUTE))).toBe(false)
    // Something in front of Core that knows no such route or method.
    expect(lacksLookup(err(404, 'unknown', 'HTTP 404'))).toBe(true)
    expect(lacksLookup(err(405, 'method_not_allowed'))).toBe(true)
    expect(lacksLookup(err(400, 'method_not_allowed'))).toBe(true)
    // The tool itself: nobody has that address or id.
    expect(lacksLookup(err(404, 'not_found', NOBODY))).toBe(false)
    expect(foundNobody(err(404, 'not_found', NOBODY))).toBe(true)
  })

  it('take nothing else for either', async () => {
    const { lacksLookup, foundNobody, err } = await page()
    for (const e of [
      err(400, 'invalid_argument', 'give one of email or actor_id'),
      err(401, 'unauthenticated'),
      err(403, 'forbidden'),
      err(500, 'internal'),
      err(0, 'network'),
      new Error('HTTP 404'),
      null,
      undefined,
    ]) {
      expect(lacksLookup(e)).toBe(false)
      expect(foundNobody(e)).toBe(false)
    }
  })
})

describe('wholeEmail', () => {
  it('takes a whole address, trimmed, in the case it was typed', async () => {
    const { wholeEmail } = await page()
    expect(wholeEmail('  Mei@Example.EDU ')).toBe('Mei@Example.EDU')
    expect(wholeEmail('pat+e2e@e2e.test')).toBe('pat+e2e@e2e.test')
    expect(wholeEmail('root@localhost')).toBe('root@localhost')
  })

  it('refuses a piece of one, or none', async () => {
    const { wholeEmail } = await page()
    expect(wholeEmail('mei@')).toBeNull()
    expect(wholeEmail('@example.edu')).toBeNull()
    expect(wholeEmail('example.edu')).toBeNull()
    expect(wholeEmail('Mei Chan')).toBeNull()
    expect(wholeEmail('mei chan@example.edu')).toBeNull()
    expect(wholeEmail('mei@example@edu')).toBeNull()
    expect(wholeEmail('   ')).toBeNull()
    expect(wholeEmail('')).toBeNull()
    expect(wholeEmail(null)).toBeNull()
    expect(wholeEmail(undefined)).toBeNull()
  })
})

describe('candidateFrom', () => {
  it('reads what the directory says as a lookup would, with no word on a seat', async () => {
    const { candidateFrom } = await page()
    expect(candidateFrom({ id: MEI, display_name: 'Mei Chan', kind: 'human', status: 'suspended' })).toEqual({
      actor_id: MEI,
      display_name: 'Mei Chan',
      kind: 'human',
      status: 'suspended',
    })
  })
  it('keeps whose agent it is, which member.add refuses to seat', async () => {
    const { candidateFrom, ownedBy } = await page()
    const c = candidateFrom({
      id: MEI,
      display_name: 'Helper',
      kind: 'agent',
      status: 'active',
      owner_actor_id: ME,
      owner_name: 'Yuki',
    })
    expect(c.owner_actor_id).toBe(ME)
    expect(ownedBy(c)).toBe('Yuki')
    expect(ownedBy({ owner_actor_id: ME })).toBe('')
    expect(ownedBy(candidateFrom({ id: MEI, display_name: 'Grader', kind: 'agent', status: 'active' }))).toBeNull()
    expect(ownedBy(null)).toBeNull()
  })
})

describe('explainRefusal', () => {
  it('explains the refusals that concern agents and their owners', async () => {
    const { explainRefusal, err } = await page()
    const says = (message: string) => explainRefusal(err(403, 'forbidden', message))
    for (const m of [
      'the agent belongs to someone: its owner brings it in, with member.add_delegate',
      "the delegate's principal holds grade_read at denied, so the delegate cannot hold it at autonomous",
      'a delegate reaches no further than its principal, whose scope is narrower than that',
      'a delegate lasts no longer than its principal, whose membership ends at 2026-12-01T00:00:00Z',
      'a delegate never holds member_manage',
      'not on the membership you are a delegate of',
    ]) {
      const out = says(m)
      expect(out, m).toBeTruthy()
      expect(out, m).not.toMatch(/^members\.refusal\./)
    }
    expect(
      says("the delegate's principal holds grade_read at denied, so the delegate cannot hold it at autonomous"),
    ).not.toContain('grade_read')
  })
})

describe('explainRefusal, above a seat’s ceiling', () => {
  it('says which permission, how far, why, and on whose seat a change to many stopped', async () => {
    const { explainRefusal } = await page()
    const { ApiError } = await import('@/api/http')
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useCourseStore } = await import('@/stores/course')
    const course = useCourseStore()
    course.members = new Map([['m-agent', { id: 'm-agent', display_name: 'Mei’s helper' } as never]])
    const details = { reason: 'student_agent_by_proposal', permission: 'submission_write', ceiling: 'confirm_required' }
    const one = new ApiError({ status: 403, code: 'forbidden', message: 'the agent of someone …', details })
    expect(explainRefusal(one)).toBe(
      'Write submissions can be at most “Needs approval” here, because the agent of someone who does not manage this course’s members does this only by proposal, as it goes beyond what the personal assistant preset gives.',
    )
    const bulk = new ApiError({
      status: 403,
      code: 'forbidden',
      message: '…',
      details: { ...details, member_id: 'm-agent' },
    })
    expect(explainRefusal(bulk)).toMatch(/ \(the seat of Mei’s helper\)$/)
  })
})

describe('lookupActor', () => {
  it('notes that the Core has the tool when it answers', async () => {
    const { lookupActor, hasLookup } = await page()
    const mei = { actor_id: MEI, display_name: 'Mei Chan', kind: 'human', status: 'active', member_id: null }
    answer = () => Promise.resolve(mei)
    expect(hasLookup.value).toBeNull()
    await expect(lookupActor({ course_id: COURSE, email: 'MEI@example.edu' })).resolves.toEqual(mei)
    expect(hasLookup.value).toBe(true)
    expect(asked).toEqual([{ tool: 'member.lookup_actor', args: { course_id: COURSE, email: 'MEI@example.edu' } }])
  })

  it('notes that it has the tool when it finds nobody, and still throws', async () => {
    const { lookupActor, hasLookup, refuse, foundNobody } = await page()
    answer = () => refuse(404, 'not_found', NOBODY)
    const e = await lookupActor({ course_id: COURSE, email: 'nobody@example.edu' }).catch((x: unknown) => x)
    expect(foundNobody(e)).toBe(true)
    expect(hasLookup.value).toBe(true)
  })

  it('notes that it has none when there is no such route, and still throws', async () => {
    const { lookupActor, hasLookup, refuse } = await page()
    answer = () => refuse(404, 'not_found', NO_ROUTE)
    await expect(lookupActor({ course_id: COURSE, actor_id: MEI })).rejects.toThrow(NO_ROUTE)
    expect(hasLookup.value).toBe(false)
  })

  it('leaves it unknown on a refusal or the network', async () => {
    const { lookupActor, hasLookup, refuse } = await page()
    answer = () => refuse(403, 'forbidden')
    await expect(lookupActor({ course_id: COURSE, actor_id: MEI })).rejects.toThrow()
    expect(hasLookup.value).toBeNull()
    answer = () => refuse(0, 'network')
    await expect(lookupActor({ course_id: COURSE, actor_id: MEI })).rejects.toThrow()
    expect(hasLookup.value).toBeNull()
  })
})

describe('probeLookup', () => {
  it('asks whom the caller themselves is, once, and nothing once the Core has said', async () => {
    const { probeLookup, hasLookup } = await page()
    answer = (_tool, args) =>
      Promise.resolve({ actor_id: args.actor_id, display_name: 'Sato', kind: 'human', status: 'active' })
    // Two at once share one question.
    await Promise.all([probeLookup(COURSE, ME), probeLookup(COURSE, ME)])
    expect(asked).toEqual([{ tool: 'member.lookup_actor', args: { course_id: COURSE, actor_id: ME } }])
    expect(hasLookup.value).toBe(true)
    await probeLookup(COURSE, ME)
    expect(asked).toHaveLength(1)
  })

  it('never fails, and notes a Core without the tool for good', async () => {
    const { probeLookup, hasLookup, refuse } = await page()
    answer = () => refuse(405, 'method_not_allowed')
    await expect(probeLookup(COURSE, ME)).resolves.toBeUndefined()
    expect(hasLookup.value).toBe(false)
    await probeLookup(COURSE, ME)
    expect(asked).toHaveLength(1)
  })

  it('asks again after an answer that said nothing about the tool', async () => {
    const { probeLookup, hasLookup, refuse } = await page()
    answer = () => refuse(0, 'network')
    await probeLookup(COURSE, ME)
    expect(hasLookup.value).toBeNull()
    answer = () => refuse(404, 'not_found', NOBODY)
    await probeLookup(COURSE, ME)
    expect(hasLookup.value).toBe(true)
    expect(asked).toHaveLength(2)
  })

  it('asks nothing without the caller’s own id', async () => {
    const { probeLookup, hasLookup } = await page()
    await probeLookup(COURSE, undefined)
    await probeLookup(COURSE, null)
    expect(asked).toEqual([])
    expect(hasLookup.value).toBeNull()
  })
})
