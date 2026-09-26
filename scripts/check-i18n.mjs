#!/usr/bin/env node
// Checks the messages: every key the code names exists in every language,
// and every language has the same keys as English.
//
//   node scripts/check-i18n.mjs
//
// Keys are found where code names them literally: t('a.b'), te('a.b'),
// $t('a.b'), <i18n-t keypath="a.b">, and in the route and navigation
// tables (title: 'a.b', label: 'a.b'). A key built at run time
// (t(`enums.role.${r}`)) is checked by its static prefix only: the prefix
// must name an object.
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')
const messagesDir = join(src, 'i18n/messages')

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

// --- Load messages ------------------------------------------------------------
const locales = (await readdir(messagesDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
const messages = {}
for (const l of locales) {
  messages[l] = {}
  for (const f of await readdir(join(messagesDir, l))) {
    if (!f.endsWith('.ts')) continue
    const mod = await import(pathToFileURL(join(messagesDir, l, f)).href)
    messages[l][f.replace(/\.ts$/, '')] = mod.default
  }
}

function lookup(tree, key) {
  let cur = tree
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return undefined
    cur = cur[part]
  }
  return cur
}

function leaves(tree, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(tree ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') out.push(...leaves(v, key))
    else out.push(key)
  }
  return out
}

function placeholders(s) {
  return [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',')
}

const problems = []

// --- Same keys in every language, same placeholders ----------------------------
const base = 'en'
const baseLeaves = new Set(leaves(messages[base]))
for (const l of locales) {
  if (l === base) continue
  const theirs = new Set(leaves(messages[l]))
  for (const k of baseLeaves) if (!theirs.has(k)) problems.push(`${l}: missing ${k}`)
  for (const k of theirs) if (!baseLeaves.has(k)) problems.push(`${l}: has ${k}, which ${base} does not`)
  for (const k of baseLeaves) {
    if (!theirs.has(k)) continue
    const a = placeholders(lookup(messages[base], k))
    const b = placeholders(lookup(messages[l], k))
    if (a !== b) problems.push(`${l}: ${k} has placeholders {${b}}, ${base} has {${a}}`)
  }
}

// --- Keys named in code exist --------------------------------------------------
const files = (await walk(src)).filter(
  (f) => /\.(vue|ts)$/.test(f) && !f.includes('/i18n/messages/') && !f.includes('/generated/') && !f.endsWith('.spec.ts'),
)
const literal = /\b(?:\$?t|te)\(\s*(['"])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g
const tableEntry = /\b(?:title|label):\s*(['"])([a-z][A-Za-z]*\.[\w.-]+)\1/g
// Not :keypath="…", whose value is an expression.
const keypath = /(?<![:\w-])keypath=(["'])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g
const templated = /\b(?:\$?t|te)\(\s*`([A-Za-z][\w-]*(?:\.[\w-]+)*)\.\$\{/g
let checked = 0
for (const f of files) {
  const text = await readFile(f, 'utf8')
  const where = relative(root, f)
  const seen = new Set()
  for (const re of [literal, tableEntry, keypath]) {
    for (const m of text.matchAll(re)) {
      const key = m[2]
      if (seen.has(key)) continue
      seen.add(key)
      // A table entry that is not a message key (e.g. a route name) is skipped
      // unless its namespace exists.
      if (re === tableEntry && !(key.split('.')[0] in messages[base])) continue
      checked++
      for (const l of locales) {
        const v = lookup(messages[l], key)
        if (v === undefined) problems.push(`${where}: ${key} is not in ${l}`)
        else if (typeof v === 'object') problems.push(`${where}: ${key} names a group in ${l}, not a message`)
      }
    }
  }
  for (const m of text.matchAll(templated)) {
    const prefix = m[1]
    checked++
    for (const l of locales) {
      const v = lookup(messages[l], prefix)
      if (v === undefined || typeof v !== 'object') problems.push(`${where}: ${prefix}.* is not a group in ${l}`)
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s) in the messages:`)
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`messages OK: ${baseLeaves.size} keys in ${locales.join(', ')}; ${checked} uses checked`)
