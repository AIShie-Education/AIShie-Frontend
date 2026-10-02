import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, demo, expectToasted, keepToasts, root, signInAsRoot } from './support'

// An administrator sees an agent's API tokens on its page, with who issued
// each, and revokes one that has leaked without suspending the agent: the
// revoked token is refused from its next call, and the other goes on working.
// Only agents are given API tokens: a person's page, one's own included,
// offers none to issue.
const stamp = Date.now().toString(36)
const AGENT = `token-agent-${stamp}`
const FIRST = `leaky grader ${stamp}`
const SECOND = `replacement grader ${stamp}`
let agentId = ''
let firstToken = ''
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

  const made = await call(token, 'POST', '/v1/actors', { kind: 'agent', display_name: AGENT, hosting: 'mcp' })
  expect(made.body.status, JSON.stringify(made.body)).toBe('executed')
  agentId = made.body.result.actor_id
  // The first token through the API, as a script setting the agent up would.
  const issued = await call(token, 'POST', `/v1/actors/${agentId}/tokens`, { label: FIRST, expires_in_days: 30 })
  expect(issued.body.status, JSON.stringify(issued.body)).toBe('executed')
  firstToken = issued.body.result.token
})

test.describe('an agent’s tokens on its admin page', () => {
  test('an administrator lists an agent’s tokens with their issuer, and revokes the one that leaked', async ({
    page,
  }) => {
    await keepToasts(page)
    await signInAsRoot(page)
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
    const secondToken = await reveal.locator('#reveal-token').inputValue()
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
    await expectToasted(page, 'Revoked')

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
})

test('on one’s own page, credentials are listed but revoked on the Account page', async ({ page }) => {
  await signInAsRoot(page)
  await page.goto(`/admin/actors/${rootId}`)
  const card = credentialsCard(page)
  await expect(card).toContainText('These are your own.')
  await card.getByRole('link', { name: 'Open my account' }).click()
  await expect(page).toHaveURL(/\/account$/)
  await page.goBack()
  // Root's sessions: the run's own, and this browser's.
  await expect(credentialsCard(page).locator('.creds-other').first()).toBeVisible()
  await expect(credentialsCard(page).getByRole('button', { name: 'Revoke' })).toHaveCount(0)
  await expect(credentialsCard(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  // A person, root included, is issued no token.
  await expect(page.getByRole('heading', { name: 'API token', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Issue token' })).toHaveCount(0)
})

test('a person’s page offers no token to issue, and lists how they sign in', async ({ page }) => {
  const yuki = demo().actors.yuki
  await signInAsRoot(page)
  await page.goto(`/admin/actors/${yuki.actor_id}`)
  await expect(page.locator('.page-header')).toContainText(yuki.display_name)
  // How a person gets in: an invitation link, and single sign-on.
  await expect(page.locator('.invite')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'API token', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Issue token' })).toHaveCount(0)
  const card = credentialsCard(page)
  await expect(card.getByRole('heading', { name: 'Tokens and sign-ins' })).toBeVisible()
  await expect(card.getByRole('heading', { name: 'API tokens' })).toHaveCount(0)
  await expect(card.locator('.creds-other').filter({ hasText: 'Password' }).first()).toBeVisible()
  await expect(card.locator('.creds-other').filter({ hasText: 'Signed in by accepting an invitation' }).first()).toBeVisible()
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
  await signInAsRoot(page)
  await page.goto(`/admin/actors/${agentId}`)
  await expect(page.getByText('This Core cannot list an actor’s tokens and sign-ins yet')).toBeVisible()
  await expect(credentialsCard(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Issue token' })).toBeVisible()
})
