#!/usr/bin/env bash
# Checks that an image of the front end does what docs/deploying.md says it
# does (The image): it runs it as a hardened stack would, on a read-only file
# system with every capability dropped and no new privileges, and asks it
# with curl; then again with FRAME_ANCESTORS set, and once with a value that
# must stop it from starting.
#
#   scripts/test-image.sh IMAGE [DIST]
#
# IMAGE is an image in the local Docker (docker build -t IMAGE .). DIST is the
# build the checks passed (dist/): given it, the image must serve exactly its
# files, and version.json besides. What the image must say it is, when known:
#
#   EXPECT_VERSION   version.json's version: the VERSION build argument
#   EXPECT_COMMIT    version.json's commit: its first 7 hex digits (COMMIT)
#   EXPECT_REVISION  the label org.opencontainers.image.revision, the whole
#                    commit; the label org.opencontainers.image.version must
#                    then be EXPECT_VERSION
#   EXPECT_SOURCE    the label org.opencontainers.image.source
#
# CI runs it on every image after it is built and before anything pushes it
# (ci.yml, publish.yml, release.yml).
set -euo pipefail

usage() { echo "usage: scripts/test-image.sh IMAGE [DIST]" >&2; exit 2; }
if [ $# -lt 1 ] || [ $# -gt 2 ]; then usage; fi
IMAGE=$1
DIST=${2:-}
[ -z "$DIST" ] || [ -f "$DIST/index.html" ] || { echo "test-image: $DIST/index.html is missing: give the build (dist/)" >&2; exit 2; }

work=$(mktemp -d)
containers=()
cleanup() {
  for c in ${containers[@]+"${containers[@]}"}; do docker rm -f "$c" > /dev/null 2>&1 || true; done
  rm -rf "$work"
}
trap cleanup EXIT

failed=0
ok() { echo "ok - $*"; }
fail() { echo "FAIL - $*" >&2; failed=1; }
check() { # check DESCRIPTION COMMAND...: ok when the command succeeds
  local what=$1
  shift
  if "$@"; then ok "$what"; else fail "$what"; fi
}

# get NAME PATH [CURL ARGS...]: asks for PATH; the status in $status, the
# headers in $work/NAME.headers, the body in $work/NAME.body.
status=
get() {
  local name=$1 path=$2
  shift 2
  status=$(curl -sS --max-time 10 -D "$work/$name.headers" -o "$work/$name.body" -w '%{http_code}' "$@" "$base$path") || status=000
}
# header NAME FIELD: that header's value in NAME's answer, or nothing.
header() {
  tr -d '\r' < "$work/$1.headers" | awk -v f="$2" 'BEGIN { f = tolower(f) } { i = index($0, ":") } i && tolower(substr($0, 1, i - 1)) == f { v = substr($0, i + 1); sub(/^[ \t]+/, "", v); print v; exit }'
}
is() { [ "$1" = "$2" ] || { echo "  got: ${1:-(nothing)}; want: $2" >&2; return 1; }; }
# shellcheck disable=SC2053 # $2 is a pattern
like() { [[ $1 == $2 ]] || { echo "  got: ${1:-(nothing)}; want: $2" >&2; return 1; }; }
same() { cmp -s "$1" "$2" || { echo "  $1 and $2 differ" >&2; return 1; }; }

label() { docker image inspect --format "{{ index .Config.Labels \"$1\" }}" "$IMAGE"; }

echo "# $IMAGE"

# What the image says of itself.
# A user by name or number, and neither root's name nor 0.
not_root() { local u=${1%%:*}; [ -n "$u" ] && [ "$u" != root ] && ! [[ $u =~ ^0+$ ]]; }
user=$(docker image inspect --format '{{ .Config.User }}' "$IMAGE")
check "it runs as a user that is not root (${user:-none given})" not_root "$user"
ports=$(docker image inspect --format '{{ range $p, $_ := .Config.ExposedPorts }}{{ $p }} {{ end }}' "$IMAGE")
check "it exposes 8080/tcp, and nothing else" is "$ports" "8080/tcp "
check "it has a health check" like "$(docker image inspect --format '{{ if .Config.Healthcheck }}{{ .Config.Healthcheck.Test }}{{ end }}' "$IMAGE")" '*version.json*'
if [ -n "${EXPECT_SOURCE:-}" ]; then
  check "label org.opencontainers.image.source" is "$(label org.opencontainers.image.source)" "$EXPECT_SOURCE"
fi
if [ -n "${EXPECT_REVISION:-}" ]; then
  check "label org.opencontainers.image.revision" is "$(label org.opencontainers.image.revision)" "$EXPECT_REVISION"
  check "label org.opencontainers.image.version" is "$(label org.opencontainers.image.version)" "${EXPECT_VERSION:-}"
fi

# harden: how the stack may run it, read-only with no capabilities.
harden=(--read-only --cap-drop ALL --security-opt no-new-privileges)
# start [DOCKER RUN ARGS...]: runs the image hardened, with those arguments
# besides, and waits until it answers; the port it listens on is published on
# one of this machine's, which Docker picks. The container is $container, and
# it answers at $base.
container=
base=
start() {
  container=$(docker run -d "${harden[@]}" -p 127.0.0.1::8080 "$@" "$IMAGE")
  containers+=("$container")
  local hostport up=
  hostport=$(docker port "$container" 8080/tcp | head -n 1)
  [ -n "$hostport" ] || { docker logs "$container" >&2 || true; echo "test-image: port 8080 is not published" >&2; exit 1; }
  base=http://$hostport
  for _ in $(seq 1 60); do
    if [ "$(docker inspect --format '{{ .State.Running }}' "$container")" != true ]; then
      break
    fi
    if curl -fsS --max-time 2 -o /dev/null "$base/version.json" 2> /dev/null; then
      up=1
      break
    fi
    sleep 0.5
  done
  if [ -z "$up" ]; then
    docker logs "$container" >&2 || true
    echo "FAIL - it does not answer on 8080 within 30 seconds" >&2
    exit 1
  fi
}

start
server=$container
ok "it answers on 8080 (published at $base), read-only, with no capabilities"

# The server itself, as it runs.
pid1=$(docker exec "$container" cat /proc/1/status)
uid=$(awk '$1 == "Uid:" { print $2 " " $3 " " $4 " " $5 }' <<< "$pid1")
check "the server runs as a user that is not root (uids $uid)" like "$uid" '[1-9]* [1-9]* [1-9]* [1-9]*'
check "the server is Caddy" is "$(docker exec "$container" cat /proc/1/comm | tr -d '\r')" caddy

# Which pages may frame it, unless FRAME_ANCESTORS says otherwise.
frame_self="frame-ancestors 'self'"

# /: the app, asked for again each time.
get root /
check "/ answers 200" is "$status" 200
check "/ is HTML" like "$(header root Content-Type)" 'text/html*'
check "/ is Cache-Control: no-cache" is "$(header root Cache-Control)" no-cache
check "/ is X-Content-Type-Options: nosniff" is "$(header root X-Content-Type-Options)" nosniff
check "/ may be framed by this origin alone" is "$(header root Content-Security-Policy)" "$frame_self"
check "/ says nothing of X-Frame-Options" is "$(header root X-Frame-Options)" ""
if [ -n "$DIST" ]; then
  check "/ is the build's index.html" same "$work/root.body" "$DIST/index.html"
else
  check "/ is the app" grep -q '<div id="app"' "$work/root.body"
fi

# One of the app's own routes: index.html, the same way.
get deep '/courses/0f1e2d3c/assignments/4b5a6978/grade?tab=rubric'
check "a deep path answers 200" is "$status" 200
check "a deep path is index.html" same "$work/deep.body" "$work/root.body"
check "a deep path is Cache-Control: no-cache" is "$(header deep Cache-Control)" no-cache

# A hashed file: the script index.html loads, kept for good.
entry=$(sed -n 's/.*<script type="module"[^>]* src="\([^"]*\)".*/\1/p' "$work/root.body" | head -n 1)
check "index.html loads a script from /assets/ ($entry)" like "$entry" '/assets/?*'
get asset "$entry" -H 'Accept-Encoding: identity'
check "$entry answers 200" is "$status" 200
check "$entry is JavaScript" like "$(header asset Content-Type)" '*javascript*'
check "$entry is immutable" is "$(header asset Cache-Control)" "public, max-age=31536000, immutable"
check "$entry is X-Content-Type-Options: nosniff" is "$(header asset X-Content-Type-Options)" nosniff
check "$entry may be framed by this origin alone" is "$(header asset Content-Security-Policy)" "$frame_self"
if [ -n "$DIST" ]; then
  check "$entry is the build's" same "$work/asset.body" "$DIST$entry"
fi
get gzip "$entry" -H 'Accept-Encoding: gzip'
check "$entry comes gzipped, when that is asked for" is "$(header gzip Content-Encoding)" gzip
if gzip -dc < "$work/gzip.body" > "$work/gzip.plain" 2> /dev/null; then
  check "$entry, gunzipped, is the file" same "$work/gzip.plain" "$work/asset.body"
else
  fail "$entry, gzipped, does not gunzip"
fi
get zstd "$entry" -H 'Accept-Encoding: zstd, gzip'
check "$entry comes in zstd, when that is asked for" is "$(header zstd Content-Encoding)" zstd

# A hashed file that is not there: a plain 404, not the app, and not kept.
get missing /assets/index-0000000000.js
check "a missing /assets/ file answers 404" is "$status" 404
check "a missing /assets/ file is not the app" is "$(grep -c '<div id="app"' "$work/missing.body" || true)" 0
check "a missing /assets/ file is not immutable" is "$(header missing Cache-Control)" ""
check "a missing /assets/ file may be framed by this origin alone" is "$(header missing Content-Security-Policy)" "$frame_self"

# /version.json: the stack's health check, from the build arguments.
get version /version.json
check "/version.json answers 200" is "$status" 200
check "/version.json is JSON" like "$(header version Content-Type)" 'application/json*'
check "/version.json is Cache-Control: no-cache" is "$(header version Cache-Control)" no-cache
check "/version.json may be framed by this origin alone" is "$(header version Content-Security-Policy)" "$frame_self"
body=$(cat "$work/version.body")
check "/version.json is {\"version\":…,\"commit\":…}" like "$body" '{"version":"*","commit":"*"}'
[[ $body =~ ^\{\"version\":\"[0-9A-Za-z.+_-]+\",\"commit\":\"([0-9a-f]{7}|unknown)\"\}$ ]] \
  || fail "/version.json is not a version and a 7-hex commit: $body"
if [ -n "${EXPECT_VERSION:-}" ]; then
  check "/version.json's version is $EXPECT_VERSION" like "$body" "{\"version\":\"$EXPECT_VERSION\",*"
fi
if [ -n "${EXPECT_COMMIT:-}" ]; then
  check "/version.json's commit is $EXPECT_COMMIT" like "$body" "*,\"commit\":\"$EXPECT_COMMIT\"}"
fi

# The icons index.html names, and the ones browsers ask for unasked: files of
# their own, served as images. Were one missing, the app's page would answer
# in its place, and a browser would keep that as the icon.
for icon in '/favicon.svg image/svg+xml' '/favicon.ico image/*icon' '/apple-touch-icon.png image/png'; do
  path=${icon% *}
  type=${icon#* }
  get icon "$path"
  check "$path answers 200" is "$status" 200
  check "$path is served as an image ($type)" like "$(header icon Content-Type)" "$type*"
  check "$path is not the app" is "$(grep -c '<div id="app"' "$work/icon.body" || true)" 0
  if [ -n "$DIST" ]; then
    check "$path is the build's" same "$work/icon.body" "$DIST$path"
  fi
done

# The image's own health check passes.
health=
for _ in $(seq 1 45); do
  health=$(docker inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ end }}' "$container")
  [ "$health" = starting ] || break
  sleep 1
done
check "Docker finds it healthy" is "$health" healthy

# What it holds: the build and version.json in /srv, and no sources,
# dependencies or settings anywhere.
docker cp "$container:/srv" "$work/srv"
check "/srv has version.json" test -f "$work/srv/version.json"
if [ -n "$DIST" ]; then
  if [ -e "$DIST/version.json" ]; then
    fail "the build has a version.json of its own, which the image's hides"
  fi
  rm -f "$work/srv/version.json"
  check "/srv is the build, file for file" diff -r "$DIST" "$work/srv"
fi
docker export "$container" | tar -t > "$work/files"
extra=$(grep -E '(^|/)(node_modules|package\.json|package-lock\.json|\.env[^/]*|tsconfig[^/]*\.json|vite\.config\.ts)(/|$)|^srv/.*\.(ts|vue)$' "$work/files" | head -n 5 || true)
check "no sources, dependencies or .env in the image" is "$extra" ""

# FRAME_ANCESTORS: the sources it is given, in place of 'self'.
framers="'self' https://canvas.example.edu"
start -e "FRAME_ANCESTORS=$framers"
get framed /
check "with FRAME_ANCESTORS set, / answers 200" is "$status" 200
check "with FRAME_ANCESTORS set, / may be framed by what it says" is "$(header framed Content-Security-Policy)" "frame-ancestors $framers"
get framed-version /version.json
check "with FRAME_ANCESTORS set, /version.json too" is "$(header framed-version Content-Security-Policy)" "frame-ancestors $framers"
docker rm -f "$container" > /dev/null

# A value Caddy cannot read, here one on two lines, stops the container from
# starting: an update that sets one fails where it is seen, and the stack's
# updater rolls it back.
bad=$(docker run -d "${harden[@]}" -e "FRAME_ANCESTORS=$(printf "'self'\nhttps://canvas.example.edu")" "$IMAGE")
containers+=("$bad")
code=$(timeout 30 docker wait "$bad" 2> /dev/null) || code="still running after 30 seconds"
check "with FRAME_ANCESTORS on two lines, it does not start (exit $code)" like "$code" '[1-9]*'

if [ "$failed" != 0 ]; then
  echo "# the server's log:" >&2
  docker logs "$server" >&2 || true
  exit 1
fi
echo "# all passed"
