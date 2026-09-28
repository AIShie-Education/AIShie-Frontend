import { describe, expect, it } from 'vitest'
import { emailDomain, emailDomainAllowed, joinLinkUrl, normalizeDomain, qrFileName, tokenFromRoute } from './joinLink'

describe('joinLinkUrl', () => {
  it('puts the join page’s own address on this site’s origin, base path and all', () => {
    expect(joinLinkUrl('https://lms.example.edu', '/join/aisjoin_abc_def')).toBe(
      'https://lms.example.edu/join/aisjoin_abc_def',
    )
    expect(joinLinkUrl('https://lms.example.edu/', '/lms/join/aisjoin_abc_def')).toBe(
      'https://lms.example.edu/lms/join/aisjoin_abc_def',
    )
    expect(joinLinkUrl('http://localhost:5173', '/join/aisjoin_x-y_z')).toBe('http://localhost:5173/join/aisjoin_x-y_z')
  })
})

describe('tokenFromRoute', () => {
  it('takes the token as it is, trimmed', () => {
    expect(tokenFromRoute('aisjoin_abcdefghijkl_S3cr-et_')).toBe('aisjoin_abcdefghijkl_S3cr-et_')
    expect(tokenFromRoute('  aisjoin_a_b ')).toBe('aisjoin_a_b')
    expect(tokenFromRoute(['aisjoin_a_b', 'x'])).toBe('aisjoin_a_b')
  })
  it('drops what clings to a link pasted from a message', () => {
    expect(tokenFromRoute('aisjoin_a_b.')).toBe('aisjoin_a_b')
    expect(tokenFromRoute('aisjoin_a_b),')).toBe('aisjoin_a_b')
    expect(tokenFromRoute('aisjoin_a_b。')).toBe('aisjoin_a_b')
  })
  it('is null for nothing', () => {
    expect(tokenFromRoute('')).toBeNull()
    expect(tokenFromRoute(undefined)).toBeNull()
    expect(tokenFromRoute(' . ')).toBeNull()
  })
})

describe('qrFileName', () => {
  it('names the image by the course, and never by the token', () => {
    expect(qrFileName('CS101', 'A')).toBe('CS101-A-invite-qr.png')
    expect(qrFileName('CS 101', '')).toBe('CS-101-invite-qr.png')
    expect(qrFileName('a/b:c', null)).toBe('a-b-c-invite-qr.png')
    expect(qrFileName('', '')).toBe('invite-qr.png')
  })
})

describe('normalizeDomain', () => {
  it('keeps a domain as a link keeps it', () => {
    expect(normalizeDomain(' @HainanU.edu.cn ')).toBe('hainanu.edu.cn')
    expect(normalizeDomain('example.org.')).toBe('example.org')
    expect(normalizeDomain('mail-1.example.co')).toBe('mail-1.example.co')
  })
  it('refuses what is no domain', () => {
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain('localhost')).toBeNull()
    expect(normalizeDomain('someone@example.org')).toBeNull()
    expect(normalizeDomain('-bad.example.org')).toBeNull()
    expect(normalizeDomain('exa mple.org')).toBeNull()
    expect(normalizeDomain('http://example.org')).toBeNull()
  })
})

describe('emailDomainAllowed', () => {
  it('lets in any email when the link names no domain', () => {
    expect(emailDomainAllowed('a@gmail.com', null)).toBe(true)
    expect(emailDomainAllowed('a@gmail.com', [])).toBe(true)
  })
  it('lets in an email at one of the domains, in any case', () => {
    expect(emailDomainAllowed('Stu@HainanU.edu.cn', ['hainanu.edu.cn'])).toBe(true)
    expect(emailDomainAllowed('a@gmail.com', ['hainanu.edu.cn'])).toBe(false)
    expect(emailDomainAllowed('a@evilhainanu.edu.cn', ['hainanu.edu.cn'])).toBe(false)
    expect(emailDomainAllowed('', ['hainanu.edu.cn'])).toBe(false)
    expect(emailDomainAllowed(null, ['hainanu.edu.cn'])).toBe(false)
  })
  it('reads the domain after the last @', () => {
    expect(emailDomain('"a@b"@example.org')).toBe('example.org')
    expect(emailDomain('nobody')).toBeNull()
    expect(emailDomain('a@')).toBeNull()
  })
})
