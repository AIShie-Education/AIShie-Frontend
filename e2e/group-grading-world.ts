// A course of its own for grading group work, built through Core as root and
// its teacher, with names of this run's own so that runs never meet:
//
//   Projects (a group set):  Team A — Ana, Ben, Cai     Team B — Dev, Eva
//   Fay, a student in no group; Tom, a TA; Ivy, a TA listed for Ana and Ben
//   alone, who posts grades; Kit, a TA who may not read grades; grader-g, a
//   grading agent; approver-a, an agent whose decisions wait for approval.
//
// "Group project" (100 points, in the course's one component) is a group
// assignment of Projects, published: Ben hands Team A's report in, Dev Team
// B's. Nothing is graded yet.
import { randomUUID } from 'node:crypto'

export interface WorldPerson {
  actor_id: string
  member_id: string
  display_name: string
  email?: string
  kind: 'human' | 'agent'
  /** A person's signed-in session, or the agent's API token: what the tests call Core with as them. */
  token: string
}
export interface GroupGradingWorld {
  core: string
  tag: string
  course: { id: string; code: string; section: string; title: string }
  setId: string
  groups: { a: string; b: string }
  assignment: { id: string; title: string }
  submissions: { a: string; b: string }
  people: Record<
    'teacher' | 'ta' | 'ivy' | 'kit' | 'ana' | 'ben' | 'cai' | 'dev' | 'eva' | 'fay' | 'grader' | 'approver',
    WorldPerson
  >
}

interface Tool {
  name: string
  method: string
  path: string
}

/** Calls tools by name, as their routes in Core's catalogue say. */
export async function toolCaller(core: string) {
  const base = core.replace(/\/+$/, '')
  const catalogue: Tool[] = (await (await fetch(`${base}/v1/tools`)).json()).tools
  const routes = new Map(catalogue.map((t) => [t.name, t]))
  return async function call<T = any>(
    token: string,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{
    status: string
    result?: T
    action_id?: string
    error?: { code: string; details?: Record<string, unknown> }
  }> {
    const t = routes.get(name)
    if (!t) throw new Error(`no tool ${name}`)
    const rest: Record<string, unknown> = { ...args }
    let path = t.path.replace(/\{([a-z_]+)\}/g, (_, k: string) => {
      const v = rest[k]
      delete rest[k]
      return encodeURIComponent(String(v))
    })
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    let body: string | undefined
    if (t.method === 'GET') {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) q.append(k, String(v))
      if ([...q].length) path += `?${q}`
    } else {
      headers['Content-Type'] = 'application/json'
      headers['Idempotency-Key'] = randomUUID()
      body = JSON.stringify(rest)
    }
    const res = await fetch(base + path, { method: t.method, headers, body })
    return res.json()
  }
}

/**
 * Takes up an invitation with a password, as the page an invitation link
 * opens does, and returns the session Core signs the person in with (as
 * support.ts's acceptInvitation does: this file is run outside the tests too,
 * to look at the pages by hand).
 */
async function acceptInvitation(base: string, invitation: string, password: string): Promise<string> {
  const res = await fetch(`${base}/v1/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token: invitation, password }),
  })
  const session = res.headers
    .getSetCookie()
    .map((c) => /^ais_session=([^;]+)/.exec(c)?.[1])
    .find((v) => !!v)
  if (res.status !== 200 || !session) throw new Error(`POST /v1/auth/invite: HTTP ${res.status}, and no session`)
  return session
}

export async function buildGroupGradingWorld(
  core: string,
  rootToken: string,
  password: string,
): Promise<GroupGradingWorld> {
  const base = core.replace(/\/+$/, '')
  const raw = await toolCaller(base)
  async function call<T = any>(token: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
    const out = await raw<T>(token, name, args)
    if (out.status !== 'executed') throw new Error(`${name}: ${JSON.stringify(out.error ?? out)}`)
    return out.result as T
  }

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const year = new Date().getFullYear()
  const term = await call(rootToken, 'term.create', {
    name: `Groups ${year} (${tag})`,
    starts_on: `${year}-01-01`,
    ends_on: `${year}-12-31`,
  })
  const dept = await call(rootToken, 'department.create', { name: `Group work (${tag})` })
  const course = { code: 'GRP200', section: tag, title: 'Team Projects' }
  const made = await call(rootToken, 'course.create', { dept_id: dept.id, term_id: term.id, ...course })
  const C = made.course_id as string
  await call(rootToken, 'course.activate', { course_id: C })

  async function person(key: string, display_name: string) {
    const email = `${key}+${tag}@groups.test`
    const { actor_id } = await call(rootToken, 'actor.register', { kind: 'human', display_name, email })
    const invite = await call(rootToken, 'actor.invite', { actor_id, expires_in_days: 1 })
    const token = await acceptInvitation(base, invite.token, password)
    return { actor_id, display_name, email, kind: 'human' as const, token, member_id: '' }
  }
  const people = {
    teacher: await person('teacher', 'Teacher Wong'),
    ta: await person('ta', 'Tom Lee'),
    ivy: await person('ivy', 'Ivy Kwok'),
    kit: await person('kit', 'Kit Mak'),
    ana: await person('ana', 'Ana Chan'),
    ben: await person('ben', 'Ben Ho'),
    cai: await person('cai', 'Cai Lam'),
    dev: await person('dev', 'Dev Patel'),
    eva: await person('eva', 'Eva Ng'),
    fay: await person('fay', 'Fay Yip'),
    grader: { actor_id: '', display_name: `grader-g-${tag}`, kind: 'agent' as const, token: '', member_id: '' },
    approver: { actor_id: '', display_name: `approver-a-${tag}`, kind: 'agent' as const, token: '', member_id: '' },
  }
  for (const key of ['grader', 'approver'] as const) {
    const agent = await call(rootToken, 'actor.register', {
      kind: 'agent',
      display_name: people[key].display_name,
      hosting: 'mcp',
    })
    people[key].actor_id = agent.actor_id
    people[key].token = (
      await call(rootToken, 'actor.issue_token', {
        actor_id: agent.actor_id,
        label: `groups ${tag}`,
        expires_in_days: 2,
      })
    ).token
  }

  people.teacher.member_id = (
    await call(rootToken, 'course.seat_instructor', { course_id: C, actor_id: people.teacher.actor_id })
  ).member_id
  const T = people.teacher.token
  const seat = async (key: keyof typeof people, preset: string, extra: Record<string, unknown> = {}) => {
    people[key].member_id = (
      await call(T, 'member.add', { course_id: C, actor_id: people[key].actor_id, preset, ...extra })
    ).member_id
  }
  await seat('ta', 'ta')
  for (const k of ['ana', 'ben', 'cai', 'dev', 'eva', 'fay'] as const) await seat(k, 'student')
  // A TA whose seat reaches Ana and Ben alone, of Team A, and who posts (and so regrades) grades; and one who grades
  // without reading grades.
  await seat('ivy', 'ta', {
    student_scope: 'listed',
    listed_students: [people.ana.member_id, people.ben.member_id],
    perms: { grade_post: 'autonomous' },
  })
  await seat('kit', 'ta', { perms: { grade_read: 'denied' } })

  const component = await call(T, 'component.create', {
    course_id: C,
    parent_id: made.root_component_id,
    name: 'Projects',
    weight: 100,
    sort_order: 1,
  })

  const set = await call(T, 'group_set.create', { course_id: C, name: 'Projects' })
  const [a, b] = (
    await call(T, 'group.create', { course_id: C, set_id: set.id, groups: [{ name: 'Team A' }, { name: 'Team B' }] })
  ).group_ids as string[]
  await call(T, 'group.set_members', {
    course_id: C,
    set_id: set.id,
    placements: [
      { student_member_id: people.ana.member_id, group_id: a },
      { student_member_id: people.ben.member_id, group_id: a },
      { student_member_id: people.cai.member_id, group_id: a },
      { student_member_id: people.dev.member_id, group_id: b },
      { student_member_id: people.eva.member_id, group_id: b },
    ],
  })
  const title = 'Group project'
  const assignment = await call(T, 'assignment.create', {
    course_id: C,
    title,
    points_possible: 100,
    component_id: component.id,
    group_set_id: set.id,
  })
  await call(T, 'assignment.publish', { course_id: C, assignment_id: assignment.id })
  await seat('grader', 'grader', { assignment_scope: 'listed', listed_assignments: [assignment.id] })
  // An agent that decides proposals, its every decision itself a proposal for someone to approve.
  await seat('approver', 'grader', {
    assignment_scope: 'listed',
    listed_assignments: [assignment.id],
    perms: { action_decide: 'confirm_required' },
  })

  const subA = await call(people.ana.token, 'submission.create', {
    course_id: C,
    assignment_id: assignment.id,
    body: 'Team A’s report: a bridge of paper that holds 2 kg.',
  })
  await call(people.ben.token, 'submission.submit', { course_id: C, submission_id: subA.submission_id })
  const subB = await call(people.dev.token, 'submission.create', {
    course_id: C,
    assignment_id: assignment.id,
    body: 'Team B’s report: a tower of straws, 1.2 m tall.',
  })
  await call(people.dev.token, 'submission.submit', { course_id: C, submission_id: subB.submission_id })

  return {
    core: base,
    tag,
    course: { id: C, ...course },
    setId: set.id,
    groups: { a, b },
    assignment: { id: assignment.id, title },
    submissions: { a: subA.submission_id, b: subB.submission_id },
    people,
  }
}
