// For the runtime administrators' page's unit tests only (imported by
// *.spec.ts): the runtime's admin routes behind the hosting components'
// fake servers (hostingFakes.ts), which stub fetch and see every request,
// headers and bodies included. The plan, OCR's settings and today's use are
// kept as a runtime keeps them, and answered as its contract has them.
import type { OcrSettings, PlanOffer, RuntimeSettings, SchoolPlan, SchoolPlanUsage } from '@/api/runtime-types'
import { INFO, Servers, executed, json, refusal } from '@/views/account/components/agents/hostingFakes'

export { Servers, json, refusal }
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
  actor: /^\/v1\/actors\/([^/]+)$/,
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

/** What the fake runtime holds, for a test to look at or change. */
export interface AdminState {
  settings: RuntimeSettings
  plan: SchoolPlan
  usage: SchoolPlanUsage
  isAdmin: boolean
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
    const o = state.settings.ocr
    if (p.ocr?.enabled !== undefined) o.enabled = p.ocr.enabled
    if (p.ocr && 'languages' in p.ocr) o.languages = p.ocr.languages ?? [...o.default_languages]
    o.updated_at = '2026-09-30T09:00:00Z'
    o.updated_by = ADMIN_ID
    return json(200, state.settings)
  })
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
  return s
}

/** A fresh state: two offers (runtime.yaml's and the site's), OCR on in two languages, and today's use. */
export function adminState(over: Partial<AdminState> = {}): AdminState {
  return { settings: ocrSettings(), plan: schoolPlan(), usage: planUsage(), isAdmin: true, ...over }
}

/** An older runtime's answer to a route it does not have. */
export function noRoute() {
  return refusal(404, 'not_found', 'no_route')
}
