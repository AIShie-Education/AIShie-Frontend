import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import { setLocale } from '@/i18n'
import { errorMessage } from './useErrors'

const refusal = (code: string, details: Record<string, unknown>, over: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status: 403, code, message: 'core’s own words', details, ...over })

beforeEach(() => setLocale('en'))

describe('errorMessage, by the reason Core gives', () => {
  it('says what a department administrator reached beyond, recorded denial or not', () => {
    const denied = refusal('forbidden', { reason: 'department_out_of_scope' }, { actionId: 'a1', actionStatus: 'denied' })
    expect(errorMessage(denied)).toBe('That is outside the departments you administer.')
    expect(errorMessage(refusal('forbidden', { reason: 'destination_out_of_scope' }))).toBe(
      'It can go only to a department you administer; the top of the tree is a platform administrator’s.',
    )
  })

  it('explains the tree’s own rules, with the limit Core names', () => {
    expect(errorMessage(refusal('conflict', { reason: 'name_taken' }, { status: 409 }))).toBe(
      'Another department there already has that name.',
    )
    expect(errorMessage(refusal('failed_precondition', { reason: 'cycle' }, { status: 422 }))).toBe(
      'A department cannot go under itself, or under a department beneath it.',
    )
    expect(errorMessage(refusal('failed_precondition', { reason: 'too_deep', max_depth: 8 }, { status: 422 }))).toBe(
      'That would nest departments more than 8 levels deep.',
    )
  })

  it('says in plain words why an invitation may not be made', () => {
    const why = (w: string) => errorMessage(refusal('forbidden', { reason: 'invite_not_allowed', why: w }))
    expect(why('signed_in')).toMatch(/signed in before/)
    expect(why('seated_elsewhere')).toMatch(/outside the departments you administer/)
    expect(why('owns_agents')).toMatch(/own agents/)
    expect(why('administers')).toMatch(/administer a department themselves/)
    expect(why('platform_role')).toMatch(/platform administrator/)
    expect(why('not_a_person')).toMatch(/agent/)
    // A reason this app does not know yet still gets the rule in general.
    expect(why('something_new')).toMatch(/^You can invite someone again only while/)
    expect(errorMessage(refusal('forbidden', { reason: 'invite_not_allowed' }))).toMatch(/^You can invite someone again/)
  })

  it('in Traditional Chinese too', () => {
    setLocale('zh-Hant')
    expect(errorMessage(refusal('forbidden', { reason: 'department_out_of_scope' }))).toBe('這不在你所管理的部門範圍內。')
    expect(errorMessage(refusal('failed_precondition', { reason: 'too_deep', max_depth: 8 }))).toBe('這會令部門超過 8 層。')
  })

  it('in Simplified Chinese too', () => {
    setLocale('zh-Hans')
    expect(errorMessage(refusal('forbidden', { reason: 'department_out_of_scope' }))).toBe('这不在你所管理的部门范围内。')
    expect(errorMessage(refusal('forbidden', { reason: 'invite_not_allowed', why: 'seated_elsewhere' }))).toMatch(/以外的课程有席位/)
  })

  it('says of a question to an agent operated from outside what every page says of such an agent', () => {
    const e = refusal(
      'failed_precondition',
      { reason: 'agent_answers_elsewhere' },
      { status: 422, actionId: 'a1', actionStatus: 'failed' },
    )
    expect(errorMessage(e)).toBe(
      'This agent is operated from an external tool (such as Claude through MCP); it does not take conversations on the site.',
    )
    setLocale('zh-Hant')
    expect(errorMessage(e)).toBe('這個代理是從外部工具操作的（例如 Claude 透過 MCP），不在站內對話。')
    setLocale('zh-Hans')
    expect(errorMessage(e)).toBe('这个智能体是从外部工具操作的（例如 Claude 通过 MCP），不在站内对话。')
  })

  it('never takes a reason for one of an object’s own properties', () => {
    expect(errorMessage(refusal('conflict', { reason: 'constructor' }, { status: 409 }))).toMatch(/^This conflicts/)
    expect(errorMessage(refusal('conflict', { reason: 'to_string' }, { status: 409 }))).toMatch(/^This conflicts/)
  })

  it('leaves a reason it has no words for to the usual text', () => {
    const denied = refusal('forbidden', { reason: 'permission_denied' }, { actionId: 'a1', actionStatus: 'denied' })
    expect(errorMessage(denied)).toBe('You are not permitted to do this here.')
    expect(errorMessage(refusal('conflict', {}, { status: 409 }))).toBe('This conflicts with the current state: core’s own words')
    expect(errorMessage(refusal('conflict', { reason: '../../x' }, { status: 409 }))).toMatch(/^This conflicts/)
  })
})
