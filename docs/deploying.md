# Deploying the web front end

The front end is a directory of static files, and it is served from the same
origin as AIShiteru Core: Core's session cookie is `SameSite=Lax`, and its
guard refuses writes from other origins. So it lives on the server Core runs
on, one per environment, set up with Core's `deploy/setup-server.sh`
([Core's docs/deploying.md](https://github.com/AIShiteru-LMS/AIShiteru-Core/blob/main/docs/deploying.md)).
Caddy, which already serves HTTPS there, sends `/v1/*`, `/mcp`, `/mcp/*` and
`/healthz` to Core on `127.0.0.1:8080`, and everything else to the files in
`/srv/aishiteru-web/current`, falling back to `index.html` for the app's own
routes.

The scripts in [`deploy/`](../deploy) do the work:

- `setup-web.sh` sets a server up for the front end, once. Run again, it
  installs a newer copy of the other script and leaves everything else as it
  is.
- `aishiteru-web-deploy` puts a build on the server, or goes back to one it
  keeps. The Deploy workflow runs it; so can you.

## How a build gets there

A build is made once, and what is deployed is what was checked:

1. On every push to `main`, CI checks the commit, builds it, runs the
   end-to-end tests on those very files (against the Core pinned in
   `.github/core-image`), and hands them to the Deploy workflow for
   `staging`.
2. A version tag runs all of CI again on the tagged commit and publishes that
   build on the release page, as `aishiteru-web-vX.Y.Z.tar.gz`
   ([CONTRIBUTING.md](../CONTRIBUTING.md#releasing)). A pre-release
   (`v1.2.3-rc.1`) is then deployed to `staging` too.
3. `production` gets a release's tarball, and only when somebody runs Deploy
   for it by hand, from the release's tag.

The Deploy workflow packs the build, connects to the server with SSH as the
user `webdeploy`, whose key can do nothing but run `aishiteru-web-deploy`, and
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
   sh ~you/web-deploy/setup-web.sh test.aishie.app staging
   ```

   It creates the user `webdeploy`, with no password, and
   `/srv/aishiteru-web`, which `webdeploy` owns and everyone can read. It
   installs `aishiteru-web-deploy` in `/usr/local/bin`, and serves a
   placeholder page until the first deploy. It gives `webdeploy` an SSH key
   whose only command is `aishiteru-web-deploy`. That line, the `.ssh` it is
   in and `webdeploy`'s home are root's, so `webdeploy` cannot change what
   its key may do; and under `/srv/aishiteru-web` the script writes as
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
   `/root/aishiteru-web-deploy-key` from the server.

3. Deploy: push to `main`, or run Deploy by hand (Actions → Deploy → Run
   workflow, from `main`, environment `staging`). Until then
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
| Variable | `DEPLOY_WEB_TARGET_STAGING` | `webdeploy@test.aishie.app` |
| Variable | `DEPLOY_WEB_KNOWN_HOSTS_STAGING` | the server's host key line, as printed |
| Secret | `DEPLOY_WEB_SSH_KEY_STAGING` | the whole of `/root/aishiteru-web-deploy-key` |
| Variable (optional) | `DEPLOY_WEB_URL_STAGING` | the site's origin, when it is not `https://` + the target's host |

For production, the names end in `_PRODUCTION`. They are the repository's,
not the environment's: a private repository on GitHub Free has no environment
variables or secrets. SSH on a port other than 22 is
`ssh://webdeploy@host:2222` in the target and `[host]:2222 ssh-ed25519 …` in
the host key line.

The host key line is the same one Core's repository has in
`DEPLOY_KNOWN_HOSTS_STAGING`: it is the server's. The key is not the same: the
front end has a user and a key of its own, which can change the site's files
and nothing else, and Core's key cannot touch them.

Until `DEPLOY_WEB_TARGET_STAGING` is set, a deploy says which build is ready
and passes. A secret or host key set without the target fails the run, so
that half a configuration is not taken for none.

The key can only run `aishiteru-web-deploy`, but that puts any build it is
given on the site, which is Core's origin: whoever can deploy can run
JavaScript as every person who signs in. Anyone with write access to this
repository can run a workflow that reads the secret. On GitHub Free nothing
narrows that down to a branch or to people. When someone loses write access,
replace the key: on the server, delete `~webdeploy/.ssh/authorized_keys` and
any `/root/aishiteru-web-deploy-key*` left, run `setup-web.sh` again as in
step 1, and put the new key it prints into the secret.

## Day to day

Run these as root on the server.

- **What is served**, and what else is kept, newest first:

  ```
  sudo -u webdeploy aishiteru-web-deploy list
  ```

  `/srv/aishiteru-web/deploy.log` lists every deploy and switch, from what to
  what. The Deploy run's summary names the commit, the version and the files.
- **Rolling back** to a release the server keeps (the newest five, and the one
  served before the current one) is immediate:

  ```
  sudo -u webdeploy aishiteru-web-deploy activate v1.2.2
  ```

  From GitHub instead: run Deploy from the newest release's tag, with
  environment `production` and ref `v1.2.2`; for staging, from `main` with
  the release ID `list` shows (a commit's first seven characters, or a tag)
  as the ref. That builds the commit again, where `activate` serves the
  files kept.
- **Deploying without GitHub**, a release's tarball, say:

  ```
  sha256sum -c aishiteru-web-v1.2.3.tar.gz.sha256
  sudo -u webdeploy aishiteru-web-deploy v1.2.3 < aishiteru-web-v1.2.3.tar.gz
  ```

- **Updating the script:** when `deploy/` changes, copy it to the server again
  and run `setup-web.sh` as in step 1. It installs the new script and leaves
  the rest.
- **Caching:** files under `/assets/` have the hash of their contents in
  their names, and are served `immutable` for a year. Everything else,
  `index.html` first, is served `no-cache`: browsers ask each time, and a
  deploy shows at once. A tab left open across a deploy still has the old
  `index.html`, and a page it has not loaded yet is no longer on the server:
  reloading fixes that.
- **Disk:** each release is a few megabytes, and five are kept.

## When something goes wrong

- **The e2e job cannot pull Core's image.** Core's image is private, and this
  repository's workflows can read it only once an owner of the organization
  grants it: the package's settings
  (github.com/orgs/AIShiteru-LMS/packages/container/aishiteru-core/settings)
  → Manage Actions access → Add Repository → `AIShiteru-Frontend`, role
  Read. It is done once.
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
  ([Core's docs/deploying.md](https://github.com/AIShiteru-LMS/AIShiteru-Core/blob/main/docs/deploying.md));
  the front end needs nothing more.
- **`setup-web.sh` stops at a link, or at a line of `authorized_keys`.**
  Neither it nor `aishiteru-web-deploy` makes a link there, nor a key line
  that is not the forced command: something else changed what `webdeploy`
  owns, or its key. Find out what before you run it again.
- **A re-run of an older push to `main` fails.** Once `main` has moved on,
  re-running the deploy of an older push would put an older build over a
  newer one, and is refused; the first run of such a push skips its deploy.
  To deploy staging again, run Deploy from `main`.
