#!/usr/bin/env node
// Photographs the app's main screens and audits the shapes each one shows,
// as the browser draws them (e2e/styleAudit.ts; docs/CONVENTIONS.md,
// "Shapes"): every corner over 4 px but a round mark's (a pill among them),
// every shadow that is not a line, every gradient but the two named, any
// frosted glass, and the solid buttons of the page and of each dialog over
// it. For before and after: run it on main's build and on a branch's, against
// the same Core and the same demonstration course, and compare.
//
//   DEMO_PASSWORD=… [ROOT_EMAIL=… ROOT_PASSWORD=…] node scripts/style-audit.mjs \
//     --base http://localhost:4173 --demo demo.json --out shots/ \
//     [--lang zh-Hant|zh-Hans|en] [--views desk,phone] [--themes light,dark] \
//     [--only login,materials,…] [--setup]
//
// The demo file is scripts/seed-demo.mjs's --out. Each person signs in
// through the sign-in form: the instructor, Yuki (a student) and, for the
// administration's screens, root with ROOT_EMAIL and ROOT_PASSWORD (without
// them, those screens are left out, and the script says so). Agents do not
// sign in to the app.
//
// --setup first adds what the seeded course lacks for these screens, through
// Core's API, as people and agents would: a group set with two groups (as
// the instructor); Ken's draft handed in, and Mei's work, each with a grade
// the grading agent proposes, so that the approvals queue holds three; and a
// course agent of the instructor's, hosted on AIshie, which Yuki asks how to
// check her Python version, answered with Markdown, the week's material as
// its source and a file. The script plays the site's agent runtime for it,
// as the end-to-end tests do (e2e/support.ts, hostOnRuntime): root issues
// the runtime's credential (ROOT_TOKEN, root's session, or ROOT_EMAIL and
// ROOT_PASSWORD), revoking any other. What it made goes to <demo>.setup.json
// beside the demo file, which later runs read: set up once, then photograph
// main's build and a branch's. It never prints a token.
//
// Each screen is shot at 1280×800 (desk) and 390×844 with touch (phone), in
// light and dark, as <view>-<theme>-<lang>-<screen>.png in --out; what the
// audit finds goes to report.json there, by the same names: the offences by
// kind, each element with its count, and the solid buttons. Never point it at
// a Core people use: --setup writes to it.
//
// Run it with Node 24 (.nvmrc): it imports e2e/styleAudit.ts as it is, which
// Node reads by stripping its types, from 22.18 and 23.6 on; the 20.19 that
// package.json's engines allows for the app cannot.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { shapeOffences, soloPrimary } from '../e2e/styleAudit.ts'

function args() {
  const a = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '')
    if (k === 'setup') out.setup = true
    else out[k] = a[++i]
  }
  return out
}
const opt = args()
const base = (opt.base || 'http://localhost:5173').replace(/\/+$/, '')
const demoFile = opt.demo || 'demo.json'
const outDir = opt.out || 'style-audit'
const lang = opt.lang || 'zh-Hant'
const views = (opt.views || 'desk,phone').split(',')
const themes = (opt.themes || 'light,dark').split(',')
const only = opt.only ? new Set(opt.only.split(',')) : null
const demo = JSON.parse(await readFile(demoFile, 'utf8'))
const setupFile = demoFile.replace(/\.json$/, '') + '.setup.json'
if (!process.env.DEMO_PASSWORD) throw new Error('DEMO_PASSWORD is required: the demo people sign in with it')

const CORE = demo.core.replace(/\/+$/, '')
const catalogue = opt.setup ? (await (await fetch(`${CORE}/v1/tools`)).json()).tools : []
const routes = Object.fromEntries(catalogue.map((t) => [t.name, t]))

/** Calls a Core tool by its name as seed-demo.mjs does; a proposal comes back as { proposed, action_id }. */
async function call(token, name, input = {}) {
  const t = routes[name]
  if (!t) throw new Error(`no tool ${name}`)
  const rest = { ...input }
  let path = t.path.replace(/\{([a-z_]+)\}/g, (_, k) => {
    const v = rest[k]
    delete rest[k]
    return encodeURIComponent(v)
  })
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  let body
  if (t.method === 'GET') {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) q.append(k, String(v))
    if ([...q].length) path += `?${q}`
  } else {
    headers['Content-Type'] = 'application/json'
    headers['Idempotency-Key'] = randomUUID()
    body = JSON.stringify(rest)
  }
  const res = await fetch(CORE + path, { method: t.method, headers, body })
  const out = await res.json()
  if (out.status !== 'executed' && out.status !== 'proposed')
    throw new Error(`${name}: HTTP ${res.status} ${out.error?.code ?? out.status} ${out.error?.message ?? ''}`)
  return out.status === 'proposed' ? { proposed: true, action_id: out.action_id } : out.result
}

/** Root's session: ROOT_TOKEN, or a sign-in with ROOT_EMAIL and ROOT_PASSWORD. */
async function rootSession() {
  if (process.env.ROOT_TOKEN) return process.env.ROOT_TOKEN
  if (!process.env.ROOT_EMAIL || !process.env.ROOT_PASSWORD)
    throw new Error('--setup needs root: ROOT_TOKEN, or ROOT_EMAIL and ROOT_PASSWORD')
  const res = await fetch(`${CORE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ROOT_EMAIL, password: process.env.ROOT_PASSWORD }),
  })
  const session = res.headers
    .getSetCookie()
    .map((c) => /^ais_session=([^;]+)/.exec(c)?.[1])
    .find(Boolean)
  if (!session) throw new Error(`root could not sign in: HTTP ${res.status}`)
  return session
}

/** Puts bytes where an upload URL of Core's says, and returns its upload token. */
async function upload(u, bytes, contentType) {
  const url = new URL(u.upload_url)
  const res = await fetch(`${CORE}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, ...u.headers },
    body: bytes,
  })
  if (!res.ok) throw new Error(`upload: HTTP ${res.status}`)
  return u.upload_token
}

/** What the seeded course lacks for these screens (see the top of the file). */
async function setUp() {
  const A = demo.actors
  const C = demo.course.id
  const I = A.instructor.token
  const made = {}

  // A group set of two groups, Yuki and Ken in the first, Mei in the second.
  const set = await call(I, 'group_set.create', { course_id: C, name: 'Lab pairs' })
  const groups = await call(I, 'group.create', {
    course_id: C,
    set_id: set.id,
    groups: [{ name: 'Pair A' }, { name: 'Pair B' }],
  })
  await call(I, 'group.set_members', {
    course_id: C,
    set_id: set.id,
    placements: [
      { student_member_id: A.yuki.member_id, group_id: groups.group_ids[0] },
      { student_member_id: A.ken.member_id, group_id: groups.group_ids[0] },
      { student_member_id: A.mei.member_id, group_id: groups.group_ids[1] },
    ],
  })
  made.group_set = set.id

  // Two more proposed grades on HW1: Ken hands in his draft, Mei her work, and the grading agent proposes each.
  const hw1 = demo.course.assignments.hw1
  await call(A.ken.token, 'submission.submit', { course_id: C, submission_id: demo.course.submissions.ken_hw1_draft })
  const mei = await call(A.mei.token, 'submission.create', {
    course_id: C,
    assignment_id: hw1,
    body: '```python\ndef c_to_f(c):\n    return 9 * c / 5 + 32\n```\n\nTested with -40, 0, 37 and 100: -40, 32, 98.6 and 212.',
  })
  await call(A.mei.token, 'submission.submit', { course_id: C, submission_id: mei.submission_id })
  const ken = await call(A.grader.token, 'grade.submit', {
    course_id: C,
    submission_id: demo.course.submissions.ken_hw1_draft,
    score: '4',
    feedback: 'c * 2 + 30 is close to 9/5 c + 32 near 10 °C only: 100 °C gives 230, not 212. No tests handed in.',
    breakdown: [
      { criterion: 'Correctness', points: 3, max: 6, comment: 'an approximation, not the formula' },
      { criterion: 'Testing', points: 0, max: 3 },
      { criterion: 'Style', points: 1, max: 1 },
    ],
  })
  const meiGrade = await call(A.grader.token, 'grade.submit', {
    course_id: C,
    submission_id: mei.submission_id,
    score: '10',
    feedback: 'Correct, and 37 °C is a good non-integer case to have checked.',
    breakdown: [
      { criterion: 'Correctness', points: 6, max: 6 },
      { criterion: 'Testing', points: 3, max: 3 },
      { criterion: 'Style', points: 1, max: 1 },
    ],
  })
  made.proposals = [ken.action_id, meiGrade.action_id]

  // A course agent of the instructor's, hosted on AIshie, which Yuki asks; the script answers as its runtime.
  const root = await rootSession()
  const runtime = await call(root, 'service.issue_credential', {
    scope: 'agent_runtime',
    label: `style audit ${demo.tag}`,
    replace: true,
  })
  const agent = await call(I, 'agent.create', { display_name: 'CS101 helper', hosting: 'runtime' })
  const seat = await call(I, 'member.add_delegate', {
    course_id: C,
    actor_id: agent.actor_id,
    preset: 'course_tutor',
    answers_course: true,
  })
  const issued = await call(runtime.token, 'agent_runtime.issue_token', {
    agent_id: agent.actor_id,
    label: `style audit ${demo.tag}`,
  })
  const agentToken = issued.token
  await fetch(`${CORE}/v1/me`, { headers: { Authorization: `Bearer ${agentToken}` } })
  const asked = await call(A.yuki.token, 'conversation.open', {
    course_id: C,
    respondent_member_id: seat.member_id,
    body: 'How do I check which Python version I have before the lab?',
  })
  const week1 = await call(I, 'document.get', { course_id: C, document_id: demo.course.documents.week1 })
  const script =
    'import sys\n\nprint(sys.version)\nif sys.version_info < (3, 12):\n    print("Python 3.12 or later is needed for the lab.")\n'
  const u = await call(agentToken, 'conversation.upload_url', { course_id: C, content_type: 'text/x-python' })
  const fileToken = await upload(u, script, 'text/x-python')
  await call(agentToken, 'conversation.answer', {
    course_id: C,
    conversation_id: asked.conversation_id,
    in_reply_to_message_id: asked.message_id,
    body:
      'Run this in a terminal:\n\n```bash\npython3 --version\n```\n\n' +
      'It prints a line such as `Python 3.12.4`. The lab needs **3.12 or later** (Week 1, *Before the lab*).\n\n' +
      '- On Windows, if `python3` is not found, try `py --version`.\n' +
      '- If the version is older, install the latest from python.org and run the command again.\n\n' +
      'The attached script prints the same, and says whether it is new enough.',
    sources: [{ document_id: demo.course.documents.week1, version_id: week1.version.id }],
    attachments: [{ upload_token: fileToken, filename: 'check_version.py' }],
  })
  made.conversation = asked.conversation_id
  return made
}

let setup = existsSync(setupFile) ? JSON.parse(await readFile(setupFile, 'utf8')) : null
if (opt.setup) {
  if (setup) console.log(`${setupFile} is there already: not set up again`)
  else {
    setup = await setUp()
    await writeFile(setupFile, JSON.stringify(setup, null, 2))
    console.log(`set up: a group set, two more proposals, a hosted agent's answer (${setupFile})`)
  }
}

const c = demo.course
const fill = (p) =>
  p
    .replace('{course}', c.id)
    .replace('{group_set}', setup?.group_set ?? '')
    .replace('{conversation}', setup?.conversation ?? '')
    .replace(/\{([a-z0-9_]+)\}/g, (m, k) => c.assignments?.[k] ?? c.documents?.[k] ?? c.submissions?.[k] ?? c[k] ?? m)

/** A page has loaded what it shows: the network quiet, or 5 s gone (the chat and the activity hold a request open). */
const settle = async (page) => {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(600)
}

/**
 * The screens: [name, who, path, what to open there]. Who is instructor, yuki
 * or root; anon for the sign-in page. A screen whose path needs the setup is
 * left out without it.
 */
const SCREENS = [
  ['login', 'anon', '/login'],
  ['home', 'instructor', '/'],
  ['overview', 'instructor', '/courses/{course}'],
  ['materials', 'instructor', '/courses/{course}/materials'],
  ['document', 'instructor', '/courses/{course}/documents/{week1}'],
  ['assignments', 'instructor', '/courses/{course}/assignments'],
  ['assignment', 'instructor', '/courses/{course}/assignments/{hw1}'],
  ['submissions', 'instructor', '/courses/{course}/submissions'],
  ['submission', 'instructor', '/courses/{course}/submissions/{yuki_hw1}'],
  ['grades', 'instructor', '/courses/{course}/grades'],
  ['gradebook', 'instructor', '/courses/{course}/gradebook'],
  ['scheme', 'instructor', '/courses/{course}/scheme'],
  ['approvals', 'instructor', '/courses/{course}/approvals'],
  ['action', 'instructor', '/courses/{course}/actions/{proposed_grade_action}'],
  ['members', 'instructor', '/courses/{course}/members'],
  [
    'add-member',
    'instructor',
    '/courses/{course}/members',
    async (page) => {
      await page.locator('.page-header__actions .el-button--primary').first().click()
      await page.locator('.el-dialog.add-member').waitFor()
    },
  ],
  [
    'select',
    'instructor',
    '/courses/{course}/members',
    async (page) => {
      await page.locator('.page-header__actions .el-button--primary').first().click()
      await page.locator('.el-dialog.add-member .add-member__preset-select .el-select__wrapper').click()
      await page.locator('.el-select-dropdown:visible').waitFor()
    },
  ],
  [
    'date-picker',
    'instructor',
    '/courses/{course}/assignments',
    async (page) => {
      await page.locator('.page-header__actions .el-button--primary').first().click()
      await page.locator('.assignment-form__due .el-input__wrapper').click()
      await page.locator('.el-picker-panel.el-date-picker:visible').waitFor()
    },
  ],
  ['groups', 'instructor', '/courses/{course}/groups'],
  ['group-set', 'instructor', '/courses/{course}/groups/{group_set}', null, 'group_set'],
  ['activity', 'instructor', '/courses/{course}/activity'],
  ['agents', 'instructor', '/courses/{course}/agents'],
  ['my-agents', 'yuki', '/account/agents'],
  ['account', 'instructor', '/account'],
  ['student-overview', 'yuki', '/courses/{course}'],
  ['student-assignment', 'yuki', '/courses/{course}/assignments/{hw1}'],
  ['chat', 'yuki', '/courses/{course}/conversations/{conversation}', null, 'conversation'],
  ['admin-courses', 'root', '/admin/courses'],
  ['admin-actors', 'root', '/admin/actors'],
  ['admin-runtime', 'root', '/admin/runtime'],
  ['admin-presets', 'root', '/admin/presets'],
]

const VIEWS = {
  desk: { width: 1280, height: 800, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
}
const canRoot = !!(process.env.ROOT_EMAIL && process.env.ROOT_PASSWORD)
if (!canRoot) console.log('no ROOT_EMAIL and ROOT_PASSWORD: the administration’s screens are left out')

await mkdir(outDir, { recursive: true })
const reportFile = `${outDir}/report.json`
const report = existsSync(reportFile) ? JSON.parse(await readFile(reportFile, 'utf8')) : {}
const browser = await chromium.launch()
for (const theme of themes) {
  for (const view of views) {
    const v = VIEWS[view]
    const pages = {}
    const pageFor = async (who) => {
      if (pages[who]) return pages[who]
      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        deviceScaleFactor: 1,
        colorScheme: theme,
        locale: { 'zh-Hant': 'zh-HK', 'zh-Hans': 'zh-CN' }[lang] || 'en-GB',
        isMobile: v.isMobile,
        hasTouch: v.hasTouch,
      })
      await context.addInitScript(
        ([l, dark]) => {
          try {
            localStorage.setItem('aishie.locale', l)
            localStorage.setItem('aishie.theme', dark ? 'dark' : 'light')
          } catch {}
        },
        [lang, theme === 'dark'],
      )
      const page = await context.newPage()
      if (who !== 'anon') {
        const email = who === 'root' ? process.env.ROOT_EMAIL : demo.actors[who].email
        const password = who === 'root' ? process.env.ROOT_PASSWORD : process.env.DEMO_PASSWORD
        await page.goto(`${base}/login`)
        await page.locator('input[name=login]:visible, button.login__use-password:visible').first().waitFor()
        if (await page.locator('button.login__use-password').isVisible()) await page.click('button.login__use-password')
        await page.fill('input[name=login]', email)
        await page.fill('input[name=password]', password)
        await Promise.all([
          page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }),
          page.click('button[type=submit]'),
        ])
      }
      pages[who] = page
      return page
    }
    const shots = [
      ...SCREENS,
      // The phone's menu, open over the materials.
      ...(view === 'phone'
        ? [
            [
              'drawer',
              'instructor',
              '/courses/{course}/materials',
              async (page) => {
                await page.locator('.app-header__menu').click()
                await page.locator('.app-nav-drawer').waitFor()
              },
            ],
          ]
        : []),
    ]
    for (const [name, who, path, open, needs] of shots) {
      if (only && !only.has(name)) continue
      if (who === 'root' && !canRoot) continue
      if (needs && !setup?.[needs]) {
        console.log(`${name}: left out, as it needs --setup`)
        continue
      }
      const page = await pageFor(who)
      const key = `${view}-${theme}-${lang}-${name}`
      try {
        await page.goto(base + fill(path))
        await settle(page)
        if (open) {
          await open(page)
          await settle(page)
        }
        await page.screenshot({ path: `${outDir}/${key}.png` })
        const offences = await shapeOffences(page)
        const kinds = {}
        const where = {}
        for (const o of offences) {
          kinds[o.kind] = (kinds[o.kind] ?? 0) + 1
          const k = `${o.kind} ${o.where} ${o.value}`
          where[k] = (where[k] ?? 0) + 1
        }
        report[key] = { kinds, where, solid: await soloPrimary(page) }
        console.log(`${key}: ${offences.length ? JSON.stringify(kinds) : 'nothing'}`)
      } catch (e) {
        report[key] = { error: String(e).split('\n')[0] }
        console.log(`${key}: ${report[key].error}`)
      }
      // A dialog or a menu opened for a screen is not left over the next.
      if (open) await page.goto('about:blank')
    }
    for (const p of Object.values(pages)) await p.context().close()
  }
}
await browser.close()
await writeFile(reportFile, JSON.stringify(report, null, 1))
console.log(`${Object.keys(report).length} screens in ${reportFile}`)
