import { describe, expect, it } from 'vitest'
import type { ChatConversation, ChatMessage, ChatSnapshot } from '@/api/runtimeChat'
import { arMessageMeta, chatAgentView, chatConversationState, chatConversationView, chatMessageView, chatSnapshotView } from './arModel'

const conversation: ChatConversation = {
  id: 'c1',
  course_id: 'k1',
  agent_id: 'agt1',
  title: 'Chat',
  state: 'answering',
  revision: 1,
  created_at: '2026-11-27T00:00:00Z',
  updated_at: '2026-11-27T00:00:00Z',
  last_activity_at: '2026-11-27T00:00:00Z',
}
function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversation_id: 'c1',
    seq: 1,
    role: 'user',
    status: 'posted',
    body: 'Question',
    created_at: '2026-11-27T00:00:00Z',
    ...over,
  }
}

describe('AR chat view adapters', () => {
  it('treats failed as terminal, so no generation timer can continue', () => {
    expect(chatConversationState({ state: 'failed' })).toBe('answered')
    expect(chatConversationState({ state: 'answering' })).toBe('awaiting_answer')
  })

  it.each([
    ['own personal delegate', true, false, true],
    ['course-owned delegate', true, true, true],
    ['unowned course agent', false, true, false],
  ])('keeps %s’s explicit ownership and course-answer flags independent', (_, mine, answersCourse, expectedMine) => {
    const agent = chatAgentView({
      agent_id: 'agt1',
      display_name: 'Tutor',
      is_my_delegate: mine,
      answers_course: answersCourse,
      answer_level: 'autonomous',
    })
    expect(agent.is_my_delegate).toBe(expectedMine)
    expect(agent.answers_course).toBe(answersCourse)
    const view = chatConversationView(conversation, {
      agent_id: 'agt1',
      display_name: 'Tutor',
      is_my_delegate: mine,
      answers_course: answersCourse,
      answer_level: 'autonomous',
    })
    expect(view.respondent.is_delegate_of_opener).toBe(expectedMine)
  })

  it('treats a pending question as accepted for approval, not generating', () => {
    const snapshot: ChatSnapshot = { conversation, messages: [message({ status: 'pending' })], more: false, draft: null }
    expect(chatSnapshotView(snapshot).conversation.state).toBe('answered')
    expect(arMessageMeta(chatSnapshotView(snapshot).messages[0]!).status).toBe('pending')
  })

  it('never exposes a pending answer body or draft text as a posted answer', () => {
    const view = chatSnapshotView({ conversation, messages: [], more: false, draft: null }).conversation
    const pending = chatMessageView(
      message({ role: 'assistant', status: 'pending', body: 'not approved', sources: [{ document_id: 'd1', part: 2 }] }),
      view,
    )
    expect(pending.body).toBeNull()
    expect(arMessageMeta(pending).status).toBe('pending')
  })

  it('keeps AR sources as safe locations for lazy Core resolution, not as fake SourceView links', () => {
    const view = chatSnapshotView({ conversation, messages: [], more: false, draft: null }).conversation
    const source = { document_id: 'd1', version_id: 'v1', file_id: 'f1', slide: 3, part: 1 }
    const m = chatMessageView(message({ role: 'assistant', sources: [source], sources_stated: true }), view)
    expect(m.sources).toBeUndefined()
    expect(arMessageMeta(m).sources).toEqual([source])
    expect(arMessageMeta(m).sourcesStated).toBe(true)
  })
})
