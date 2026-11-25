import { describe, expect, it } from 'vitest'

// Traditional Chinese is written as Hong Kong writes it (docs/CONVENTIONS.md, Text), and AIshie's guide in
// Traditional Chinese with it: an address, a network's or a mail's, is 地址, never Taiwan's 位址.
const modules = import.meta.glob<{ default: Record<string, unknown> }>('./messages/zh-Hant/*.ts', { eager: true })

/** Each Traditional Chinese message, as `<namespace>.<path>` and its text. */
function messages(): [string, string][] {
  const out: [string, string][] = []
  const walk = (prefix: string, v: unknown) => {
    if (typeof v === 'string') out.push([prefix, v])
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${prefix}.${k}`, x)
  }
  for (const [path, mod] of Object.entries(modules)) walk(path.replace(/^.*\/([^/]+)\.ts$/, '$1'), mod.default)
  return out
}

/** Taiwan's word, and Hong Kong's for it. */
const TAIWAN: [RegExp, string][] = [[/位址/, '地址']]

describe('Traditional Chinese, as Hong Kong writes it', () => {
  it('says an address 地址, never 位址', () => {
    const all = messages()
    expect(all.length).toBeGreaterThan(1000)
    const found = all.flatMap(([key, text]) =>
      TAIWAN.filter(([word]) => word.test(text)).map(([word, hk]) => `${key}: ${word.source} → ${hk}`),
    )
    expect(found).toEqual([])
    // The single sign-on's refusal of an issuer at a private address, where the word was.
    expect(all.find(([key]) => key === 'ssoAdmin.status.issuer_address_not_allowed')?.[1]).toBe('簽發者地址非公開')
  })
})
