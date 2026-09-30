# AIShie-Frontend

The web front end for [AIshie Core](https://github.com/AIShie-Education/AIShie-Core), an
agent-centred LMS. Core has one tool surface that people (REST) and agents (MCP) both call; this app
is one more client of it, calling the same tools an agent calls, through the same pipeline — so a
grade an agent proposes and a grade a person enters are the same action, approved in the same queue.

Vue 3 · TypeScript · Vite · Vue Router · Pinia · Element Plus · vue-i18n (繁體中文 / English).

## What is in it

- **Courses** — material with versions and publishing; assignments with pinned instructions and
  rubrics; students' drafts, files and hand-in; grading with rubric, per-criterion breakdown and
  feedback files; posting, regrading and the gradebook; the grading scheme; members with their
  permissions and scope; the course's activity feed.
- **Uploading files** — a document is made from a file first: new material, a new version, and new
  instructions or a rubric open on a drop zone, and writing text is the second choice ("Write text
  instead"). Files are dropped on the zone, or anywhere on the page or dialog it is the one zone of,
  chosen, or pasted, several at once: files dropped on the materials list become material, one
  each, titled from their names (to change before creating), and a file dropped on a document's
  page becomes its new version. Students drop their work on their draft, and graders feedback
  files on a grade. Three upload at a time, each listed with its progress, speed and time left, to
  cancel, try again or take off; one whose connection drops is tried again by itself, once the
  browser is back online where it is not. A file larger than the site takes is refused before it
  is sent, with both sizes, and nothing is saved while a file is still uploading. On a phone the
  drop zone is one big button to choose files.
- **Text versions (文字版)** — each version of material, instructions or a rubric with a file has a
  text version on a tab of its own: the file transcribed into Markdown once by the school's
  transcriber (a model of the school's plan, on the agent runtime), shown as the chat shows Markdown,
  formulas, code and tables, with a way to go to each page or slide, and said to be the AI's (and
  which model's) or corrected by whom. Whoever reads the version reads it; whoever writes the
  document corrects it (a staff text, which no transcription writes over; a text changed meanwhile
  keeps the draft to save over the latest), writes one by hand, or sends it to be transcribed again,
  a staff text discarded only once they confirm twice. Its place in the queue (queued, transcribing)
  shows while the runtime says its transcriber is on; a text that failed or was skipped says why.
- **Records that change after the fact** — whoever manages a course's members changes a seat's
  roster role (student, TA, instructor), which changes nothing it may do, and the course's title and
  description; its code, section, term and department stay its administrators'. A change of what
  graded work is worth asks what becomes of the grades already entered, rescaled or kept as they are,
  each shown in the actual numbers, and says how many were rescaled and how many totals written
  again. A grader overrides a student's total with a reason, beside the figure worked out, takes the
  override off, and comments on a total; the student sees the override and the comment, never who or
  why. Final grades are undone for one student or all. Material is renamed, reordered, archived and
  brought back; an administrator of the course purges a version or a whole document uploaded by
  mistake, which leaves a tombstone saying who purged it, when and why.
- **Invite links** — whoever holds `member_invite` in a course makes a link to it on the members
  page, for showing a class as a QR code (full screen, to project): it works for ten minutes, for
  as many people and only for the email domains its maker says, and is counted down as it runs.
  The page it opens (`/join/<token>`) joins someone signed in as a student at once; anyone else
  signs in (single sign-on included) and comes back to join, or creates an account through it
  while Core takes registrations through links: with a student number to sign in with (and an email
  if they have one), or, through a link kept to email domains, an email there. The list says who
  created each link, how many joined, and revokes it.
- **Student and staff numbers** — a person signs in with their student or staff number (a login
  ID) as with an email, where Core takes one; the roster, a member's page and their own account show
  it, an instructor finds someone to add by it, and an administrator gives and corrects it, and
  vouches for one a person typed themselves registering through a link. Whoever manages a course's
  members without approval gives a student who has forgotten their password a temporary one, shown
  once, to hand to them in person; every session of theirs ends, and at the next sign-in they may do
  nothing but choose their own (`/change-password`), then go where they were going.
- **People and agents in the loop** — what an agent (or a person) with `confirm_required` does
  becomes a proposal: it shows up under *Approvals*, and nothing happens until someone approves
  it. `pending_review` work is reviewed after the fact in the same place. Everyone can see what
  became of their own actions under *My actions*. An agent decides only by proposal, and every
  permission editor offers only the levels a seat may hold, greying out the rest with why.
- **An agent's owner decides what it did** where they could have done it themselves without
  anyone's confirmation, as their own doing: a student whose agent drafts her submission, which it
  may do only by proposal, approves it herself. Someone who decides nothing else in a course but
  owns an agent seated there finds its proposals and reviews under *Your agents' proposals* (the
  approvals page, showing their own agents' alone), where each one that is not theirs to decide says
  why, and any proposal of their agent's may be withdrawn while it waits.
- **Administration** (root and admins) — terms, departments, permission presets, courses and their
  first instructor; a directory of everyone registered, searchable by name, email, student or staff
  number or ID, with how each signs in; registering people and agents, an agent with the person who
  owns it, which is fixed then and never changed, and correcting their name, email and number;
  invitation links, with which a person chooses their password (their first, or a new one when it is
  forgotten); single sign-on identities; and API tokens for agents, which only agents are given.
- **The agent runtime's settings** (its administrators, under *AI and documents*) — the school's AI
  plan: the models the school provides and pays for, the operator's (runtime.yaml) shown read-only
  and the site's added, edited, turned off and deleted, each with the school's key, which is tried
  with the provider before it is kept and never shown again, and each saying first what becomes of
  the agents on it; the plan's daily quotas, in answers and dollars, and today's use of it.
  Pricing: the price table (the operator's price file, read-only, and the site's prices before it,
  from a day on), each person's daily quota on the school's key, hosted agents' daily budgets, and
  what things cost, by day, person, agent, model or key, a document's transcription as a line of its
  own. Documents: the reading of scanned ones (OCR), on or off and in which of the server's
  languages; and their transcription into text versions, on or off, with which model of the plan,
  up to how many pages a document and a day, how many at once, what it is doing and did today, the
  versions it took up and how each ended, and its credential with Core, issued and handed to the
  runtime by one button (never shown) and revoked by another. Where the server has no runtime, or
  one from before these settings, the page says so.
- **Account** — the ways into one's account (password, single sign-on, invitations and the browser
  sessions they began), each revocable, and the password; and the page an invitation link opens
  (`/welcome`), where the person chooses a password and is signed in. The link carries its token
  in the fragment (`#token=…`), which reaches no server log. People have no API tokens: an agent is
  given its tokens by its owner under *My agents*, or by an administrator.

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
production. Which Core it talks to is `AISHIE_API_TARGET` (default `https://test.aishie.app`):

```bash
AISHIE_API_TARGET=http://localhost:8080 npm run dev
```

(`npm run dev:local` is the same for a Core on this machine.) Sign in with an email (or a student or
staff number) and a password, or with single sign-on where Core has it. Only people sign in to the
app; agents call Core with their API tokens, over MCP or REST.

The agent runtime's API, `/runtime/api`, is proxied too, without the `Cookie` header, as the
server's proxy sends it: to `AISHIE_RUNTIME_TARGET`, by default the same place as Core, whose
server routes that path to its runtime. For a runtime on this machine, point it at the runtime's
`API_ADDR`; the runtime's `API_AUDIENCE` must then be one of the local Core's `RUNTIME_AUDIENCES`:

```bash
AISHIE_RUNTIME_TARGET=http://localhost:9091 npm run dev:local
```

Without a runtime there the path answers 404 or 502, and the pages simply offer no hosting.

To run Core locally, see its README (`make build`, `aishie-core migrate up`, `seed`, `bootstrap`,
`serve`). Start it with `INSECURE_COOKIES=true` so that the session cookie is accepted over plain
`http://localhost`.

### Demo data

`scripts/seed-demo.mjs` builds a demonstration course through the API, the way people and agents
would: a term and department, an instructor, a TA, three students, an observer, a grading agent and
a tutor agent; material, a grading scheme and two assignments; a handed-in submission with a file,
a draft, a grade the grading agent proposed that waits for approval, and a draft exam grade.

```bash
CORE_URL=http://localhost:8080 ROOT_EMAIL=… ROOT_PASSWORD=… DEMO_PASSWORD='at least 10 chars' \
  node scripts/seed-demo.mjs --out demo.json
```

It acts as root (or another administrator), signed in with `ROOT_EMAIL` and `ROOT_PASSWORD`, or
with a session of theirs in `ROOT_TOKEN`. Each person it registers chooses `DEMO_PASSWORD` through
an invitation; each agent is given an API token.

Core deletes nothing, so run it against a development instance. `scripts/shot.mjs` signs in as one
of the demo's people, or root, and screenshots a page, listing console errors and failed API calls.

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

Single sign-on is Core's to say. The sign-in page asks Core how one signs in
(`GET /v1/auth/methods`) as it loads, and shows the single sign-on button once Core says it has an
identity provider (its `OIDC_ISSUER`), with the provider's name when Core gives one
(`OIDC_DISPLAY_NAME`) and *single sign-on* when it does not. Nothing here is set for it.

Built into the app at build time (see `.env.example`):

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Where Core is, when it is not this origin. Leave empty for a same-origin deployment (recommended). |
| `VITE_SSO_ENABLED` | Only for a Core without `GET /v1/auth/methods` (it answers 404), or when Core cannot be asked: `true` shows the single sign-on button; Core must have `OIDC_ISSUER` set. |
| `VITE_SSO_LABEL` | The button's provider name then, e.g. `PolyU NetID`. |

The published image is built with none of them set: Core on the page's own origin, and single
sign-on as Core says, or none from a Core too old to say
([docs/deploying.md](docs/deploying.md#the-image)).

Hosting agents on the school's agent runtime is the server's to say too. The app asks the runtime's
public `GET /runtime/api/v1/info` once per page load, and offers hosting only when it answers with
the runtime's audience, issuer and version; a 404, a 502, the app's own page or no answer hides it.
The runtime is called with an assertion Core makes for the person signed in, for that audience
(`POST /v1/auth/assertion`), so Core's `RUNTIME_AUDIENCES` must list it
([docs/deploying.md](docs/deploying.md#the-agent-runtimes-api)).

## Deploy

Serve `dist/` and Core from **one origin**, behind one reverse proxy: Core's session cookie is
`SameSite=Lax` and its guard refuses cross-origin writes, so this is the arrangement it expects. The
proxy sends `/v1/*`, `/mcp` and `/healthz` to Core, `/runtime/api/*` to the agent runtime's API
with the `Cookie` header removed, and everything else to the static files, falling back to
`index.html` for the app's own routes.

The front end is deployed as an image, in the docker compose stack that runs the whole system
([AIShie-Deploy](https://github.com/AIShie-Education/AIShie-Deploy)), which pulls it from GHCR:
`ghcr.io/aishie-education/aishie-frontend`, for amd64 and arm64. It is the production build, served
by Caddy on port 8080 over plain HTTP, as a user that is not root, by the rules below; the stack's
Caddy terminates TLS in front of it and sends Core its routes. Its tags:

- `:sha-<commit>` for every push to `main` whose checks and image test passed (the commit's first 7
  hex digits), and `:edge` for the newest of them that is still `main`'s tip;
- `:X.Y.Z` and `:X.Y` for a release `vX.Y.Z`, and `:latest` for the highest stable one; a
  pre-release gets `:X.Y.Z-rc.N` alone.

`GET /version.json` says which it is, `{"version":"v1.2.3","commit":"abc1234"}`, and is the stack's
health check. It takes one setting, `FRAME_ANCESTORS`: which sites may show the app in a frame
(`Content-Security-Policy: frame-ancestors`), by default `'self'`, its own origin alone; an LMS
that frames it from another site also needs Core's `COOKIE_SAMESITE=none`
([Frames](docs/deploying.md#frames)). What the image does, exactly, and how to build and test it
here: [docs/deploying.md](docs/deploying.md#the-image).

Until the stack runs, the older way still works: on a server set up with Core's
`deploy/setup-server.sh`, `deploy/setup-web.sh` serves the files with Caddy, and the Deploy workflow
keeps them up to date over SSH ([docs/deploying.md](docs/deploying.md#over-ssh)). It is retired once
the stack runs. The site block it writes, whose rules the image's `Caddyfile` has too:

```caddyfile
lms.example.edu {
	@core path /v1/* /mcp /mcp/* /healthz
	handle @core {
		reverse_proxy 127.0.0.1:8080
	}

	handle /assets/* {
		root * /srv/aishie-web/current
		@found file
		header @found Cache-Control "public, max-age=31536000, immutable"
		encode zstd gzip
		file_server
	}
	handle {
		root * /srv/aishie-web/current
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
  against the Core pinned in `.github/core-image`. A pull request's image is built and tested too
  (`scripts/test-image.sh`).
- **A green push to `main`** has its image tested and pushed to GHCR as `:sha-<commit>`, and `:edge`
  while it is `main`'s tip, by [Publish](.github/workflows/publish.yml); and it is deployed to staging
  (test.aishie.app) over SSH by [Deploy](.github/workflows/deploy.yml), with the build CI checked:
  nothing is built again.
- **A version tag** (`v1.2.3`) runs CI again, publishes its image as `:1.2.3` and `:1.2` (and
  `:latest`), and that build on the release page; a pre-release (`v1.2.3-rc.1`) also goes to staging.
  **Production** is deployed by hand: Actions → Deploy → Run workflow, from the release's tag,
  environment `production` ([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).
- **Rolling back** is immediate on the server, which keeps the last few releases:
  `sudo -u webdeploy aishie-web-deploy list`, then `… activate <release>`; or run Deploy from the
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
scripts/                  type generator, i18n check, demo data, screenshot helper, the CI Core, packing a build,
                          the image's test (test-image.sh)
.github/                  CI, Publish, Deploy and Release workflows, the pinned Core (core-image), Dependabot
Dockerfile, Caddyfile     the image: the build, served by Caddy on :8080 (docs/deploying.md)
deploy/                   the SSH deploy's server side: setup-web.sh and aishie-web-deploy (docs/deploying.md)
src/api/                  the client: http.ts (read, write, uploadFile), generated types, named shapes
src/stores/               session (who is signed in), course (the open course and the caller's seat)
src/composables/          useAsync / usePaged, useWrite (idempotent writes and their outcomes), errors,
                          useUploadQueue and useFileDrop (files on their way, and dropped or pasted on the page)
src/components/           shared pieces: status tags, Markdown, the drop zone (FileDropZone), file download,
                          permission editor…
src/layouts/              the app frame, and the course frame with its sections
src/views/                one directory per area
src/i18n/messages/        one file per namespace and language
docs/CONVENTIONS.md       how the views are written
docs/deploying.md         the image and its tags; setting a server up, deploying, rolling back over SSH
```

## License

AIshie Frontend is copyright 2026 XIE Hanming, and source-available under the [Elastic License 2.0](LICENSE) (ELv2), governed by the laws of Hong Kong. You may use, copy, change and redistribute it on the terms in LICENSE, which include that you may not offer it to others as a hosted or managed service.
