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
    const shell = renderMarkdown('The variables $HOME and `$PATH` are set.')
    expect(shell).toContain('$HOME and <code>$PATH</code> are set.')
    expect(shell).not.toContain('katex')
  })

  it('takes the first $ after an opening one as its close, or the opening one as text', () => {
    const mixed = renderMarkdown('It costs $5 and $10, where $x$ is unknown.')
    expect(mixed).toContain('It costs $5 and $10, where ')
    expect(mixed).not.toContain('katex-error')
    expect(mixed.match(/<span class="katex">/g)).toHaveLength(1)
    const tickets = renderMarkdown('Tickets are $5 each; solve for $n$.')
    expect(tickets).toContain('Tickets are $5 each; solve for ')
    expect(tickets).not.toContain('katex-error')
    expect(tickets.match(/<span class="katex">/g)).toHaveLength(1)
  })

  it('does not let a display span a blank line or a code fence', () => {
    const famous = renderMarkdown('$$E = mc^2$$ is the famous one. Newton wrote\n\n$$\nF = ma\n$$\n\nThe end.')
    expect(famous).not.toContain('katex-error')
    expect(famous).toContain('is the famous one. Newton wrote')
    expect(famous.match(/class="katex-display"/g)).toHaveLength(2)
    expect(famous).toContain('<p>The end.</p>')

    const pid = renderMarkdown('$$ is the PID of the shell:\n\n```bash\necho $$\n```\n\nAfter.')
    expect(pid).not.toContain('katex')
    expect(pid).toContain('<p>$$ is the PID of the shell:</p>')
    expect(pid).toMatch(/<pre><code class="language-bash">[^]*\$\$[^]*<\/code><\/pre>/)
    expect(pid).toContain('<p>After.</p>')

    const unclosed = renderMarkdown('$$\nx + 1\n\nPara one.\n\nPara two.\n\n$$\ny\n$$')
    expect(unclosed).toContain('<p>Para one.</p>')
    expect(unclosed).toContain('<p>Para two.</p>')
    expect(unclosed.match(/class="katex-display"/g)).toHaveLength(1)

    expect(renderMarkdown('- one\n  $$\n- two\n\n  $$\n  x^2\n  $$')).toContain('<div class="md-math">')
    const two = renderMarkdown('$$a$$ and $$b$$')
    expect(two.match(/class="katex-display"/g)).toHaveLength(2)
    expect(two).not.toContain('katex-error')
    expect(renderMarkdown('$$\na\n= b\n- c\n$$')).toContain('<div class="md-math">')
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
    expect(renderMarkdown('$a '.repeat(50_000) + '`b$')).not.toContain('katex')
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('shows as written what could make too much: macros defined in the text, @-named ones, very long TeX', () => {
    for (const tex of [
      '$\\def\\a{' + 'x'.repeat(500) + '}' + '\\a'.repeat(200) + '$',
      '$\\newcommand{\\a}{' + 'x'.repeat(500) + '}' + '\\a'.repeat(200) + '$',
      '$$\\tag{\\(' + '\\sqrt{x}'.repeat(40) + '\\)}' + '\\df@tag'.repeat(100) + '$$',
      '$\\color{' + 'a'.repeat(1000) + '}' + '\\current@color'.repeat(200) + '$',
      '$' + 'x+'.repeat(2500) + 'x$',
    ]) {
      const started = Date.now()
      const html = renderMarkdown(tex)
      expect(Date.now() - started).toBeLessThan(200)
      expect(html).not.toContain('class="katex')
      expect(html).toContain('md-math-error')
    }
    expect(renderMarkdown('$\\color{red}{x}$')).toContain('<span class="katex">')
    expect(renderMarkdown('$$x \\tag{1}$$')).toContain('class="katex-display"')
  })

  it('stops typesetting once the formulas of one text have made enough', () => {
    const formula = '$' + '\\sqrt{x}'.repeat(300) + '$'
    const html = renderMarkdown(Array(10).fill(formula).join('\n\n'))
    expect(html).toContain('<span class="katex">')
    expect(html).toContain('md-math-error')
    // A new text starts again.
    expect(renderMarkdown(formula)).toContain('<span class="katex">')
  })

  it('shows as written a formula that reaches beyond the sizes KaTeX allows', () => {
    for (const tex of [
      'x $\\rule[-3000em]{1em}{1em}$',
      '$\\raisebox{-100000em}{x}$',
      '$\\rule[-50000pt]{1em}{1em}$',
      '$\\kern{-1000em}x$',
      '$\\rule[-' + '9'.repeat(30) + 'em]{1em}{1em}$',
      '$\\rule[-' + '9'.repeat(400) + 'em]{1em}{1em}$',
    ]) {
      const html = renderMarkdown(tex)
      expect(html).toContain('md-math-error')
      expect(html).not.toContain('katex')
    }
    const lines = Array.from({ length: 80 }, (_, i) => `x_{${i + 1}} &= x_{${i}} + 1`).join(' \\\\\n')
    const derivation = renderMarkdown(`$$\n\\begin{aligned}\n${lines}\n\\end{aligned}\n$$`)
    expect(derivation).toContain('katex-display')
    expect(derivation).not.toContain('md-math-error')
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
