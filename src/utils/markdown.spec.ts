import { afterEach, describe, expect, it, vi } from 'vitest'
import katex from 'katex'
import { pageHeadingOf, pageHeadings, renderMarkdown } from './markdown'

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

// The tests run in Node, whose process this is (the app's types leave Node's out).
type CpuUsage = { user: number; system: number }
const node = (globalThis as unknown as { process: { threadCpuUsage?: () => CpuUsage; cpuUsage: () => CpuUsage } })
  .process

/** The CPU time this thread has spent, in ms: unlike the wall clock, it stands still while other work has the CPU. */
function cpuTime(): number {
  const used = node.threadCpuUsage?.() ?? node.cpuUsage()
  return (used.user + used.system) / 1000
}

/**
 * How many times more CPU time renderMarkdown takes on text(4n) than on
 * text(n), neither of which it typesets: about 4 where its work grows with
 * the text, 16 where it grows with the text's square. CPU time, not the
 * wall clock's: on a busy machine a short run may have a CPU to itself and a
 * longer one share it, which the wall clock would count as work. The two
 * are rendered one after the other, three times, and the middle one of the
 * three ratios is taken: a run that the machine's other work slowed, or a
 * short one it happened to leave alone, does not decide it.
 */
function growth(text: (n: number) => string, n: number): number {
  const ratios: number[] = []
  for (let round = 0; round < 3; round++) {
    const [small, large] = [text(n), text(4 * n)].map((src) => {
      const started = cpuTime()
      const html = renderMarkdown(src)
      const used = cpuTime() - started
      expect(html).not.toContain('katex')
      return used
    })
    ratios.push(large! / small!)
  }
  return ratios.sort((a, b) => a - b)[1]!
}

describe('math', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  // What is bounded is how the work grows with the text, never how long it
  // takes: four times the dollar signs may cost up to 8 times as much, twice
  // the 4 of work that grows with the text and half the 16 of a search from
  // each sign to the end of the text. The sizes are those at which such a
  // search, were there one, would outweigh the rest of rendering, and at
  // which a run is long enough for its cost to hold still; rendering them
  // takes a second or two on an idle machine, and several times that on a
  // busy one, within the suite's 30 s (vite.config.ts).
  it('does not take time in the square of the number of dollar signs that close nothing', () => {
    const texts: [(n: number) => string, number][] = [
      [(n) => '$1 '.repeat(n), 5_000],
      [(n) => '$$a\n\n'.repeat(n), 1_000],
      [(n) => '$a '.repeat(n) + '`b$', 5_000],
    ]
    for (const [text, n] of texts) expect(growth(text, n)).toBeLessThan(8)
  })

  it('shows as written what could make too much: macros defined in the text, @-named ones, very long TeX', () => {
    const typeset = vi.spyOn(katex, 'renderToString')
    for (const tex of [
      '$\\def\\a{' + 'x'.repeat(500) + '}' + '\\a'.repeat(200) + '$',
      '$\\newcommand{\\a}{' + 'x'.repeat(500) + '}' + '\\a'.repeat(200) + '$',
      '$$\\tag{\\(' + '\\sqrt{x}'.repeat(40) + '\\)}' + '\\df@tag'.repeat(100) + '$$',
      '$\\color{' + 'a'.repeat(1000) + '}' + '\\current@color'.repeat(200) + '$',
      '$' + 'x+'.repeat(2500) + 'x$',
    ]) {
      const html = renderMarkdown(tex)
      expect(html).not.toContain('class="katex')
      expect(html).toContain('md-math-error')
    }
    // Refused before KaTeX is asked: typesetting them is what would take
    // seconds, and make megabytes.
    expect(typeset).not.toHaveBeenCalled()
    expect(renderMarkdown('$\\color{red}{x}$')).toContain('<span class="katex">')
    expect(renderMarkdown('$$x \\tag{1}$$')).toContain('class="katex-display"')
  })

  it('stops typesetting once the formulas of one text have made enough', () => {
    // Each formula makes 700,000 characters, as a formula of some 500
    // square roots would, but at once and in one element: real ones take
    // seconds to typeset and to sanitise, and what is bounded is what a
    // text's formulas make, whatever they are.
    const made = '<span class="katex">' + 'x'.repeat(700_000) + '</span>'
    const typeset = vi.spyOn(katex, 'renderToString').mockReturnValue(made)
    const html = renderMarkdown(Array(10).fill('$x$').join('\n\n'))
    expect(html).toContain('<span class="katex">')
    // Once enough is made, the rest are shown as written, KaTeX not asked.
    const typesetHere = typeset.mock.calls.length
    expect(typesetHere).toBeGreaterThan(0)
    expect(typesetHere).toBeLessThan(10)
    expect(html.match(/md-math-error/g)).toHaveLength(10 - typesetHere)
    // A new text starts again.
    expect(renderMarkdown('$x$')).toContain('<span class="katex">')
    expect(typeset).toHaveBeenCalledTimes(typesetHere + 1)
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

describe('code tools', () => {
  it('puts fenced code in a box with its language and a copy button, when asked', () => {
    const html = renderMarkdown('```python\nprint(1)\n```', { code: { copy: 'Copy' } })
    expect(html).toMatch(
      /^<div class="md-code"><div class="md-code__bar"><span class="md-code__lang">python<\/span><button (?=[^>]*type="button")(?=[^>]*class="md-code__copy")(?=[^>]*data-md-copy="")[^>]*>Copy<\/button><\/div><pre><code class="language-python">/,
    )
    // With no language, no name; and nothing of the kind unless asked.
    expect(renderMarkdown('```\nx\n```', { code: { copy: 'Copy' } })).toContain('<span class="md-code__lang"></span>')
    expect(renderMarkdown('```python\nprint(1)\n```')).not.toContain('md-code')
  })

  it('escapes the language and the words it is given', () => {
    const html = renderMarkdown('```"><img src=x onerror=alert(1)>\nx\n```', { code: { copy: '<b>複製</b>' } })
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelector('img, b')).toBeNull()
    expect(box.querySelector('.md-code__lang')?.textContent).toBe('"><img')
    expect(box.querySelector('.md-code__copy')?.textContent).toBe('<b>複製</b>')
  })
})

describe('page anchors', () => {
  const TEXT = [
    '## 第 1 頁',
    '',
    'Intro',
    '',
    '## 投影片 2',
    '',
    '```md',
    '## 第 9 頁',
    '```',
    '',
    '### 第 3 頁',
    '',
    '## Page 4',
    '',
    '## 第 1 頁',
    '',
    '## 第 5 頁 of notes',
  ].join('\n')

  it('gives the pages’ and slides’ headings ids of their kind and number, when asked', () => {
    const box = document.createElement('div')
    box.innerHTML = renderMarkdown(TEXT, { anchors: 'text-' })
    expect([...box.querySelectorAll('[id]')].map((e) => [e.tagName, e.id, e.textContent])).toEqual([
      ['H2', 'text-page-1', '第 1 頁'],
      ['H2', 'text-slide-2', '投影片 2'],
      ['H2', 'text-page-4', 'Page 4'],
      ['H2', 'text-page-1-2', '第 1 頁'],
    ])
    // Nothing of the kind unless asked.
    expect(renderMarkdown(TEXT)).not.toContain(' id=')
  })

  it('lists them with the same ids, and none in code or at another level', () => {
    expect(pageHeadings(TEXT, 'text-')).toEqual([
      { kind: 'page', n: 1, id: 'text-page-1', text: '第 1 頁' },
      { kind: 'slide', n: 2, id: 'text-slide-2', text: '投影片 2' },
      { kind: 'page', n: 4, id: 'text-page-4', text: 'Page 4' },
      { kind: 'page', n: 1, id: 'text-page-1-2', text: '第 1 頁' },
    ])
    expect(pageHeadings('', 'text-')).toEqual([])
  })

  it('knows a heading of a page or a slide in the forms written, and nothing else', () => {
    expect(pageHeadingOf('第 12 頁')).toEqual({ kind: 'page', n: 12 })
    expect(pageHeadingOf('第3页')).toEqual({ kind: 'page', n: 3 })
    expect(pageHeadingOf('投影片 7')).toEqual({ kind: 'slide', n: 7 })
    expect(pageHeadingOf('幻灯片 7')).toEqual({ kind: 'slide', n: 7 })
    expect(pageHeadingOf('Slide 2')).toEqual({ kind: 'slide', n: 2 })
    expect(pageHeadingOf('page 2')).toEqual({ kind: 'page', n: 2 })
    expect(pageHeadingOf('第 1 頁：導論')).toBeNull()
    expect(pageHeadingOf('Pages 2')).toBeNull()
  })

  it('makes the id of the number alone, whatever else the text says', () => {
    const html = renderMarkdown('## 第 1 頁\n\n## <img src=x onerror=alert(1)>', { anchors: '"><b>' })
    const box = document.createElement('div')
    box.innerHTML = html
    expect(box.querySelector('img, b')).toBeNull()
    expect(box.querySelector('h2')?.id).toBe('"><b>page-1')
  })
})
