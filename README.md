# AIShie-Frontend

The web front end for [AIshie Core](https://github.com/AIShie-Education/AIShie-Core), an
agent-centred LMS. Core has one tool surface that people (REST) and agents (MCP) both call; this app
is one more client of it, calling the same tools an agent calls, through the same pipeline — so a
grade an agent proposes and a grade a person enters are the same action, approved in the same queue.

Vue 3 · TypeScript · Vite · Vue Router · Pinia · Element Plus · vue-i18n (繁體中文 / 简体中文 / English).

## What is in it

- **Courses** — material with versions and publishing; assignments with pinned instructions and
  rubrics; students' drafts, files and hand-in; grading with rubric, per-criterion breakdown and
  feedback files; posting, regrading and the gradebook; the grading scheme; members with their
  permissions and scope; the course's activity feed.
- **Uploading files** — a document is made from files first (一份文件含多個檔案): new material,
  a new version, and new instructions or a rubric open on a drop zone, and under it an optional
  text note in Markdown (「加入文字說明（選填）」), which goes in the same version as the files;
  material that is text alone is written by "Write text instead". Files are dropped on the zone,
  or anywhere on the page or dialog it is the one zone of, chosen, or pasted, several at once, and
  all go into one version, numbered in the order listed, which can be changed (each moved up or
  down) or a file taken off before saving: files dropped on the materials list become one
  material, titled from the first file's name until the title is written, and files dropped on a
  document's page become its new version, with the latest version's text unless it is left out.
  Students drop their work on their draft, each file attached as it is up, and graders feedback
  files on a grade. Three upload at a time, each listed with its progress, speed and time left, to
  cancel, try again or take off; one whose connection drops is tried again by itself, once the
  browser is back online where it is not. What a version holds (twenty files, 50 MB each, 200 MB in
  all, by default) is said on the zone and checked before anything is sent: a file larger than the
  site takes, or one there is no room for, is not uploaded, and says why, with the sizes; what Core
  still refuses because of the files is said in words, and an upload it no longer takes is uploaded
  again. Nothing is saved while a file is still uploading. On a phone the drop zone is one big
  button to choose files.
- **A version's files** — each version lists its files in order, with an icon by type, name and
  size, each opened in the file viewer or downloaded under its name from a fresh short-lived URL;
  the version history counts and names each version's files. A submitted document or a feedback
  file that holds several files shows them all wherever it is listed (the submission, the grade, a
  student's draft, grading).
- **Previewing files (檔案預覽)** — any file listed (a version's, a submitted or feedback document's,
  a chat message's) opens in a viewer over the page, the whole screen on a phone, which steps
  through the files listed with it (buttons, or the arrow keys), downloads the one shown under its
  name, and closes with Escape. A PDF is drawn in the page by pdf.js, loaded only then from this
  site's own files, page by page as it is scrolled, with page numbers, zoom and fit to width, and
  its text selectable; an image is shown fitted or zoomed; Markdown is rendered, code highlighted,
  plain text shown as it is (in UTF-8, Big5 or GB 18030), CSV as a table of its first thousand rows;
  audio and video play in the browser. Files are fetched from a fresh short-lived URL and shown from
  object URLs let go as soon as another is shown; a file larger than is fetched to be shown (2 MB of
  text, 40 MB of an image, 100 MB of a PDF) is offered to download.
- **Office files as PDF (統一轉 PDF)** — a Word, Excel, PowerPoint, OpenDocument or RTF file, which no
  browser shows, is converted to PDF once, on the server, by the site's runtime (Core keeps the PDF
  as the file's rendition), and the viewer shows that PDF as it shows any other, with 「下載 PDF」
  beside the file's own download. Until it is ready the viewer says 「正在轉換為 PDF…」 and shows it
  by itself once it is, asking Core again (after 2 seconds, then twice as long each time, up to 30)
  while the file is shown. One that could not be converted says why (protected by a password,
  not readable as an Office document, its PDF too large, the conversion failed or took too long, or
  never finished), with the file's download, and 「再試一次」 for whoever may change the document or
  sent the message, which queues it again. A file listed whose PDF is made says so (a PDF tag). Where
  Core keeps no PDF of an Office file (a Core from before, or a kind it does not convert), it is
  shown as its text version (文字版) once Core has one, and otherwise says that no preview is
  available yet, with its download.
- **Download as PDF (下載為 PDF)** — a version's text note, a file's text version, a text or
  Markdown file in the viewer, a submitted text and a conversation with an agent are laid out for
  paper (the title, the course and the date above, the page's number at its foot) and handed to the
  browser's print window, where 「另存為 PDF」 saves them: set in the fonts the page has, Chinese
  among them, with nothing made or sent elsewhere.
- **Files in the chat** — a question to an agent may carry files, for the agent to read: chosen with
  the paperclip, dropped on the chat panel, or an image pasted in the box, up to as many and as
  large as the site takes (ten, 50 MB each, by default), which is checked before anything is sent.
  Each is a chip that uploads at once, with its progress, to remove or try again, and nothing is
  sent until they are all up; files need a line to go with them, which the box asks for. Each
  message lists its files with an icon by type, name and size, to open in the file viewer or
  download, and small images as thumbnails; a withdrawn message's files are hidden with its text.
- **What an answer relied on (依據)** — under an agent's answer, a quiet line names the course
  materials it relied on, where the agent said (AIShie-Core#69): 「依據：《第二週》· 第 3 頁」, or for
  several the first and how many (「依據：《第二週》· 3 項」), which opens to list them. Each is shown
  as the reader may open it now: one they may open opens the version the answer read (its file in
  the viewer, at the page or slide named), one read in a version since replaced leads to the
  material as it is now and says the answer read an earlier version, and one they may not open (a
  rubric, to a student) is "a course material you cannot open", with no title and no link. An
  answer that said it relied on none shows 「未引用課程教材」; one that did not say (every answer
  from before, and an agent that does not say) shows nothing. A proposed answer under *Approvals*
  says how many it names.
- **Text versions (文字版)** — each file of a version of material, instructions or a rubric has a
  text version, read on a tab of its own (a version of several files picks the file there, each
  saying where its text stands): the file transcribed into Markdown once by the school's
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
- **Agents and how they run** — a person makes agents of their own under *My agents*, choosing once
  how each runs, with nothing chosen for them, and for good: **hosted on AIshie**, which the school's
  agent runtime runs and members of its courses ask on the site; or **MCP access**, which the owner's
  own tools (Claude Desktop, an editor, a script) use over MCP with tokens the owner issues and
  revokes on its page, beside Core's MCP endpoint, the header and Claude Desktop's configuration, and
  which nobody asks on the site. An agent hosted on AIshie is hosted by its id (the agent, then its
  model and key, or the school's plan): the runtime alone is issued its one token, by Core, and its
  owner never sees, pastes or issues one. On the school's plan its page shows how much of the day's
  allowance its owner has used and when it starts again, on the reader's own clock with their time
  zone named (the exact time in UTC on hover). Wherever an agent is shown in detail (its page, member
  lists, the agents one may ask) it says how it runs, and one hosted on AIshie whether it can be
  asked now (「可在站內提問」 or 「未在執行」); the chat offers only the agents that can be, and says
  why one cannot.
- **Administration** (root and admins) — terms, departments, permission presets, courses and their
  first instructor; a directory of everyone registered, searchable by name, email, student or staff
  number or ID, with how each signs in; registering people and agents, an agent with how it runs
  and the person who owns it, both fixed then and never changed, and correcting their name, email
  and number;
  invitation links, with which a person chooses their password (their first, or a new one when it is
  forgotten); single sign-on identities, linked at a provider chosen from those set up and by the
  claim it knows accounts by; and API tokens for agents with MCP access, which only they are given.
- **Sign-in** (root and admins, under *登入方式*) — single sign-on's identity providers: the one the
  server's operator sets in Core's environment, shown read-only with its status, and the site's,
  added, tested against the issuer's discovery document and keys (endpoints, keys, problems and
  warnings), switched on and off, changed and deleted, each over the version read. The redirect URI to
  register comes first, with a copy button and short help for AD FS, Entra ID, Google Workspace and
  Keycloak; the client secret is write-only, never shown again but as its last four characters; a new
  provider is added switched off; linking existing accounts by verified email is off unless turned on,
  and says the rules it holds to; deleting one says how many accounts would lose single sign-on.
  Without `SECRETS_KEY` on Core's server nothing is added, and the page says so. A Core that holds the
  site's providers to public addresses refuses an issuer on this machine or a private network, or
  reports one that resolves there, unless its operator sets `SSO_ALLOW_PRIVATE_ISSUERS`; the form and
  the test say so in the reader's language. The sign-in page shows a button for each provider offered.
- **Exporting conversations for audit** (root, admins and a department's administrators, under
  *匯出對話*) — the conversations of a course, of a department and those beneath it, or (root and
  admins alone) of the whole site; of one participant if chosen, the person who asked or the agent
  that answered; over a span of days on the reader's calendar, up to and including the last. An
  export is two files: JSON Lines, the conversations, each with its messages (withdrawn ones with
  their text, marked) and the answers and questions proposed and never posted; and CSV, a message to
  a row, with a byte order mark so that a spreadsheet reads Chinese. A department's administrator is
  offered only the courses and departments beneath their appointments, and finds a person by their
  whole email or number. An export can take minutes and goes on while the page is left; one that got
  no answer is sent again under the same idempotency key, after a reload too, so that it is never
  made twice. The page shows what it holds, says that the files hold personal data, that each link
  works for about 15 minutes and when the files are deleted, and downloads each file from its link
  or a new one; Core's refusals (too large, with how much and the limits; a course or department not
  theirs) are said in the reader's words. This browser remembers each administrator's exports,
  without their links, until their files are deleted, to download again. Every export is recorded
  in Core, and a conversation's note of who can read it says that administrators may export it.
- **The agent runtime's settings** (its administrators, under *AI and documents*) — the school's AI
  plan: the models the school provides and pays for, the operator's (runtime.yaml) shown read-only
  and the site's added, edited, turned off and deleted, each with the school's key, which is tried
  with the provider before it is kept and never shown again, and each saying first what becomes of
  the agents on it; the plan's daily quotas, in answers and dollars, and today's use of it, with
  when the counts start again in the reader's own time; the whole school's ceiling counts everything
  on the school's key (the plan's agents, the operator's on the school's key and, in dollars,
  transcription), nothing on anyone's own key, and today's cost, which leaves transcription out,
  says so beside it.
  Pricing: the price table (the operator's price file, read-only, and the site's prices before it,
  from a day on), each person's daily quota on the school's key, hosted agents' daily budgets, and
  what things cost, by day, person, agent, model or key, a document's transcription as a line of its
  own. Documents: the reading of scanned ones (OCR), on or off and in which of the server's
  languages; and their transcription into text versions, on or off, with which model of the plan,
  up to how many pages a document and a day, how many at once, what it is doing and did today, the
  files it took up (each named as its version names it) and how each ended, and its credential
  with Core, issued and handed to the runtime by one button (never shown) and revoked by another.
  Agent hosting: the runtime's own credential for Core (the `agent_runtime` service), which setting
  up the server makes and `aishie runtime-credential` on the server rotates, listed, issued (shown
  once) and revoked. Where the server has no runtime, or one from before these settings, the page
  says so.
- **Account** — the ways into one's account (password, single sign-on, invitations and the browser
  sessions they began), each revocable, and the password; and the page an invitation link opens
  (`/welcome`), where the person chooses a password and is signed in. The link carries its token
  in the fragment (`#token=…`), which reaches no server log. People have no API tokens: an agent with
  MCP access is given its tokens by its owner under *My agents*, or by an administrator; one hosted
  on AIshie, by Core to the runtime alone.
- **Three languages** — Traditional Chinese (繁體中文), written for readers in Hong Kong and Taiwan;
  Simplified Chinese (简体中文), written in the Mainland's own wording (保存, 创建, 智能体, where the
  Traditional has 儲存, 建立, 代理), not a character conversion of the Traditional; and English. A
  first visit is in the language the browser asks for: Chinese in the script its tag names
  (`zh-Hant`, `zh-Hans`), or else in its region's — Traditional for Taiwan, Hong Kong and Macao,
  Simplified for any other region and for a bare `zh` — and English for any other language. The
  account menu's *Language* submenu changes it, as does the language select on the pages before one
  is in (sign-in, an invitation's `/welcome`, an invite link's `/join/<token>`, changing a password);
  this browser remembers the choice, which is not kept with the account. Dates, numbers, the names of
  time zones, Element Plus's own words and the typefaces (IBM Plex Sans and Source Serif 4 for
  English; Noto Sans and Noto Serif, TC or SC, for Chinese) follow the language. A refusal the app
  has words for (by its reason) is said in the page's language; any other error shows Core's own
  message, which is in English, mostly after a few words of the page's language saying what kind
  of error it is.

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
an invitation; each agent is registered with MCP access and given an API token.

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
(`GET /v1/auth/methods`) as it loads, and shows a single sign-on button for each identity provider
Core offers (`sso_providers`: the operator's, its `OIDC_ISSUER`, and those set up on *登入方式*), in
Core's order, each with the provider's name when Core gives one and *single sign-on* when it does not;
from a Core from before several providers, the one button its `sso` names, as before. Nothing here is
set for it.

Built into the app at build time (see `.env.example`):

| Variable | Meaning |
|---|---|
| `VITE_API_BASE` | Where Core is, when it is not this origin. Leave empty for a same-origin deployment (recommended). |
| `VITE_SSO_ENABLED` | Only for a Core without `GET /v1/auth/methods` (it answers 404), or when Core cannot be asked: `true` shows the single sign-on button; Core must have `OIDC_ISSUER` set. |
| `VITE_SSO_LABEL` | The button's provider name then, e.g. `School NetID`. |

The published image is built with none of them set: Core on the page's own origin, and single
sign-on as Core says, or none from a Core too old to say
([docs/deploying.md](docs/deploying.md#the-image)).

Hosting agents on the school's agent runtime is the server's to say too. The app asks the runtime's
public `GET /runtime/api/v1/info` once per page load, and offers hosting only when it answers with
the runtime's audience, issuer and version, and says it hosts agents by their id
(`features.host_by_id`); a 404, a 502, the app's own page or no answer hides it. Only an agent
created as hosted on AIshie is ever offered to it.
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
([AIShie-Deploy](https://github.com/AIShie-Education/AIShie-Deploy)), whose server pulls it from
GHCR, with no login, as the package is public, and keeps itself up to date:
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

The older way is still here: on a server set up with Core's `deploy/setup-server.sh`,
`deploy/setup-web.sh` serves the files with Caddy, and the Deploy workflow keeps them up to date over
SSH once this repository has the server's settings ([docs/deploying.md](docs/deploying.md#over-ssh));
until then a deploy says which build is ready and does nothing. The site block it writes, whose
rules the image's `Caddyfile` has too:

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
  while it is `main`'s tip, by [Publish](.github/workflows/publish.yml), which edge servers
  (test.aishie.app) pull within five minutes. [Deploy](.github/workflows/deploy.yml) hands the build
  CI checked to a server of the older way, over SSH, once this repository has its settings: nothing
  is built again.
- **A version tag** (`v1.2.3`) runs CI again, publishes its image as `:1.2.3` and `:1.2` (and
  `:latest` and `:stable`, when it is the highest stable release), and that build on the release
  page. **Stable**, schools' sites, takes a release when its operator names it in the server's
  settings (AIShie-Deploy's README, Upgrading stable); a server of the older way, when somebody runs
  Deploy by hand from the release's tag, environment `stable`
  ([CONTRIBUTING.md](CONTRIBUTING.md#releasing)).
- **Rolling back**, on the stack, is pinning the image before (AIShie-Deploy's README, Rolling back).
  Over SSH it is immediate on the server, which keeps the last few releases:
  `sudo -u webdeploy aishie-web-deploy list`, then `… activate <release>`; or run Deploy from the
  newest release's tag with the older tag as the ref ([docs/deploying.md](docs/deploying.md#day-to-day)).

This repository and its image are public, and so is Core's: anyone pulls them, and the end-to-end
tests pull Core's, with no login. The older way needs `deploy/setup-web.sh` on a server once, and the
repository its deploy settings ([CONTRIBUTING.md](CONTRIBUTING.md#one-time-settings)).

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
src/components/           shared pieces: status tags, Markdown, the drop zone (FileDropZone), a version's
                          files (VersionFileList, DocumentFiles), the file viewer (preview/: FileViewer,
                          PdfView with pdf.js), "Download as PDF" (PrintButton), permission editor…
src/utils/                formatting, files' kinds and names (files.ts), a version's files (documentFiles.ts),
                          how a file is previewed (preview.ts), an Office file's PDF (rendition.ts),
                          the print layout (printLayout.ts)…
src/layouts/              the app frame, and the course frame with its sections
src/views/                one directory per area
src/i18n/messages/        one file per namespace and language (en, zh-Hant, zh-Hans)
docs/CONVENTIONS.md       how the views are written
docs/deploying.md         the image and its tags; setting a server up, deploying, rolling back over SSH
```

## License

AIshie Frontend is copyright 2026 XIE Hanming, and source-available under the [Elastic License 2.0](LICENSE) (ELv2), governed by the laws of Hong Kong. You may use, copy, change and redistribute it on the terms in LICENSE, which include that you may not offer it to others as a hosted or managed service.

For clarity: an educational institution that runs its own installation for its own staff and students is not providing the software to third parties as a hosted or managed service.

（補充說明：教育機構自行架設、供其教職員及學生使用，不視為向第三方提供託管服務。）
