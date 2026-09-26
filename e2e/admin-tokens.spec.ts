import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, root, signInWithToken, toast } from './support'

// An administrator sees an agent's API tokens on its page, with who issued
// each, and revokes one that has leaked without suspending the agent: the
// revoked token is refused from its next call, and the other goes on working.
const stamp = Date.now().toString(36)
const AGENT = `token-agent-${stamp}`
const FIRST = `leaky grader ${stamp}`
const SECOND = `replacement grader ${stamp}`
let agentId = ''
let firstToken = ''
let secondToken = ''
let rootId = ''
let rootName = ''

/** Whom Core takes a token for: the status of GET /v1/me with it. */
async function meStatus(token: string): Promise<number> {
  return (await call(token, 'GET', '/v1/me')).status
}

/** The prefix a token is listed by: ais_<prefix>_<secret>. */
function prefixOf(token: string): string {
  return token.split('_')[1]
}

function credentialsCard(page: Page): Locator {
  return page.locator('section.creds')
}

/** A token's row in the list: a table row on a wide screen, a card on a narrower one. */
function tokenRow(card: Locator, label: string): Locator {
  return card.locator('.el-table__row, .creds-token').filter({ hasText: label })
}

test.beforeAll(async () => {
  const token = root().token
  const me = await call(token, 'GET', '/v1/me')
  expect(me.status, JSON.stringify(me.body)).toBe(200)
  rootId = me.body.result.id
  rootName = me.body.result.display_name

  const made = await call(token, 'POST', '/v1/actors', { kind: 'agent', display_name: AGENT })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  agentId = made.body.result.actor_id
  // The first token through the API, as a script setting the agent up would.
  const issued = await call(token, 'POST', `/v1/actors/${agentId}/tokens`, { label: FIRST, expires_in_days: 30 })
  expect(issued.body.status, JSON.stringify(issued.body)).toBe('executed')
  firstToken = issued.body.result.token
})

// The second test reads the token the first issues: they run, and are retried, together.
test.describe.serial('an agent’s tokens on its admin page', () => {
  test('an administrator lists an agent’s tokens with their issuer, and revokes the one that leaked', async ({
    page,
  }) => {
    await signInWithToken(page, root())
    await page.goto(`/admin/actors/${agentId}`)
    await expect(page.locator('.page-header')).toContainText(AGENT)
    const card = credentialsCard(page)
    await expect(card.getByRole('heading', { name: 'Tokens and sign-ins' })).toBeVisible()

    // The token made before: its label, masked prefix, issuer and state.
    const first = tokenRow(card, FIRST)
    await expect(first).toBeVisible()
    await expect(first).toContainText(`ais_${prefixOf(firstToken)}_…`)
    await expect(first).toContainText(rootName)
    await expect(first).toContainText('Active')
    await expect(first).toContainText('Never used')
    await expect(first.getByRole('link', { name: rootName })).toHaveAttribute('href', `/admin/actors/${rootId}`)
    // An agent signs in with nothing else.
    await expect(card).not.toContainText('Sessions and other sign-ins')
    // It works, until it is revoked.
    expect(await meStatus(firstToken)).toBe(200)

    // The second through the page: once issued, the list shows it at once.
    const issue = page
      .locator('section.app-card')
      .filter({ has: page.getByRole('heading', { name: 'API token', exact: true }) })
    await issue.getByPlaceholder('grader for CS101, autumn term').fill(SECOND)
    await issue.getByRole('button', { name: 'Issue token' }).click()
    const reveal = page.getByRole('dialog', { name: 'Copy the token now' })
    await expect(reveal).toContainText('This is the only time the token is shown.')
    secondToken = await reveal.locator('#reveal-token').inputValue()
    expect(secondToken).toMatch(/^ais_[a-z2-7]{12}_/)
    await reveal.getByRole('button', { name: 'Done' }).click()
    await page
      .getByRole('dialog', { name: 'Close without copying?' })
      .getByRole('button', { name: 'Close anyway' })
      .click()
    await expect(reveal).toBeHidden()

    const second = tokenRow(card, SECOND)
    await expect(second).toBeVisible()
    await expect(second).toContainText(`ais_${prefixOf(secondToken)}_…`)
    await expect(second).toContainText(rootName)
    await expect(second).toContainText('Active')
    await expect(first).toBeVisible()
    expect(await meStatus(secondToken)).toBe(200)

    // Revoking the first says what it does, and that it cannot be undone.
    await first.getByRole('button', { name: 'Revoke' }).click()
    const confirm = page.getByRole('dialog', { name: `Revoke the token “${FIRST}”?` })
    await expect(confirm).toContainText(`Anything using ais_${prefixOf(firstToken)}_… is refused from its next call.`)
    await expect(confirm).toContainText('This cannot be undone')
    await expect(confirm).toContainText(`${AGENT} keeps their other tokens and sign-ins, and their seats.`)
    await confirm.getByRole('button', { name: 'Revoke' }).click()
    await expect(toast(page, 'Revoked')).toBeVisible()

    // Gone from the live tokens; shown as revoked on asking, with nothing more to do to it.
    await expect(first).toHaveCount(0)
    await expect(second).toBeVisible()
    await card.getByText('Show revoked and expired (1)').click()
    await expect(first).toBeVisible()
    await expect(first).toContainText('Revoked')
    await expect(first.getByRole('button', { name: 'Revoke' })).toHaveCount(0)
    await expect(second.getByRole('button', { name: 'Revoke' })).toBeVisible()

    // Core refuses the revoked token and takes the other; the agent itself is not suspended.
    expect(await meStatus(firstToken)).toBe(401)
    expect(await meStatus(secondToken)).toBe(200)
    const agent = await call(root().token, 'GET', `/v1/actors/${agentId}`)
    expect(agent.body.result.status).toBe('active')
    await expect(page.locator('.page-header')).toContainText('Active')
  })

  test('the agent sees on its Account page who issued its token', async ({ browser }) => {
    expect(secondToken, 'the token from the test before').not.toBe('')
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInWithToken(page, { token: secondToken })
    await page.goto('/account')
    const item = page.locator('.creds-item').filter({ hasText: SECOND })
    await expect(item).toContainText('Issued by')
    await expect(item).toContainText(rootName)
    await context.close()
  })
})

test('on one’s own page, credentials are listed but revoked on the Account page', async ({ page }) => {
  await signInWithToken(page, root())
  await page.goto(`/admin/actors/${rootId}`)
  const card = credentialsCard(page)
  await expect(card).toContainText('These are your own.')
  await card.getByRole('link', { name: 'Open my account' }).click()
  await expect(page).toHaveURL(/\/account$/)
  await page.goBack()
  await expect(credentialsCard(page).locator('.el-table__row, .creds-token').first()).toBeVisible()
  await expect(credentialsCard(page).getByRole('button', { name: 'Revoke' })).toHaveCount(0)
  await expect(credentialsCard(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0)
})

test('on a Core without the list, the page says so and still issues tokens', async ({ page }) => {
  // What a Core from before actor.list_credentials answers: no such route.
  await page.route(
    (url) => /^\/v1\/actors\/[^/]+\/credentials$/.test(url.pathname),
    (route) =>
      route.request().method() !== 'GET'
        ? route.continue()
        : route.fulfill({
            status: 404,
            json: { error: { code: 'not_found', message: 'no such route; GET /v1/tools lists what there is' } },
          }),
  )
  await signInWithToken(page, root())
  await page.goto(`/admin/actors/${agentId}`)
  await expect(page.getByText('This Core cannot list an actor’s tokens and sign-ins yet')).toBeVisible()
  await expect(credentialsCard(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Issue token' })).toBeVisible()
})
