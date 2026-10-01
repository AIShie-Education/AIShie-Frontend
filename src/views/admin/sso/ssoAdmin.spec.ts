import { describe, expect, it } from 'vitest'
import { issuerProblem, problemReason, reportRead } from './ssoAdmin'

describe('issuerProblem', () => {
  it('takes https anywhere, and http for this machine alone, as every Core does', () => {
    for (const issuer of [
      'https://login.example.edu/realms/school',
      'https://10.0.0.1/adfs',
      'https://localhost:8443/realms/school',
      'http://localhost:8081/realms/school',
      'http://127.0.0.1:8081',
      'http://127.0.0.2:8081',
      'http://[::1]:8081/realms/school',
    ]) {
      expect(issuerProblem(issuer), issuer).toBeNull()
    }
  })
  it('refuses http elsewhere, and what is no issuer', () => {
    expect(issuerProblem('http://login.example.edu')).toBe('https')
    expect(issuerProblem('http://10.0.0.1')).toBe('https')
    expect(issuerProblem('http://128.0.0.1')).toBe('https')
    expect(issuerProblem('ftp://localhost')).toBe('https')
    expect(issuerProblem('https://login.example.edu/?x=1')).toBe('url')
    expect(issuerProblem(' ')).toBe('required')
  })
})

describe('problemReason', () => {
  it('finds the reason Core writes in brackets at the end of a problem of sso.test’s', () => {
    expect(
      problemReason(
        'its token_endpoint, "https://idp.internal/token", is on this machine or a private, link-local or reserved address, which this server reaches for no identity provider of the site’s unless its operator sets SSO_ALLOW_PRIVATE_ISSUERS (issuer_address_not_allowed)',
      ),
    ).toBe('issuer_address_not_allowed')
    expect(problemReason('the document has no jwks_uri')).toBeNull()
    expect(problemReason('mentions issuer_address_not_allowed without brackets')).toBeNull()
  })
})

describe('reportRead', () => {
  const discovery_url = 'https://login.example.edu/realms/school/.well-known/openid-configuration'
  it('says how much of the issuer sso.test read, from what Core reports', () => {
    expect(reportRead({ discovery_url: '', problems: ['issuer is on this machine … (issuer_address_not_allowed)'] })).toBe('issuer')
    expect(reportRead({ discovery_url, problems: [`the discovery document: ${discovery_url} could not be reached`] })).toBe('document')
    expect(reportRead({ discovery_url, problems: ['the key set: https://login.example.edu/certs answered HTTP 404'] })).toBe('keys')
    expect(reportRead({ discovery_url, problems: ['it takes no response_type code, which a sign-in here asks for'] })).toBe('all')
    expect(reportRead({ discovery_url, problems: [] })).toBe('all')
  })
})
