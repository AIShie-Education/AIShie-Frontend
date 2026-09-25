#!/usr/bin/env node
// Builds a demonstration course in a Core instance, through its REST API, the
// way people and agents would: an administrator sets up a term, a department
// and a course; the instructor seats a TA, three students, a grading agent and
// a tutor agent, writes material, sets a grading scheme and two assignments;
// students hand in work; the grading agent proposes a grade that waits for the
// instructor's approval.
//
// Everything it creates stays: Core deletes nothing. Run it against a
// development or scratch instance, not against one people use.
//
//   CORE_URL=http://localhost:8080 ROOT_TOKEN=ais_… DEMO_PASSWORD=… \
//     node scripts/seed-demo.mjs [--out demo.json]
//
// Every person it registers gets DEMO_PASSWORD, and an email under
// @demo.test tagged with this run, so the script can run again. --out writes
// what was made (ids, emails, API tokens for each actor) as JSON.

import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const CORE = (process.env.CORE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const ROOT = process.env.ROOT_TOKEN
const PASSWORD = process.env.DEMO_PASSWORD
if (!ROOT) throw new Error('ROOT_TOKEN is required: an API token of a root or admin actor')
if (!PASSWORD || PASSWORD.length < 10) throw new Error('DEMO_PASSWORD is required, 10 characters or more')
const outIdx = process.argv.indexOf('--out')
const outFile = outIdx === -1 ? null : process.argv[outIdx + 1]
const tag = (process.env.DEMO_TAG || randomUUID().slice(0, 6)).toLowerCase()

const catalogue = (await (await fetch(`${CORE}/v1/tools`)).json()).tools
const routes = Object.fromEntries(catalogue.map((t) => [t.name, t]))

async function call(token, name, args = {}) {
  const t = routes[name]
  if (!t) throw new Error(`no tool ${name}`)
  const rest = { ...args }
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
  if (out.status !== 'executed' && out.status !== 'proposed') {
    throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(out.error ?? out)}`)
  }
  return out.status === 'proposed' ? { proposed: true, action_id: out.action_id } : out.result
}

async function uploadText(token, courseId, kind, fileName, text, contentType = 'text/plain') {
  const u = await call(token, 'document.upload_url', { course_id: courseId, kind, content_type: contentType })
  const url = new URL(u.upload_url)
  const res = await fetch(`${CORE}${url.pathname}${url.search}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, ...u.headers },
    body: text,
  })
  if (!res.ok) throw new Error(`upload ${fileName}: HTTP ${res.status} ${await res.text()}`)
  return u.upload_token
}

const day = 24 * 3600 * 1000
const iso = (ms) => new Date(ms).toISOString()
const now = Date.now()
const made = { core: CORE, tag, password_env: 'DEMO_PASSWORD', actors: {}, course: {} }

// --- Platform: a term, a department, the people and agents ------------------
const year = new Date().getFullYear()
const term = await call(ROOT, 'term.create', {
  name: `Demo ${year} (${tag})`,
  starts_on: `${year}-01-01`,
  ends_on: `${year}-12-31`,
})
const dept = await call(ROOT, 'department.create', { name: `Computing (demo ${tag})` })

const people = {
  instructor: { display_name: 'Sato Hiroshi', kind: 'human' },
  ta: { display_name: 'Lee Ka Man', kind: 'human' },
  yuki: { display_name: 'Yuki Tanaka', kind: 'human' },
  ken: { display_name: 'Ken Wong', kind: 'human' },
  mei: { display_name: 'Mei Chan', kind: 'human' },
  observer: { display_name: 'Olivia Observer', kind: 'human' },
  grader: { display_name: 'grader-v2', kind: 'agent' },
  tutor: { display_name: 'tutor-yuki', kind: 'agent' },
}
for (const [key, p] of Object.entries(people)) {
  const email = p.kind === 'human' ? `${key}+${tag}@demo.test` : undefined
  const { actor_id } = await call(ROOT, 'actor.register', { ...p, email })
  const tok = await call(ROOT, 'actor.issue_token', { actor_id, label: `demo ${tag}`, expires_in_days: 90 })
  if (p.kind === 'human') await call(tok.token, 'credential.set_password', { password: PASSWORD })
  made.actors[key] = { actor_id, email, display_name: p.display_name, kind: p.kind, token: tok.token }
}
const A = made.actors

// --- The course -------------------------------------------------------------
const course = await call(ROOT, 'course.create', {
  dept_id: dept.id,
  term_id: term.id,
  code: 'CS101',
  section: 'A',
  title: 'Introduction to Programming',
  description: 'Variables, control flow, functions and a first look at data structures, in Python.',
})
const C = course.course_id
await call(ROOT, 'course.activate', { course_id: C })
const { member_id: instructorMember } = await call(ROOT, 'course.seat_instructor', { course_id: C, actor_id: A.instructor.actor_id })
made.course = { id: C, root_component_id: course.root_component_id, term_id: term.id, dept_id: dept.id }
const I = A.instructor.token

// --- Grading scheme ---------------------------------------------------------
const bucket = await call(I, 'component.create', { course_id: C, parent_id: course.root_component_id, name: 'Assignments', weight: 60, drop_lowest: 0, sort_order: 1 })
const midterm = await call(I, 'component.create', { course_id: C, parent_id: course.root_component_id, name: 'Midterm', weight: 40, points_possible: 100, sort_order: 2 })
made.course.components = { assignments: bucket.id, midterm: midterm.id }

// --- Material ---------------------------------------------------------------
const week1 = await call(I, 'document.create', {
  course_id: C,
  kind: 'material',
  title: 'Week 1 — Welcome and setup',
  sort_order: 1,
  body_md: `# Welcome to CS101\n\nThis week we install Python and write our first program.\n\n## Before the lab\n\n1. Install Python 3.12 or later.\n2. Install an editor (VS Code is fine).\n3. Run \`python --version\` and bring the output.\n\n\`\`\`python\nprint("Hello, world!")\n\`\`\`\n\n> Ask the tutor agent any time — it can see your own work and grades, and nobody else's.\n`,
})
await call(I, 'document.publish', { course_id: C, document_id: week1.document_id })
const week2 = await call(I, 'document.create', {
  course_id: C,
  kind: 'material',
  title: 'Week 2 — Variables and types',
  sort_order: 2,
  body_md: `# Variables and types\n\n*Draft — not yet published.*\n\n| Type | Example |\n|---|---|\n| int | \`42\` |\n| float | \`3.14\` |\n| str | \`"hi"\` |\n`,
})
const syllabusToken = await uploadText(I, C, 'material', 'syllabus.txt', `CS101 syllabus (demo ${tag})\n\nAssessment: assignments 60%, midterm 40%.\n`)
const syllabus = await call(I, 'document.create', { course_id: C, kind: 'material', title: 'Syllabus (file)', sort_order: 0, upload_token: syllabusToken })
await call(I, 'document.publish', { course_id: C, document_id: syllabus.document_id })
made.course.documents = { week1: week1.document_id, week2: week2.document_id, syllabus: syllabus.document_id }

// --- Assignments ------------------------------------------------------------
const hw1Instr = await call(I, 'document.create', {
  course_id: C,
  kind: 'instructions',
  title: 'HW1 instructions',
  body_md: `# HW1 — Temperature converter\n\nWrite a function \`c_to_f(c)\` that converts Celsius to Fahrenheit, and a short paragraph explaining how you tested it.\n\nHand in your code in the text box, or attach a \`.py\` file.\n`,
})
await call(I, 'document.publish', { course_id: C, document_id: hw1Instr.document_id })
const hw1Rubric = await call(I, 'document.create', {
  course_id: C,
  kind: 'rubric',
  title: 'HW1 rubric',
  body_md: `# HW1 rubric (10 points)\n\n- **Correctness (6)**: the formula is right for negative, zero and positive input.\n- **Testing (3)**: at least three cases, including an edge case.\n- **Style (1)**: clear names, no dead code.\n`,
})
await call(I, 'document.publish', { course_id: C, document_id: hw1Rubric.document_id })
const hw1 = await call(I, 'assignment.create', {
  course_id: C,
  title: 'HW1 — Temperature converter',
  component_id: bucket.id,
  points_possible: 10,
  due_at: iso(now + 7 * day),
  instructions_document_id: hw1Instr.document_id,
  rubric_document_id: hw1Rubric.document_id,
})
await call(I, 'assignment.publish', { course_id: C, assignment_id: hw1.id })

const hw2 = await call(I, 'assignment.create', {
  course_id: C,
  title: 'HW2 — Loops (not yet published)',
  component_id: bucket.id,
  points_possible: 20,
  due_at: iso(now + 21 * day),
})
made.course.assignments = { hw1: hw1.id, hw2: hw2.id }

// --- Members ----------------------------------------------------------------
const seat = async (key, preset, extra = {}) => {
  const out = await call(I, 'member.add', { course_id: C, actor_id: A[key].actor_id, preset, ...extra })
  A[key].member_id = out.member_id
  return out.member_id
}
A.instructor.member_id = instructorMember
await seat('ta', 'ta')
await seat('yuki', 'student')
await seat('ken', 'student')
await seat('mei', 'student')
await seat('observer', 'observer')
await seat('grader', 'grader', { assignment_scope: 'listed', listed_assignments: [hw1.id] })
await seat('tutor', 'tutor', { student_scope: 'listed', listed_students: [A.yuki.member_id] })

// --- Students' work ---------------------------------------------------------
const yukiSub = await call(A.yuki.token, 'submission.create', {
  course_id: C,
  assignment_id: hw1.id,
  body: "```python\ndef c_to_f(c):\n    return c * 9 / 5 + 32\n```\n\nI tested -40 (→ -40), 0 (→ 32) and 100 (→ 212).",
})
const yukiFile = await uploadText(A.yuki.token, C, 'submission', 'converter.py', 'def c_to_f(c):\n    return c * 9 / 5 + 32\n', 'text/x-python')
const yukiDoc = await call(A.yuki.token, 'document.create', {
  course_id: C,
  kind: 'submission',
  submission_id: yukiSub.submission_id,
  title: 'converter.py',
  upload_token: yukiFile,
})
await call(A.yuki.token, 'submission.submit', {
  course_id: C,
  submission_id: yukiSub.submission_id,
  files: [yukiDoc.document_id],
})
const kenSub = await call(A.ken.token, 'submission.create', {
  course_id: C,
  assignment_id: hw1.id,
  body: 'def c_to_f(c):\n    return c * 2 + 30  # TODO check',
})
made.course.submissions = { yuki_hw1: yukiSub.submission_id, ken_hw1_draft: kenSub.submission_id }

// --- An agent proposes a grade; it waits for a person ------------------------
const proposal = await call(A.grader.token, 'grade.submit', {
  course_id: C,
  submission_id: yukiSub.submission_id,
  score: '9.5',
  feedback: 'Correct formula and good edge cases. Consider testing a non-integer input too.',
  breakdown: [
    { criterion: 'Correctness', points: 6, max: 6 },
    { criterion: 'Testing', points: 2.5, max: 3, comment: 'three cases, all integers' },
    { criterion: 'Style', points: 1, max: 1 },
  ],
})
made.course.proposed_grade_action = proposal.action_id

// The TA enters a midterm grade directly (a draft, not yet posted).
const midtermGrade = await call(A.ta.token, 'grade.submit', {
  course_id: C,
  component_id: midterm.id,
  student_member_id: A.mei.member_id,
  score: '78',
  feedback: 'Solid; revisit recursion.',
})
made.course.midterm_draft_grade = midtermGrade.grade_id

const summary = {
  ...made,
  actors: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v])),
}
if (outFile) await writeFile(outFile, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 })
console.log(`Demo course CS101-A made in ${CORE} (tag ${tag}): course ${C}`)
for (const [k, v] of Object.entries(A)) {
  console.log(`  ${k.padEnd(10)} ${v.display_name.padEnd(16)} ${v.email ?? '(agent: token only)'}`)
}
