import { describe, expect, it } from 'vitest'

// What people read never names the machinery behind the page: not Core, not
// the runtime, not a tool's name, not a server's setting or a file on the
// server (docs/CONVENTIONS.md, Text). A teacher who has never heard of Core
// would take it for a second authority deciding behind the first.
//
// The scan is of every message in every language. A message an operator, and
// only an operator, reads (a setting's name in a tooltip, the command or file
// they act on) is let through by its key in ALLOWED, each with why.

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/*/*.ts', { eager: true })

/** Each message, as `<locale>:<namespace>.<path>` and its text. */
function messages(): [string, string][] {
  const out: [string, string][] = []
  const walk = (prefix: string, v: unknown) => {
    if (typeof v === 'string') out.push([prefix, v])
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${prefix}.${k}`, x)
  }
  for (const [path, mod] of Object.entries(modules)) {
    const m = path.match(/\.\/messages\/([^/]+)\/([^/]+)\.ts$/)
    if (m) walk(`${m[1]}:${m[2]}`, mod.default)
  }
  return out
}

/** The words a message may not use, each with a name for the failure. */
const FORBIDDEN: [string, RegExp][] = [
  ['Core', /\bCore\b/],
  ['runtime', /runtime/i],
  // A tool's dotted name (actor.list, member.add) or a field of its answer (details.reason).
  [
    'a tool’s name',
    /\b(?:action|actor|agent|assignment|component|conversation|course|department|details|document|event|grade|me|member|preset|rubric|service|sso|submission|term)\.[a-z_]+\b/,
  ],
  // A tool's name as an agent's client calls it, the dot an underscore (grade_submit, event_list).
  [
    'a tool’s client name',
    /\b(?:action|actor|agent|assignment|component|conversation|course|department|document|event|grade|member|preset|rubric|service|sso|submission|term)_(?:[a-z]+)\b/,
  ],
  // An environment flag or a setting of the server (OCR=off, ADMIN_ACTOR_IDS), or a family of them (OIDC_*).
  ['a server setting', /\b[A-Z][A-Z0-9]*=\w|\b[A-Z][A-Z0-9]+_(?:\*|[A-Z0-9])/],
]

/**
 * Messages only an operator reads, by key or by a key's start, in every
 * language: the setting, the command or the file named is what they type or
 * look for on the server.
 */
const ALLOWED = [
  // Settings and commands, each named in the tooltip beside the words that say what they do (OperatorDetail).
  'runtimeAdmin.flags.',
  'ssoAdmin.flags.',
  // The steps of a task only the server's operator does, issuing the agent service's credential by
  // hand: where on the server to put it, inline, as what they follow (docs/CONVENTIONS.md, Text). The
  // command that does it all (AgentRuntimeCard's ROTATE) is a parameter of these, and of the card's
  // setup, none and revokeBody, so it is not scanned here.
  'runtimeAdmin.agentRuntime.where',
  'runtimeAdmin.agentRuntime.issueBody',
  // Setting up an agent's MCP client, read by whoever connects it: the tool names it calls.
  'admin.token.mcpNotes',
]
const allowed = (key: string) => ALLOWED.some((a) => (a.endsWith('.') ? key.startsWith(a) : key === a))

describe('the words people read', () => {
  const all = messages()

  it('are many (the scan reads every message)', () => {
    expect(all.length).toBeGreaterThan(3000)
  })

  it.each(FORBIDDEN)('never name %s, outside an operator’s tooltip', (_name, re) => {
    const found = all
      .filter(([key, text]) => !allowed(key.replace(/^[^:]+:/, '')) && re.test(text))
      .map(([key, text]) => `${key}: ${text}`)
    expect(found).toEqual([])
  })

  it('let through only messages that exist', () => {
    const keys = new Set(all.map(([k]) => k.replace(/^[^:]+:/, '')))
    expect(ALLOWED.filter((a) => ![...keys].some((k) => (a.endsWith('.') ? k.startsWith(a) : k === a)))).toEqual([])
  })
})
