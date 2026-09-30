// For the runtime administrators' page's unit tests only (imported by
// *.spec.ts): the runtime's admin routes behind the hosting components'
// fake servers (hostingFakes.ts), which stub fetch and see every request,
// headers and bodies included. The plan, OCR's settings, today's use and
// the money (prices, tenants' quotas, agents' budgets, costs) are kept as a
// runtime keeps them, and answered as its contract has them; so are the
// transcriber's settings, credential and jobs, and Core's credentials of the
// transcription service (issued at random as a test runs: no token is
// written in any file).
import type {
  AgentBudgets,
  CostGroup,
  CostReport,
  OcrSettings,
  PlanOffer,
  PriceRow,
  PriceTable,
  RuntimeSettings,
  SchoolPlan,
  SchoolPlanUsage,
  TenantQuota,
  TranscriptionJob,
  TranscriptionSettings,
} from '@/api/runtime-types'
import { INFO, Servers, executed, json, newToken, refusal } from '@/views/account/components/agents/hostingFakes'

export { Servers, executed, json, refusal }
export { OFFERS, newKey, newToken } from '@/views/account/components/agents/hostingFakes'

/** What the runtime says of itself, as useRuntime gives it. */
export const INFO_FOR_TESTS = INFO

export const ADMIN_ID = '0192f3c1-aaaa-7c3a-9b1f-2a4c6e8f0a1b'
export const ADMIN_NAME = 'Ada Admin'
export const AT = '2026-09-30T08:12:00Z'

export const ADMIN = {
  me: /^\/runtime\/api\/v1\/me$/,
  settings: /^\/runtime\/api\/v1\/admin\/settings$/,
  plan: /^\/runtime\/api\/v1\/admin\/school-plan$/,
  offers: /^\/runtime\/api\/v1\/admin\/school-plan\/offers$/,
  offer: /^\/runtime\/api\/v1\/admin\/school-plan\/offers\/([^/]+)$/,
  quotas: /^\/runtime\/api\/v1\/admin\/school-plan\/quotas$/,
  usage: /^\/runtime\/api\/v1\/admin\/school-plan\/usage$/,
  prices: /^\/runtime\/api\/v1\/admin\/prices$/,
  price: /^\/runtime\/api\/v1\/admin\/prices\/([^/]+)$/,
  tenants: /^\/runtime\/api\/v1\/admin\/tenants$/,
  tenant: /^\/runtime\/api\/v1\/admin\/tenants\/([^/]+)$/,
  budgets: /^\/runtime\/api\/v1\/admin\/agent-budgets$/,
  costs: /^\/runtime\/api\/v1\/admin\/costs$/,
  credential: /^\/runtime\/api\/v1\/admin\/transcription\/credential$/,
  jobs: /^\/runtime\/api\/v1\/admin\/transcription\/jobs$/,
  actor: /^\/v1\/actors\/([^/]+)$/,
  // Core's credentials of the transcription service.
  serviceCredentials: /^\/v1\/services\/document_text\/credentials$/,
  serviceRevoke: /^\/v1\/services\/document_text\/credentials\/([^/]+)\/revoke$/,
  document: /^\/v1\/courses\/([^/]+)\/documents\/([^/]+)$/,
}

/** runtime.yaml's offer: the operator's, read-only here. */
export function configOffer(over: Partial<PlanOffer> = {}): PlanOffer {
  return {
    id: 'standard',
    source: 'config',
    label: 'School AI (standard)',
    provider: 'openai',
    adapter: 'openai_chat',
    model: 'gpt-4.1-mini',
    endpoint: null,
    resource: null,
    region: null,
    base_url: null,
    max_output_tokens: null,
    reasoning_effort: null,
    enabled: true,
    status: 'offered',
    priced: true,
    agents: 14,
    key_hint: null,
    key_status: null,
    version: null,
    created_at: null,
    created_by: null,
    updated_at: null,
    updated_by: null,
    ...over,
  }
}

/** One of the site's offers, made here. */
export function siteOffer(over: Partial<PlanOffer> = {}): PlanOffer {
  return {
    id: 'fast',
    source: 'site',
    label: 'School AI (fast)',
    provider: 'openai',
    adapter: 'openai_chat',
    model: 'gpt-4.1-mini',
    endpoint: null,
    resource: null,
    region: null,
    base_url: null,
    max_output_tokens: null,
    reasoning_effort: null,
    enabled: true,
    status: 'offered',
    priced: true,
    agents: 3,
    key_hint: 'sk-…3f9a',
    key_status: 'tested',
    version: 4,
    created_at: AT,
    created_by: ADMIN_ID,
    updated_at: AT,
    updated_by: ADMIN_ID,
    ...over,
  }
}

export function schoolPlan(over: Partial<SchoolPlan> = {}): SchoolPlan {
  return {
    offers: [configOffer(), siteOffer()],
    quotas: { per_owner_day: 150, per_asker_day: 20, per_day: 5000 },
    quota_defaults: { per_owner_day: 100, per_asker_day: 20, per_day: null },
    quotas_set: true,
    quotas_updated_at: AT,
    quotas_updated_by: ADMIN_ID,
    ...over,
  }
}

export function ocrSettings(over: Partial<OcrSettings> = {}): RuntimeSettings {
  return {
    ocr: {
      available: true,
      unavailable_reason: null,
      unavailable_detail: null,
      enabled: true,
      languages: ['chi_tra', 'eng'],
      default_languages: ['chi_sim', 'chi_tra', 'eng'],
      available_languages: ['chi_sim', 'chi_tra', 'eng', 'jpn'],
      updated_at: AT,
      updated_by: ADMIN_ID,
      ...over,
    },
  }
}

/** The transcriber as a site that has set it up has it: on, running, on the site's offer, with a credential. */
export function transcriptionSettings(over: Partial<TranscriptionSettings> = {}): TranscriptionSettings {
  return {
    available: true,
    unavailable_reason: null,
    unavailable_detail: null,
    enabled: true,
    offer: 'fast',
    offer_status: 'ok',
    max_pages: 300,
    per_day_pages: null,
    concurrency: 2,
    credential: {
      status: 'ok',
      hint: 'aissvc_held00000000…',
      credential_id: 'cred-held',
      set_at: AT,
      set_by: ADMIN_ID,
      last_ok_at: '2026-09-30T09:59:00Z',
      last_error: null,
    },
    state: 'running',
    blocked_reason: null,
    today: { pages: 120, documents: 9, failed: 1, skipped: 2, cost_usd: '0.031200' },
    updated_at: AT,
    updated_by: ADMIN_ID,
    ...over,
  }
}

/** The transcriber off, as a runtime is before the site turns it on: no offer, no credential. */
export function transcriptionOff(over: Partial<TranscriptionSettings> = {}): TranscriptionSettings {
  return transcriptionSettings({
    enabled: false,
    offer: null,
    offer_status: null,
    credential: {
      status: 'none',
      hint: null,
      credential_id: null,
      set_at: null,
      set_by: null,
      last_ok_at: null,
      last_error: null,
    },
    state: 'off',
    today: { pages: 0, documents: 0, failed: 0, skipped: 0, cost_usd: '0.000000' },
    updated_at: null,
    updated_by: null,
    ...over,
  })
}

export const COURSE_ID = '0192f3c1-cccc-7c3a-9b1f-2a4c6e8f0a1b'
export const DOC_ID = '0192f3c1-dddd-7c3a-9b1f-2a4c6e8f0a1b'

export function transcriptionJob(over: Partial<TranscriptionJob> = {}): TranscriptionJob {
  return {
    id: 'job-1',
    version_id: '0192f3c1-eeee-7c3a-9b1f-2a4c6e8f0a1b',
    document_id: DOC_ID,
    course_id: COURSE_ID,
    status: 'done',
    reason: null,
    backfill: false,
    content_type: 'application/pdf',
    byte_size: 1_200_000,
    pages: 12,
    offer: 'fast',
    model: 'gpt-4.1-mini',
    cost_usd: '0.004100',
    input_tokens: 3100,
    output_tokens: 5200,
    started_at: '2026-09-30T09:00:00Z',
    finished_at: '2026-09-30T09:01:10Z',
    ...over,
  }
}

/** One of Core's credentials of the transcription service, as service.list_credentials lists it. */
export interface FakeServiceCredential {
  id: string
  token_prefix: string
  label: string
  live: boolean
  created_at: string
  revoked_at: string | null
  claims_held: number
}

export function planUsage(over: Partial<SchoolPlanUsage> = {}): SchoolPlanUsage {
  return {
    since: '2026-09-30T00:00:00Z',
    limits: { per_owner_day: 150, per_asker_day: 20, per_day: 5000 },
    total: { answers: 262, model_calls: 700, cost_usd: '2.118200' },
    owners: [
      {
        tenant_id: 'ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b',
        owner_actor_id: '0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b',
        display_name: 'Chan Tai Man',
        answers: 96,
        model_calls: 301,
        cost_usd: '0.998100',
      },
      {
        tenant_id: `ten_${ADMIN_ID}`,
        owner_actor_id: ADMIN_ID,
        display_name: ADMIN_NAME,
        answers: 150,
        model_calls: 380,
        cost_usd: '1.020000',
      },
      {
        tenant_id: 'ten_operator',
        owner_actor_id: null,
        display_name: null,
        answers: 16,
        model_calls: 19,
        cost_usd: '0.100100',
      },
    ],
    ...over,
  }
}

/** A row of the price table: the site's unless said. */
export function priceRow(over: Partial<PriceRow> = {}): PriceRow {
  const site = (over.source ?? 'site') === 'site'
  return {
    id: 'gpt-4.1-mini-2026-09-01',
    source: 'site',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    glob: false,
    from: '2026-09-01',
    usd_per_mtok: { input: '0.4', cache_read: '0.1', cache_write: '0.4', output: '1.6' },
    version: 'site-20260930T081200Z/gpt-4.1-mini-2026-09-01',
    overridden: false,
    row_version: site ? 2 : null,
    created_at: site ? AT : null,
    created_by: site ? ADMIN_ID : null,
    updated_at: site ? AT : null,
    updated_by: site ? ADMIN_ID : null,
    ...over,
  }
}

export function priceTable(over: Partial<PriceTable> = {}): PriceTable {
  return {
    version: '2026-09-27+site-20260930T081200Z',
    file_version: '2026-09-27',
    site_version: 'site-20260930T081200Z',
    site_changed_at: AT,
    rows: [
      priceRow(),
      priceRow({
        id: '0',
        source: 'file',
        model: 'gpt-4.1-mini',
        from: '2026-09-01',
        usd_per_mtok: { input: '0.5', cache_read: '0.5', cache_write: '0.5', output: '2' },
        version: '2026-09-27/0',
        overridden: true,
      }),
      priceRow({
        id: 'claude',
        source: 'file',
        provider: 'anthropic',
        model: 'claude-*',
        glob: true,
        from: '2026-01-01',
        usd_per_mtok: { input: '3', cache_read: '0.3', cache_write: '3.75', output: '15' },
        version: '2026-09-27/claude',
      }),
    ],
    unpriced_offers: [],
    ...over,
  }
}

export function tenantQuota(over: Partial<TenantQuota> = {}): TenantQuota {
  return {
    tenant_id: `ten_${ADMIN_ID}`,
    owner_actor_id: ADMIN_ID,
    display_name: ADMIN_NAME,
    source: 'site',
    per_day: { answers: 300, usd: '5.000000' },
    config_per_day: { answers: 200, usd: null },
    agents: 2,
    updated_at: AT,
    updated_by: ADMIN_ID,
    ...over,
  }
}

export function agentBudgets(over: Partial<AgentBudgets> = {}): AgentBudgets {
  return {
    per_agent_day: { answers: 500, usd: '10.000000' },
    per_asker_day: { answers: 40, usd: null },
    defaults: { per_agent_day: { answers: 400, usd: null }, per_asker_day: { answers: 30, usd: '1.500000' } },
    set: true,
    updated_at: AT,
    updated_by: ADMIN_ID,
    ...over,
  }
}

export function costGroup(over: Partial<CostGroup> = {}): CostGroup {
  return {
    key: '2026-09-29',
    day: '2026-09-29',
    tenant_id: null,
    owner_actor_id: null,
    display_name: null,
    agent_id: null,
    agent_name: null,
    key_source: null,
    provider: null,
    model: null,
    offers: null,
    cost_usd: '1.250000',
    lines: [
      {
        kind: 'model_calls',
        calls: 120,
        unpriced_calls: 0,
        tokens: { input: 150000, cache_read: 20000, cache_write: 0, output: 30000 },
        cost_usd: '1.250000',
      },
    ],
    ...over,
  }
}

/** The report the fake answers: its rows by the group asked for, two pages by day. */
export function costReport(q: URLSearchParams): CostReport {
  const group = (q.get('group') ?? 'day') as CostReport['group']
  const transcription = { kind: 'transcription', calls: 4, unpriced_calls: 0, tokens: null, cost_usd: '0.100000' }
  const total = {
    cost_usd: '3.500000',
    lines: [
      {
        kind: 'model_calls',
        calls: 300,
        unpriced_calls: 7,
        tokens: { input: 400000, cache_read: 50000, cache_write: 1000, output: 90000 },
        cost_usd: '3.400000',
      },
      transcription,
    ],
  }
  let rows: CostGroup[] = []
  let next: string | null = null
  if (group === 'day') {
    if (q.get('after')) rows = [costGroup({ key: '2026-09-28', day: '2026-09-28', cost_usd: '0.750000' })]
    else {
      rows = [costGroup()]
      next = '2026-09-29'
    }
  } else if (group === 'tenant') {
    rows = [
      costGroup({
        key: `ten_${ADMIN_ID}`,
        day: null,
        tenant_id: `ten_${ADMIN_ID}`,
        owner_actor_id: ADMIN_ID,
        display_name: ADMIN_NAME,
      }),
      costGroup({ key: 't_ops', day: null, tenant_id: 't_ops' }),
      // The transcriber's, the site's own.
      costGroup({ key: 'site', day: null, cost_usd: '0.100000', lines: [transcription] }),
    ]
  } else if (group === 'agent') {
    rows = [
      costGroup({
        key: 'agt_1',
        day: null,
        agent_id: 'agt_1',
        agent_name: 'Study helper',
        tenant_id: `ten_${ADMIN_ID}`,
        owner_actor_id: ADMIN_ID,
        display_name: ADMIN_NAME,
      }),
      // The transcriber's, under no agent.
      costGroup({ key: 'transcription', day: null, cost_usd: '0.100000', lines: [transcription] }),
    ]
  } else if (group === 'model') {
    rows = [
      costGroup({
        key: 'school/openai/gpt-4.1-nano',
        day: null,
        key_source: 'school',
        provider: 'openai',
        model: 'gpt-4.1-nano',
        offers: ['fast'],
        lines: [{ kind: 'model_calls', calls: 12, unpriced_calls: 12, tokens: null, cost_usd: '0.000000' }],
        cost_usd: '0.000000',
      }),
    ]
  } else if (group === 'total') rows = [costGroup({ key: '', day: null, ...total })]
  return {
    since: q.get('since') ?? '2026-09-01',
    until: q.get('until') ?? '2026-09-30',
    group,
    key_source: (q.get('key_source') as CostReport['key_source']) ?? null,
    total,
    rows,
    next,
  }
}

/** What the fake runtime holds, for a test to look at or change. */
export interface AdminState {
  settings: RuntimeSettings
  plan: SchoolPlan
  usage: SchoolPlanUsage
  isAdmin: boolean
  prices: PriceTable
  tenants: TenantQuota[]
  budgets: AgentBudgets
  jobs: TranscriptionJob[]
  /** Core's side of the transcription service: its credentials, and the tokens issued and handed to the runtime. */
  service: {
    credentials: FakeServiceCredential[]
    /** Every token Core issued, in order: for a test to look for it elsewhere. */
    issued: string[]
    /** The tokens the runtime was given. */
    received: string[]
  }
}

/**
 * The runtime's admin routes on s, answered from state as the runtime would
 * (a write's version moves on; If-Match on another is 412), and Core's
 * actor.get naming the administrator. A test adds its own routes after, to
 * answer otherwise (the newest route is matched first).
 */
export function withAdmin(s: Servers, state: AdminState): Servers {
  const siteIndex = (id: string) => state.plan.offers.findIndex((o) => o.id === id && o.source === 'site')
  const body = (b: string | undefined) => (b ? JSON.parse(b) : undefined)
  s.on('GET', ADMIN.actor, (_, m) =>
    decodeURIComponent(m[1]) === ADMIN_ID
      ? executed({ id: ADMIN_ID, kind: 'human', display_name: ADMIN_NAME })
      : json(404, { error: { code: 'not_found', message: 'no such actor' } }),
  )
  s.on('GET', ADMIN.me, () =>
    json(200, { actor_id: ADMIN_ID, display_name: ADMIN_NAME, is_admin: state.isAdmin, hosted_agents: 0 }),
  )
  s.on('GET', ADMIN.settings, () => json(200, state.settings))
  s.on('PATCH', ADMIN.settings, (c) => {
    const p = body(c.body)
    if (p.ocr) {
      const o = state.settings.ocr
      if (p.ocr.enabled !== undefined) o.enabled = p.ocr.enabled
      if ('languages' in p.ocr) o.languages = p.ocr.languages ?? [...o.default_languages]
      o.updated_at = '2026-09-30T09:00:00Z'
      o.updated_by = ADMIN_ID
    }
    const tp = p.transcription
    const tr = state.settings.transcription
    if (tp && tr) {
      // A new object, as an answer is: what a page holds of the one before stays as it was.
      const next = { ...tr }
      if (tp.enabled !== undefined) next.enabled = tp.enabled
      if ('offer' in tp) {
        next.offer = tp.offer
        next.offer_status = tp.offer === null ? null : 'ok'
      }
      if ('max_pages' in tp) next.max_pages = tp.max_pages ?? 300
      if ('per_day_pages' in tp) next.per_day_pages = tp.per_day_pages
      if ('concurrency' in tp) next.concurrency = tp.concurrency ?? 2
      next.state = !next.enabled
        ? 'off'
        : next.credential.status === 'none'
          ? 'blocked'
          : next.offer === null
            ? 'blocked'
            : 'running'
      next.blocked_reason =
        next.state !== 'blocked' ? null : next.credential.status === 'none' ? 'no_credential' : 'no_offer'
      next.updated_at = '2026-09-30T09:00:00Z'
      next.updated_by = ADMIN_ID
      state.settings = { ...state.settings, transcription: next }
    }
    return json(200, state.settings)
  })
  // The transcriber's credential: a service token of Core's shape, kept by its hint.
  s.on('PUT', ADMIN.credential, (c) => {
    const b = body(c.body)
    const tr = state.settings.transcription
    if (!tr) return refusal(404, 'not_found', 'no_route')
    if (typeof b.token !== 'string' || !/^aissvc_[a-z2-7]{12}_[A-Za-z0-9_-]{43}$/.test(b.token))
      return refusal(400, 'invalid_argument', 'invalid_field', { field: '/token' })
    state.service.received.push(b.token)
    const prefix = b.token.slice('aissvc_'.length, 'aissvc_'.length + 12)
    const live = state.service.credentials.find((x) => x.token_prefix === prefix)?.live
    if (!live) return refusal(422, 'failed_precondition', 'credential_rejected', { status: 401 })
    const next: TranscriptionSettings = {
      ...tr,
      credential: {
        status: 'ok',
        hint: `aissvc_${prefix}…`,
        credential_id: b.credential_id ?? null,
        set_at: '2026-09-30T10:00:00Z',
        set_by: ADMIN_ID,
        last_ok_at: '2026-09-30T10:00:00Z',
        last_error: null,
      },
    }
    if (next.enabled && next.offer) {
      next.state = 'running'
      next.blocked_reason = null
    }
    state.settings = { ...state.settings, transcription: next }
    return json(200, next)
  })
  s.on('DELETE', ADMIN.credential, () => {
    const tr = state.settings.transcription!
    const next: TranscriptionSettings = {
      ...tr,
      credential: {
        status: 'none',
        hint: null,
        credential_id: null,
        set_at: null,
        set_by: null,
        last_ok_at: null,
        last_error: null,
      },
      state: tr.enabled ? 'blocked' : 'off',
      blocked_reason: tr.enabled ? 'no_credential' : null,
    }
    state.settings = { ...state.settings, transcription: next }
    return json(200, next)
  })
  s.on('GET', ADMIN.jobs, (c) => {
    const q = new URLSearchParams(c.url.split('?')[1] ?? '')
    const status = q.get('status')
    const all = state.jobs.filter((j) => !status || j.status === status)
    const after = q.get('after')
    const from = after ? all.findIndex((j) => j.id === after) + 1 : 0
    const page = all.slice(from, from + 2)
    return json(200, { jobs: page, next: from + 2 < all.length ? page[page.length - 1].id : null })
  })
  // Core's credentials of the transcription service, for platform administrators.
  s.on('GET', ADMIN.serviceCredentials, () =>
    executed({
      scope: 'document_text',
      service_actor_id: 'svc-actor',
      credentials: [...state.service.credentials].reverse().map((x) => ({
        id: x.id,
        token_prefix: x.token_prefix,
        label: x.label,
        live: x.live,
        created_at: x.created_at,
        revoked_at: x.revoked_at,
        claims_held: x.claims_held,
      })),
    }),
  )
  s.on('POST', ADMIN.serviceCredentials, (c) => {
    const b = body(c.body)
    const live = state.service.credentials.filter((x) => x.live)
    if (!b.replace && live.length >= 5) return refusal(422, 'failed_precondition', 'too_many_credentials')
    const revoked: string[] = []
    if (b.replace)
      for (const x of live) {
        x.live = false
        x.revoked_at = '2026-09-30T10:00:00Z'
        revoked.push(x.id)
      }
    const { token, prefix } = newServiceToken()
    const id = `cred-${prefix.slice(0, 6)}`
    state.service.credentials.push({
      id,
      token_prefix: prefix,
      label: b.label,
      live: true,
      created_at: '2026-09-30T10:00:00Z',
      revoked_at: null,
      claims_held: 0,
    })
    state.service.issued.push(token)
    return executed({
      service_actor_id: 'svc-actor',
      credential_id: id,
      token,
      token_prefix: prefix,
      ...(b.replace ? { revoked } : {}),
    })
  })
  s.on('POST', ADMIN.serviceRevoke, (_, m) => {
    const x = state.service.credentials.find((y) => y.id === decodeURIComponent(m[1]) && y.live)
    if (!x) return refusal(404, 'not_found', 'not_found')
    x.live = false
    x.revoked_at = '2026-09-30T10:00:00Z'
    return executed({ ok: true, claims_released: 0 })
  })
  s.on('GET', ADMIN.document, (_, m) =>
    decodeURIComponent(m[2]) === DOC_ID
      ? executed({
          id: DOC_ID,
          course_id: COURSE_ID,
          kind: 'material',
          title: 'Week 3 slides',
          version: {
            id: '0192f3c1-eeee-7c3a-9b1f-2a4c6e8f0a1b',
            seq: 1,
            files: [
              { id: 'file-1', position: 1, filename: 'week3-slides.pdf', content_type: 'application/pdf', byte_size: 9 },
              { id: 'file-2', position: 2, filename: 'week3-handout.pdf', content_type: 'application/pdf', byte_size: 9 },
            ],
          },
        })
      : json(404, { error: { code: 'not_found', message: 'no such document' } }),
  )
  s.on('GET', ADMIN.plan, () => json(200, state.plan))
  s.on('GET', ADMIN.usage, () => json(200, state.usage))
  s.on('PUT', ADMIN.quotas, (c) => {
    Object.assign(state.plan, {
      quotas: body(c.body),
      quotas_set: true,
      quotas_updated_at: AT,
      quotas_updated_by: ADMIN_ID,
    })
    return json(200, state.plan)
  })
  s.on('DELETE', ADMIN.quotas, () => {
    Object.assign(state.plan, {
      quotas: { ...state.plan.quota_defaults },
      quotas_set: false,
      quotas_updated_at: null,
      quotas_updated_by: null,
    })
    return json(200, state.plan)
  })
  s.on('POST', ADMIN.offers, (c) => {
    const b = body(c.body)
    const o = siteOffer({
      id: b.id,
      label: b.label,
      provider: b.provider,
      adapter: b.adapter ?? 'openai_chat',
      model: b.model,
      endpoint: b.endpoint ?? null,
      resource: b.resource ?? null,
      region: b.region ?? null,
      max_output_tokens: b.max_output_tokens ?? null,
      reasoning_effort: b.reasoning_effort ?? null,
      enabled: b.enabled ?? true,
      status: b.enabled === false ? 'disabled' : 'offered',
      agents: 0,
      key_hint: 'sk-…new1',
      key_status: b.skip_key_test ? 'untested' : 'tested',
      version: 1,
    })
    state.plan.offers.push(o)
    return json(201, o, { ETag: '"1"' })
  })
  s.on('GET', ADMIN.offer, (_, m) => {
    const i = siteIndex(decodeURIComponent(m[1]))
    if (i < 0) return refusal(404, 'not_found', 'offer_not_found')
    const o = state.plan.offers[i]
    return json(200, o, { ETag: `"${o.version}"` })
  })
  const versioned = (c: { headers: Record<string, string> }, o: PlanOffer) => {
    const im = c.headers['If-Match']
    return !im || im === `"${o.version}"`
  }
  s.on('PATCH', ADMIN.offer, (c, m) => {
    const i = siteIndex(decodeURIComponent(m[1]))
    if (i < 0) return refusal(404, 'not_found', 'offer_not_found')
    // A new object, as an answer is: what a page holds of the one before stays as it was.
    const o = { ...state.plan.offers[i] }
    if (!versioned(c, o)) return refusal(412, 'version_mismatch', 'version_mismatch', { current_version: o.version })
    state.plan.offers[i] = o
    const { key, skip_key_test, ...rest } = body(c.body)
    const model = ['provider', 'adapter', 'model', 'endpoint', 'resource', 'region'].some((k) => k in rest)
    Object.assign(o, rest)
    if (key) {
      o.key_hint = 'sk-…new2'
      o.key_status = skip_key_test ? 'untested' : 'tested'
    } else if (model) o.key_status = 'untested'
    o.status = o.enabled ? 'offered' : 'disabled'
    o.version = (o.version ?? 0) + 1
    return json(200, o, { ETag: `"${o.version}"` })
  })
  s.on('DELETE', ADMIN.offer, (c, m) => {
    const i = siteIndex(decodeURIComponent(m[1]))
    if (i < 0) return refusal(404, 'not_found', 'offer_not_found')
    const o = state.plan.offers[i]
    if (!versioned(c, o)) return refusal(412, 'version_mismatch', 'version_mismatch', { current_version: o.version })
    state.plan.offers.splice(i, 1)
    return json(200, { deleted: { id: o.id }, agents: o.agents })
  })
  // Pricing.
  s.on('GET', ADMIN.prices, () => json(200, state.prices))
  const siteRow = (id: string) => state.prices.rows.findIndex((r) => r.id === id && r.source === 'site')
  s.on('GET', ADMIN.price, (_, m) => {
    const i = siteRow(decodeURIComponent(m[1]))
    if (i < 0) return refusal(404, 'not_found', 'price_not_found')
    const r = state.prices.rows[i]
    return json(200, r, { ETag: `"${r.row_version}"` })
  })
  s.on('POST', ADMIN.prices, (c) => {
    const b = body(c.body)
    const u = b.usd_per_mtok
    const r = priceRow({
      id: b.id,
      provider: b.provider,
      model: b.model,
      glob: b.model.includes('*'),
      from: b.from,
      usd_per_mtok: {
        input: String(u.input),
        output: String(u.output),
        cache_read: String(u.cache_read ?? u.input),
        cache_write: String(u.cache_write ?? u.input),
      },
      row_version: 1,
    })
    state.prices = { ...state.prices, rows: [r, ...state.prices.rows], unpriced_offers: [] }
    return json(201, r, { ETag: '"1"' })
  })
  s.on('PATCH', ADMIN.price, (c, m) => {
    const i = siteRow(decodeURIComponent(m[1]))
    if (i < 0) return refusal(404, 'not_found', 'price_not_found')
    const r = { ...state.prices.rows[i], usd_per_mtok: { ...state.prices.rows[i].usd_per_mtok } }
    if (!versioned(c, { version: r.row_version } as PlanOffer))
      return refusal(412, 'version_mismatch', 'version_mismatch', { current_version: r.row_version })
    const { usd_per_mtok, ...rest } = body(c.body)
    Object.assign(r, rest)
    if (usd_per_mtok)
      for (const [k, v] of Object.entries(usd_per_mtok)) (r.usd_per_mtok as Record<string, string>)[k] = String(v)
    r.row_version = (r.row_version ?? 0) + 1
    state.prices.rows[i] = r
    return json(200, r, { ETag: `"${r.row_version}"` })
  })
  s.on('DELETE', ADMIN.price, (c, m) => {
    const id = decodeURIComponent(m[1])
    const i = siteRow(id)
    if (i < 0) {
      return state.prices.rows.some((r) => r.id === id)
        ? refusal(403, 'forbidden', 'price_read_only')
        : refusal(404, 'not_found', 'price_not_found')
    }
    if (!versioned(c, { version: state.prices.rows[i].row_version } as PlanOffer))
      return refusal(412, 'version_mismatch', 'version_mismatch')
    state.prices = { ...state.prices, rows: state.prices.rows.filter((_, j) => j !== i) }
    return json(200, state.prices)
  })
  s.on('GET', ADMIN.tenants, (c) => {
    const q = new URLSearchParams(c.url.split('?')[1] ?? '')
    const after = q.get('after')
    const from = after ? state.tenants.findIndex((x) => x.tenant_id === after) + 1 : 0
    const page = state.tenants.slice(from, from + 2)
    const more = from + 2 < state.tenants.length
    return json(200, { tenants: page, next: more ? page[page.length - 1].tenant_id : null })
  })
  const tenantIndex = (m: RegExpMatchArray) => state.tenants.findIndex((x) => x.tenant_id === decodeURIComponent(m[1]))
  s.on('PUT', ADMIN.tenant, (c, m) => {
    const i = tenantIndex(m)
    const b = body(c.body)
    const q: TenantQuota = {
      ...state.tenants[i],
      source: 'site',
      per_day: { answers: b.per_day.answers, usd: b.per_day.usd === null ? null : Number(b.per_day.usd).toFixed(6) },
    }
    state.tenants[i] = q
    return json(200, q)
  })
  s.on('DELETE', ADMIN.tenant, (_, m) => {
    const i = tenantIndex(m)
    const was = state.tenants[i]
    const q: TenantQuota = {
      ...was,
      source: was.config_per_day ? 'config' : 'none',
      per_day: was.config_per_day ?? { answers: null, usd: null },
      updated_at: null,
      updated_by: null,
    }
    state.tenants[i] = q
    return json(200, q)
  })
  s.on('GET', ADMIN.budgets, () => json(200, state.budgets))
  s.on('PUT', ADMIN.budgets, (c) => {
    const b = body(c.body)
    const usd = (v: unknown) => (v === null ? null : Number(v).toFixed(6))
    state.budgets = {
      ...state.budgets,
      per_agent_day: { answers: b.per_agent_day.answers, usd: usd(b.per_agent_day.usd) },
      per_asker_day: { answers: b.per_asker_day.answers, usd: usd(b.per_asker_day.usd) },
      set: true,
    }
    return json(200, state.budgets)
  })
  s.on('DELETE', ADMIN.budgets, () => {
    state.budgets = { ...state.budgets, ...state.budgets.defaults, set: false, updated_at: null, updated_by: null }
    return json(200, state.budgets)
  })
  s.on('GET', ADMIN.costs, (c) => json(200, costReport(new URLSearchParams(c.url.split('?')[1] ?? ''))))
  return s
}

/** A fresh token of the transcription service's, in Core's shape, aissvc_<12>_<43>, with its public prefix. */
export function newServiceToken(): { token: string; prefix: string } {
  const t = newToken()
  return { token: t.token.replace(/^ais_/, 'aissvc_'), prefix: t.prefix }
}

/** A credential of the service's in Core, live unless said. */
export function serviceCredential(over: Partial<FakeServiceCredential> = {}): FakeServiceCredential {
  return {
    id: 'cred-held',
    token_prefix: 'held00000000',
    label: 'runtime lms.example.edu',
    live: true,
    created_at: AT,
    revoked_at: null,
    claims_held: 0,
    ...over,
  }
}

/**
 * A fresh state: two offers (runtime.yaml's and the site's), OCR on in two
 * languages, the transcriber on with a credential Core has, and today's use.
 */
export function adminState(over: Partial<AdminState> = {}): AdminState {
  return {
    settings: { ...ocrSettings(), transcription: transcriptionSettings() },
    plan: schoolPlan(),
    usage: planUsage(),
    isAdmin: true,
    prices: priceTable(),
    tenants: [
      tenantQuota(),
      tenantQuota({
        tenant_id: 't_ops',
        owner_actor_id: null,
        display_name: null,
        source: 'config',
        per_day: { answers: 1000, usd: null },
        config_per_day: { answers: 1000, usd: null },
        agents: 3,
        updated_at: null,
        updated_by: null,
      }),
      tenantQuota({
        tenant_id: 'ten_0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b',
        owner_actor_id: '0192f3c1-1111-7c3a-9b1f-2a4c6e8f0a1b',
        display_name: 'Chan Tai Man',
        source: 'none',
        per_day: { answers: null, usd: null },
        config_per_day: null,
        agents: 1,
        updated_at: null,
        updated_by: null,
      }),
    ],
    budgets: agentBudgets(),
    jobs: [
      transcriptionJob(),
      transcriptionJob({
        id: 'job-2',
        // The second file of the version.
        file_id: 'file-2',
        position: 2,
        status: 'skipped',
        reason: 'too_many_pages',
        pages: 812,
        cost_usd: null,
        input_tokens: null,
        output_tokens: null,
      }),
      transcriptionJob({
        id: 'job-3',
        status: 'failed',
        reason: 'The model answered 500 three times',
        document_id: '0192f3c1-ffff-7c3a-9b1f-2a4c6e8f0a1b',
        file_id: 'file-9',
        position: 3,
        pages: null,
        cost_usd: '0.000200',
        backfill: true,
      }),
    ],
    service: { credentials: [serviceCredential()], issued: [], received: [] },
    ...over,
  }
}

/** The plan's quotas as a runtime with quotas in dollars answers them. */
export function withDollars(plan: SchoolPlan): SchoolPlan {
  return {
    ...plan,
    quotas: { ...plan.quotas, per_owner_day_usd: '2.500000', per_asker_day_usd: null, per_day_usd: '100.000000' },
    quota_defaults: {
      ...plan.quota_defaults,
      per_owner_day_usd: null,
      per_asker_day_usd: '0.500000',
      per_day_usd: null,
    },
  }
}

/** An older runtime's answer to a route it does not have. */
export function noRoute() {
  return refusal(404, 'not_found', 'no_route')
}
