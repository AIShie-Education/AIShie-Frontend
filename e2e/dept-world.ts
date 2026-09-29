// A small university for the department administrators' tests, built
// through Core as root, with names of this run's own so that runs never meet
// (sibling names are unique, and the tree is the platform's):
//
//   University ─┬─ Engineering ─┬─ Computing ── AI
//               │               └─ Design
//               └─ Humanities ── History
//
// Ada is appointed at Engineering. Bob, Chan and Dora are people with no
// role: Bob is appointed during the tests, Chan is an instructor to seat,
// Dora a student. A course sits in AI, Computing, Design and History each.
import { randomUUID } from 'node:crypto'
import { acceptInvitation } from './support'

export interface Person {
  actor_id: string
  display_name: string
  email: string
  kind: 'human'
  /** Their signed-in session, which the tests call Core with as them: people hold no API tokens. */
  token: string
}
export interface DeptWorld {
  tag: string
  term_id: string
  depts: Record<'university' | 'engineering' | 'computing' | 'ai' | 'design' | 'humanities' | 'history', { id: string; name: string }>
  people: Record<'ada' | 'bob' | 'chan' | 'dora', Person>
  courses: Record<'ai' | 'computing' | 'design' | 'history', { id: string; code: string; title: string }>
}

interface Tool {
  name: string
  method: string
  path: string
}

export async function buildDeptWorld(core: string, rootToken: string, password: string): Promise<DeptWorld> {
  const base = core.replace(/\/+$/, '')
  const catalogue: Tool[] = (await (await fetch(`${base}/v1/tools`)).json()).tools
  const routes = new Map(catalogue.map((t) => [t.name, t]))

  async function call<T = any>(token: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
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
    const out = await res.json()
    if (out.status !== 'executed') throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(out.error ?? out)}`)
    return out.result as T
  }

  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const year = new Date().getFullYear()
  const term = await call(rootToken, 'term.create', {
    name: `Dept ${year} (${tag})`,
    starts_on: `${year}-01-01`,
    ends_on: `${year}-12-31`,
  })

  async function dept(name: string, parent?: string) {
    const out = await call(rootToken, 'department.create', { name, parent_id: parent })
    return { id: out.id as string, name }
  }
  const university = await dept(`University ${tag}`)
  const engineering = await dept('Engineering', university.id)
  const computing = await dept('Computing', engineering.id)
  const ai = await dept('AI', computing.id)
  const design = await dept('Design', engineering.id)
  const humanities = await dept('Humanities', university.id)
  const history = await dept('History', humanities.id)

  // A person chooses their password through an invitation, as people do, and
  // is signed in by it.
  async function person(key: string, display_name: string): Promise<Person> {
    const email = `${key}+${tag}@dept.test`
    const { actor_id } = await call(rootToken, 'actor.register', { kind: 'human', display_name, email })
    const invite = await call(rootToken, 'actor.invite', { actor_id, expires_in_days: 1 })
    const token = await acceptInvitation(base, invite.token, password)
    return { actor_id, display_name, email, kind: 'human', token }
  }
  const people = {
    ada: await person('ada', 'Ada Lovelace'),
    bob: await person('bob', 'Bob Chan'),
    chan: await person('chan', 'Chan Siu Ming'),
    dora: await person('dora', 'Dora Wong'),
  }
  await call(rootToken, 'department.add_admin', { dept_id: engineering.id, actor_id: people.ada.actor_id })

  async function course(deptId: string, code: string, title: string) {
    const out = await call(rootToken, 'course.create', { dept_id: deptId, term_id: term.id, code, section: tag, title })
    return { id: out.course_id as string, code, title }
  }
  const courses = {
    ai: await course(ai.id, 'AI501', 'Machine Learning'),
    computing: await course(computing.id, 'CS201', 'Data Structures'),
    design: await course(design.id, 'DES101', 'Design Studio'),
    history: await course(history.id, 'HIS101', 'World History'),
  }
  await call(rootToken, 'course.activate', { course_id: courses.computing.id })

  return {
    tag,
    term_id: term.id,
    depts: { university, engineering, computing, ai, design, humanities, history },
    people,
    courses,
  }
}
