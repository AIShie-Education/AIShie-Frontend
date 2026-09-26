// Highlighting fenced code (```sql … ```) with highlight.js: its core and the
// languages a course is likely to show, not all of them. A fence in no known
// language, or in none, is left plain. highlight.js escapes the code itself
// and adds only <span class="hljs-…">; the colours are in styles/markdown-rich.css.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// Each language also answers to its usual aliases (py, js, ts, sh, html, …).
const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  plaintext,
  python,
  r,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml,
}
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language)

/** The name of a language highlight.js knows by this fence's info string, if any. */
export function codeLanguage(info: string): string | undefined {
  const name = info.trim().split(/\s+/)[0]?.toLowerCase()
  return name && hljs.getLanguage(name) ? name : undefined
}

/**
 * markdown-it's highlight option: the code as highlighted HTML, or '' for
 * markdown-it to escape it as it is.
 */
export function highlightCode(code: string, info: string): string {
  const language = codeLanguage(info)
  if (!language) return ''
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return ''
  }
}
