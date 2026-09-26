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

describe('math', () => {
  it('typesets $…$ inline, as MathML for readers and HTML for the eye', () => {
    const html = renderMarkdown('Pythagoras: $a^2 + b^2 = c^2$.')
    expect(html).toContain('<span class="katex">')
    expect(html).toContain('<math')
    expect(html).toContain('<msup><mi>a</mi><mn>2</mn></msup>')
    expect(html).not.toContain('$')
  })

  it('typesets $$…$$ as a display, on lines of its own or on one line', () => {
    const block = renderMarkdown('Before\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter')
    expect(block).toContain('<div class="md-math"><span class="katex-display">')
    expect(block).toContain('<p>Before</p>')
    expect(block).toContain('<p>After</p>')
    expect(renderMarkdown('$$\\frac{1}{2}$$')).toContain('class="katex-display"')
    expect(renderMarkdown('so $$x = 1$$ holds')).toContain('class="katex-display"')
  })

  it('leaves prices, escaped dollars and code alone', () => {
    const prices = renderMarkdown('It costs $5 and $10.')
    expect(prices).not.toContain('katex')
    expect(prices).toContain('It costs $5 and $10.')
    expect(renderMarkdown('\\$x$ is not math')).not.toContain('katex')
    expect(renderMarkdown('`$x$` is code')).toContain('<code>$x$</code>')
    const fence = renderMarkdown('```\n$$x$$\n```')
    expect(fence).not.toContain('katex')
    expect(fence).toContain('$$x$$')
  })

  it('leaves a $$ that is never closed as text', () => {
    const html = renderMarkdown('$$\nx + 1\n\nmore text')
    expect(html).not.toContain('katex')
    expect(html).toContain('more text')
  })

  it('shows TeX it cannot read as written, marked as an error', () => {
    const html = renderMarkdown('$\\frac{1}{$')
    expect(html).toContain('katex-error')
    expect(html).toContain('\\frac{1}{')
  })

  it('does not read the TeX out again after the formula', () => {
    const html = renderMarkdown('$x^2$')
    expect(html).not.toContain('<annotation')
    expect(html).not.toContain('x^2')
  })

  it('makes no links, images or script from TeX', () => {
    for (const tex of [
      '$\\href{javascript:alert(1)}{x}$',
      '$\\url{javascript:alert(1)}$',
      '$\\includegraphics{https://evil.example/p.png}$',
      '$\\htmlClass{x}{y}$',
      '$<img src=x onerror=alert(1)>$',
      '$\\text{<script>alert(1)</script>}$',
    ]) {
      const html = renderMarkdown(tex)
      expect(html).not.toMatch(/<a |<img|<script|javascript:|onerror=/)
    }
  })

  it('does not take time in the square of the number of dollar signs that close nothing', () => {
    const started = Date.now()
    expect(renderMarkdown('$1 '.repeat(50_000))).not.toContain('katex')
    expect(renderMarkdown('$$a\n\n'.repeat(20_000))).not.toContain('katex')
    expect(Date.now() - started).toBeLessThan(3000)
  })
})

describe('code', () => {
  it('highlights fenced code in a language it knows', () => {
    const sql = renderMarkdown('```sql\nSELECT name FROM student WHERE id = 1;\n```')
    expect(sql).toContain('<code class="language-sql">')
    expect(sql).toContain('<span class="hljs-keyword">SELECT</span>')
    for (const lang of ['python', 'java', 'c', 'cpp', 'javascript', 'typescript', 'bash', 'json', 'go', 'py', 'ts']) {
      expect(renderMarkdown(`\`\`\`${lang}\nx = 1\n\`\`\``)).toContain(`class="language-${lang}"`)
    }
    expect(renderMarkdown('```python\ndef f():\n    return 1\n```')).toContain('<span class="hljs-keyword">def</span>')
  })

  it('leaves code in no language, or one it does not know, plain', () => {
    const html = renderMarkdown('```klingon\n<b>x</b>\n```')
    expect(html).not.toContain('hljs-')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(renderMarkdown('```\nSELECT 1\n```')).not.toContain('hljs-')
  })

  it('escapes the code it highlights', () => {
    const html = renderMarkdown("```javascript\nconst s = '<script>alert(1)</script>'\n```")
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })
})
