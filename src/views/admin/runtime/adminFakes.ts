// For the runtime administrators' page's unit tests only (imported by
// *.spec.ts): the runtime's admin routes behind the hosting components'
// fake servers (hostingFakes.ts), which stub fetch and see every request,
// headers and bodies included. The plan, today's use and the money (prices,
// tenants' quotas, agents' budgets, costs) are kept as a runtime keeps them,
// and answered as its contract has them. OpenRouter's upstream providers for a model are
// answered from state.openrouter, by model: OpenRouter itself is never
// called.
import type {
  AgentBudgets,
  CostGroup,
  CostReport,
  OpenRouterEndpoint,
  OpenRouterEndpoints,
  PlanOffer,
  ProviderOffer,
  PriceRow,
  PriceTable,
  SchoolPlan,
  SchoolPlanUsage,
  TenantQuota,
} from '@/api/runtime-types'
import { INFO, Servers, executed, json, refusal } from '@/views/account/components/agents/hostingFakes'

export { Servers, executed, json, refusal }
export { OFFERS, newKey, newToken } from '@/views/account/components/agents/hostingFakes'

/** What the runtime says of itself, as useRuntime gives it. */
export const INFO_FOR_TESTS = INFO

export const ADMIN_ID = '0192f3c1-aaaa-7c3a-9b1f-2a4c6e8f0a1b'
export const ADMIN_NAME = 'Ada Admin'
export const AT = '2026-09-30T08:12:00Z'

export const ADMIN = {
  me: /^\/runtime\/api\/v1\/me$/,
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
  actor: /^\/v1\/actors\/([^/]+)$/,
  document: /^\/v1\/courses\/([^/]+)\/documents\/([^/]+)$/,
  openrouterEndpoints: /^\/runtime\/api\/v1\/admin\/openrouter\/endpoints$/,
}

/**
 * OpenRouter as the runtime offers it for a key (GET /models): here, and not
 * among hostingFakes' OFFERS, so that the hosting pages' tests stand as they
 * are. A test of an offer of OpenRouter's passes [...OFFERS, OPENROUTER].
 */
export const OPENROUTER: ProviderOffer = {
  provider: 'openrouter',
  label: 'OpenRouter',
  adapters: ['openai_chat'],
  endpoint: { kind: 'fixed', base_url: 'https://openrouter.ai/api/v1' },
  key_prefix: 'sk-or-',
  suggested_models: [{ model: 'meta-llama/llama-3.3-70b-instruct', priced: false }],
}

/** The model the fixture lists upstream providers for. */
export const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct'

/** One upstream provider's endpoint, as the runtime answers it: listed prices, before any discount. */
export function openRouterEndpoint(over: Partial<OpenRouterEndpoint> = {}): OpenRouterEndpoint {
  return {
    slug: 'groq',
    provider: 'groq',
    provider_name: 'Groq',
    quantization: 'unknown',
    usd_per_mtok: { input: '0.590000', output: '0.790000', cache_read: null, cache_write: null },
    usd_per_request: null,
    usd_per_image: null,
    discount: 0,
    higher_above_tokens: null,
    context_length: 131072,
    max_output_tokens: 32768,
    max_prompt_tokens: null,
    tools: true,
    tool_choice: true,
    reasoning: false,
    zdr: true,
    status: 0,
    uptime_30m: 99.26,
    uptime_1d: 99.1,
    latency: null,
    throughput: null,
    headquarters: 'US',
    datacenters: ['US'],
    privacy_policy_url: 'https://groq.com/privacy-policy/',
    terms_of_service_url: 'https://groq.com/terms-of-use/',
    status_page_url: 'https://groqstatus.com/',
    ...over,
  }
}

/**
 * GET admin/openrouter/endpoints's answer for OPENROUTER_MODEL, from the
 * contract's shape and OpenRouter's own list: Groq (calls tools, ZDR),
 * DeepInfra's turbo (calls tools, FP8), Cloudflare (no tools), and Google
 * Vertex's base slug beside one of its regions, to try coverage; the price
 * table has no price for it unless said.
 */
export function openRouterEndpointsFixture(over: Partial<OpenRouterEndpoints> = {}): OpenRouterEndpoints {
  return {
    model: OPENROUTER_MODEL,
    name: 'Meta: Llama 3.3 70B Instruct',
    fetched_at: AT,
    stale: false,
    price: null,
    endpoints: [
      openRouterEndpoint(),
      openRouterEndpoint({
        slug: 'deepinfra/turbo',
        provider: 'deepinfra',
        provider_name: 'DeepInfra',
        quantization: 'fp8',
        usd_per_mtok: { input: '0.100000', output: '0.320000', cache_read: null, cache_write: null },
        max_output_tokens: 16384,
        zdr: false,
        uptime_30m: 98.85,
        uptime_1d: 98.48,
        privacy_policy_url: 'https://deepinfra.com/privacy',
        terms_of_service_url: 'https://deepinfra.com/terms',
        status_page_url: 'https://status.deepinfra.com/',
      }),
      openRouterEndpoint({
        slug: 'cloudflare/fp8',
        provider: 'cloudflare',
        provider_name: 'Cloudflare',
        quantization: 'fp8',
        usd_per_mtok: { input: '0.293000', output: '2.253000', cache_read: null, cache_write: null },
        context_length: 24000,
        max_output_tokens: 21600,
        tools: false,
        tool_choice: false,
        zdr: false,
        uptime_30m: 99.43,
        uptime_1d: 99.2,
        privacy_policy_url: 'https://www.cloudflare.com/privacypolicy/',
        terms_of_service_url: 'https://www.cloudflare.com/website-terms/',
        status_page_url: 'https://www.cloudflarestatus.com/',
      }),
      openRouterEndpoint({
        slug: 'google-vertex',
        provider: 'google-vertex',
        provider_name: 'Google',
        usd_per_mtok: { input: '0.720000', output: '0.720000', cache_read: '0.360000', cache_write: null },
        context_length: 128000,
        max_output_tokens: 115200,
        zdr: false,
        uptime_30m: null,
        uptime_1d: null,
        privacy_policy_url: 'https://cloud.google.com/terms/cloud-privacy-notice',
        terms_of_service_url: 'https://cloud.google.com/terms/',
        status_page_url: 'https://status.cloud.google.com/',
      }),
      openRouterEndpoint({
        slug: 'google-vertex/us-central1',
        provider: 'google-vertex',
        provider_name: 'Google',
        usd_per_mtok: { input: '0.720000', output: '0.720000', cache_read: '0.360000', cache_write: null },
        context_length: 128000,
        max_output_tokens: 8192,
        zdr: false,
        status: -1,
        uptime_30m: null,
        uptime_1d: null,
        privacy_policy_url: 'https://cloud.google.com/terms/cloud-privacy-notice',
        terms_of_service_url: 'https://cloud.google.com/terms/',
        status_page_url: 'https://status.cloud.google.com/',
      }),
    ],
    ...over,
  }
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
    openrouter: null,
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
    openrouter: null,
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

export const COURSE_ID = '0192f3c1-cccc-7c3a-9b1f-2a4c6e8f0a1b'
export const DOC_ID = '0192f3c1-dddd-7c3a-9b1f-2a4c6e8f0a1b'

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
  plan: SchoolPlan
  usage: SchoolPlanUsage
  isAdmin: boolean
  prices: PriceTable
  tenants: TenantQuota[]
  budgets: AgentBudgets
  /**
   * OpenRouter's upstream providers by model, as the runtime answers them,
   * or its refusal (refusal(503, 'unavailable', 'openrouter_unavailable')); a
   * model not here is one OpenRouter has not (404 openrouter_model_not_found).
   */
  openrouter: Record<string, OpenRouterEndpoints | Response>
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
  s.on('GET', ADMIN.openrouterEndpoints, (c) => {
    const model = new URLSearchParams(c.url.split('?')[1] ?? '').get('model') ?? ''
    const a = state.openrouter[model]
    if (!a) return refusal(404, 'not_found', 'openrouter_model_not_found', { field: 'model' })
    if (a instanceof Response) return a.clone()
    return json(200, a, { 'Cache-Control': 'no-store' })
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
      openrouter: b.openrouter ?? null,
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
    // The routing as sent replaces the one kept (null removes it); a move to another provider drops it.
    Object.assign(o, rest)
    if (o.provider !== 'openrouter') o.openrouter = null
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

/**
 * A fresh state: two offers (runtime.yaml's and the site's) and today's use.
 */
export function adminState(over: Partial<AdminState> = {}): AdminState {
  return {
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
    openrouter: { [OPENROUTER_MODEL]: openRouterEndpointsFixture() },
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
