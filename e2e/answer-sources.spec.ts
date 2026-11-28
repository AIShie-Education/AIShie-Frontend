/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  arCall,
  arMessages,
  call,
  coursePath,
  demo,
  hostARAgent,
  releaseARAgent,
  modelRules,
  openChat,
  inTraditionalChinese,
  photograph,
  registerPerson,
  signIn,
  type CoreReply,
  type DemoActor,
} from './support'

// What an answer relied on (AIShie-Core#69), with the real Core. A course
// agent of the instructor's, hosted as the site's runtime hosts it, answers a
// student of this run through Core's API, as its runtime does, naming the
// course materials each answer relied on: page 2 of a lecture's PDF, none at
// all, or nothing said. Under each answer the student sees the line that names
// the lecture (which opens the PDF in the viewer at page 2), the neutral pill,
// and nothing. On a phone, an answer that relied on the lecture's last page
// opens it there, the viewer filling the screen with its one bar at the
// bottom, as the phone's viewer is. On a phone 375 px wide, an answer that
// relied on notes whose title has no spaces (as a file's name gives one) sums
// them up on a line that wraps, and nothing in the chat scrolls sideways; a
// tap on the pill says the agent said so. Both may read rubrics at first, and
// an answer that relied on HW1's rubric and the lecture names the rubric
// first; once the student may no longer read rubrics, the rubric is a course
// material she cannot open, with no title and no link. Once the lecture has a
// new version, an answer that read the old one leads to the lecture as it is
// now, and says beside its link that it read another version; so does one
// that read the new version once the old one is published again, since the
// version read may be newer. An answer waiting for approval says in the
// approval queue how many course materials it names, two pages of the lecture
// being one, and why on focus.
//
// The Core pinned in .github/core-image keeps sources (api/catalogue.json, its
// catalogue, says so): a Core whose catalogue does not say so, or one this
// cannot read, fails the run. The tests skip only where the pin itself keeps
// none.

const STAMP = Date.now().toString(36)
const TUTOR = `Sources tutor ${STAMP}`
const LECTURE = `Week 4 — Lists (e2e ${STAMP})`
const PDF_NAME = `lists-${STAMP}.pdf`
/** A title with no spaces, longer than 50 characters, as a file's name gives one. */
const NOTES = `COMP1001_Lecture04_Lists_Tuples_and_Dictionaries_${STAMP}`
const Q = (n: number) => `Question ${n} about lists (${STAMP})`
const A = (n: number) => `Answer ${n}: a list keeps its order (${STAMP}).`
const PAGE_MARK = (n: number) => ['amber', 'cobalt', 'violet'][n - 1] ?? 'other'
const NOTES_MARK = 'quartz'

type Catalogue = { tools?: { name: string; input_schema?: { properties?: Record<string, unknown> } }[] }
/** Whether a catalogue's conversation.answer takes the sources an answer relied on. */
const takesSources = (catalogue: Catalogue) =>
  !!catalogue.tools?.find((t) => t.name === 'conversation.answer')?.input_schema?.properties?.sources
/** Whether the Core pinned in .github/core-image does: its catalogue, which CI checks against the pin. */
const pinTakesSources = takesSources(
  JSON.parse(readFileSync(new URL('../api/catalogue.json', import.meta.url), 'utf8')),
)

const w = {
  sources: false,
  tutorId: '',
  hostedId: '',
  tutorSeat: '',
  student: null as (DemoActor & { member_id?: string }) | null,
  lectureId: '',
  lectureVersion: '',
  lectureFile: '',
  rubricId: '',
  rubricVersion: '',
  rubricTitle: '',
  conversationId: '',
}

function done(r: { status: number; body: CoreReply }, what: string) {
  expect(r.body.status, `${what}: ${JSON.stringify(r.body)}`).toBe('executed')
  return r.body.result
}

/** A PDF of `pages` pages, each saying its number: enough for pdf.js to draw, and to tell the pages apart. */
function pdfOf(pages: number): Buffer {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const kids: string[] = []
  for (let i = 0; i < pages; i++) {
    const content = `BT /F1 28 Tf 72 680 Td (Lists, page ${i + 1}) Tj ET`
    kids.push(`${objs.length + 1} 0 R`)
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objs.length + 2} 0 R >>`,
    )
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`
  let out = '%PDF-1.4\n'
  const at: number[] = []
  objs.forEach((o, i) => {
    at.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** The deterministic model's search/read steps for the sources this answer needs. */
function sourceSteps(n: number, sources: Record<string, unknown>[] | undefined) {
  // Undefined: a search glimpse without a read is not a source statement.
  if (sources === undefined) return [{ query: LECTURE }]
  // No search/read at all is the runner's explicit empty stated list.
  if (!sources.length) return undefined
  return sources.map((source) => {
    let query = String(source.document_id)
    if (source.document_id === w.rubricId) query = w.rubricTitle
    else if (source.document_id === w.lectureId) {
      query = typeof source.page === 'number'
        ? PAGE_MARK(source.page)
        : source.version_id === w.lectureVersion
          ? LECTURE
          : `Revised: the slides are now in the notes (${STAMP})`
    } else query = NOTES_MARK
    return { query, read: true }
  })
}

/** Waits for the current published source to be searchable, never for a fixed sleep. */
async function waitForSources(n: number, sources: Record<string, unknown>[] | undefined) {
  if (!sources?.length) return
  const steps = sourceSteps(n, sources)!
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!
    await expect
      .poll(
        async () => {
          const out = done(
            await call(
              w.student!.token,
              'GET',
              `/v1/courses/${demo().course.id}/materials/search?query=${encodeURIComponent(steps[i]!.query)}`,
            ),
            'course_materials.search',
          ) as { hits: { document_id: string }[] }
          return out.hits.some((hit) => hit.document_id === source.document_id)
        },
        { timeout: 30_000 },
      )
      .toBe(true)
  }
}

/** One real AR question and its model/tool answer, with no Core chat writes. */
async function answerQuestion(n: number, sources: Record<string, unknown>[] | undefined) {
  const course = demo().course.id
  await waitForSources(n, sources)
  modelRules([{ match: Q(n), answer: A(n), ...(sourceSteps(n, sources) ? { steps: sourceSteps(n, sources)! } : {}) }])
  const input = { body: Q(n), idempotency_key: `sources-${STAMP}-${n}` }
  const response = w.conversationId
    ? await arCall(w.student!, 'POST', `/courses/${course}/conversations/${w.conversationId}/messages`, input)
    : await arCall(w.student!, 'POST', `/courses/${course}/conversations`, { ...input, agent_id: w.tutorId })
  expect([200, 202], `AR question ${n}: ${JSON.stringify(response.body)}`).toContain(response.status)
  w.conversationId = response.body.conversation.id
  await expect
    .poll(
      async () => {
        const snapshot = await arMessages(w.student!, course, w.conversationId)
        if (snapshot.conversation.state === 'reply_pending_approval') return true
        const answer = snapshot.messages.find((m: { body?: string; status?: string; error?: { kind?: string } }) => m.body === A(n))
        if (answer?.status === 'failed') throw new Error(`AR model answer failed: ${answer.error?.kind ?? 'failed'}`)
        return answer?.status === 'posted'
      },
      { timeout: 30_000 },
    )
    .toBe(true)
  return response
}

/** The lecture's PDF, page 2, as the first version has it. */
const lecturePage2 = () => ({
  document_id: w.lectureId,
  version_id: w.lectureVersion,
  file_id: w.lectureFile,
  page: 2,
})

async function perms(memberId: string, levels: Record<string, string>) {
  const d = demo()
  done(
    await call(d.actors.instructor.token, 'POST', `/v1/courses/${d.course.id}/members/${memberId}/perms`, {
      perms: levels,
    }),
    'member.update_perms',
  )
}

/** The student's AR conversation, opened through the real history UI. */
async function openConversation(page: Page) {
  await page.goto(coursePath())
  const panel = await openChat(page)
  const history = panel.locator('[data-action="history"]')
  const row = panel.locator('.hist-row').filter({ hasText: Q(1) })
  await expect(async () => {
    if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click()
    await expect(row).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await row.click()
  await expect(panel.locator('.chat-msg').filter({ hasText: Q(1) })).toBeVisible()
  return panel
}

const answerIn = (panel: ReturnType<Page['locator']>, n: number) =>
  panel.locator('.chat-msg.is-agent').filter({ hasText: A(n) })

test.describe.serial('what an answer relied on', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeAll(async () => {
    const d = demo()
    const I = d.actors.instructor.token
    const c = d.course.id
    const res = await fetch(`${d.core}/v1/tools`)
    expect(res.ok, `GET /v1/tools: HTTP ${res.status}`).toBe(true)
    w.sources = takesSources(await res.json())
    // Against the pin, which takes them, a catalogue that does not say so fails the run: it is not skipped.
    expect(
      w.sources || !pinTakesSources,
      'the pinned Core’s conversation.answer takes sources (api/catalogue.json), but this Core’s catalogue says nothing of them',
    ).toBe(true)
    if (!w.sources) return

    // A course agent of the instructor's, hosted on AIshie: any student it is within may ask it.
    w.tutorId = done(
      await call(I, 'POST', '/v1/me/agents', { display_name: TUTOR, hosting: 'runtime' }),
      'agent.create',
    ).actor_id
    w.tutorSeat = done(
      await call(I, 'POST', `/v1/courses/${c}/delegates`, {
        actor_id: w.tutorId,
        preset: 'course_tutor',
        answers_course: true,
      }),
      'member.add_delegate',
    ).member_id
    w.hostedId = (await hostARAgent(d.actors.instructor, w.tutorId)).id

    // A student of this run, who may read rubrics for now; and so may the agent, which stays within her seat.
    const student = await registerPerson(`Sources student ${STAMP}`, { email: `sources+${STAMP}@e2e.test` })
    const seated = done(
      await call(I, 'POST', `/v1/courses/${c}/members`, { actor_id: student.actor_id, preset: 'student' }),
      'member.add',
    )
    w.student = { ...student, member_id: seated.member_id }
    await perms(seated.member_id, { rubric_read: 'autonomous' })
    await perms(w.tutorSeat, { rubric_read: 'autonomous' })

    // The lecture: a PDF of three pages, published.
    const u = await call(
      I,
      'GET',
      `/v1/courses/${c}/upload-url?kind=material&content_type=application%2Fpdf&filename=${encodeURIComponent(PDF_NAME)}`,
    )
    expect(u.body.status, JSON.stringify(u.body.error)).toBe('executed')
    const url = new URL(u.body.result.upload_url)
    const put = await fetch(`${d.core}${url.pathname}${url.search}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf', ...u.body.result.headers },
      body: new Uint8Array(pdfOf(3)),
    })
    expect(put.ok).toBe(true)
    const lecture = done(
      await call(I, 'POST', `/v1/courses/${c}/documents`, {
        kind: 'material',
        title: LECTURE,
        files: [{ upload_token: u.body.result.upload_token, filename: PDF_NAME }],
      }),
      'document.create',
    )
    w.lectureId = lecture.document_id
    w.lectureVersion = lecture.version_id
    w.lectureFile = lecture.file_ids[0]
    done(await call(I, 'POST', `/v1/courses/${c}/documents/${w.lectureId}/publish`, {}), 'document.publish')
    // A staff-written text version gives Core's real FTS deterministic page
    // passages even in a minimal local/CI image with no OCR worker.
    done(
      await call(I, 'POST', `/v1/courses/${c}/documents/${w.lectureId}/versions/${w.lectureVersion}/text`, {
        file_id: w.lectureFile,
        body: `## Page 1\nLists, page 1 ${PAGE_MARK(1)}\n## Page 2\nLists, page 2 ${PAGE_MARK(2)}\n## Page 3\nLists, page 3 ${PAGE_MARK(3)}`,
      }),
      'document.text_update (the lecture)',
    )

    // HW1's rubric, as published.
    const hw1 = done(await call(I, 'GET', `/v1/courses/${c}/assignments/${d.course.assignments.hw1}`), 'assignment.get')
    w.rubricId = hw1.rubric_document_id
    const rubric = done(await call(I, 'GET', `/v1/courses/${c}/documents/${w.rubricId}`), 'document.get')
    w.rubricVersion = rubric.version.id
    w.rubricTitle = rubric.title

    // Four real AR answers: page 2 of the lecture; none; nothing said; the rubric, then the lecture.
    await answerQuestion(1, [lecturePage2()])
    await answerQuestion(2, [])
    await answerQuestion(3, undefined)
    await answerQuestion(4, [
      { document_id: w.rubricId, version_id: w.rubricVersion },
      { document_id: w.lectureId, version_id: w.lectureVersion },
    ])
  })

  // A person may have five agents at once: this run's is suspended when it is done with, for the specs after it.
  test.afterAll(async () => {
    await releaseARAgent(demo().actors.instructor, w.hostedId)
    if (w.tutorId) await call(demo().actors.instructor.token, 'POST', `/v1/me/agents/${w.tutorId}/suspend`, {})
  })

  test.beforeEach(() => {
    test.skip(!w.sources, 'the pinned Core keeps no sources with an answer (its conversation.answer takes none)')
  })

  test('names the lecture an answer relied on, opening its PDF at the page; a pill for none; nothing where it did not say', async ({
    page,
  }) => {
    await signIn(page, w.student!)
    const panel = await openConversation(page)

    const first = answerIn(panel, 1)
    await expect(first.locator('.chat-sources')).toHaveText(`Based on: “${LECTURE}” · ${PDF_NAME} · page 2`)
    await expect(answerIn(panel, 2).locator('.chat-sources')).toHaveText('No course material cited')
    await expect(answerIn(panel, 2).locator('.chat-sources .el-tag--info')).toBeVisible()
    await expect(answerIn(panel, 3)).toBeVisible()
    await expect(answerIn(panel, 3).locator('.chat-sources')).toBeHidden()
    // While she may read rubrics, the rubric is named, and the line opens on both.
    const summary = answerIn(panel, 4).locator('.chat-sources__summary')
    await expect(summary).toHaveText(`Based on: “${w.rubricTitle}” · 2 items`)
    await summary.click()
    await expect(answerIn(panel, 4).locator('.chat-sources__item')).toHaveText([`“${w.rubricTitle}”`, `“${LECTURE}” · ${PDF_NAME}`])
    await page.mouse.move(0, 400)
    await photograph(page, 'answer-sources')

    // The lecture opens in the viewer, at the page the answer read.
    await first.locator('.chat-sources').getByRole('button', { name: LECTURE }).click()
    const viewer = page.getByRole('dialog', { name: PDF_NAME })
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('.file-viewer__meta')).toContainText(LECTURE)
    await expect(viewer.getByRole('textbox', { name: 'Page number' })).toHaveValue('2')
    await expect(viewer.locator('.pdf-view__of')).toHaveText('of 3')
    await expect(viewer.locator('.pdf-page[data-page="2"] .textLayer')).toContainText('Lists, page 2')
    await page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()

    // The rubric has no file: it leads to the version the answer read.
    await expect(answerIn(panel, 4).locator('.chat-sources__item a').nth(0)).toHaveAttribute(
      'href',
      `${coursePath(`documents/${w.rubricId}`)}?version=${w.rubricVersion}`,
    )

    // The pill says why on focus, not only on hover: the agent said so.
    const noneTip = page
      .locator('.el-popper')
      .filter({ hasText: 'The agent said this answer relied on no course material.' })
    await expect(noneTip).toBeHidden()
    await answerIn(panel, 2).locator('.chat-sources__none').focus()
    await expect(noneTip).toBeVisible()
  })

  // A narrow, tall phone (a folded Galaxy Z Fold 5's cover screen), on which the lecture's
  // last page, scrolled to the end, still lies below the top third of what is seen: the viewer
  // reads it all the same, since it went there.
  test.describe('on a narrow phone', () => {
    const PHONE = { width: 344, height: 882 }
    test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

    test('opens the PDF at the last page an answer read, filling the screen, with its one bar at the bottom', async ({
      page,
    }) => {
      await answerQuestion(6, [{ ...lecturePage2(), page: 3 }])
      await signIn(page, w.student!)
      const panel = await openConversation(page)
      const line = answerIn(panel, 6).locator('.chat-sources')
      await expect(line).toHaveText(`Based on: “${LECTURE}” · ${PDF_NAME} · page 3`)
      await line.getByRole('button', { name: LECTURE }).click()

      const viewer = page.getByRole('dialog', { name: PDF_NAME })
      await expect
        .poll(async () => {
          const box = (await viewer.locator('.el-dialog').boundingBox())!
          return [box.x, box.y, box.width, box.height].map(Math.round)
        })
        .toEqual([0, 0, PHONE.width, PHONE.height])
      const last = viewer.locator('.pdf-page[data-page="3"]')
      await expect(last.locator('.textLayer')).toContainText('Lists, page 3', { timeout: 20_000 })
      // Fitted to the width, and the one bar of pages and zoom is at the bottom, reading the last page.
      await expect(viewer.getByRole('button', { name: 'Fit width', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(viewer.locator('.pdf-view__of')).toHaveText('of 3')
      const toolbar = viewer.getByRole('toolbar', { name: 'Pages and zoom' })
      await expect(toolbar).toHaveCount(1)
      const bar = (await toolbar.boundingBox())!
      expect(bar.y).toBeGreaterThan(PHONE.height * 0.8)
      // Scrolled to the end, the last page clears the bar, and its number stays once the pages have settled.
      await expect
        .poll(async () => {
          const r = (await last.boundingBox())!
          return Math.round(r.y + r.height) <= Math.round(bar.y)
        })
        .toBe(true)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await expect(viewer.getByRole('textbox', { name: 'Page number' })).toHaveValue('3')
      await expect(viewer.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
      await photograph(page, 'answer-sources-phone')
    })
  })

  // A phone 375 px wide, on which a title with no spaces would push the summary of several
  // sources past the chat's right edge, and the chevron with it.
  test.describe('on a phone 375 px wide', () => {
    const PHONE = { width: 375, height: 812 }
    test.use({ viewport: PHONE, isMobile: true, hasTouch: true })

    test('wraps a summary whose title has no spaces, so that nothing in the chat scrolls sideways; a tap on the pill says why', async ({
      page,
    }) => {
      const d = demo()
      const I = d.actors.instructor.token
      const c = d.course.id
      const notes = done(
        await call(I, 'POST', `/v1/courses/${c}/documents`, {
          kind: 'material',
          title: NOTES,
          body_md: `Lists keep their order (${STAMP}). ${NOTES_MARK}`,
        }),
        'document.create',
      )
      done(await call(I, 'POST', `/v1/courses/${c}/documents/${notes.document_id}/publish`, {}), 'document.publish')
      await answerQuestion(7, [
        { document_id: notes.document_id, version_id: notes.version_id },
        lecturePage2(),
      ])
      await signIn(page, w.student!)
      const panel = await openConversation(page)
      const scroller = panel.locator('.chat-pane__messages')
      /** Nothing in the messages runs past their right edge, which the screen's is. */
      const fits = async (what: string) => {
        const [scrollWidth, clientWidth, right] = await scroller.evaluate((el) => [
          el.scrollWidth,
          el.clientWidth,
          el.getBoundingClientRect().right,
        ])
        expect(scrollWidth, `${what}: the messages' scrollWidth`).toBeLessThanOrEqual(clientWidth)
        expect(Math.round(right), `${what}: the messages' right edge`).toBeLessThanOrEqual(PHONE.width)
      }

      const msg = answerIn(panel, 7)
      const summary = msg.locator('.chat-sources__summary')
      await summary.scrollIntoViewIfNeeded()
      await expect(summary).toHaveText(`Based on: “${NOTES}” · 2 items`)
      await fits('the summary, closed')
      // The summary wraps within the messages, its chevron with it.
      const box = (await summary.boundingBox())!
      const chevron = (await summary.locator('.chat-sources__chevron').boundingBox())!
      const edge = (await scroller.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(edge.x + edge.width)
      expect(chevron.x + chevron.width).toBeLessThanOrEqual(edge.x + edge.width)
      await summary.tap()
      await expect(msg.locator('.chat-sources__item')).toHaveText([`“${NOTES}”`, `“${LECTURE}” · ${PDF_NAME} · page 2`])
      await fits('the summary, open')
      await photograph(page, 'answer-sources-375')

      // A tap on the pill says that the agent said it relied on none.
      const pill = answerIn(panel, 2).locator('.chat-sources__none')
      const noneTip = page
        .locator('.el-popper')
        .filter({ hasText: 'The agent said this answer relied on no course material.' })
      await expect(noneTip).toBeHidden()
      await pill.tap()
      await expect(noneTip).toBeVisible()
      const tip = (await noneTip.boundingBox())!
      expect(tip.x).toBeGreaterThanOrEqual(0)
      expect(tip.x + tip.width).toBeLessThanOrEqual(PHONE.width)
      await photograph(page, 'answer-sources-375-pill')
    })
  })

  test('says in the approval queue how many course materials an answer waiting there names, two pages of one being one, and why on focus', async ({
    page,
  }) => {
    const d = demo()
    // Its answers now wait for someone's approval.
    await perms(w.tutorSeat, { conversation_answer: 'confirm_required' })
    const proposed = await answerQuestion(5, [lecturePage2(), { ...lecturePage2(), page: 3 }])
    // An append is accepted while the model is still running; the approval is
    // created when the answer finishes. Read its real AR queue entry.
    const approvals = await arCall<{ approvals: { id: string; conversation_id: string; state: string }[] }>(
      d.actors.instructor,
      'GET',
      `/chat/approvals?course_id=${d.course.id}&state=pending&limit=50`,
    )
    const approvalId = proposed.body.submission?.approval_id ??
      approvals.body.approvals.find((a) => a.conversation_id === w.conversationId)?.id
    expect(approvalId).toBeTruthy()
    try {
      await signIn(page, d.actors.instructor)
      await page.goto(coursePath('approvals'))
      const card = page.locator('.ar-approval-card').filter({ hasText: A(5) })
      const line = card.locator('.answer-sources')
      await expect(line).toHaveText('Based on 1 course material')
      // Why it only counts them, on focus as on hover.
      const tip = page.locator('.el-popper').filter({ hasText: 'Each is checked again when the reply is approved' })
      await expect(tip).toBeHidden()
      await line.focus()
      await expect(tip).toBeVisible()
      await expect(card.locator('.ar-approval-card__sources')).toContainText(LECTURE)
    } finally {
      // A real AR rejection settles this pending answer; no Core action id is used.
      const rejected = await arCall(d.actors.instructor, 'POST', `/chat/approvals/${approvalId}/decision`, {
        decision: 'reject', reason: 'source test complete', idempotency_key: `sources-reject-${STAMP}`,
      })
      expect(rejected.status).toBe(200)
      await perms(w.tutorSeat, { conversation_answer: 'autonomous' })
    }
  })

  test('shows a rubric the student may no longer read as a course material she cannot open, with no title and no link', async ({
    page,
  }) => {
    await perms(w.student!.member_id!, { rubric_read: 'denied' })
    // Keep the agent within the student's current reach; otherwise AR's fresh
    // check_ask correctly makes the whole conversation unavailable instead.
    await perms(w.tutorSeat, { rubric_read: 'denied' })
    // AR keeps the two minimal source pointers; the reader's current Core
    // permission is applied by the on-demand source resolver, not by a legacy
    // Core message write or a title embedded in AR.
    const c = demo().course.id
    const read = await arMessages(w.student!, c, w.conversationId)
    const fourth = read.messages.find((m: { body?: string }) => m.body === A(4))!
    expect(fourth.sources).toHaveLength(2)

    await signIn(page, w.student!)
    await inTraditionalChinese(page)
    const panel = await openConversation(page)
    const msg = answerIn(panel, 4)
    const summary = msg.locator('.chat-sources__summary')
    await expect(summary).toHaveText(`依據：《${LECTURE}》· 2項`)
    await summary.click()
    const items = msg.locator('.chat-sources__item')
    await expect(items).toHaveText(['一份你無法開啟的課程教材', `《${LECTURE}》· ${PDF_NAME}`])
    await expect(items.nth(0).locator('a, button')).toHaveCount(0)
    await expect(msg).not.toContainText(w.rubricTitle)
    await expect(items.nth(1).locator('button')).toBeVisible()
    // The others as before, in her language.
    await expect(answerIn(panel, 1).locator('.chat-sources')).toHaveText(`依據：《${LECTURE}》· ${PDF_NAME} · 第2頁`)
    await expect(answerIn(panel, 2).locator('.chat-sources')).toHaveText('未引用課程教材')
    await page.mouse.move(0, 400)
    await photograph(page, 'answer-sources-restricted')
  })

  test('leads an answer that read another version, older or newer, to the lecture as it is now, saying so beside the link', async ({
    page,
  }) => {
    const d = demo()
    const I = d.actors.instructor.token
    const lecture = `/v1/courses/${d.course.id}/documents/${w.lectureId}`
    const v2 = done(
      await call(I, 'POST', `${lecture}/versions`, {
        body_md: `Revised: the slides are now in the notes (${STAMP}).`,
        publish: true,
      }),
      'document.add_version',
    )
    // An answer that read the second version, published. She may ask the agent again once it, too, may no longer read
    // rubrics: an agent that may do what she may not is not hers to ask.
    await perms(w.tutorSeat, { rubric_read: 'denied' })
    await answerQuestion(8, [{ document_id: w.lectureId, version_id: v2.version_id }])
    await signIn(page, w.student!)
    let panel = await openConversation(page)
    const another = `Based on: “${LECTURE}” · another version (opens it as it is now)`
    const line = answerIn(panel, 1).locator('.chat-sources')
    await expect(line).toHaveText(another)
    await expect(answerIn(panel, 8).locator('.chat-sources')).toHaveText(`Based on: “${LECTURE}”`)
    const link = line.getByRole('link')
    await expect(link).toHaveText(`“${LECTURE}” · another version`)
    await expect(link).toHaveAttribute('href', coursePath(`documents/${w.lectureId}`))
    await page.mouse.move(0, 400)
    await photograph(page, 'answer-sources-another-version')
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${coursePath(`documents/${w.lectureId}`)}$`))
    await expect(page.getByText(`Revised: the slides are now in the notes (${STAMP}).`)).toBeVisible()

    // The first version is published again: the second, which the answer read, is newer than what she may open,
    // and is not called earlier; the first answer's version is hers to open again.
    done(
      await call(I, 'POST', `${lecture}/publish`, { version_id: w.lectureVersion }),
      'document.publish (the first again)',
    )
    panel = await openConversation(page)
    await expect(answerIn(panel, 8).locator('.chat-sources')).toHaveText(another)
    await expect(answerIn(panel, 8).locator('.chat-sources').getByRole('link')).toHaveAttribute(
      'href',
      coursePath(`documents/${w.lectureId}`),
    )
    await expect(line).toHaveText(`Based on: “${LECTURE}” · ${PDF_NAME} · page 2`)
    expect((await panel.locator('.chat-sources').allTextContents()).join('\n')).not.toMatch(/earlier/i)
  })
})
