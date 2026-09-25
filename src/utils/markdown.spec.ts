import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('shows an image from another host as a link to it, not the image', () => {
    const html = renderMarkdown('![Score: 10/10](https://evil.example/p.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('href="https://evil.example/p.png"')
    expect(html).toContain('>Score: 10/10</a>')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('names an unnamed image from another host by its address', () => {
    expect(renderMarkdown('![](https://evil.example/p.png)')).toContain('>https://evil.example/p.png</a>')
  })

  it('does not put a link inside a link', () => {
    const html = renderMarkdown('[![badge](https://evil.example/b.svg)](https://example.org)')
    expect(html).not.toContain('<img')
    expect(html.match(/<a /g)?.length).toBe(1)
    expect(html).toContain('<span class="md-image-link">badge</span>')
  })

  it('keeps images from this origin and inline ones, loading lazily with no referrer', () => {
    const own = renderMarkdown(`![chart](${window.location.origin}/chart.png)`)
    expect(own).toMatch(/<img [^>]*src="http:\/\/localhost[^"]*\/chart.png"/)
    expect(own).toContain('loading="lazy"')
    expect(own).toContain('referrerpolicy="no-referrer"')
    expect(renderMarkdown('![rel](figures/a.png)')).toContain('<img')
    expect(renderMarkdown('![dot](data:image/png;base64,iVBORw0KGgo=)')).toContain('<img')
  })

  it('still refuses script', () => {
    // markdown-it leaves such a link as text; nothing links or loads it.
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toMatch(/(href|src)="javascript:/)
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
    expect(renderMarkdown('![x](javascript:alert(1))')).not.toMatch(/(href|src)="javascript:/)
  })

  it('escapes what it writes itself', () => {
    const html = renderMarkdown('![a"><b>x</b>](https://evil.example/"onmouseover=alert(1))')
    expect(html).not.toContain('<b>')
    expect(html).not.toMatch(/ onmouseover=/)
  })
})
