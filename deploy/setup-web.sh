#!/bin/sh
# Sets up a server that runs AIshie Core (set up with Core's
# deploy/setup-server.sh) to serve the web front end as well, on the same
# origin. Run as root with this directory copied to the server
# (docs/deploying.md):
#
#   sh deploy/setup-web.sh test.aishie.app staging
#
# The environment, staging or production, names the GitHub settings it prints.
#
# It makes an SSH user, webdeploy, that can do one thing: run
# aishie-web-deploy, which it installs, on /srv/aishie-web, which
# webdeploy owns and Caddy reads. Until the first deploy a placeholder page is
# served from there. It then points Caddy's site for the host at those files,
# with /v1, /mcp and /healthz still going to Core: but only if Caddy's
# configuration is exactly what setup-server.sh wrote. Otherwise it prints the
# site block, to put in by hand.
#
# Run again, it installs the aishie-web-deploy in this directory over the
# old one and leaves everything else as it is: the releases, webdeploy's key
# and Caddy's configuration. That is how a newer aishie-web-deploy reaches
# the server. On a server set up before the rename to AIshie, it also holds
# webdeploy's key to aishie-web-deploy in the place of the script's old name,
# which it removes, and leaves the releases in /srv/aishiteru-web
# (docs/deploying.md, A server set up before the name AIshie).
#
# Root writes nothing through what webdeploy could have changed: under
# /srv/aishie-web, which webdeploy owns, webdeploy does the writing; and
# the line that holds webdeploy's key to one command is root's, as is the
# home it is in.
set -eu
umask 022

HOST=${1:-}
ENVIRONMENT=${2:-}
usage() { echo "usage: setup-web.sh HOSTNAME staging|production, e.g. test.aishie.app staging" >&2; exit 2; }
case $HOST in '' | *[!A-Za-z0-9.-]* | .* | -*) usage ;; esac
# It names the GitHub settings this server needs; guessing would name the
# other environment's.
case $ENVIRONMENT in staging | production) ;; *) usage ;; esac
[ "$(id -u)" = 0 ] || { echo "run this as root (sudo -i)" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
ROOT=/srv/aishie-web
# Compatibility: a server set up before the rename to AIshie keeps its
# releases in /srv/aishiteru-web, where aishie-web-deploy finds them too.
[ -e "$ROOT" ] || [ ! -e /srv/aishiteru-web ] || ROOT=/srv/aishiteru-web
KEY=/root/aishie-web-deploy-key
CADDYFILE=/etc/caddy/Caddyfile
say() { printf '\n== %s\n' "$*"; }
systemd() { [ -d /run/systemd/system ]; }

command -v caddy >/dev/null 2>&1 ||
  { echo "Caddy is not installed: set the server up with AIshie Core's deploy/setup-server.sh first" >&2; exit 1; }
command -v runuser >/dev/null 2>&1 || { echo "runuser (util-linux) is not installed" >&2; exit 1; }

# not_a_link PATH...: stops before root writes through a link where neither
# this script nor aishie-web-deploy makes one.
not_a_link() {
  for p in "$@"; do
    if [ -L "$p" ]; then
      echo "$p is a link, which neither this script nor aishie-web-deploy makes: find out how it got there before running this again" >&2
      exit 1
    fi
  done
}
as_webdeploy() { runuser -u webdeploy -- "$@"; }

say "User webdeploy, and $ROOT"
id webdeploy >/dev/null 2>&1 || useradd --create-home --shell /bin/sh webdeploy
# No password to log in with, and not locked either: a locked account is
# refused even with a key.
usermod -p '*' webdeploy
# Caddy reads what webdeploy writes: everything here is readable by all.
not_a_link "$ROOT" "$ROOT/releases"
install -d -o webdeploy -g webdeploy -m 755 "$ROOT"
as_webdeploy mkdir -p "$ROOT/releases"
as_webdeploy chmod 755 "$ROOT/releases"
install -m 755 "$here/aishie-web-deploy" /usr/local/bin/
echo "installed aishie-web-deploy in /usr/local/bin"
if [ ! -e "$ROOT/current" ] && [ ! -L "$ROOT/current" ]; then
  # Something sane to serve until the first deploy, and a release like any
  # other: the first few deploys remove it.
  as_webdeploy mkdir -p "$ROOT/releases/placeholder"
  as_webdeploy chmod 755 "$ROOT/releases/placeholder"
  as_webdeploy tee "$ROOT/releases/placeholder/index.html" >/dev/null <<'HTML'
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AIshie</title>
<p>AIshie's web front end has not been deployed here yet. Core's API is at <code>/v1</code>, and agents connect at <code>/mcp</code>.</p>
</html>
HTML
  as_webdeploy chmod 644 "$ROOT/releases/placeholder/index.html"
  as_webdeploy ln -s releases/placeholder "$ROOT/current"
  echo "serving a placeholder page until the first deploy"
else
  echo "$ROOT/current is there already: left as it is ($(readlink "$ROOT/current"))"
fi

say "SSH user webdeploy, for the Deploy workflow"
home=$(getent passwd webdeploy | cut -d: -f6)
keys=$home/.ssh/authorized_keys
# The key can do nothing but this: no shell, no terminal, no forwarding.
# Whatever command it asks for reaches aishie-web-deploy as one argument,
# quoted, which the script splits and checks itself; the build comes on
# standard input, which a forced command still reads.
# shellcheck disable=SC2016 # $SSH_ORIGINAL_COMMAND is for sshd to expand
forced='restrict,command="/usr/local/bin/aishie-web-deploy \"$SSH_ORIGINAL_COMMAND\""'
# That line is root's, and so are .ssh and the home around it, which sshd
# accepts: webdeploy, who needs to write nothing there, can neither rewrite
# it nor put a .ssh of its own in its place.
not_a_link "$home" "$home/.ssh" "$keys"
chown root:root "$home"
chmod 755 "$home"
install -d -o root -g root -m 755 "$home/.ssh"
# Compatibility: before the rename to AIshie, the key ran the script by its
# old name. Where every line is that forced command and a key, each key is
# held to aishie-web-deploy instead: the key in GitHub keeps working.
# shellcheck disable=SC2016 # as above
before='restrict,command="/usr/local/bin/aishiteru-web-deploy \"$SSH_ORIGINAL_COMMAND\""'
if [ -s "$keys" ] && FORCED=$before awk 'index($0, ENVIRON["FORCED"] " ") != 1 { bad = 1 } END { exit bad }' "$keys"; then
  BEFORE=$before FORCED=$forced awk '{ print ENVIRON["FORCED"] substr($0, length(ENVIRON["BEFORE"]) + 1) }' "$keys" > "$keys.new"
  mv "$keys.new" "$keys"
  echo "webdeploy's SSH key now runs aishie-web-deploy, in the place of aishiteru-web-deploy"
fi
if [ -s "$keys" ]; then
  # Every line must be the forced command and a key, and nothing else.
  if ! FORCED=$forced awk 'index($0, ENVIRON["FORCED"] " ") != 1 { bad = 1 } END { exit bad }' "$keys"; then
    echo "$keys has a line that is not the forced command above: find out how it got there, remove it, and run this again" >&2
    exit 1
  fi
  # The key in GitHub keeps working. To replace it: docs/deploying.md.
  echo "webdeploy's SSH key is set up already: left as it is"
else
  [ -e "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -C "aishie-web-deploy@$HOST" -f "$KEY"
  printf '%s %s\n' "$forced" "$(cat "$KEY.pub")" > "$keys"
  echo "made webdeploy's SSH key"
fi
chown root:root "$keys"
chmod 644 "$keys"
# Compatibility: the script by its name from before the rename to AIshie,
# which no key runs now.
rm -f /usr/local/bin/aishiteru-web-deploy

say "Caddy: the front end on $HOST, with Core behind it"
# What setup-server.sh wrote, byte for byte: made the same way it makes it.
core_only=$(printf '{\n\tadmin unix//var/lib/caddy/admin.sock\n}\n\n%s {\n\treverse_proxy 127.0.0.1:8080\n}\n' "$HOST")
# The same site, with the front end's files for everything that is not Core's.
# Hashed files (/assets/) never change, so a browser may keep them for good;
# a name that is not there is a 404, not the app, and is not kept. Anything
# else, index.html first, is asked for again each time, so that a deploy shows
# at once. Only the files are compressed: Core's MCP endpoint streams.
site() {
  printf '%s {\n' "$HOST"
  printf '\t# AIshie Core: the API, the MCP endpoint and the health check.\n'
  printf '\t@core path /v1/* /mcp /mcp/* /healthz\n'
  printf '\thandle @core {\n'
  printf '\t\treverse_proxy 127.0.0.1:8080\n'
  printf '\t}\n'
  printf '\n'
  printf '\t# The web front end, as aishie-web-deploy puts it here.\n'
  printf '\thandle /assets/* {\n'
  printf '\t\troot * %s/current\n' "$ROOT"
  printf '\t\t@found file\n'
  printf '\t\theader @found Cache-Control "public, max-age=31536000, immutable"\n'
  printf '\t\tencode zstd gzip\n'
  printf '\t\tfile_server\n'
  printf '\t}\n'
  printf '\thandle {\n'
  printf '\t\troot * %s/current\n' "$ROOT"
  printf '\t\theader Cache-Control "no-cache"\n'
  printf '\t\tencode zstd gzip\n'
  printf '\t\ttry_files {path} /index.html\n'
  printf '\t\tfile_server\n'
  printf '\t}\n'
  printf '}\n'
}
with_web=$(printf '{\n\tadmin unix//var/lib/caddy/admin.sock\n}\n\n'; site)
caddy_todo=
printf '%s\n' "$core_only" > "$CADDYFILE.core-only"
# Compared less its comment lines: a site written before the rename to AIshie
# differs from this one in its comments alone.
uncommented='/^[[:space:]]*#/d'
if [ "$(sed "$uncommented" "$CADDYFILE" 2>/dev/null)" = "$(printf '%s\n' "$with_web" | sed "$uncommented")" ]; then
  echo "$CADDYFILE serves the front end already"
  rm -f "$CADDYFILE.core-only"
elif cmp -s "$CADDYFILE.core-only" "$CADDYFILE"; then
  rm -f "$CADDYFILE.core-only"
  printf '%s\n' "$with_web" > "$CADDYFILE.new"
  if ! caddy validate --adapter caddyfile --config "$CADDYFILE.new" >/dev/null 2>"$CADDYFILE.errors"; then
    cat "$CADDYFILE.errors" >&2
    rm -f "$CADDYFILE.new" "$CADDYFILE.errors"
    echo "caddy validate refused the new configuration; $CADDYFILE is as it was" >&2
    exit 1
  fi
  rm -f "$CADDYFILE.errors"
  backup=$CADDYFILE.before-web-$(date -u +%Y%m%d-%H%M%S)
  cp -p "$CADDYFILE" "$backup"
  mv "$CADDYFILE.new" "$CADDYFILE"
  # A restart, as setup-server.sh does: it works whatever admin endpoint the
  # running Caddy has. Core is unreachable for the second it takes.
  if systemd; then
    systemctl restart caddy
    systemctl is-active --quiet caddy ||
      { echo "Caddy did not start again: journalctl -u caddy; the old configuration is $backup" >&2; exit 1; }
  fi
  echo "wrote $CADDYFILE (the one before is $backup)"
else
  rm -f "$CADDYFILE.core-only"
  caddy_todo=1
  echo "$CADDYFILE is not what setup-server.sh wrote: left as it is. The site block to put in it is below, under What is left."
fi

upper=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
say "Done. What is left"
n=1
if [ -n "$caddy_todo" ]; then
  # Until this is done the site is Core alone: / is Core's 404, and a deploy
  # fails its check that the site serves the build.
  cat <<DONE
$n. Caddy, which still sends everything on $HOST to Core: make $HOST's site
   block in $CADDYFILE this one, and keep the rest (the global block with its
   admin line first):

DONE
  site
  cat <<DONE

   then: caddy validate --adapter caddyfile --config $CADDYFILE && systemctl restart caddy
DONE
  n=$((n + 1))
fi
cat <<DONE
$n. For the Deploy workflow, in AIShie-Frontend's Settings → Secrets and variables → Actions:
     variable DEPLOY_WEB_TARGET_$upper       webdeploy@$HOST
     variable DEPLOY_WEB_KNOWN_HOSTS_$upper  $HOST $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
DONE
if [ -e "$KEY" ]; then
  cat <<DONE
     secret   DEPLOY_WEB_SSH_KEY_$upper      the whole of $KEY (cat $KEY)
   then delete $KEY: the server keeps only its public half.
DONE
fi
cat <<DONE
   The workflow checks the site at https://$HOST; if people reach it
   elsewhere, add the variable DEPLOY_WEB_URL_$upper with that origin.
DONE
n=$((n + 1))
if [ -n "$caddy_todo" ]; then
  cat <<DONE
$n. Deploy (docs/deploying.md), once Caddy has the block above: until then a
   deploy puts the files in place, but fails its check that the site serves them.
DONE
else
  cat <<DONE
$n. Deploy (docs/deploying.md): until then, https://$HOST/ shows a placeholder
   page, and Core answers under /v1, /mcp and /healthz as before.
DONE
fi
