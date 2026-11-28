import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'

const transport = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return { ...real, read: transport.read, write: transport.write }
})

const { ApiError } = await import('@/api/http')
const { i18n, setLocale } = await import('@/i18n')
const { default: LegacyConversationPage } = await import('./LegacyConversationPage.vue')

const conversation = {
  id: 'core-bookmark-1',
  created_at: '2026-09-01T09:00:00Z',
  title: 'A conversation outside the reader’s own list',
  opener: { member_id: 'student-seat', display_name: 'Student', kind: 'human' },
  respondent: {
    member_id: 'agent-seat',
    display_name: 'Tutor',
    kind: 'agent',
    answer_level: 'autonomous',
    is_delegate_of_opener: false,
    role: 'assistant',
    seat_status: 'active',
  },
  state: 'answered',
  status: 'open',
}

function mountPage() {
  return mount(LegacyConversationPage, {
    props: { courseId: 'course-1', conversationId: 'core-bookmark-1' },
    global: {
      plugins: [i18n, ElementPlus],
      components: icons,
      stubs: {
        PageHeader: { template: '<header><h1>Legacy conversations (read-only)</h1></header>' },
        MarkdownView: { props: ['source'], template: '<div class="legacy-markdown">{{ source }}</div>' },
      },
    },
  })
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  setLocale('en')
  transport.read.mockReset()
  transport.write.mockReset()
  transport.read.mockImplementation(async (tool: string) => {
    if (tool === 'conversation.get') return { ...conversation, visible_to: ['participants'], draft: null }
    if (tool !== 'conversation.messages') throw new Error(`unexpected read: ${tool}`)
    return {
      conversation,
      messages: [
        {
          id: 'message-1',
          seq: 1,
          author_member_id: 'student-seat',
          body: 'A historical question',
          created_at: '2026-09-01T09:01:00Z',
        },
      ],
      more: false,
      draft: { text: 'not part of the historical page' },
    }
  })
})

describe('LegacyConversationPage deep link', () => {
  it('reads the addressed Core conversation directly, without me.conversations, AR or live draft state', async () => {
    const w = mountPage()
    await flushPromises()

    expect(transport.read).toHaveBeenCalledTimes(2)
    expect(transport.read).toHaveBeenCalledWith(
      'conversation.messages',
      {
        course_id: 'course-1',
        conversation_id: 'core-bookmark-1',
        before_seq: undefined,
        limit: 50,
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(transport.read).toHaveBeenCalledWith(
      'conversation.get',
      { course_id: 'course-1', conversation_id: 'core-bookmark-1' },
      { signal: expect.any(AbortSignal) },
    )
    expect(w.text()).toContain('A conversation outside the reader’s own list')
    expect(w.text()).toContain('A historical question')
    expect(w.find('.chat-msg .chat-msg__body').exists()).toBe(true)
    expect(w.text()).not.toContain('not part of the historical page')
    expect(w.find('textarea').exists()).toBe(false)
    expect(transport.write).not.toHaveBeenCalled()
  })

  it('keeps Core’s refusal generic and does not retry through AR', async () => {
    transport.read.mockRejectedValue(
      new ApiError({ status: 403, code: 'forbidden', message: 'sensitive overseer scope details' }),
    )
    const w = mountPage()
    await flushPromises()

    expect(transport.read).toHaveBeenCalledTimes(2)
    expect(w.find('[role="alert"]').text()).toContain('Legacy conversations could not be read. Please try again.')
    expect(w.text()).not.toContain('sensitive overseer scope details')
    expect(transport.write).not.toHaveBeenCalled()
  })
})
