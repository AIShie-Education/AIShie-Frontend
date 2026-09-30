# Contributing

How views are written is in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). This
is about checking, releasing and deploying.

## Checks

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull
request, on every push to `main` and once a week:

- **checks and build:** the generated API types are what `npm run gen:api`
  makes of `api/catalogue.json`; `npm run typecheck`, `npm run check:i18n`,
  `npm test`, `npm run build`. The build is kept as the run's artifact
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
  `GET /v1/tools` must be `api/catalogue.json`.
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

and the end-to-end tests against a throwaway Core, from its image (Docker, and
`docker login ghcr.io` with a token that can read the package) or from a
binary of Core:

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
`:sha-<commit>` and `:edge`, and its build to edge. A release is made by a
tag, from `main`:

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
(`v0.1.0-rc.1`) is a pre-release: its image is `:0.1.0-rc.1` alone, and it is
deployed to edge.

A stable release goes to stable when somebody runs **Deploy** for it:
Actions → Deploy → Run workflow, use the workflow from the release's tag, and
give the environment `stable`. Deploy ships that release's own tarball
and says what it is before it goes on. For stable it takes nothing else:
run from a branch or a pre-release's tag, it stops before it deploys. To roll
back, run it from the newest release's tag with the older tag as the ref, or
`activate` the older release on the server, which keeps the last few
([docs/deploying.md](docs/deploying.md#day-to-day)).

### One-time settings

Before the first push to `main` after the CI/CD workflows land, in GitHub:

- **Core's image** (organization Settings → Packages, or the package's own
  page, github.com/orgs/AIShie-Education/packages/container/aishie-core/settings):
  Manage Actions access → Add Repository → `AIShie-Frontend`, role Read.
  The image is private, and without this the end-to-end job cannot pull it and
  says so. An owner of the organization, or an admin of the package, does it
  once.
- **Environments** (repository Settings → Environments): `edge` and
  `stable`, created before the first deploy (a run that names one that
  does not exist creates it, with no rules). On GitHub Free a private
  repository's environments take no rules, neither reviewers nor branch and
  tag limits: they record the deployments, and Deploy's own checks keep the
  environment `stable` to stable releases. On a plan that has the rules, let
  `edge` take branch `main` and tags `v*`, and `stable` tags `v*` only. A
  repository set up when they were called `staging` and `production` needs
  `edge` and `stable` made as well, with the same rules
  ([README.md](README.md#renaming-the-settings)).
- **Packages** (organization Settings → Packages): Package Creation must
  allow Private, and Default Package Settings should keep "Inherit access
  from source repository". The first publish then creates
  `aishie-frontend` private, linked to this repository, which its workflows
  can write to. Do not push the image by hand before that: a package pushed
  from outside a workflow is not linked, and the workflow cannot push to it
  until it is given access (package settings, Manage Actions access). The
  compose stack's server pulls it with a token that can read it.
- **Allowed actions** (organization Settings → Actions → General →
  Policies): if the organization allows only selected actions, allow
  `docker/*` with `actions/*`. Pull requests' CI uses only `actions/*`, so a
  policy that leaves `docker/*` out first shows at the first publish.
- **Variables and secrets**, when they apply: `ATTESTATIONS` = `true` where
  artifact attestations are available (a public repository, or GitHub
  Enterprise Cloud), for a release's image. For each environment with a
  server: the repository variables `DEPLOY_WEB_TARGET_EDGE` and
  `DEPLOY_WEB_KNOWN_HOSTS_EDGE`, and the repository secret
  `DEPLOY_WEB_SSH_KEY_EDGE` (`_STABLE` for stable), which
  `deploy/setup-web.sh` prints ([docs/deploying.md](docs/deploying.md)).
- **Minutes and storage**: on GitHub Free a private repository has 2,000
  Actions minutes a month, shared with Core's. A run of CI takes about ten,
  most of them the end-to-end job; a push to `main` adds a few, to build,
  test and push its two-architecture image. Every green push leaves a
  `:sha-*` image, with its SBOM and provenance. Nothing deletes old images
  automatically, since deleting untagged versions can break a
  multi-architecture image; prune them from the package page when needed.
