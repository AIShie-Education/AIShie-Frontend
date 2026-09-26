import { describe, expect, it } from 'vitest'
import { invitationLink, tokenFromHash } from './invitation'

const TOKEN = 'aisinv_abcdefghijkl_Zm9vYmFyYmF6cXV4LXRoZV9zZWNyZXQtcGFydC1pcy1sb25nLWVub3VnaA'

describe('invitationLink', () => {
  it('puts the token in the fragment of the welcome page', () => {
    expect(invitationLink('https://lms.example.edu/welcome', TOKEN)).toBe(
      `https://lms.example.edu/welcome#token=${TOKEN}`,
    )
  })

  it('keeps a base path, and replaces a fragment the page already had', () => {
    expect(invitationLink('https://example.edu/lms/welcome#old', 'aisinv_x_y')).toBe(
      'https://example.edu/lms/welcome#token=aisinv_x_y',
    )
  })

  it('escapes what a fragment cannot carry as it is', () => {
    expect(invitationLink('https://e.edu/welcome', 'a&b=c d')).toBe('https://e.edu/welcome#token=a%26b%3Dc%20d')
  })
})

describe('tokenFromHash', () => {
  it('reads the token from the fragment, with or without its #', () => {
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromHash(`token=${TOKEN}`)).toBe(TOKEN)
  })

  it('reads back what invitationLink wrote', () => {
    const link = new URL(invitationLink('https://e.edu/welcome', 'a&b=c d'))
    expect(tokenFromHash(link.hash)).toBe('a&b=c d')
    expect(tokenFromHash(new URL(invitationLink('https://e.edu/welcome', TOKEN)).hash)).toBe(TOKEN)
  })

  it('ignores the rest of the fragment', () => {
    expect(tokenFromHash(`#utm=x&token=${TOKEN}&y=1`)).toBe(TOKEN)
  })

  it('is null when there is no token', () => {
    expect(tokenFromHash('')).toBeNull()
    expect(tokenFromHash(null)).toBeNull()
    expect(tokenFromHash('#')).toBeNull()
    expect(tokenFromHash('#token=')).toBeNull()
    expect(tokenFromHash('#token=%20%20')).toBeNull()
    expect(tokenFromHash('#section-2')).toBeNull()
  })
})
