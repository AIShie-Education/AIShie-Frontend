// A stand-in OpenID Connect provider for the end-to-end tests, from Node's
// standard library alone, as Core's own tests have one (its
// scripts/e2e-idp.py). It serves one issuer on 127.0.0.1, at a port of its
// own: a discovery document, a key set, an authorization endpoint that signs
// in the one person it vouches for at once and sends the browser back with a
// code, and a token endpoint that redeems each code once, for the client id
// and secret it was made with, for an ID token signed RS256 with a key made as
// it starts.
//
// It refuses a redirect URI other than the one Core says to register
// (sso.list's redirect_uri), so that the tests learn whether Core sends that
// one. Core's redirect URI is under its PUBLIC_URL, 127.0.0.1 and Core's own
// port, while the page is served on another origin that proxies /v1 to Core,
// as a server's does: so, having checked it, it sends the browser to the same
// path on the page's origin (backTo), where Core finishes the sign-in with the
// state cookie it set there. Nothing of a code, a token or the secret is
// logged or thrown.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export interface StandInIdp {
  issuer: string
  clientId: string
  /** The client secret it takes: made up as it starts, for the test to type in, and to say nowhere. */
  clientSecret: string
  /** Sign-ins sent back to Core, and codes redeemed. */
  signIns: number
  redeemed: number
  close(): Promise<void>
}

export interface StandInOptions {
  /** What Core must send as redirect_uri: sso.list's redirect_uri. */
  redirectUri: string
  /** The origin the page is served from, which proxies /v1 to Core. */
  backTo: string
  /** The one person it vouches for: their subject, and their email (vouched for as verified). */
  subject: string
  email: string
  clientId?: string
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export async function startStandInIdp(opts: StandInOptions): Promise<StandInIdp> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string }
  const clientId = opts.clientId ?? 'aishie-e2e'
  const clientSecret = randomBytes(24).toString('base64url')
  const codes = new Map<string, string>() // code → nonce
  const state = { signIns: 0, redeemed: 0 }
  let issuer = ''

  const answer = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
    const data = body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers })
    res.end(data)
  }
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      const parts: Buffer[] = []
      req.on('data', (c: Buffer) => parts.push(c))
      req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
      req.on('error', reject)
    })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname
    if (req.method === 'GET' && path === '/site/.well-known/openid-configuration') {
      return answer(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'profile', 'email'],
        claims_supported: ['sub', 'email', 'email_verified', 'name'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      })
    }
    if (req.method === 'GET' && path === '/site/keys') {
      return answer(res, 200, { keys: [{ kty: 'RSA', kid: 'e2e', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] })
    }
    if (req.method === 'GET' && path === '/site/authorize') {
      const q = url.searchParams
      if (
        q.get('client_id') !== clientId ||
        q.get('redirect_uri') !== opts.redirectUri ||
        q.get('response_type') !== 'code' ||
        !(q.get('scope') ?? '').split(' ').includes('openid') ||
        !q.get('state') ||
        !q.get('nonce')
      ) {
        return answer(res, 400, { error: 'invalid_request' })
      }
      const code = randomBytes(24).toString('base64url')
      codes.set(code, q.get('nonce')!)
      state.signIns++
      const back = new URL(new URL(opts.redirectUri).pathname, opts.backTo)
      back.searchParams.set('code', code)
      back.searchParams.set('state', q.get('state')!)
      return answer(res, 302, undefined, { Location: back.toString() })
    }
    if (req.method === 'POST' && path === '/site/token') {
      const form = new URLSearchParams(await readBody(req))
      let client = form.get('client_id')
      let secret = form.get('client_secret')
      const auth = req.headers.authorization ?? ''
      if (auth.startsWith('Basic ')) {
        const [c, ...s] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
        client = decodeURIComponent(c.replace(/\+/g, ' '))
        secret = decodeURIComponent(s.join(':').replace(/\+/g, ' '))
      }
      const code = form.get('code') ?? ''
      const nonce = codes.get(code)
      codes.delete(code) // a code is good once
      if (client !== clientId || secret !== clientSecret) return answer(res, 401, { error: 'invalid_client' })
      if (!nonce || form.get('grant_type') !== 'authorization_code' || form.get('redirect_uri') !== opts.redirectUri) {
        return answer(res, 400, { error: 'invalid_grant' })
      }
      const now = Math.floor(Date.now() / 1000)
      const claims = {
        iss: issuer,
        aud: clientId,
        sub: opts.subject,
        email: opts.email,
        email_verified: true,
        nonce,
        iat: now,
        exp: now + 300,
      }
      const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'e2e' }))}.${b64url(JSON.stringify(claims))}`
      const token = `${input}.${b64url(sign('sha256', Buffer.from(input), privateKey))}`
      state.redeemed++
      return answer(res, 200, {
        access_token: randomBytes(16).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: token,
      })
    }
    return answer(res, 404, { error: 'not_found' })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  issuer = `http://127.0.0.1:${port}/site`
  return {
    issuer,
    clientId,
    clientSecret,
    get signIns() {
      return state.signIns
    },
    get redeemed() {
      return state.redeemed
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
