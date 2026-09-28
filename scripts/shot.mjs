#!/usr/bin/env node
// Signs in to the running dev server as one of the demo actors, opens a page,
// and saves a screenshot — reporting any console error and any API call that
// failed on the way. For checking a view by eye without clicking through it.
//
//   DEMO_FILE=demo.json DEMO_PASSWORD=… node scripts/shot.mjs \
//     --as instructor --path '/courses/{course}/members' --out members.png \
//     [--base http://localhost:5173] [--width 1280] [--height 900] [--dark] [--lang en|zh-Hant|zh-Hans]
//     [--click 'text=Add member'] [--wait 800] [--full]
//
// --as is a key in the demo file's actors (instructor, ta, yuki, ken, mei,
// observer, grader, tutor), or root (with ROOT_TOKEN set). People sign in through the sign-in form with
// DEMO_PASSWORD; agents, which have no password, with their API token.
// {course}, {hw1}, {hw2}, {yuki_hw1}, {week1}, … in --path are filled from
// the demo file, as are {member:yuki} and {actor:yuki}.
// --click may be given more than once; each is a Playwright selector clicked
// in turn after the page has loaded.
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

function args() {
  const a = process.argv.slice(2)
  const out = { click: [] }
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '')
    if (k === 'dark' || k === 'full') out[k] = true
    else if (k === 'click') out.click.push(a[++i])
    else out[k] = a[++i]
  }
  return out
}

const opt = args()
const demo = JSON.parse(await readFile(process.env.DEMO_FILE || 'demo.json', 'utf8'))
const base = (opt.base || 'http://localhost:5173').replace(/\/+$/, '')
// --as root signs in with ROOT_TOKEN, for the administration pages.
const who =
  opt.as === 'root'
    ? { kind: 'agent', token: process.env.ROOT_TOKEN, display_name: 'root' }
    : demo.actors[opt.as || 'instructor']
if (!who || !who.token) throw new Error(`no demo actor ${opt.as} (or no ROOT_TOKEN for root)`)

const fill = (p) =>
  p
    .replace('{course}', demo.course.id)
    .replace(/\{member:([a-z]+)\}/g, (_, k) => demo.actors[k]?.member_id ?? '')
    .replace(/\{actor:([a-z]+)\}/g, (_, k) => demo.actors[k]?.actor_id ?? '')
    .replace(/\{([a-z0-9_]+)\}/g, (m, k) =>
      demo.course.assignments?.[k] ??
      demo.course.documents?.[k] ??
      demo.course.submissions?.[k] ??
      demo.course.components?.[k] ??
      demo.course[k] ??
      m,
    )

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: Number(opt.width || 1280), height: Number(opt.height || 900) },
  colorScheme: opt.dark ? 'dark' : 'light',
  locale: { 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN' }[opt.lang] || 'en-US',
})
await context.addInitScript(
  ([lang, dark]) => {
    try {
      if (lang) localStorage.setItem('aishiteru.locale', lang)
      localStorage.setItem('aishiteru.theme', dark ? 'dark' : 'light')
    } catch {}
  },
  [opt.lang || 'en', !!opt.dark],
)
const page = await context.newPage()
const problems = []
// What happens while signing in (a 401 from asking who is signed in, before
// anyone is) is not a problem with the page.
let recording = false
page.on('console', (m) => {
  if (recording && (m.type() === 'error' || m.type() === 'warning')) problems.push(`console.${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => recording && problems.push(`pageerror: ${e.message}`))
page.on('response', async (r) => {
  const u = new URL(r.url())
  if (recording && u.pathname.startsWith('/v1/') && r.status() >= 400) {
    let body = ''
    try {
      body = (await r.text()).slice(0, 300)
    } catch {}
    problems.push(`HTTP ${r.status()} ${r.request().method()} ${u.pathname}${u.search} ${body}`)
  }
})

if (who.kind === 'human') {
  if (!process.env.DEMO_PASSWORD) throw new Error('DEMO_PASSWORD is required to sign in as a person')
  await page.goto(`${base}/login`)
  await page.fill('input[name=email]', who.email)
  await page.fill('input[name=password]', process.env.DEMO_PASSWORD)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }), page.click('button[type=submit]')])
} else {
  await page.goto(`${base}/login`)
  await page.evaluate((t) => sessionStorage.setItem('aishiteru.bearer', t), who.token)
}

const target = fill(opt.path || '/')
recording = true
await page.goto(base + target)
await page.waitForLoadState('networkidle').catch(() => {})
await page.waitForTimeout(Number(opt.wait || 400))
for (const sel of opt.click) {
  await page.click(sel, { timeout: 5000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(Number(opt.wait || 400))
}
const out = opt.out || 'shot.png'
await page.screenshot({ path: out, fullPage: !!opt.full })
console.log(`${opt.as || 'instructor'} → ${target} → ${out} (${page.url()})`)
if (problems.length) {
  console.log(`${problems.length} problem(s):`)
  for (const p of problems) console.log('  ' + p)
} else {
  console.log('no console errors, no failed API calls')
}
await browser.close()
