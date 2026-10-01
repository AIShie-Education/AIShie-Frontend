# Deploying the web front end

The front end is a directory of static files, and it is served from the same
origin as AIshie Core: Core's session cookie is `SameSite=Lax`, and its
guard refuses writes from other origins. One proxy in front of both sends
`/v1/*`, `/mcp`, `/mcp/*` and `/healthz` to Core, and everything else to the
front end's files, falling back to `index.html` for the app's own routes.

The whole system runs as one docker compose stack, from
[AIShie-Deploy](https://github.com/AIShie-Education/AIShie-Deploy): its
server pulls the images of Core, the agent runtime and this front end from
GHCR, and its Caddy terminates TLS in front of them. That is how the front end
is deployed: as [its image](#the-image), which every green push to `main` and
every release publishes.

The older way is still here: over SSH, as files, to a server of Core's own
([Over SSH](#over-ssh), and the sections after it), which the Deploy workflow
keeps up to date once this repository has the server's settings.

## The agent runtime's API

The pages that host a person's agent on the school's runtime call the
runtime's API, on the same origin, under `/runtime/api/v1`. The stack's Caddy
sends `/runtime/api/*` to the runtime's API listener with the `Cookie` header
removed: the runtime takes a bearer assertion, never Core's session. The
front end asks for one with `POST /v1/auth/assertion`, for the audience the
runtime names, so Core's `RUNTIME_AUDIENCES` must list the runtime's
`API_AUDIENCE` (such as `https://lms.example.edu/runtime`).

Nothing in the front end is set for it. It asks the runtime's public
`GET /runtime/api/v1/info` once per page load, and offers hosting only when
the answer is the runtime's (its audience, issuer and version). A 404, the
stack's 502 while the runtime serves no API, `index.html` from a proxy that
does not route the path, or no answer, hides it. So the same image serves a
server with a runtime and one without, and the SSH set-up below, whose site
block has no route for the path, shows no hosting.

## The image

`ghcr.io/aishie-education/aishie-frontend`, for `linux/amd64` and
`linux/arm64`: the production build (`npm run build`) served by Caddy, as the
[`Dockerfile`](../Dockerfile) and [`Caddyfile`](../Caddyfile) make it. The
package is public, as Core's is: the first publish creates it, linked to this
repository, and a server pulls it with no login.

### Tags

| Tag | What it is |
| --- | --- |
| `:sha-<commit>` | A push to `main` whose checks passed (checks and build, scripts, end to end) and whose image passed its test; `<commit>` is the commit's first 7 hex digits. It never moves. |
| `:edge` | The newest of those: moved to each one that is still `main`'s tip when it is published, so it never goes backwards. |
| `:X.Y.Z` and `:X.Y` | A release, tag `vX.Y.Z`; `:X.Y` moves to each release of that line. |
| `:latest` and `:stable` | The highest stable release. A release on an older line leaves them alone. |
| `:X.Y.Z-rc.N` | A pre-release, tag `vX.Y.Z-rc.N`: that tag only, neither `:X.Y` nor `:latest` nor `:stable`. |

Every image carries the labels `org.opencontainers.image.source`
(`https://github.com/AIShie-Education/AIShie-Frontend`),
`org.opencontainers.image.revision` (the whole commit) and
`org.opencontainers.image.version` (the version, below), and its build's
provenance and SBOM. A release's image also has an artifact attestation where
GitHub has them (`ATTESTATIONS`, [CONTRIBUTING.md](../CONTRIBUTING.md#one-time-settings)).

### What it does

- It listens on **port 8080**, plain HTTP/1.1. TLS, HSTS and the routes to
  Core are the stack's Caddy's: whatever reaches this server is taken for the
  front end's, so `/v1/*`, `/mcp`, `/mcp/*` and `/healthz` must be routed to
  Core before they get here (here they would get `index.html`).
- It runs as **uid 65532** (not root), writes nothing and needs no
  capability: `read_only: true`, `cap_drop: [ALL]` and
  `security_opt: [no-new-privileges:true]` all suit it. It takes no volume
  or command, and one setting from the environment, `FRAME_ANCESTORS`
  ([Frames](#frames)).
- `/assets/*` are the hashed files: one that is there comes with
  `Cache-Control: public, max-age=31536000, immutable`; one that is not is a
  plain 404, with an empty body and no `Cache-Control`, not the app.
- Everything else comes with `Cache-Control: no-cache`: a file of the build if
  there is one, and otherwise `index.html`, with 200, for the app's own
  routes.
- Answers are compressed with zstd or gzip when the browser asks. Every
  answer, a 404 too, carries `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: frame-ancestors 'self'`, or the sources
  `FRAME_ANCESTORS` lists in place of `'self'` ([Frames](#frames)). That
  header says nothing else: `index.html` has a policy of its own, for
  images. There is no `X-Frame-Options`.
- `GET /version.json` answers `{"version":"<version>","commit":"<commit>"}`,
  `no-cache`: `<commit>` is the first 7 hex digits of the image's commit, as
  in its `:sha-` tag, and `<version>` its version label: `git describe --tags --always` of the commit
  for a push to `main` (`v1.2.3-4-gabc1234`, or the commit before the first
  tag), the tag for a release (`v1.2.3`). It is written when the image is
  built, from its build arguments, not from the app. It is the stack's health
  check. The image declares it as its own (`HEALTHCHECK`: every 30 seconds,
  every second while it starts), and has `wget` for a compose `healthcheck`
  of the stack's own:
  `["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/version.json"]`.
- It holds the build, `version.json`, Caddy and its configuration, on Alpine:
  no sources, no `node_modules`, no `.env`.

The build is the same for every server: Core on the page's own origin
(`VITE_API_BASE` and `VITE_CORE_PUBLIC_URL` empty). What is not the same is
not built in, but asked for when the page loads, or set when the container
starts:

- **Single sign-on** is Core's to say. The sign-in page asks
  `GET /v1/auth/methods` as it loads, and shows a single sign-on button for
  each identity provider Core offers: the operator's (its `OIDC_ISSUER`),
  named as Core's `OIDC_DISPLAY_NAME` names it, or *single sign-on* when that
  is not set, and those root and the platform's administrators set up on
  *登入方式* (which needs Core's `SECRETS_KEY`). The rest of the page does not
  wait for the answer. A Core from before
  that route answers 404, and then the build's own settings are taken, as
  they are when Core cannot be asked: in the image `VITE_SSO_ENABLED` is
  unset, so there is no button.
- **Which sites may show the app in a frame** is the container's
  `FRAME_ANCESTORS` ([Frames](#frames)).

In the stack, the Caddy in front sends Core its routes and this image the
rest, for instance:

```caddyfile
lms.example.edu {
	@core path /v1/* /mcp /mcp/* /healthz
	handle @core {
		reverse_proxy core:8080
	}
	handle {
		reverse_proxy web:8080
	}
}
```

### Frames

Framing goes two ways, and the image allows both:

- **The app showing another site in a frame**, a similarity checker's
  viewer (Turnitin's, say), is governed by the page's own policy
  (`frame-src`), and nothing limits it: `index.html`'s policy sets only
  `img-src`, and the image's header only `frame-ancestors`. Keep it so for
  such a viewer to work.
- **Another site showing the app in a frame**, an LMS that opens it in an
  iframe (an LTI launch, say), is `frame-ancestors`, which only a header can
  set: a `<meta>` policy leaves it out. Unless told otherwise, only the app's
  own origin may frame it: `Content-Security-Policy: frame-ancestors 'self'`.
  The container's `FRAME_ANCESTORS` puts its own sources in place of
  `'self'`, separated by spaces and written as CSP writes them, quotes
  included (the value is what is inside the double quotes, as a shell or a
  compose `.env` file takes it):

  ```bash
  FRAME_ANCESTORS="'self' https://canvas.example.edu"   # the app, and that LMS
  FRAME_ANCESTORS="'none'"                              # no page at all, not even the app's own
  ```

  Caddy puts the value into its configuration as it reads it, when the
  container starts. A value it cannot read (one on more than one line) stops
  the container from starting, and so the stack's updater rolls the update
  back. Anything on one line goes into the header as it is, to be read by the
  browser, which ignores a source it does not understand. Set but empty, it
  lists no source, which lets no page frame the app, as `'none'` does: for
  the default, leave it unset. There is no `X-Frame-Options`:
  `frame-ancestors` supersedes it, and it cannot name another site.

  An LMS on another site framing the app makes Core's session cookie a
  third-party one. The browser sends it only when it is `SameSite=None`, so
  Core needs `COOKIE_SAMESITE=none` as well, or a sign-in in the frame does
  not hold: the next call finds nobody signed in. The browser must also
  accept third-party cookies, which Safari, and every browser on iOS, does
  not, and which people can turn off in others; there the app works only in
  a tab of its own. That is Core's setting, not the image's
  ([Core's docs/deploying.md](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/deploying.md)).
  Single sign-on in a frame takes the frame to the identity provider's page,
  which most providers do not let be framed.

### How an image is made

The Dockerfile builds the app with `npm ci` and `npm run build` in Node
(`.nvmrc`'s), once, on the machine's own architecture, and puts the files
into each architecture's image; nothing is emulated. The build takes nothing
from the environment: `.dockerignore` keeps `.env` out, and no `VITE_`
variable is set, so it is the same build CI makes and checks.

Before any image is pushed, `scripts/test-image.sh` runs it read-only with no
capabilities, as the stack may, and checks it with curl: every rule above,
`version.json`, the user and the port, the health check, and that it serves
exactly the build CI checked, file for file. It runs it again with
`FRAME_ANCESTORS` set, for the header that sets, and once with a value on two
lines, which must stop it from starting. On a pull request CI builds the
image and runs the test; on `main`, `publish.yml` builds it, tests it, pushes
it, and checks that the image pushed has the layers of the one tested;
`release.yml` does the same for a version tag. To do it here:

```bash
npm ci && npm run build
docker build --build-arg VERSION=$(git describe --tags --always) \
  --build-arg COMMIT=$(git rev-parse HEAD | cut -c1-7) -t aishie-frontend:dev .
scripts/test-image.sh aishie-frontend:dev dist
docker run --rm -p 8080:8080 aishie-frontend:dev    # http://localhost:8080
```

The test says which rule an image breaks. If it says `/srv` is not the
build, the image's `npm run build` made other files than the one it is
compared with: other sources or another `package-lock.json`, most likely.

## Over SSH

The server Core runs on, one per environment, set up with Core's
`deploy/setup-server.sh`
([Core's docs/deploying.md](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/deploying.md)),
serves the files itself. Caddy, which already serves HTTPS there, sends
`/v1/*`, `/mcp`, `/mcp/*` and `/healthz` to Core on `127.0.0.1:8080`, and
everything else to the files in `/srv/aishie-web/current`. It is the older
way, and works as it did once this repository has the server's settings.

The scripts in [`deploy/`](../deploy) do the work:

- `setup-web.sh` sets a server up for the front end, once. Run again, it
  installs a newer copy of the other script and leaves everything else as it
  is.
- `aishie-web-deploy` puts a build on the server, or goes back to one it
  keeps. The Deploy workflow runs it; so can you.

## How a build gets there

A build is made once, and what is deployed is what was checked:

1. On every push to `main`, CI checks the commit, builds it, runs the
   end-to-end tests on those very files (against the Core pinned in
   `.github/core-image`), and hands them to the Deploy workflow for
   `edge`, the test site.
2. A version tag runs all of CI again on the tagged commit and publishes that
   build on the release page, as `aishie-web-vX.Y.Z.tar.gz`
   ([CONTRIBUTING.md](../CONTRIBUTING.md#releasing)). A pre-release
   (`v1.2.3-rc.1`) is then deployed to `edge` too.
3. `stable`, the schools' sites, gets a release's tarball, and only when
   somebody runs Deploy for it by hand, from the release's tag.

The Deploy workflow packs the build, connects to the server with SSH as the
user `webdeploy`, whose key can do nothing but run `aishie-web-deploy`, and
sends the tarball on its standard input, named by a release ID: the release's
tag for a release's build, the short commit otherwise. The script checks the
archive before it unpacks anything, unpacks it beside the releases it keeps,
and switches `current` to it in one rename: a request gets the old build or
the new one, never a mix. The workflow then asks the site over HTTPS whether
it serves the new `index.html`, and whether `/healthz` still reaches Core.

## Setting a server up

The server runs Core already. As root:

1. Copy `deploy/` to the server, and run the set-up with the server's name
   and its environment:

   ```
   scp -r deploy you@test.aishie.app:web-deploy
   ssh you@test.aishie.app
   sudo -i
   sh ~you/web-deploy/setup-web.sh test.aishie.app edge
   ```

   It creates the user `webdeploy`, with no password, and
   `/srv/aishie-web`, which `webdeploy` owns and everyone can read. It
   installs `aishie-web-deploy` in `/usr/local/bin`, and serves a
   placeholder page until the first deploy. It gives `webdeploy` an SSH key
   whose only command is `aishie-web-deploy`. That line, the `.ssh` it is
   in and `webdeploy`'s home are root's, so `webdeploy` cannot change what
   its key may do; and under `/srv/aishie-web` the script writes as
   `webdeploy`, never as root.

   Then it changes Caddy's site for the name, but only if
   `/etc/caddy/Caddyfile` is exactly what Core's `setup-server.sh` wrote. It
   keeps a copy of the old file, checks the new one with `caddy validate`, and
   restarts Caddy; Core is unreachable for that second. If the file has been
   changed by hand, nothing is changed: the list of what is left, at the end,
   starts with the site block to put in yourself (keep the global block with
   the `admin` line), then `caddy validate --adapter caddyfile --config
   /etc/caddy/Caddyfile && systemctl restart caddy`.

2. Add the settings it prints to GitHub (next section), then delete
   `/root/aishie-web-deploy-key` from the server.

3. Deploy: push to `main`, or run Deploy by hand (Actions → Deploy → Run
   workflow, from `main`, environment `edge`). Until then
   `https://test.aishie.app/` shows the placeholder, and Core answers under
   `/v1`, `/mcp` and `/healthz` as before. While the site block is still to
   be put in by hand (step 1), the site is Core alone: a deploy then puts the
   files in place, but fails its check that the site serves them.

Core needs no new setting: `PUBLIC_URL` is this origin already, and a front end
on the same origin needs no `TRUSTED_ORIGINS`.

## Connecting the Deploy workflow

`setup-web.sh` ends by printing three settings. Add them in this
repository's Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `DEPLOY_WEB_TARGET_EDGE` | `webdeploy@test.aishie.app` |
| Variable | `DEPLOY_WEB_KNOWN_HOSTS_EDGE` | the server's host key line, as printed |
| Secret | `DEPLOY_WEB_SSH_KEY_EDGE` | the whole of `/root/aishie-web-deploy-key` |
| Variable (optional) | `DEPLOY_WEB_URL_EDGE` | the site's origin, when it is not `https://` + the target's host |

For stable, the names end in `_STABLE`. They are the repository's, not the
environment's, as the workflow was written when the repository was private and
GitHub Free gave it no environment variables or secrets. SSH on a port other than 22 is
`ssh://webdeploy@host:2222` in the target and `[host]:2222 ssh-ed25519 …` in
the host key line. Settings added before edge and stable had those names end
in `_STAGING` and `_PRODUCTION`: they are read, with a warning, until a later
release ([below](#settings-from-before-the-rename)).

The host key line is the same one Core's repository has in
`DEPLOY_KNOWN_HOSTS_EDGE`: it is the server's. The key is not the same: the
front end has a user and a key of its own, which can change the site's files
and nothing else, and Core's key cannot touch them.

Until `DEPLOY_WEB_TARGET_EDGE` is set, a deploy says which build is ready
and passes. A secret or host key set without the target fails the run, so
that half a configuration is not taken for none.

The key can only run `aishie-web-deploy`, but that puts any build it is
given on the site, which is Core's origin: whoever can deploy can run
JavaScript as every person who signs in. Anyone with write access to this
repository can run a workflow that reads the secret. The secret is the
repository's, not an environment's, so no environment's rule narrows that down
to a branch or to people. When someone loses write access,
replace the key: on the server, delete `~webdeploy/.ssh/authorized_keys` and
any `/root/aishie-web-deploy-key*` left, run `setup-web.sh` again as in
step 1, and put the new key it prints into the secret.

### Settings from before the rename

The environments were called `staging` and `production`, and are `edge` and `stable` now. Deploy
reads each of its settings by the new name first and, until a later release that removes this, by
the old one, with a warning in the run that names the setting to add; so deploys go on, and
test.aishie.app keeps getting each green push, while the settings are renamed. In this
repository's settings, before merging the rename if you can:

1. **Environments** (Settings → Environments → New environment): make `edge` with the rules
   `staging` has, and `stable` with the rules `production` has: its required reviewers, and
   Deployment branches and tags (`edge`: branch `main` and tags `v*`; `stable`: tags `v*` only).
   **Give `stable` production's protection before its first deploy.** GitHub neither renames
   environments nor carries their rules over: the first run that names `stable` creates it with no
   protection at all, and then nothing but Deploy's own check that it runs from a stable release's
   tag stands between write access to this repository and the schools' sites.
2. **Variables and secrets** (Settings → Secrets and variables → Actions): add each one that is set
   under its new name, with the same value, then delete the old one.

   | Kind | Old name | New name |
   | --- | --- | --- |
   | Variable | `DEPLOY_WEB_TARGET_STAGING` | `DEPLOY_WEB_TARGET_EDGE` |
   | Variable | `DEPLOY_WEB_KNOWN_HOSTS_STAGING` | `DEPLOY_WEB_KNOWN_HOSTS_EDGE` |
   | Variable | `DEPLOY_WEB_URL_STAGING` | `DEPLOY_WEB_URL_EDGE` |
   | Secret | `DEPLOY_WEB_SSH_KEY_STAGING` | `DEPLOY_WEB_SSH_KEY_EDGE` |
   | Variable | `DEPLOY_WEB_TARGET_PRODUCTION` | `DEPLOY_WEB_TARGET_STABLE` |
   | Variable | `DEPLOY_WEB_KNOWN_HOSTS_PRODUCTION` | `DEPLOY_WEB_KNOWN_HOSTS_STABLE` |
   | Variable | `DEPLOY_WEB_URL_PRODUCTION` | `DEPLOY_WEB_URL_STABLE` |
   | Secret | `DEPLOY_WEB_SSH_KEY_PRODUCTION` | `DEPLOY_WEB_SSH_KEY_STABLE` |

   A variable's value can be copied from its page. A secret's cannot be read back: paste the key
   from wherever a copy is kept or, with none, give the server a new key
   ([above](#connecting-the-deploy-workflow), to replace the key),
   which `setup-web.sh` prints under the new name.
3. Once a deploy to each environment runs without a warning, the environments `staging` and
   `production` can be deleted, with the deployments they recorded.

The Deploy form offers `edge` and `stable` alone, as GitHub takes nothing but a choice's options
there; a workflow that calls Deploy with `staging` or `production` has them taken as `edge` and
`stable`, with a warning. Servers need nothing: `deploy/setup-web.sh` takes `edge` or `stable`, or
their old names until the same later release, only to name the settings it prints.

## Day to day

Run these as root on the server.

- **What is served**, and what else is kept, newest first:

  ```
  sudo -u webdeploy aishie-web-deploy list
  ```

  `/srv/aishie-web/deploy.log` lists every deploy and switch, from what to
  what. The Deploy run's summary names the commit, the version and the files.
- **Rolling back** to a release the server keeps (the newest five, and the one
  served before the current one) is immediate:

  ```
  sudo -u webdeploy aishie-web-deploy activate v1.2.2
  ```

  From GitHub instead: run Deploy from the newest release's tag, with
  environment `stable` and ref `v1.2.2`; for edge, from `main` with
  the release ID `list` shows (a commit's first seven characters, or a tag)
  as the ref. That builds the commit again, where `activate` serves the
  files kept.
- **Deploying without GitHub**, a release's tarball, say:

  ```
  sha256sum -c aishie-web-v1.2.3.tar.gz.sha256
  sudo -u webdeploy aishie-web-deploy v1.2.3 < aishie-web-v1.2.3.tar.gz
  ```

- **Updating the script:** when `deploy/` changes, copy it to the server again
  and run `setup-web.sh` as in step 1. It installs the new script and leaves
  the rest.
- **A server set up before the name AIshie** has the script as
  `aishiteru-web-deploy`, its files in `/srv/aishiteru-web`, and `webdeploy`'s
  key held to that command. It deploys as it did: the Deploy workflow names no
  program, the key's forced command does. It takes a newer script as any
  server does, by running `setup-web.sh` again, which installs
  `aishie-web-deploy`, holds the same key to it (the secret in GitHub stays as
  it is), and removes `aishiteru-web-deploy`. The releases stay in
  `/srv/aishiteru-web`, where both scripts look when `/srv/aishie-web` is not
  there, and Caddy's site, which differs from the one `setup-web.sh` writes
  now in its comments alone, is left as it is. Any
  `/root/aishiteru-web-deploy-key` left can go.
- **Caching:** files under `/assets/` have the hash of their contents in
  their names, and are served `immutable` for a year. Everything else,
  `index.html` first, is served `no-cache`: browsers ask each time, and a
  deploy shows at once. A tab left open across a deploy still has the old
  `index.html`, and a page it has not loaded yet is no longer on the server:
  reloading fixes that.
- **Disk:** each release is a few megabytes, and five are kept.

## When something goes wrong

- **The publish job cannot push the image** (`denied`, `permission_denied`).
  The package is not linked to this repository, or does not let its
  workflows write: it was pushed by hand before the first publish, most
  likely. In the package's settings
  (github.com/orgs/AIShie-Education/packages/container/aishie-frontend/settings),
  Manage Actions access → Add Repository → `AIShie-Frontend`, role Write.
- **"… is not the image tested".** The image was pushed, but its `linux/amd64`
  layers are not those of the image the job tested, which the builder's cache
  should have made them: `:edge` was not moved, and a release was not
  published. Run the job again.
- **The e2e job cannot pull Core's image.** It is pulled with no login, so the
  package must be public: an owner of the organization makes it so in the
  package's settings
  (github.com/orgs/AIShie-Education/packages/container/aishie-core/settings)
  → Danger Zone → Change visibility → Public. If the error is not `denied`,
  `unauthorized` or `not found`, GHCR may be having trouble: run the job again.
- **"refused the build".** The archive held something other than plain files
  and directories, a name with a character other than letters, digits and
  `. _ ~ @ + - /`, a path outside itself, no `index.html` at the top, or more
  than the limits (50 MiB as sent, 256 MiB unpacked, as the listing gives each
  file's size, 10,000 entries). Nothing was unpacked, and the site is as it
  was. A build from `npm run build`, packed by `scripts/pack-dist.sh`, is none
  of those; a file added to `public/` may be.
- **"the build did not come whole within 600 seconds".** The upload stalled
  between the runner and the server. Nothing was changed; run the deploy
  again. An upload holds up no other deploy and no `activate` while it comes:
  the lock is taken only once the build is in.
- **"release … is here already, with other files".** The same ID with another
  build: most likely a build of the same commit made again by hand. The one
  kept is left alone; `activate` it, or deploy the new one from a commit of its
  own.
- **"another deploy has held the lock".** Deploys to one server wait for each
  other. If none is running and the message names `.lock.d`, a deploy was
  killed: remove that directory.
- **The site does not serve the new build.** The deploy switched `current`,
  but the site still sends the old `index.html`: Caddy's site block is not
  the one `setup-web.sh` writes, or a proxy or CDN in front keeps
  `index.html`. `curl -sI https://test.aishie.app/` shows what comes back.
- **`/healthz` did not reach Core.** The site sends it to the front end's
  files: the site block has lost its `@core` routes. Put back the block
  `setup-web.sh` prints.
- **Core does not answer.** The front end was deployed, but for two minutes
  `/healthz` got 502, 503 or 504 from Caddy, or no answer: Core is down, or
  its own deploy was restarting it for longer than that. See to Core
  ([Core's docs/deploying.md](https://github.com/AIShie-Education/AIShie-Core/blob/main/docs/deploying.md));
  the front end needs nothing more.
- **`setup-web.sh` stops at a link, or at a line of `authorized_keys`.**
  Neither it nor `aishie-web-deploy` makes a link there, nor a key line
  that is not the forced command: something else changed what `webdeploy`
  owns, or its key. Find out what before you run it again.
- **A re-run of an older push to `main` fails.** Once `main` has moved on,
  re-running the deploy of an older push would put an older build over a
  newer one, and is refused; the first run of such a push skips its deploy.
  To deploy edge again, run Deploy from `main`.
