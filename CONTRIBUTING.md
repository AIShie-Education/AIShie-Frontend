# Contributing

How views are written is in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). This
is about checking, releasing and deploying.

## Checks

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull
request, on every push to `main` and once a week:

- **checks and build:** the generated API types are what `npm run gen:api`
  makes of `api/catalogue.json`; `npm run typecheck`, `npm run check:i18n`,
  `npm run lint` (the few rules of `eslint.config.js`), `npm test`,
  `npm run build`. The build is kept as the run's artifact
  `web-<commit>`: everything after this uses those files, a deploy ships
  them, and the image, which builds the sources again, must hold them file
  for file.
- **workflows and deploy scripts:** actionlint over the workflows, ShellCheck
  over the scripts, and `deploy/aishie-web-deploy_test.sh`. ShellCheck is
  0.11.0, pinned in `ci.yml` (`brew install shellcheck` gives the same), not
  the runner's 0.9.0, which reports lines 0.11.0 lets pass.
- **npm audit:** advisories of high severity in what the build bundles.
- **end to end, and Core's catalogue:** the Playwright suite against the
  build, served by `vite preview`, and a real Core: the image pinned in
  `.github/core-image`, on a scratch database. The same Core's
  `GET /v1/tools` must be `api/catalogue.json`. A test is tried once more
  when it fails; the report and the traces of what failed, with Core's log,
  are kept as the run's artifact `e2e-<commit>-<attempt>` when the run
  fails, and when it passes with a test that passed only on its retry.
- **the image:** on a pull request, the weekly run and a run by hand, the
  image is built with `docker build` and `scripts/test-image.sh` runs it and
  checks it against the build: the rules it serves by, `/version.json`, its
  user and port, that it serves exactly those files, and the frame header,
  with `FRAME_ANCESTORS` unset and set
  ([docs/deploying.md](docs/deploying.md#the-image)). A push skips it: the
  push's Publish or Release run builds and tests the image it pushes.

A green push to `main` is then published
([`publish.yml`](.github/workflows/publish.yml)): its image is built, tested
the same way, and pushed to `ghcr.io/aishie-education/aishie-frontend` as
`:sha-<commit>`, and `:edge` while the commit is still `main`'s tip. It is
also deployed to edge, the test site, over SSH, as before.

On a laptop, the same, with Node from `.nvmrc`:

```bash
npm ci
npm run gen:api && git diff --exit-code src/api/generated
npm run check && npm run build
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12   # uses the shellcheck on PATH
shellcheck -s sh deploy/aishie-web-deploy deploy/setup-web.sh scripts/pack-dist.sh
shellcheck deploy/aishie-web-deploy_test.sh scripts/ci-core.sh scripts/test-image.sh
deploy/aishie-web-deploy_test.sh
```

and the image, with Docker, against the build `npm run build` made:

```bash
docker build --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse HEAD | cut -c1-7) -t aishie-frontend:dev .
scripts/test-image.sh aishie-frontend:dev dist
```

and the end-to-end tests against a throwaway Core, from its image (Docker; the
image is public, pulled with no login) or from a binary of Core:

```bash
CORE_BIN=../AIShie-Core/bin/aishie-core DATABASE_URL=postgres:///aishie_e2e scripts/ci-core.sh start
. "${TMPDIR:-/tmp}/aishie-ci-core/env"
npm run gen:api -- --from "$E2E_CORE_URL" --check
npx playwright test                         # E2E_PREVIEW=1 to test dist/, as CI does
scripts/ci-core.sh stop
```

`ci-core.sh` creates the database when it is missing, and `stop` drops it.
It gives Core a `SECRETS_KEY` (and the `SIGNING_KEY` it needs) made up for the
run, so that the tests can set up identity providers of the site's; their
provider is a stand-in the tests start themselves (`e2e/stand-in-idp.ts`), on
127.0.0.1, which Core reaches over the host's network.
Root signs in with a password as any person does: the env file's
`E2E_ROOT_TOKEN` is root's signed-in session (12 hours), not an API token, and
`E2E_PASSWORD` is root's password and the one the tests give the people they
register, each through an invitation. People hold no API tokens; only the
tests' agents are given them.

### Tests that hold on a busy machine

A test passes on a loaded laptop or CI runner as it does on an idle one. On
a busy machine what a unit test's time goes to is CPU, mostly Element Plus
rendering in jsdom (up to half a second a test, the first of a file more),
stretched many times over; what keeps the tests within their limits there is
the limits themselves. A new or changed test follows these:

- **The limits are for CPU.** `vite.config.ts` gives a test and a hook 30 s,
  not the 5 s by default, which a busy machine's CPU alone runs past (at a
  load near 130 on 10 cores, a test of 0.4 s took over 10). A file that
  costs more says why and sets its own (`PermEditor.spec.ts`, 60 s).
- **No waiting on the clock.** The wait before a call is sent again (half a
  second, then a second), a poll's, a timer's of the page are passed with fake
  timers (`vi.useFakeTimers`, then `vi.advanceTimersByTimeAsync`), the test
  saying how many calls had gone by then (a component's, at each step); an
  answer that comes through promises is waited for with `flushPromises`. Only a moment's
  wait is real: past Element Plus's 100 ms debounce of a field's error
  (`settle()`). The clock then costs no time, and a busy machine cannot
  stretch it.
- **No bound on the wall clock.** What is bounded is how the work grows (the
  CPU time of n and 4n, as `src/utils/markdown.spec.ts` does), or what is
  made, never how long it took. `vi.waitFor` gives up after a second: one
  that waits for a render is given longer (`rendered`, 20 s).
- **A component rendered once a test.** A component rendered again, for
  another language or another administrator, is another test (`it.each`):
  less work a test, and a failure that names the case. Older tests that
  render more than once are split when they are changed.
- **End to end,** a test walks a few pages, not every one: the walk over the
  signed-in pages in `e2e/chat-panel.spec.ts` is three tests.
- **A message that closes itself is checked from what the page kept.** A
  success message (`ElMessage`, by default) is gone 3 s after it comes (some,
  such as single sign-on's, 6 s), and a busy machine can hold a test up that
  long between the click and a check of the screen, which then never sees
  it. `keepToasts(page)`, before the page is opened, has the page keep each
  message as it comes, and `expectToasted(page, text)` checks the kept one,
  however late, by its whole text or a RegExp; the end-to-end tests check
  every success or information message this way, and
  `expectNothingElseToasted(page)` checks that no other message came. A
  refusal is checked on the screen: one Core recorded comes as a
  notification (`ElNotification`, 8 s), which is not kept.

## The Core the tests run against

`.github/core-image` pins one image of Core, by digest, with its commit in the
tag. It changes by hand, with the catalogue it brings, in one pull request:

1. Take the new image from Core's CI run (its `publish / image` job) or the
   package's page: `ghcr.io/aishie-education/aishie-core:sha-<commit>`, and its
   digest (`docker buildx imagetools inspect <image>`).
2. Start that Core: `CORE_IMAGE=<image>:sha-<commit>@sha256:<digest>` for
   `scripts/ci-core.sh start`, or `CORE_BIN` with a binary built from that
   commit.
3. `npm run gen:api -- --from http://127.0.0.1:8080` rewrites
   `api/catalogue.json` and `src/api/generated/tools.ts`; `npm run typecheck`
   shows what has to follow.
4. Write the new line into `.github/core-image`, run the end-to-end tests, and
   push it all together.

Edge's Core should be at that version or later before the front end that
needs it is deployed there.

## Releasing

A push to `main` goes out by itself once CI passes: its image to GHCR as
`:sha-<commit>` and `:edge`, which edge servers pull within five minutes
([AIShie-Deploy](https://github.com/AIShie-Education/AIShie-Deploy)). A
release is made by a tag, from `main`:

```
git switch main && git pull
git tag -s v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

[`release.yml`](.github/workflows/release.yml) checks that the tag is on
`main`, runs all of CI again on the tagged commit, and publishes the build it
checked: first its image, tested, as `ghcr.io/aishie-education/aishie-frontend:0.1.0`
and `:0.1` (and `:latest` and `:stable`, when it is the highest stable release), for
`linux/amd64` and `linux/arm64`; then the release page, with
`aishie-web-v0.1.0.tar.gz` and its `.sha256`. The notes list what is new
since the release before (for a stable release, since the last stable one),
name the image, and say which Core the build was checked against: deploy it
beside that version of Core or a later one. A tag with a hyphen
(`v0.1.0-rc.1`) is a pre-release: its image is `:0.1.0-rc.1` alone.

A stable release goes to a school's site when its operator names its image in
the server's `/etc/aishie/aishie.env` (AIShie-Deploy's README, Upgrading
stable), beside the Core the notes name or a later one, and goes back by
pinning the image before (its README, Rolling back). To a server of the older
way ([docs/deploying.md](docs/deploying.md#over-ssh)) somebody runs **Deploy**
for it instead: Actions → Deploy → Run workflow, use the workflow from the
release's tag, and give the environment `stable`. Deploy ships that release's own tarball
and says what it is before it goes on. For stable it takes nothing else:
run from a branch or a pre-release's tag, it stops before it deploys. To roll
back, run it from the newest release's tag with the older tag as the ref, or
`activate` the older release on the server, which keeps the last few
([docs/deploying.md](docs/deploying.md#day-to-day)).

### One-time settings

Before the first push to `main` after the CI/CD workflows land, in GitHub:

- **Environments** (repository Settings → Environments): `edge` and
  `stable`, created before the first deploy (a run that names one that
  does not exist creates it, with no rules). The repository is public, so its
  environments take rules on GitHub Free: let `edge` take branch `main` and
  tags `v*`, and `stable` tags `v*` only, and add required reviewers to
  `stable`. A repository set up when they were called `staging` and
  `production` needs `edge` and `stable` made as well, with the same rules
  ([docs/deploying.md](docs/deploying.md#settings-from-before-the-rename)).
- **Packages** (organization Settings → Packages): Default Package Settings
  should keep "Inherit access from source repository". The first publish
  then creates `aishie-frontend` linked to this repository, which its
  workflows can write to. The package must be public (its settings → Danger
  Zone → Change visibility → Public): the compose stack's server pulls it
  with no login. Do not push the image by hand before the first publish: a
  package pushed from outside a workflow is not linked, and the workflow
  cannot push to it until it is given access (package settings, Manage
  Actions access).
- **Allowed actions** (organization Settings → Actions → General →
  Policies): if the organization allows only selected actions, allow
  `docker/*` with `actions/*`. Pull requests' CI uses only `actions/*`, so a
  policy that leaves `docker/*` out first shows at the first publish.
- **Variables and secrets**, when they apply. A release's image is attested
  with no setting, the repository being public (a private one would need
  GitHub Enterprise Cloud and `ATTESTATIONS` = `true`). For each environment
  with a server of the older way: the repository variables `DEPLOY_WEB_TARGET_EDGE` and
  `DEPLOY_WEB_KNOWN_HOSTS_EDGE`, and the repository secret
  `DEPLOY_WEB_SSH_KEY_EDGE` (`_STABLE` for stable), which
  `deploy/setup-web.sh` prints ([docs/deploying.md](docs/deploying.md)).
- **Minutes and storage**: the repository is public, so its Actions minutes
  on GitHub's standard runners cost nothing, and neither does a public
  package's storage. A run of CI takes about ten minutes, most of them the
  end-to-end job; a push to `main` adds a few, to build, test and push its
  two-architecture image. Every green push leaves a
  `:sha-*` image, with its SBOM and provenance. Nothing deletes old images
  automatically, since deleting untagged versions can break a
  multi-architecture image; prune them from the package page when needed.
