# Contributing

How views are written is in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). This
is about checking, releasing and deploying.

## Checks

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull
request, on every push to `main` and once a week:

- **checks and build:** the generated API types are what `npm run gen:api`
  makes of `api/catalogue.json`; `npm run typecheck`, `npm run check:i18n`,
  `npm test`, `npm run build`. The build is kept as the run's artifact
  `web-<commit>`: everything after this uses those files, and a deploy ships
  them.
- **workflows and deploy scripts:** actionlint over the workflows, ShellCheck
  over the scripts, and `deploy/aishiteru-web-deploy_test.sh`. ShellCheck is
  0.11.0, pinned in `ci.yml` (`brew install shellcheck` gives the same), not
  the runner's 0.9.0, which reports lines 0.11.0 lets pass.
- **npm audit:** advisories of high severity in what the build bundles.
- **end to end, and Core's catalogue:** the Playwright suite against the
  build, served by `vite preview`, and a real Core: the image pinned in
  `.github/core-image`, on a scratch database. The same Core's
  `GET /v1/tools` must be `api/catalogue.json`.

On a laptop, the same, with Node from `.nvmrc`:

```bash
npm ci
npm run gen:api && git diff --exit-code src/api/generated
npm run check && npm run build
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12   # uses the shellcheck on PATH
shellcheck -s sh deploy/aishiteru-web-deploy deploy/setup-web.sh scripts/pack-dist.sh
shellcheck deploy/aishiteru-web-deploy_test.sh scripts/ci-core.sh
deploy/aishiteru-web-deploy_test.sh
```

and the end-to-end tests against a throwaway Core, from its image (Docker, and
`docker login ghcr.io` with a token that can read the package) or from a
binary of Core:

```bash
CORE_BIN=../AIShiteru-Core/bin/aishiterud DATABASE_URL=postgres:///aishiteru_e2e scripts/ci-core.sh start
. "${TMPDIR:-/tmp}/aishiteru-ci-core/env"
npm run gen:api -- --from "$E2E_CORE_URL" --check
npx playwright test                         # E2E_PREVIEW=1 to test dist/, as CI does
scripts/ci-core.sh stop
```

`ci-core.sh` creates the database when it is missing, and `stop` drops it.

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

Staging's Core should be at that version or later before the front end that
needs it is deployed there.

## Releasing

A push to `main` goes to staging by itself once CI passes. A release is made
by a tag, from `main`:

```
git switch main && git pull
git tag -s v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

[`release.yml`](.github/workflows/release.yml) checks that the tag is on
`main`, runs all of CI again on the tagged commit, and publishes the build it
checked on the release page: `aishiteru-web-v0.1.0.tar.gz` and its `.sha256`.
The notes list what is new since the release before (for a stable release,
since the last stable one) and say which Core the build was checked against:
deploy it beside that version of Core or a later one. A tag with a hyphen
(`v0.1.0-rc.1`) is a pre-release, and is deployed to staging.

A stable release goes to production when somebody runs **Deploy** for it:
Actions → Deploy → Run workflow, use the workflow from the release's tag, and
give the environment `production`. Deploy ships that release's own tarball
and says what it is before it goes on. For production it takes nothing else:
run from a branch or a pre-release's tag, it stops before it deploys. To roll
back, run it from the newest release's tag with the older tag as the ref, or
`activate` the older release on the server, which keeps the last few
([docs/deploying.md](docs/deploying.md#day-to-day)).

### One-time settings

Before the first push to `main` after the CI/CD workflows land, in GitHub:

- **Core's image** (organization Settings → Packages, or the package's own
  page, github.com/orgs/AIShie-Education/packages/container/aishie-core/settings):
  Manage Actions access → Add Repository → `AIShiteru-Frontend`, role Read.
  The image is private, and without this the end-to-end job cannot pull it and
  says so. An owner of the organization, or an admin of the package, does it
  once.
- **Environments** (repository Settings → Environments): `staging` and
  `production`, created before the first deploy (a run that names one that
  does not exist creates it). On GitHub Free a private repository's
  environments take no rules, neither reviewers nor branch and tag limits:
  they record the deployments, and Deploy's own checks keep production to
  stable releases. On a plan that has the rules, let `staging` take branch
  `main` and tags `v*`, and `production` tags `v*` only.
- **Allowed actions** (organization Settings → Actions → General →
  Policies): the workflows use `actions/*` only.
- **Variables and secrets**, for each environment with a server: the
  repository variables `DEPLOY_WEB_TARGET_STAGING` and
  `DEPLOY_WEB_KNOWN_HOSTS_STAGING`, and the repository secret
  `DEPLOY_WEB_SSH_KEY_STAGING` (`_PRODUCTION` for production), which
  `deploy/setup-web.sh` prints ([docs/deploying.md](docs/deploying.md)).
- **Minutes**: on GitHub Free a private repository has 2,000 Actions minutes a
  month, shared with Core's. A run of CI takes about ten, most of them the
  end-to-end job.
