import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import type { ConversationMessage, MyConversation } from '@/api/types'
import type { LegacyMessagePage } from '@/api/legacyConversation'

const transport = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: transport.read, write: transport.write }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { default: LegacyConversationView } = await import('./LegacyConversationView.vue')

function conversation(id = 'core-old-1', over: Partial<MyConversation> = {}): MyConversation {
  return {
    conversation_id: id,
    member_id: 'member-ada',
    course: { course_id: 'course-1', code: 'CS101', section: 'A', title: 'Old course' },
    respondent: {
      member_id: 'member-tutor',
      actor_id: 'actor-tutor',
      display_name: 'Old tutor',
      kind: 'agent',
    },
    title: 'Question from v0.2.1',
    status: 'open',
    state: 'awaiting_answer',
    created_at: '2026-09-01T09:00:00Z',
    last_activity_at: '2026-09-01T10:00:00Z',
    unread: true,
    // Even where Core says the course could accept a question, this archive
    // deliberately exposes no way to use that permission.
    may_ask: true,
    ...over,
  }
}

const detail = {
  id: 'core-old-1',
  created_at: '2026-09-01T09:00:00Z',
  opener: { member_id: 'member-ada', display_name: 'Ada', kind: 'human' },
  respondent: {
    actor_id: 'actor-tutor',
    member_id: 'member-tutor',
    display_name: 'Old tutor',
    kind: 'agent',
    answer_level: 'autonomous',
    is_delegate_of_opener: false,
    role: 'assistant',
    seat_status: 'active',
  },
  state: 'awaiting_answer',
  status: 'open',
  title: 'Question from v0.2.1',
} satisfies LegacyMessagePage['conversation']

function message(id: string, seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id,
    seq,
    author_member_id: seq % 2 ? 'member-ada' : 'member-tutor',
    body: seq % 2 ? 'Historical question' : 'Historical **answer**',
    created_at: `2026-09-01T10:0${seq}:00Z`,
    ...over,
  } as ConversationMessage
}

const attachment = {
  id: 'old-file-1',
  filename: 'evidence.txt',
  content_type: 'text/plain',
  byte_size: 128,
  created_at: '2026-09-01T10:01:00Z',
}

function defaultRead(tool: string, args: Record<string, unknown>) {
  if (tool === 'me.conversations') return Promise.resolve({ conversations: [conversation()], next: null })
  if (tool === 'conversation.messages') {
    return Promise.resolve({
      conversation: detail,
      messages: [
        message('old-message-1', 1, { attachments: [attachment] }),
        message('old-message-2', 2),
      ],
      more: false,
      draft: { text: 'A live draft must never be rendered in this archive' },
    })
  }
  if (tool === 'conversation.get') {
    return Promise.resolve({ ...detail, visible_to: ['participants', 'overseers'], draft: null })
  }
  if (tool === 'conversation.attachment') {
    return Promise.resolve({
      ...attachment,
      author_member_id: 'member-ada',
      conversation_id: 'core-old-1',
      message_id: 'old-message-1',
      message_seq: 1,
      checksum: null,
      download_url: 'https://files.example.test/evidence.txt?signature=short-lived',
      expires_at: '2026-09-01T10:15:00Z',
    })
  }
  return Promise.reject(new Error(`unexpected read: ${tool} ${JSON.stringify(args)}`))
}

function mountView(props: { courseId?: string | null; initiallyExpanded?: boolean } = {}) {
  return mount(LegacyConversationView, {
    props,
    global: {
      plugins: [i18n, ElementPlus],
      components: icons,
      stubs: {
        MarkdownView: { props: ['source'], template: '<div class="legacy-markdown">{{ source }}</div>' },
      },
    },
  })
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  setLocale('en')
  transport.read.mockReset()
  transport.read.mockImplementation(defaultRead)
  transport.write.mockReset()
  transport.write.mockImplementation((tool: string) => {
    throw new Error(`the legacy archive must not write: ${tool}`)
  })
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LegacyConversationView', () => {
  it('stays inert while collapsed, so the AR-owned new-chat/history path has no Core conversation traffic', () => {
    const w = mountView()

    expect(w.find('h2').text()).toBe('Legacy conversations (read-only)')
    expect(w.find('.legacy-chat__toggle').attributes('aria-expanded')).toBe('false')
    expect(w.find('.legacy-chat__body').exists()).toBe(false)
    expect(w.find('textarea').exists()).toBe(false)
    expect(transport.read).not.toHaveBeenCalled()
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('opens Core history, messages and attachments read-only, never mixing them with AR or live drafts', async () => {
    const w = mountView()
    await w.find('.legacy-chat__toggle').trigger('click')
    await flushPromises()

    expect(transport.read.mock.calls.map(([tool]) => tool)).toEqual(['me.conversations'])
    await w.find('[data-legacy-conversation-id="core-old-1"]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Historical question')
    expect(w.find('.legacy-markdown').text()).toBe('Historical **answer**')
    expect(w.text()).not.toContain('A live draft must never be rendered')
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.findAll('button').some((b) => /withdraw|reply|ask a question/i.test(b.text()))).toBe(false)

    const messageRead = transport.read.mock.calls.find(([tool]) => tool === 'conversation.messages')
    expect(messageRead?.[1]).toEqual({
      course_id: 'course-1',
      conversation_id: 'core-old-1',
      before_seq: undefined,
      limit: 50,
    })
    expect(messageRead?.[1]).not.toHaveProperty('wait_s')
    expect(messageRead?.[1]).not.toHaveProperty('after_seq')
    expect(transport.read.mock.calls.filter(([tool]) => tool === 'conversation.messages')).toHaveLength(1)

    await w.find('.legacy-chat__attachment').trigger('click')
    await flushPromises()
    expect(transport.read).toHaveBeenCalledWith(
      'conversation.attachment',
      { course_id: 'course-1', attachment_id: 'old-file-1' },
      { signal: undefined },
    )
    expect(window.open).toHaveBeenCalledWith(
      'https://files.example.test/evidence.txt?signature=short-lived',
      '_blank',
      'noopener,noreferrer',
    )
    expect(transport.read.mock.calls.map(([tool]) => tool)).toEqual([
      'me.conversations',
      'conversation.messages',
      'conversation.get',
      'conversation.attachment',
    ])
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('pages backwards with Core cursors only and merges old messages in sequence order', async () => {
    transport.read.mockImplementation((tool: string, args: Record<string, unknown>) => {
      if (tool === 'me.conversations') {
        return Promise.resolve(
          args.after
            ? { conversations: [conversation('core-old-2', { title: 'Second page' })], next: null }
            : { conversations: [conversation()], next: 'next-old-page' },
        )
      }
      if (tool === 'conversation.messages') {
        return Promise.resolve(
          args.before_seq
            ? { conversation: detail, messages: [message('old-message-1', 1)], more: false, draft: null }
            : { conversation: detail, messages: [message('old-message-2', 2)], more: true, draft: null },
        )
      }
      return defaultRead(tool, args)
    })
    const w = mountView({ initiallyExpanded: true })
    await flushPromises()

    await w.find('.legacy-chat__more').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Second page')
    expect(transport.read.mock.calls.filter(([tool]) => tool === 'me.conversations')[1]?.[1]).toMatchObject({
      after: 'next-old-page',
    })

    await w.find('[data-legacy-conversation-id="core-old-1"]').trigger('click')
    await flushPromises()
    await w.find('.legacy-chat__older').trigger('click')
    await flushPromises()

    const older = transport.read.mock.calls.filter(([tool]) => tool === 'conversation.messages')[1]
    expect(older?.[1]).toMatchObject({ conversation_id: 'core-old-1', before_seq: 2 })
    expect(older?.[1]).not.toHaveProperty('after_seq')
    expect(older?.[1]).not.toHaveProperty('wait_s')
    expect(w.findAll('[data-legacy-message-id]').map((m) => m.attributes('data-legacy-message-id'))).toEqual([
      'old-message-1',
      'old-message-2',
    ])
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('uses one safe error for list and message mayRead failures without exposing server details', async () => {
    transport.read.mockRejectedValueOnce(
      new ApiError({ status: 403, code: 'forbidden', message: 'private roster and permission details' }),
    )
    const w = mountView({ initiallyExpanded: true })
    await flushPromises()

    expect(w.find('[role="alert"]').text()).toContain('Legacy conversations could not be read. Please try again.')
    expect(w.text()).not.toContain('private roster and permission details')

    await w.find('.legacy-chat__error button').trigger('click')
    await flushPromises()
    transport.read.mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'not_found', message: 'sensitive conversation existence detail' }),
    )
    await w.find('[data-legacy-conversation-id="core-old-1"]').trigger('click')
    await flushPromises()

    expect(w.find('[role="alert"]').text()).toContain('Legacy conversations could not be read. Please try again.')
    expect(w.text()).not.toContain('sensitive conversation existence detail')
    expect(transport.write).not.toHaveBeenCalled()
  })
})
