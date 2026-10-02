import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import { setLocale } from '@/i18n'
import { errorMessage } from './useErrors'

const refusal = (code: string, details: Record<string, unknown>, over: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status: 403, code, message: 'core’s own words', details, ...over })

beforeEach(() => setLocale('en'))

describe('errorMessage, of a level above what a seat may hold', () => {
  it('names the permission, how far it may go, and why, in the reader’s words', () => {
    const e = refusal(
      'forbidden',
      { reason: 'agent_decides_by_proposal', permission: 'action_decide', ceiling: 'confirm_required' },
      { actionId: 'a1', actionStatus: 'failed' },
    )
    expect(errorMessage(e)).toBe(
      'Approve & review can be at most “Needs approval” here, because an agent decides and reviews only by proposal, which a person then confirms.',
    )
    setLocale('zh-Hans')
    expect(errorMessage(e)).toBe('批准与审核在这里最多只能是“需审批”，因为智能体只能以提议的方式作出决定与审核，并须由人确认。')
  })
  it('leaves a ceiling’s code without its permission to Core’s own words', () => {
    expect(errorMessage(refusal('forbidden', { reason: 'principal_level' }))).toContain('core’s own words')
  })
})

describe('errorMessage, to an agent’s owner who could not have done it themselves', () => {
  it('says so, and that someone else decides', () => {
    const e = refusal('forbidden', { reason: 'owner_not_autonomous' }, { actionId: 'a1', actionStatus: 'failed' })
    expect(errorMessage(e)).toBe(
      'You decide what your agent did only where you could have done it yourself without anyone’s confirmation. Here your own level for it is lower, or it is beyond your reach, so someone else in the course decides it.',
    )
    setLocale('zh-Hant')
    expect(errorMessage(e)).toMatch(/^你的代理所做的事，只有在你自己無需任何人確認也能做時，才由你決定。/)
  })
})

describe('errorMessage, to an agent’s owner whose approval would be refused', () => {
  const base =
    'This proposal of your agent’s is not yours to decide now: approved now, it would be refused. You may withdraw it, or someone else in the course rejects it.'
  it('says so, with the refusal approving would meet, in each language', () => {
    // action.decide by the owner, of a proposal to publish a document they published meanwhile.
    const e = refusal(
      'forbidden',
      {
        reason: 'owner_would_be_refused',
        refusal: { code: 'conflict', message: 'the document is published already' },
      },
      { actionId: 'a1', actionStatus: 'failed' },
    )
    expect(errorMessage(e)).toBe(
      `${base} Why it would be refused: This conflicts with the current state: the document is published already`,
    )
    setLocale('zh-Hant')
    expect(errorMessage(e)).toBe(
      '你的代理的這項提案現在不由你決定：若現在批准，它會被拒絕。你可以撤回它，或由課程中的其他人駁回。被拒絕的原因：與目前狀態衝突: the document is published already',
    )
    setLocale('zh-Hans')
    expect(errorMessage(e)).toBe(
      '你的智能体的这项提议现在不由你决定：若现在批准，它会被拒绝。你可以撤回它，或由课程中的其他人拒绝。被拒绝的原因：与当前状态冲突: the document is published already',
    )
  })
  it('puts the refusal in the app’s own words where it has them', () => {
    const e = refusal('forbidden', {
      reason: 'owner_would_be_refused',
      refusal: { code: 'forbidden', message: 'only the two taking part mark it read', details: { reason: 'not_a_participant' } },
    })
    expect(errorMessage(e)).toBe(
      `${base} Why it would be refused: Only the two taking part in a conversation mark it read: reading it as course staff keeps no place in it.`,
    )
  })
  it('says so alone when Core gives no refusal', () => {
    expect(errorMessage(refusal('forbidden', { reason: 'owner_would_be_refused' }))).toBe(base)
    expect(errorMessage(refusal('forbidden', { reason: 'owner_would_be_refused', refusal: 'approved now, refused' }))).toBe(base)
  })
  it('says a refusal that is itself owner_would_be_refused as the base alone', () => {
    const e = refusal('forbidden', {
      reason: 'owner_would_be_refused',
      refusal: { code: 'forbidden', message: 'approved now, it would be refused', details: { reason: 'owner_would_be_refused' } },
    })
    expect(errorMessage(e)).toBe(base)
  })
  it('gives a bare forbidden in Core’s words alone, not as a permission the owner lacks', () => {
    // An approval refused by a rule of Core's that the app has no words for.
    const e = refusal('forbidden', {
      reason: 'owner_would_be_refused',
      refusal: { code: 'forbidden', message: 'an escalation is for someone else to look at' },
    })
    expect(errorMessage(e)).toBe(`${base} Why it would be refused: an escalation is for someone else to look at`)
    expect(errorMessage(refusal('forbidden', { reason: 'owner_would_be_refused', refusal: { code: 'forbidden', message: '' } }))).toBe(
      base,
    )
  })
})

describe('errorMessage, of conversations, which are with agents', () => {
  it('says a person is never asked, and answers none, in each language', () => {
    // conversation.open with a person as respondent, or conversation.answer by a person.
    const e = refusal(
      'forbidden',
      { reason: 'conversations_are_with_agents' },
      { actionId: 'a1', actionStatus: 'failed' },
    )
    expect(errorMessage(e)).toBe(
      'Conversations here are with agents: a person is never asked in one, and answers none. People talk to each other elsewhere.',
    )
    setLocale('zh-Hant')
    expect(errorMessage(e)).toBe(
      '這裡的對話只與代理進行：真人不會在對話中被提問，也不回答任何對話。人與人之間請在其他地方交流。',
    )
    setLocale('zh-Hans')
    expect(errorMessage(e)).toBe(
      '这里的对话只与智能体进行：真人不会在对话中被提问，也不回答任何对话。人与人之间请在其他地方交流。',
    )
  })
  it('says why a person’s seat cannot be given conversation_answer, as a ceiling', () => {
    const e = refusal(
      'forbidden',
      { reason: 'conversations_are_with_agents', permission: 'conversation_answer', ceiling: 'denied' },
      { actionId: 'a1', actionStatus: 'failed' },
    )
    expect(errorMessage(e)).toBe(
      'Answer questions cannot be given here at all, because conversations are with agents, and a person answers none of them.',
    )
  })
  it('says only the two taking part mark a conversation read, in each language', () => {
    const e = refusal('forbidden', { reason: 'not_a_participant' }, { actionId: 'a1', actionStatus: 'failed' })
    expect(errorMessage(e)).toBe(
      'Only the two taking part in a conversation mark it read: reading it as course staff keeps no place in it.',
    )
    setLocale('zh-Hant')
    expect(errorMessage(e)).toBe('只有參與對話的雙方才會將對話標示為已讀；以課程教職員身分閱讀，不會在對話中留下閱讀進度。')
    setLocale('zh-Hans')
    expect(errorMessage(e)).toBe('只有参与对话的双方才会将对话标记为已读；以课程教职员身份阅读，不会在对话中留下阅读进度。')
  })
})

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

  it('says of a question to an agent nobody asks in the site now why, in the words every page has', () => {
    const refused = (reason: string) =>
      refusal('failed_precondition', { reason }, { status: 422, actionId: 'a1', actionStatus: 'failed' })
    expect(errorMessage(refused('mcp_agent'))).toBe(
      'This agent is used from its owner’s own tools, and can’t be asked here.',
    )
    expect(errorMessage(refused('agent_not_hosted'))).toBe(
      'This agent isn’t running right now, so it can’t be asked here.',
    )
    setLocale('zh-Hant')
    expect(errorMessage(refused('mcp_agent'))).toBe('這個代理由擁有者自己的工具使用，無法在這裡向它提問。')
    expect(errorMessage(refused('agent_not_hosted'))).toBe('這個代理目前未在執行，所以無法在這裡向它提問。')
    setLocale('zh-Hans')
    expect(errorMessage(refused('mcp_agent'))).toBe('这个智能体由所有者自己的工具使用，无法在这里向它提问。')
    expect(errorMessage(refused('agent_not_hosted'))).toBe('这个智能体目前未在运行，所以无法在这里向它提问。')
  })

  it('says why an agent’s hosting refuses what was asked of it', () => {
    expect(errorMessage(refusal('forbidden', { reason: 'hosted_by_runtime' }, { status: 403 }))).toBe(
      'This agent is hosted on AIshie: the site’s agent runtime alone holds its token, and none is issued to anyone else.',
    )
    expect(errorMessage(refusal('failed_precondition', { reason: 'hosting_fixed' }, { status: 422 }))).toBe(
      'How an agent runs is chosen when it is created, and never changed: create another agent for the other way.',
    )
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

describe('errorMessage, with words of the page’s own for a reason', () => {
  it('asks the page’s scopes first, then everything else', () => {
    const e = refusal('failed_precondition', { reason: 'no_total' }, { actionId: 'a1', actionStatus: 'failed' })
    expect(errorMessage(e, { reasons: 'grades.override.refusal' })).toMatch(/^No total has been written here/)
    // Without the scope, Core's own words after the lead.
    expect(errorMessage(e)).toContain('core’s own words')
  })
  it('looks through the scopes in order', () => {
    const e = refusal('failed_precondition', { reason: 'delegate_seat' }, { actionId: 'a1', actionStatus: 'failed' })
    expect(errorMessage(e, { reasons: ['grades.override.refusal', 'members.refusal.reason'] })).toMatch(
      /^This seat is an agent’s, seated as someone’s delegate/,
    )
  })
})
