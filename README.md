# AIShiteru-Frontend

The web front end for [AIShiteru Core](https://github.com/AIShie-Education/AIShie-Core), an
agent-centred LMS. Core has one tool surface that people (REST) and agents (MCP) both call; this app
is one more client of it, calling the same tools an agent calls, through the same pipeline — so a
grade an agent proposes and a grade a person enters are the same action, approved in the same queue.

Vue 3 · TypeScript · Vite · Vue Router · Pinia · Element Plus · vue-i18n (繁體中文 / English).

## What is in it

- **Courses** — material with versions and publishing; assignments with pinned instructions and
  rubrics; students' drafts, files and hand-in; grading with rubric, per-criterion breakdown and
  feedback files; posting, regrading and the gradebook; the grading scheme; members with their
  permissions and scope; the course's activity feed.
- **People and agents in the loop** — what an agent (or a person) with `confirm_required` does
  becomes a proposal: it shows up under *Approvals*, and nothing happens until someone approves
  it. `pending_review` work is reviewed after the fact in the same place. Everyone can see what
  became of their own actions under *My actions*.
- **Administration** (root and admins) — terms, departments, permission presets, courses and their
  first instructor; a directory of everyone registered, searchable by name, email or ID, with how
  each signs in; registering people and agents and correcting their name and email; invitation
  links, with which a person chooses their password (their first, or a new one when it is
  forgotten); API tokens and single sign-on identities.
- **Account** — credentials, API tokens (for connecting an agent over MCP), password; and the
  page an invitation link opens (`/welcome`), where the person chooses a password and is signed
  in. The link carries its token in the fragment (`#token=…`), which reaches no server log.

What a seat may do is Core's decision alone. The app offers what the seat's permissions suggest,
says when something will need approval, and shows Core's refusal when it refuses.

## Develop

Needs Node 20.19+; CI uses the version in `.nvmrc`.

```bash
npm install
npm run dev
```

The dev server is at http://localhost:5173 and proxies `/v1` and `/healthz` to Core, so the
browser sees one origin and Core's session cookie and cross-origin guard work as they will in
production. Which Core it talks to is `AISHITERU_API_TARGET` (default `https://test.aishie.app`):

```bash
AISHITERU_API_TARGET=http://localhost:8080 npm run dev
```

(`npm run dev:local` is the same for a Core on this machine.) Sign in with an email and password,
or paste an API token under *Use an API token* to see the app as that actor — an agent, say — sees
it; the token is kept for that browser tab only.

To run Core locally, see its README (`make build`, `aishiterud migrate up`, `seed`, `bootstrap`,
`serve`). Start it with `INSECURE_COOKIES=true` so that the session cookie is accepted over plain
`http://localhost`.

### Demo data

`scripts/seed-demo.mjs` builds a demonstration course through the API, the way people and agents
would: a term and department, an instructor, a TA, three students, an observer, a grading agent and
a tutor agent; material, a grading scheme and two assignments; a handed-in submission with a file,
a draft, a grade the grading agent proposed that waits for approval, and a draft exam grade.

```bash
CORE_URL=http://localhost:8080 ROOT_TOKEN=ais_… DEMO_PASSWORD='at least 10 chars' \
  node scripts/seed-demo.mjs --out demo.json
```

Core deletes nothing, so run it against a development instance. `scripts/shot.mjs` signs in as one
of the demo actors and screenshots a page, listing console errors and failed API calls.

### Checks

```bash
npm run typecheck   # vue-tsc
npm test            # unit tests (vitest)
npm run build       # type-check and build into dist/
```

The end-to-end tests (`npx playwright test`) need a Core they may write to;
`scripts/ci-core.sh` starts a throwaway one, as CI does. What CI runs, and how
to run it here, is in [CONTRIBUTING.md](CONTRIBUTING.md#checks).

### API types

`src/api/generated/tools.ts` holds the input and output type of every tool, generated from
`api/catalogue.json`, a snapshot of Core's `GET /v1/tools`. When Core's catalogue changes:

```bash
npm run gen:api -- --from https://test.aishie.app
```

and let the type checker show what needs to follow. CI checks the snapshot against the Core it pins
in `.github/core-image` ([Moving the Core pin](#moving-the-core-pin)).

## Configure

Built into the app at build time (see `.env.example`):

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Where Core is, when it is not this origin. Leave empty for a same-origin deployment (recommended). |
| `VITE_SSO_ENABLED` | `true` shows the single sign-on button; Core must have `OIDC_ISSUER` set. |
| `VITE_SSO_LABEL` | The button's provider name, e.g. `PolyU NetID`. |

## Deploy

Serve `dist/` and Core from **one origin**, behind one reverse proxy: Core's session cookie is
`SameSite=Lax` and its guard refuses cross-origin writes, so this is the arrangement it expects. The
proxy sends `/v1/*`, `/mcp` and `/healthz` to Core and everything else to the static files, falling
back to `index.html` for the app's own routes. On a server set up with Core's `deploy/setup-server.sh`,
`deploy/setup-web.sh` does this with Caddy, and the Deploy workflow keeps it up to date
([docs/deploying.md](docs/deploying.md)). The site block it writes:

```caddyfile
lms.example.edu {
	@core path /v1/* /mcp /mcp/* /healthz
	handle @core {
		reverse_proxy 127.0.0.1:8080
	}

	handle /assets/* {
		root * /srv/aishiteru-web/current
		@found file
		header @found Cache-Control "public, max-age=31536000, immutable"
		encode zstd gzip
		file_server
	}
	handle {
		root * /srv/aishiteru-web/current
		header Cache-Control "no-cache"
		encode zstd gzip
		try_files {path} /index.html
		file_server
	}
}
```

Hashed files under `/assets/` never change, so browsers keep them; `index.html` is asked for each time,
so a deploy shows at once. On Core's side set `PUBLIC_URL` to that origin (upload and download URLs are
made from it), and `TRUSTED_PROXIES` to the proxy's address.

If the front end must live on another origin, build it with `VITE_API_BASE=https://core.example.edu`,
add the front end's origin to Core's `TRUSTED_ORIGINS`, and — when the two are not even same-site —
set Core's `COOKIE_SAMESITE=none`.

## CI/CD

- **Every pull request and push to `main`** is checked by [CI](.github/workflows/ci.yml): the checks
  above, the build, the scripts in `deploy/`, `npm audit`, and the end-to-end tests on that build
  against the Core pinned in `.github/core-image`.
- **A green push to `main`** is deployed to staging (test.aishie.app) by
  [Deploy](.github/workflows/deploy.yml), with the build CI checked: nothing is built again.
- **A version tag** (`v1.2.3`) runs CI again and publishes that build on the release page;
  a pre-release (`v1.2.3-rc.1`) also goes to staging. **Production** is deployed by hand: Actions →
  Deploy → Run workflow, from the release's tag, environment `production`
  ([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).
- **Rolling back** is immediate on the server, which keeps the last few releases:
  `sudo -u webdeploy aishiteru-web-deploy list`, then `… activate <release>`; or run Deploy from the
  newest release's tag with the older tag as the ref ([docs/deploying.md](docs/deploying.md#day-to-day)).

A server needs `deploy/setup-web.sh` once, and the repository needs its deploy settings and read access
to Core's image once ([CONTRIBUTING.md](CONTRIBUTING.md#one-time-settings)). Until the settings are
there, a deploy says which build is ready and does nothing.

### Moving the Core pin

The end-to-end tests run against one image of Core, pinned by digest in `.github/core-image`, and
`api/catalogue.json` must be its catalogue. To move to a newer Core, start it with
`scripts/ci-core.sh`, refresh the snapshot and the types from it (`npm run gen:api -- --from
http://127.0.0.1:8080`), fix what the type checker then shows, and commit them with the new pin
([CONTRIBUTING.md](CONTRIBUTING.md#the-core-the-tests-run-against)).

## Layout

```
api/catalogue.json        snapshot of Core's tool catalogue (GET /v1/tools)
scripts/                  type generator, i18n check, demo data, screenshot helper, the CI Core, packing a build
.github/                  CI, Deploy and Release workflows, the pinned Core (core-image), Dependabot
deploy/                   the server's side: setup-web.sh and aishiteru-web-deploy (docs/deploying.md)
src/api/                  the client: http.ts (read, write, upload), generated types, named shapes
src/stores/               session (who is signed in), course (the open course and the caller's seat)
src/composables/          useAsync / usePaged, useWrite (idempotent writes and their outcomes), errors
src/components/           shared pieces: status tags, Markdown, file upload/download, permission editor…
src/layouts/              the app frame, and the course frame with its sections
src/views/                one directory per area
src/i18n/messages/        one file per namespace and language
docs/CONVENTIONS.md       how the views are written
docs/deploying.md         setting a server up, deploying, rolling back
```
