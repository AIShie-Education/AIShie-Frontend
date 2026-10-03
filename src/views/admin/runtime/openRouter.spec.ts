import { describe, expect, it } from 'vitest'
import type { OpenRouterRouting } from '@/api/runtime-types'
import { openRouterEndpoint, openRouterEndpointsFixture } from './adminFakes'
import {
  NEW_OFFER_ROUTING,
  candidates,
  canonicalDecimal,
  canonicalRouting,
  covers,
  emptyRoutingForm,
  formFromRouting,
  highestPrices,
  maxPriceProblem,
  moveInOrder,
  routingErrorAt,
  routingFromForm,
  routingProblems,
  routingRows,
  routingWarnings,
  sameRouting,
  setMode,
  setSort,
  setUsed,
  slugProblem,
  tableBelow,
  tryFirst,
  unorder,
  unskip,
  type RoutingForm,
} from './openRouter'

const endpoints = openRouterEndpointsFixture().endpoints
const form = (r: OpenRouterRouting | null = null): RoutingForm => formFromRouting(r)
const allowed = (f: RoutingForm, maxOut: number | null = null) =>
  candidates(endpoints, f, maxOut)
    .filter((c) => c.allowed)
    .map((c) => c.endpoint.slug)

describe('the canonical routing, as the runtime stores, answers and sends it', () => {
  // The contract's example (§1.5): its YAML, and the provider object on the wire, byte for byte.
  it('puts the members in OpenRouter’s order, keeps lists in theirs and writes max_price as decimal strings', () => {
    const fromYaml = {
      data_collection: 'deny',
      require_parameters: true,
      allow_fallbacks: false,
      only: ['groq', 'together', 'deepinfra'],
      order: ['deepinfra/turbo', 'groq'],
      quantizations: ['fp8', 'bf16', 'unknown'],
      preferred_max_latency: { p90: 3 },
      max_price: { prompt: 1, completion: '2.50' },
    } as OpenRouterRouting
    expect(JSON.stringify(canonicalRouting(fromYaml))).toBe(
      '{"order":["deepinfra/turbo","groq"],"allow_fallbacks":false,"require_parameters":true,' +
        '"data_collection":"deny","only":["groq","together","deepinfra"],"quantizations":["fp8","bf16","unknown"],' +
        '"preferred_max_latency":{"p90":3},"max_price":{"prompt":"1","completion":"2.5"}}',
    )
  })

  // The runtime's golden (AIShie-Agent-Runtime internal/openrouter/testdata/wire.golden.json, TestWireGolden):
  // the same inputs, the same lines, byte for byte.
  it.each([
    [
      '{"max_price":{"image":"0.01","request":0,"completion":"2.50","prompt":1},"preferred_max_latency":{"p90":3},' +
        '"preferred_min_throughput":{"p50":50,"p99":10},"quantizations":["fp8","bf16","unknown"],' +
        '"ignore":["novita"],"only":["groq","together","deepinfra"],"enforce_distillable_text":false,"zdr":true,"data_collection":"deny",' +
        '"require_parameters":true,"allow_fallbacks":false,"order":["deepinfra/turbo","groq"]}',
      '{"order":["deepinfra/turbo","groq"],"allow_fallbacks":false,"require_parameters":true,"data_collection":"deny","zdr":true,' +
        '"enforce_distillable_text":false,"only":["groq","together","deepinfra"],"ignore":["novita"],"quantizations":["fp8","bf16","unknown"],' +
        '"preferred_min_throughput":{"p50":50,"p99":10},"preferred_max_latency":{"p90":3},' +
        '"max_price":{"prompt":"1","completion":"2.5","request":"0","image":"0.01"}}',
    ],
    [
      '{"sort":{"by":"exacto","partition":"model"},"only":["groq"]}',
      '{"only":["groq"],"sort":{"by":"exacto","partition":"model"}}',
    ],
  ])('writes the runtime’s golden: %s', (given, golden) => {
    expect(JSON.stringify(canonicalRouting(JSON.parse(given)))).toBe(golden)
    // And the form the page reads it into writes it back the same.
    expect(JSON.stringify(routingFromForm(formFromRouting(JSON.parse(given))))).toBe(golden)
  })

  it('writes every member in the contract’s order, and false as false', () => {
    const every = {
      max_price: { image: '0.01', request: 0, completion: '2', prompt: '1' },
      preferred_max_latency: { p99: 9, p50: 1 },
      preferred_min_throughput: 50,
      sort: { by: 'throughput', partition: 'none' },
      quantizations: ['fp8'],
      ignore: ['novita'],
      only: ['groq'],
      enforce_distillable_text: false,
      zdr: false,
      data_collection: 'allow',
      require_parameters: false,
      allow_fallbacks: false,
      order: ['groq'],
    } as OpenRouterRouting
    expect(JSON.stringify(canonicalRouting(every))).toBe(
      '{"order":["groq"],"allow_fallbacks":false,"require_parameters":false,"data_collection":"allow","zdr":false,' +
        '"enforce_distillable_text":false,"only":["groq"],"ignore":["novita"],"quantizations":["fp8"],' +
        '"sort":{"by":"throughput","partition":"none"},"preferred_min_throughput":50,' +
        '"preferred_max_latency":{"p50":1,"p99":9},"max_price":{"prompt":"1","completion":"2","request":"0","image":"0.01"}}',
    )
  })

  it.each([
    ['sort {by} alone as the string', { sort: { by: 'price' } }, { sort: 'price' }],
    [
      'a threshold of p50 alone as the number',
      { preferred_min_throughput: { p50: 40 } },
      { preferred_min_throughput: 40 },
    ],
    ['a bare threshold as it is', { preferred_max_latency: 0.5 }, { preferred_max_latency: 0.5 }],
    ['"01.50" as "1.5"', { max_price: { prompt: '01.50' } }, { max_price: { prompt: '1.5' } }],
    ['"2.000000" as "2"', { max_price: { completion: '2.000000' } }, { max_price: { completion: '2' } }],
    ['0 as "0"', { max_price: { request: 0 } }, { max_price: { request: '0' } }],
    ['0.000125 as "0.000125"', { max_price: { image: 0.000125 } }, { max_price: { image: '0.000125' } }],
    [
      'empty lists, empty mappings and nulls left out',
      { order: [], only: [], max_price: {}, preferred_max_latency: {}, zdr: null, sort: null, data_collection: 'deny' },
      { data_collection: 'deny' },
    ],
  ])('writes %s', (_, given, canonical) => {
    expect(canonicalRouting(given as unknown as OpenRouterRouting)).toEqual(canonical)
  })

  it('is none for {} and for null', () => {
    expect(canonicalRouting({})).toBeNull()
    expect(canonicalRouting(null)).toBeNull()
    expect(canonicalRouting({ only: [], max_price: {} })).toBeNull()
  })

  it.each([
    ['01.50', '1.5'],
    ['2.000000', '2'],
    [0, '0'],
    ['0.000125', '0.000125'],
    ['000', '0'],
    ['10', '10'],
    ['1e3', null],
    ['-1', null],
    ['', null],
  ])('a decimal %s is %s', (v, out) => {
    expect(canonicalDecimal(v)).toBe(out)
  })

  it('is read into the form and written back the same, members the page does not offer included', () => {
    const read: OpenRouterRouting = {
      order: ['groq'],
      allow_fallbacks: false,
      enforce_distillable_text: true,
      only: ['groq', 'cloudflare'],
      ignore: ['cloudflare/fp8'],
      sort: { by: 'price', partition: 'model' },
      preferred_min_throughput: { p50: 10, p90: 5 },
      preferred_max_latency: 2,
      max_price: { prompt: '1.5', image: '0.01' },
    }
    const f = form(read)
    expect(f.mode).toBe('only')
    expect(JSON.stringify(routingFromForm(f))).toBe(JSON.stringify(canonicalRouting(read)))
    // A partition read is kept as sort changes, and goes with sort.
    setSort(f, 'latency')
    expect(routingFromForm(f)?.sort).toEqual({ by: 'latency', partition: 'model' })
    setSort(f, '')
    expect(routingFromForm(f)?.sort).toBeUndefined()
    expect(f.sortPartition).toBeNull()
  })

  it('starts a new offer with no data kept, every setting of a call taken, and fallbacks allowed', () => {
    expect(JSON.stringify(routingFromForm(form(NEW_OFFER_ROUTING)))).toBe(
      '{"allow_fallbacks":true,"require_parameters":true,"data_collection":"deny"}',
    )
    expect(routingFromForm(emptyRoutingForm())).toBeNull()
  })

  it('compares routings once canonical', () => {
    expect(sameRouting({ sort: { by: 'price' } } as OpenRouterRouting, { sort: 'price' })).toBe(true)
    expect(sameRouting(null, {})).toBe(true)
    expect(sameRouting({ only: ['a', 'b'] }, { only: ['b', 'a'] })).toBe(false)
  })
})

describe('slugs', () => {
  it.each([
    ['groq', true],
    ['deepinfra/turbo', true],
    ['google-vertex/us-east5', true],
    ['google-vertex/global/flex', true],
    ['a/b.c/d_e/f-g', true],
    ['Groq', false],
    ['-groq', false],
    ['groq/', false],
    ['a/b/c/d/e', false],
    ['has space', false],
    [`a/${'b'.repeat(64)}/${'c'.repeat(64)}`, false],
  ])('%s is a slug: %s', (slug, ok) => {
    expect(slugProblem(slug, []) === null).toBe(ok)
  })

  it('says one already a row is listed already', () => {
    expect(slugProblem('groq', ['groq'])).toBe('runtimeAdmin.openrouter.invalid.slugTwice')
    expect(slugProblem('GROQ', [])).toBe('runtimeAdmin.openrouter.invalid.slug')
  })

  it('a base slug covers its provider’s endpoints, and only those', () => {
    expect(covers('google-vertex', 'google-vertex/us-east5')).toBe(true)
    expect(covers('google-vertex', 'google-vertex')).toBe(true)
    expect(covers('google-vertex/us-east5', 'google-vertex')).toBe(false)
    expect(covers('google', 'google-vertex')).toBe(false)
    expect(covers('deepinfra/turbo', 'deepinfra/turbo/x')).toBe(false)
  })
})

describe('what is wrong with the routing', () => {
  it('finds nothing in a new offer’s', () => {
    expect(routingProblems(form(NEW_OFFER_ROUTING))).toEqual({})
  })

  it('finds a slug that is not one, or twice in a list, on the table’s line', () => {
    expect(routingProblems(form({ only: ['groq', 'Bad Slug'] })).table).toBe('runtimeAdmin.openrouter.invalid.slug')
    expect(routingProblems(form({ ignore: ['groq', 'groq'] })).table).toBe('runtimeAdmin.openrouter.invalid.slugTwice')
  })

  it('wants one at least, where only those turned on may answer', () => {
    const f = form()
    setMode(f, 'only')
    expect(routingProblems(f).table).toBe('runtimeAdmin.openrouter.invalid.onlyNone')
    setUsed(f, 'groq', true)
    expect(routingProblems(f)).toEqual({})
  })

  it('finds thresholds out of their bounds, each on its own input', () => {
    const f = form()
    f.throughput = { p50: 0, p75: 100_000, p90: 100_001, p99: null }
    f.latency = { p50: -1, p75: 600, p90: 600.5, p99: 0.25 }
    expect(routingProblems(f)).toEqual({
      'preferred_min_throughput/p50': 'runtimeAdmin.openrouter.invalid.throughput',
      'preferred_min_throughput/p90': 'runtimeAdmin.openrouter.invalid.throughput',
      'preferred_max_latency/p50': 'runtimeAdmin.openrouter.invalid.latency',
      'preferred_max_latency/p90': 'runtimeAdmin.openrouter.invalid.latency',
    })
  })

  it('finds a highest price that is not dollars, or more than 1,000,000', () => {
    expect(maxPriceProblem('')).toBeNull()
    expect(maxPriceProblem('0')).toBeNull()
    expect(maxPriceProblem('1000000')).toBeNull()
    expect(maxPriceProblem('0.000001')).toBeNull()
    expect(maxPriceProblem('1000000.01')).toBe('runtimeAdmin.openrouter.invalid.price')
    expect(maxPriceProblem('0.0000001')).toBe('runtimeAdmin.openrouter.invalid.price')
    expect(maxPriceProblem('1e3')).toBe('runtimeAdmin.openrouter.invalid.price')
    expect(maxPriceProblem('-1')).toBe('runtimeAdmin.openrouter.invalid.price')
    const f = form()
    f.maxPrice.prompt = 'abc'
    f.maxPrice.image = '2'
    expect(routingProblems(f)).toEqual({ 'max_price/prompt': 'runtimeAdmin.openrouter.invalid.price' })
  })

  it('places the runtime’s refusals by member, an index of a list by its slug', () => {
    const f = form({ order: ['groq'], only: ['groq', 'cloudflare/fp8'] })
    expect(routingErrorAt('/openrouter', f)).toEqual({ key: 'section', member: '', slug: null })
    expect(routingErrorAt('/openrouter/only/1', f)).toEqual({ key: 'table', member: 'only', slug: 'cloudflare/fp8' })
    expect(routingErrorAt('/openrouter/order', f)).toEqual({ key: 'table', member: 'order', slug: null })
    expect(routingErrorAt('/openrouter/max_price/prompt', f)?.key).toBe('max_price/prompt')
    expect(routingErrorAt('/openrouter/max_price', f)?.key).toBe('max_price')
    expect(routingErrorAt('/openrouter/preferred_max_latency/p90', f)?.key).toBe('preferred_max_latency/p90')
    expect(routingErrorAt('/openrouter/preferred_min_throughput', f)?.key).toBe('preferred_min_throughput')
    expect(routingErrorAt('/openrouter/sort/by', f)?.key).toBe('sort')
    expect(routingErrorAt('/openrouter/quantizations/3', f)?.key).toBe('quantizations')
    expect(routingErrorAt('/openrouter/enforce_distillable_text', f)?.key).toBe('section')
    expect(routingErrorAt('/model', f)).toBeNull()
  })
})

describe('which upstream providers may answer', () => {
  it('is every one, with nothing set', () => {
    expect(allowed(form())).toEqual([
      'groq',
      'deepinfra/turbo',
      'cloudflare/fp8',
      'google-vertex',
      'google-vertex/us-central1',
    ])
  })

  it('leaves out those skipped, a base slug skipping its endpoints', () => {
    expect(allowed(form({ ignore: ['google-vertex', 'groq'] }))).toEqual(['deepinfra/turbo', 'cloudflare/fp8'])
  })

  it('keeps only those turned on, a base slug turning on its endpoints, less those skipped beside them', () => {
    expect(allowed(form({ only: ['groq', 'google-vertex'] }))).toEqual([
      'groq',
      'google-vertex',
      'google-vertex/us-central1',
    ])
    expect(allowed(form({ only: ['google-vertex'], ignore: ['google-vertex/us-central1'] }))).toEqual(['google-vertex'])
  })

  it('leaves out a precision not chosen, ZDR where it is asked (not known counts as ZDR), and what costs more', () => {
    expect(allowed(form({ quantizations: ['fp8'] }))).toEqual(['deepinfra/turbo', 'cloudflare/fp8'])
    expect(allowed(form({ zdr: true }))).toEqual(['groq'])
    const unknown = [openRouterEndpoint({ slug: 'x', zdr: null }), openRouterEndpoint({ slug: 'y', zdr: false })]
    expect(
      candidates(unknown, form({ zdr: true }), null)
        .filter((c) => c.allowed)
        .map((c) => c.endpoint.slug),
    ).toEqual(['x'])
    expect(allowed(form({ max_price: { prompt: '0.5' } }))).toEqual(['deepinfra/turbo', 'cloudflare/fp8'])
    expect(allowed(form({ max_price: { completion: '1' } }))).toEqual([
      'groq',
      'deepinfra/turbo',
      'google-vertex',
      'google-vertex/us-central1',
    ])
    // A price per call or image is compared only where both are given.
    const perCall = [openRouterEndpoint({ slug: 'a', usd_per_request: '0.010000' }), openRouterEndpoint({ slug: 'b' })]
    expect(
      candidates(perCall, form({ max_price: { request: '0.001' } }), null)
        .filter((c) => c.allowed)
        .map((c) => c.endpoint.slug),
    ).toEqual(['b'])
  })

  it('leaves out those that cannot give the offer’s output bound, or the runtime’s 4000 where it sets none', () => {
    expect(allowed(form(), 10_000)).toEqual(['groq', 'deepinfra/turbo', 'cloudflare/fp8', 'google-vertex'])
    expect(allowed(form(), 20_000)).toEqual(['groq', 'cloudflare/fp8', 'google-vertex'])
    const short = [
      openRouterEndpoint({ slug: 'short', max_output_tokens: 3072 }),
      openRouterEndpoint({ slug: 'any', max_output_tokens: null }),
    ]
    expect(
      candidates(short, form(), null)
        .filter((c) => c.allowed)
        .map((c) => c.endpoint.slug),
    ).toEqual(['any'])
  })

  it('says which control leaves one out', () => {
    const [groq, deepinfra] = candidates(endpoints, form({ quantizations: ['bf16'], zdr: true }), 20_000)
    expect(groq.excludedBy).toEqual(['quantizations'])
    expect(deepinfra.excludedBy).toEqual(['quantizations', 'zdr', 'maxOutput'])
    // One not turned on is not left out by a limit: it is off.
    expect(candidates(endpoints, form({ ignore: ['groq'], zdr: true }), null)[0]).toMatchObject({
      used: false,
      allowed: false,
      excludedBy: [],
    })
  })
})

describe('what the table warns of', () => {
  it('that no upstream provider may answer, once the list is read', () => {
    const all = form({ ignore: ['groq', 'deepinfra', 'cloudflare', 'google-vertex'] })
    expect(routingWarnings(endpoints, all, null).none).toBe(true)
    expect(routingWarnings([], all, null).none).toBe(false)
    const only = form()
    setMode(only, 'only')
    expect(routingWarnings(endpoints, only, null).none).toBe(true)
  })

  it('that none of those that may answer calls tools', () => {
    const w = routingWarnings(endpoints, form({ only: ['cloudflare'] }), null)
    expect(w).toEqual({ none: false, noTools: true, someNoTools: [] })
  })

  it('names those tried first, or turned on alone, that call no tools', () => {
    expect(routingWarnings(endpoints, form({ only: ['groq', 'cloudflare/fp8'] }), null).someNoTools).toEqual([
      'Cloudflare',
    ])
    expect(routingWarnings(endpoints, form({ order: ['cloudflare/fp8'] }), null).someNoTools).toEqual(['Cloudflare'])
    // All may answer and none is tried first: OpenRouter skips those without tools itself, and nothing is said.
    expect(routingWarnings(endpoints, form(), null).someNoTools).toEqual([])
  })
})

describe('the prices', () => {
  it('are the highest listed among those that may answer', () => {
    expect(highestPrices(candidates(endpoints, form(), null))).toEqual({
      input: '0.720000',
      output: '2.253000',
      cache_read: '0.360000',
    })
    expect(highestPrices(candidates(endpoints, form({ only: ['groq', 'deepinfra/turbo'] }), null))).toEqual({
      input: '0.590000',
      output: '0.790000',
      cache_read: null,
    })
    expect(
      highestPrices(
        candidates(endpoints, form({ ignore: ['groq', 'deepinfra', 'cloudflare', 'google-vertex'] }), null),
      ),
    ).toBeNull()
  })

  it('warn where the price table counts less for input or output than the highest', () => {
    const highest = { input: '0.720000', output: '2.253000', cache_read: null }
    const price = (input: string, output: string) => ({
      version: 'v',
      usd_per_mtok: { input, output, cache_read: input, cache_write: input },
    })
    expect(tableBelow(price('0.72', '2.253'), highest)).toBe(false)
    expect(tableBelow(price('0.5', '3'), highest)).toBe(true)
    expect(tableBelow(price('1', '2'), highest)).toBe(true)
    expect(tableBelow(null, highest)).toBe(false)
    expect(tableBelow(price('0', '0'), null)).toBe(false)
  })
})

describe('the table’s rows and controls', () => {
  it('lists OpenRouter’s, then the slugs the routing names that it does not, then those added', () => {
    const f = form({ order: ['together'], only: ['groq', 'together', 'novita/bf16'] })
    f.added = ['groq', 'parasail']
    expect(routingRows(endpoints, f, null).map((r) => [r.slug, !!r.endpoint, r.used, r.position])).toEqual([
      ['groq', true, true, 0],
      ['deepinfra/turbo', true, false, 0],
      ['cloudflare/fp8', true, false, 0],
      ['google-vertex', true, false, 0],
      ['google-vertex/us-central1', true, false, 0],
      ['together', false, true, 1],
      ['novita/bf16', false, true, 0],
      ['parasail', false, false, 0],
    ])
    // With no list read, only the routing's own.
    expect(routingRows(null, f, null).map((r) => r.slug)).toEqual(['together', 'groq', 'novita/bf16', 'parasail'])
  })

  it('shows a row a base slug covers as included in it, in either mode', () => {
    const skipped = routingRows(endpoints, form({ ignore: ['google-vertex'] }), null)
    expect(skipped.find((r) => r.slug === 'google-vertex')).toMatchObject({ used: false, coveredBy: null })
    expect(skipped.find((r) => r.slug === 'google-vertex/us-central1')).toMatchObject({
      used: false,
      coveredBy: 'google-vertex',
    })
    const chosen = routingRows(endpoints, form({ only: ['google-vertex'] }), null)
    expect(chosen.find((r) => r.slug === 'google-vertex/us-central1')).toMatchObject({
      used: true,
      coveredBy: 'google-vertex',
    })
  })

  it('turns a row off by skipping it, which takes it out of those tried first, and on again', () => {
    const f = form({ order: ['google-vertex/us-central1', 'groq'] })
    setUsed(f, 'google-vertex', false)
    expect(f.ignore).toEqual(['google-vertex'])
    expect(f.order).toEqual(['groq'])
    setUsed(f, 'google-vertex', true)
    expect(f.ignore).toEqual([])
  })

  it('turns rows on one by one where only those may answer, and keeps those tried first among them', () => {
    const f = form({ ignore: ['groq'], order: ['deepinfra/turbo'] })
    setMode(f, 'only')
    expect([f.mode, f.ignore, f.only, f.order]).toEqual(['only', [], [], []])
    setUsed(f, 'groq', true)
    setUsed(f, 'cloudflare/fp8', true)
    tryFirst(f, 'cloudflare/fp8')
    tryFirst(f, 'groq')
    expect(f.order).toEqual(['cloudflare/fp8', 'groq'])
    setUsed(f, 'cloudflare/fp8', false)
    expect(f.only).toEqual(['groq'])
    expect(f.order).toEqual(['groq'])
    setMode(f, 'all')
    expect([f.only, f.order]).toEqual([[], ['groq']])
  })

  it('turning one on takes out what skips it beside only those turned on, and skipped ones may be taken out', () => {
    const f = form({ only: ['groq'], ignore: ['cloudflare', 'novita'] })
    setUsed(f, 'cloudflare/fp8', true)
    expect(f.ignore).toEqual(['novita'])
    unskip(f, 'novita')
    expect(f.ignore).toEqual([])
  })

  it('tries rows first in order, clearing sort as the first is put first', () => {
    const f = form({ sort: { by: 'price', partition: 'none' } })
    tryFirst(f, 'groq')
    expect([f.sortBy, f.sortPartition]).toEqual(['', null])
    tryFirst(f, 'deepinfra/turbo')
    tryFirst(f, 'groq')
    expect(f.order).toEqual(['groq', 'deepinfra/turbo'])
    moveInOrder(f, 'deepinfra/turbo', -1)
    expect(f.order).toEqual(['deepinfra/turbo', 'groq'])
    moveInOrder(f, 'deepinfra/turbo', -1)
    expect(f.order).toEqual(['deepinfra/turbo', 'groq'])
    moveInOrder(f, 'deepinfra/turbo', 1)
    expect(f.order).toEqual(['groq', 'deepinfra/turbo'])
    unorder(f, 'groq')
    expect(f.order).toEqual(['deepinfra/turbo'])
  })
})
