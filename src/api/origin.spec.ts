import { afterEach, describe, expect, it, vi } from 'vitest'

// API_BASE and CORE_ORIGIN are read once, when the module loads.
async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('./http')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('where Core is', () => {
  it('sends a bare path back from single sign-on when Core is this origin', async () => {
    const http = await load({ VITE_API_BASE: '', VITE_CORE_PUBLIC_URL: '' })
    const u = new URL(http.ssoStartUrl('/courses/c1?x=1'), window.location.href)
    expect(u.pathname).toBe('/v1/auth/sso/start')
    expect(u.searchParams.get('return_to')).toBe('/courses/c1?x=1')
    expect(http.CORE_ORIGIN).toBe(window.location.origin)
    expect(http.MCP_ENDPOINT).toBe(`${window.location.origin}/mcp`)
  })

  it('sends a full address on this origin when Core is elsewhere', async () => {
    const http = await load({ VITE_API_BASE: 'https://core.example.edu', VITE_CORE_PUBLIC_URL: '' })
    const u = new URL(http.ssoStartUrl('/courses/c1'))
    expect(u.origin).toBe('https://core.example.edu')
    expect(u.searchParams.get('return_to')).toBe(`${window.location.origin}/courses/c1`)
    expect(http.CORE_ORIGIN).toBe('https://core.example.edu')
  })

  it('takes a path prefix as this origin', async () => {
    const http = await load({ VITE_API_BASE: '/core', VITE_CORE_PUBLIC_URL: '' })
    expect(http.CORE_ORIGIN).toBe(window.location.origin)
    expect(http.MCP_ENDPOINT).toBe(`${window.location.origin}/mcp`)
    const u = new URL(http.ssoStartUrl('/courses/c1'), window.location.href)
    expect(u.pathname).toBe('/core/v1/auth/sso/start')
    expect(u.searchParams.get('return_to')).toBe('/courses/c1')
  })

  it('prefers the public URL it is given', async () => {
    const http = await load({ VITE_API_BASE: '/core', VITE_CORE_PUBLIC_URL: 'https://lms.example.edu/' })
    expect(http.MCP_ENDPOINT).toBe('https://lms.example.edu/mcp')
  })
})
