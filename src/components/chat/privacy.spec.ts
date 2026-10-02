import { afterEach, describe, expect, it } from 'vitest'
import type { HostedAgent } from '@/api/runtime-types'
import { i18n } from '@/i18n'
import {
  answerModelsOf,
  forgetPrivacySeen,
  notePrivacySeen,
  ownHostedIn,
  privacyNotice,
  privacySeen,
  providerName,
  type AnswerModels,
  type PrivacyNotice,
} from './privacy'

/** The notice in a language's words: the short line, the points, where it goes and what is kept. */
function words(n: PrivacyNotice, locale: 'en' | 'zh-Hant' | 'zh-Hans' = 'en') {
  const t = (s: { key: string; params: Record<string, string> }) =>
    i18n.global.t(`chat.privacy.${s.key}`, s.params, { locale })
  return {
    line: t(n.line),
    points: n.points.map(t),
    route: n.route.map(t).join(' '),
    kept: n.kept.map(t).join(' '),
  }
}

const SCHOOL: AnswerModels = {
  plan: 'school',
  model: { provider: 'deepseek', model: 'deepseek-chat' },
  fallback: { provider: 'openai', model: 'gpt-5-mini' },
}
const OWN: AnswerModels = { plan: 'own', model: { provider: 'anthropic', model: 'claude-sonnet' }, fallback: null }
const LABELS: Record<string, string> = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic' }
const label = (p: string) => LABELS[p] ?? p

describe('privacyNotice: who can read it, for every agent', () => {
  it.each([
    ['runtime', 'runtime'],
    ['mcp', 'mcp'],
    ['unknown', null],
  ] as const)('says Core’s readers for an agent run by %s, administrators’ export last', (_, hosting) => {
    const n = privacyNotice({ name: 'Tutor', hosting, answersOthers: true })
    expect(n.readers.map((l) => ('key' in l ? l.key : l.text))).toEqual([
      'participants',
      'overseers',
      'actionRecord',
      'respondentAnswersOthers',
      'auditExport',
    ])
    const w = words(n)
    expect(w.line).toMatch(/^Course staff and site administrators can read this conversation/)
    expect(w.points[0]).toBe(
      'Course staff can read this conversation, and the site’s administrators can export it for audit.',
    )
    // Nothing is deleted, and a withdrawn message is kept, for export too.
    expect(w.kept).toContain('Conversations are never deleted.')
    expect(w.kept).toContain('its text and files are kept')
    expect(w.kept).toContain('in exports for audit')
  })

  it('takes what Core said once it has, the opener’s own agent answering nobody else', () => {
    const n = privacyNotice({
      name: 'Mine',
      hosting: 'runtime',
      visibleTo: ['participants', 'overseers', 'action_record', 'audit_export'],
      answersOthers: true,
    })
    expect(n.readers.map((l) => ('key' in l ? l.key : l.text))).toEqual([
      'participants',
      'overseers',
      'actionRecord',
      'auditExport',
    ])
  })
})

describe('privacyNotice: where it goes, by how the agent is run', () => {
  it('names the provider of the caller’s own agent on the school’s plan, and its fallback', () => {
    const n = privacyNotice({ name: 'Ken’s helper', hosting: 'runtime', models: SCHOOL, providerName: label })
    expect(n.kind).toBe('model')
    const w = words(n)
    expect(w.line).toBe(
      'Course staff and site administrators can read this conversation. Ken’s helper sends it to DeepSeek to answer.',
    )
    expect(w.points[1]).toBe(
      'Ken’s helper sends what you write here to DeepSeek, its AI model’s provider, to answer it.',
    )
    expect(w.route).toContain('Ken’s helper is hosted on AIshie.')
    expect(w.route).toContain('That model is deepseek-chat, from DeepSeek, on the school’s plan.')
    expect(w.route).toContain('your own model answers instead: gpt-5-mini, from OpenAI.')
    expect(w.kept).toContain('no longer sends it to Ken’s helper’s model')
  })

  it('names the provider of the caller’s own agent on their own key, with no fallback', () => {
    const w = words(privacyNotice({ name: 'Notes', hosting: 'runtime', models: OWN, providerName: label }))
    expect(w.line).toContain('Notes sends it to Anthropic to answer.')
    expect(w.route).toContain('That model is claude-sonnet, from Anthropic, on your own API key.')
    expect(w.route).not.toContain('instead')
  })

  it('shows a provider’s id where the runtime gives no name for it', () => {
    const w = words(privacyNotice({ name: 'Notes', hosting: 'runtime', models: OWN }))
    expect(w.line).toContain('Notes sends it to anthropic to answer.')
  })

  it('names no provider for an agent hosted on AIshie that is not the caller’s', () => {
    const n = privacyNotice({ name: 'Lab tutor', hosting: 'runtime', models: null, providerName: label })
    expect(n.kind).toBe('runtime')
    const w = words(n)
    expect(w.line).toBe(
      'Course staff and site administrators can read this conversation. Lab tutor sends it to its AI model’s provider to answer.',
    )
    expect(w.route).toContain('AIshie’s agent runtime sends the messages of this conversation')
    expect(w.route).toContain('This page cannot show you which provider it is.')
    for (const p of Object.values(LABELS)) expect(`${w.line} ${w.route}`).not.toContain(p)
    expect(w.kept).toContain('no longer sends it to Lab tutor’s model')
  })

  it('says an agent with MCP access answers from its owner’s own tools, naming no provider', () => {
    const n = privacyNotice({ name: 'Ken’s notes', hosting: 'mcp' })
    expect(n.kind).toBe('mcp')
    const w = words(n)
    expect(w.line).toBe(
      'Course staff and site administrators can read this conversation. Ken’s notes answers from its owner’s own tools.',
    )
    expect(w.route).toContain('it is used from its owner’s own tools')
    expect(w.route).not.toContain('agent runtime sends')
    // The runtime does not send it, so nothing is said of what the runtime stops sending.
    expect(w.kept).not.toContain('runtime')
  })

  it('says only that a model answers where how the agent is run is not known', () => {
    const n = privacyNotice({ name: 'Tutor', hosting: null, models: SCHOOL })
    expect(n.kind).toBe('unknown')
    const w = words(n)
    expect(w.line).toBe(
      'Course staff and site administrators can read this conversation, and it goes to Tutor’s AI model to be answered.',
    )
    expect(w.route).not.toContain('DeepSeek')
    expect(w.route).not.toContain('deepseek')
  })

  it.each(['zh-Hant', 'zh-Hans'] as const)('says it in %s', (locale) => {
    const w = words(privacyNotice({ name: '助教', hosting: 'runtime', models: SCHOOL, providerName: label }), locale)
    expect(w.line).toContain('DeepSeek')
    expect(w.line).toContain(locale === 'zh-Hant' ? '課程教職員及網站管理員' : '课程教职员和网站管理员')
    expect(w.route).toContain('deepseek-chat')
  })
})

function hosted(over: Partial<HostedAgent>): HostedAgent {
  return {
    id: 'agt_1',
    version: 1,
    core_actor_id: 'a1',
    owner_actor_id: 'me',
    display_name: 'Notes',
    status: 'running',
    problem: null,
    paused: false,
    model: { own: null, school: null },
    own_key: null,
    seats: [],
    seats_as_of: null,
    proposals_waiting: 0,
    today: { since: '2026-10-03T00:00:00Z', answers: 0, cost_usd: '0' },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  }
}
const own = {
  provider: 'anthropic',
  adapter: 'anthropic_messages',
  model: 'claude-sonnet',
  endpoint: null,
  resource: null,
  region: null,
  max_output_tokens: null,
  reasoning_effort: null,
  price_known: true,
}
const school = {
  offer: 'cheap',
  label: 'School AI',
  model: 'deepseek-chat',
  provider: 'deepseek',
  offered: true,
  fallback: true,
}

describe('answerModelsOf', () => {
  it('is the school’s offer, with the owner’s own model behind it', () => {
    expect(answerModelsOf(hosted({ model: { own, school } }))).toEqual({
      plan: 'school',
      model: { provider: 'deepseek', model: 'deepseek-chat' },
      fallback: { provider: 'anthropic', model: 'claude-sonnet' },
    })
    expect(
      answerModelsOf(hosted({ model: { own: null, school: { ...school, fallback: false } } }))?.fallback,
    ).toBeNull()
  })

  it('is the owner’s own once the school no longer offers its model, and none without either', () => {
    expect(answerModelsOf(hosted({ model: { own, school: { ...school, offered: false } } }))).toEqual({
      plan: 'own',
      model: { provider: 'anthropic', model: 'claude-sonnet' },
      fallback: null,
    })
    expect(answerModelsOf(hosted({ model: { own: null, school: { ...school, offered: false } } }))).toBeNull()
    expect(answerModelsOf(hosted({}))).toBeNull()
  })
})

describe('ownHostedIn', () => {
  const seat = (course_id: string) => ({ course_id }) as HostedAgent['seats'][number]
  it('is the one agent of that name seated in the course, and none where two or none are', () => {
    const a = hosted({ id: 'a', seats: [seat('c1')] })
    const b = hosted({ id: 'b', display_name: 'Other', seats: [seat('c1')] })
    const c = hosted({ id: 'c', seats: [seat('c2')] })
    expect(ownHostedIn([a, b, c], 'c1', 'Notes')?.id).toBe('a')
    expect(ownHostedIn([a, b, c], 'c3', 'Notes')).toBeNull()
    expect(ownHostedIn([a, hosted({ id: 'd', seats: [seat('c1')] })], 'c1', 'Notes')).toBeNull()
    expect(ownHostedIn(null, 'c1', 'Notes')).toBeNull()
  })
})

describe('providerName', () => {
  it('is the runtime’s name for it, or its id', () => {
    const models = {
      own_key: {
        offered: true,
        providers: [
          {
            provider: 'openai',
            label: 'OpenAI',
            adapters: [],
            endpoint: { kind: 'fixed' as const, base_url: '' },
            key_prefix: null,
            suggested_models: [],
          },
        ],
      },
    }
    expect(providerName('openai', models)).toBe('OpenAI')
    expect(providerName('deepseek', models)).toBe('deepseek')
    expect(providerName('openai', null)).toBe('openai')
  })
})

describe('the first time', () => {
  afterEach(() => {
    localStorage.clear()
    forgetPrivacySeen()
  })

  it('is remembered for each person in this browser', () => {
    expect(privacySeen('p1')).toBe(false)
    notePrivacySeen('p1')
    expect(privacySeen('p1')).toBe(true)
    expect(localStorage.getItem('aishie.chatPrivacySeen.p1')).toBe('1')
    forgetPrivacySeen()
    expect(privacySeen('p1')).toBe(true)
    expect(privacySeen('p2')).toBe(false)
    expect(privacySeen(null)).toBe(true)
  })
})
