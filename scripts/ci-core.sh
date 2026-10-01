#!/usr/bin/env bash
# Starts an AIshie Core for the end-to-end tests, and stops it again. It is
# a throwaway: a database of its own, a root actor whose password is made up
# for the run, as are the keys it seals identity providers' secrets with
# (SECRETS_KEY, and SIGNING_KEY beside it), files in a temporary directory,
# and the limits that would slow the tests down turned off. Never point it at
# a database people use.
#
# CI runs the image pinned in .github/core-image, in Docker. Without Docker,
# give it a binary of Core instead:
#
#   CORE_BIN=../AIShie-Core/bin/aishie-core DATABASE_URL=postgres:///aishie_e2e \
#     scripts/ci-core.sh start
#   . "${TMPDIR:-/tmp}/aishie-ci-core/env"    # E2E_CORE_URL, E2E_ROOT_TOKEN, E2E_PASSWORD
#   npx playwright test
#   scripts/ci-core.sh stop
#
# E2E_ROOT_TOKEN is root's signed-in session, not an API token: people hold
# no API tokens, only agents do. Root is bootstrapped with the email
# root@e2e.test and the password E2E_PASSWORD, and start signs it in with
# them (POST /v1/auth/login), as the sign-in page does. The session is the
# one Core sets as its cookie, and Core takes it as a bearer token as it
# takes an API token. It lasts Core's SESSION_TTL, 12 hours: a Core kept
# longer than that is stopped and started again. A Core from before people
# held no API tokens still prints one for root at bootstrap; start throws it
# away unread.
#
# start creates the database when it is missing (with psql, on DATABASE_URL's
# server), and stop drops it again. A database that has been bootstrapped
# before is refused: bootstrap runs once per database.
#
# A binary of Core is stopped by its pid, which start records with the
# command it runs: stop signals the pid only while it still runs that
# command. One that has ended (with a restart of the container, say) may
# have left its number to another process, which is left alone: stop says
# so, and forgets it.
#
# In GitHub Actions, start masks the session and the password in the log and
# puts the three E2E_* variables in $GITHUB_ENV for the steps after it. stop
# leaves Core's log in core.log, next to the env file, for the job to upload.
#
#   CORE_BIN     a binary to run instead of the pinned image
#   CORE_IMAGE   an image to run instead of the pinned one
#   CORE_PORT    where Core listens on 127.0.0.1 (8080)
#   CORE_DIR     where the env file, the log and the files go
#   E2E_PORT     the port of the web server the tests use (5173), for TRUSTED_ORIGINS
set -euo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
DIR=${CORE_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aishie-ci-core}
DIR=${DIR//\/\//\/} # macOS's TMPDIR ends in a /
PORT=${CORE_PORT:-8080}
URL=http://127.0.0.1:$PORT
WEB_PORT=${E2E_PORT:-5173}
CONTAINER=aishie-ci-core

die() { echo "ci-core: $*" >&2; exit 1; }
in_actions() { [ "${GITHUB_ACTIONS:-}" = true ]; }

if [ -n "${CORE_BIN:-}" ]; then
  mode=binary
  [ -x "$CORE_BIN" ] || die "CORE_BIN=$CORE_BIN is not a program"
else
  mode=docker
  IMAGE=${CORE_IMAGE:-$(grep -v -e '^#' -e '^[[:space:]]*$' "$here/.github/core-image" | tail -n 1)}
  [ -n "$IMAGE" ] || die ".github/core-image names no image"
fi

# core ARGS: a one-off aishie-core command, with standard input passed on.
core() {
  if [ "$mode" = binary ]; then
    "$CORE_BIN" "$@"
  else
    docker run --rm -i --network host --user "$(id -u):$(id -g)" -e DATABASE_URL "$IMAGE" "$@"
  fi
}

# The database: its name, and the server's maintenance database to create and
# drop it from, both taken from DATABASE_URL.
database() {
  [ -n "${DATABASE_URL:-}" ] || die "set DATABASE_URL to a database of the tests' own, e.g. postgres:///aishie_e2e"
  export DATABASE_URL
  local base=${DATABASE_URL%%\?*}
  local query=${DATABASE_URL#"$base"}
  [[ $base == *://*/* ]] || die "DATABASE_URL names no database: $base"
  dbname=${base##*/}
  maint=${base%/*}/postgres$query
  # Quoted into SQL below, so a plain name only.
  [[ $dbname =~ ^[a-z_][a-z0-9_]*$ ]] || die "the database in DATABASE_URL, $dbname, is not a plain lower-case name"
  [ "$dbname" != postgres ] || die "DATABASE_URL names the maintenance database; give the tests one of their own"
}

# From the moment start makes anything, a start that fails takes down what it
# started, and leaves only Core's log.
failed() {
  local rc=$?
  if [ "$rc" != 0 ]; then
    stop >/dev/null 2>&1 || true
    echo "ci-core: Core's log is $DIR/core.log" >&2
  fi
}

start() {
  if [ -e "$DIR/pid" ] || [ -e "$DIR/container" ]; then
    die "a Core this script started is still recorded in $DIR: run scripts/ci-core.sh stop first"
  fi
  database
  # Anything listening there, whatever it answers, would get the tests'
  # requests: only "could not connect" (7) will do.
  local rc=0
  curl -s -o /dev/null --max-time 2 "$URL/" || rc=$?
  [ "$rc" = 7 ] || die "something already listens on 127.0.0.1:$PORT: stop it, or set CORE_PORT"
  trap failed EXIT
  mkdir -p "$DIR"
  rm -rf "$DIR/blobs" "$DIR/core.log" "$DIR/env"
  mkdir "$DIR/blobs"
  : > "$DIR/core.log"

  if [ "$mode" = docker ]; then
    command -v docker >/dev/null 2>&1 || die "there is no docker here: run a binary of Core with CORE_BIN"
    if ! docker pull -q "$IMAGE"; then
      if in_actions; then
        echo "::error::Could not pull $IMAGE. The package is private, and this repository's workflows can read it only once an owner of the AIShie-Education organization (or an admin of the package) grants it, once: https://github.com/orgs/AIShie-Education/packages/container/aishie-core/settings → Manage Actions access → Add Repository → AIShie-Frontend, role Read. (If the error above is not denied, unauthorized or not found, GHCR may be having trouble: re-run the job.)"
        exit 1
      fi
      die "could not pull $IMAGE: docker login ghcr.io with a token that can read the package (classic, read:packages), or run a binary of Core with CORE_BIN"
    fi
  fi
  local version commit want
  version=$(core version </dev/null)
  echo "Core: $version (${CORE_BIN:-$IMAGE})"
  # The tag in the pin names Core's commit, and the digest decides what runs:
  # they must agree, or the pin says one thing and tests another.
  if [ "$mode" = docker ] && [[ $IMAGE == *:sha-*@sha256:* ]]; then
    want=${IMAGE##*:sha-}
    want=${want%%@*}
    commit=$(printf '%s\n' "$version" | sed -n 's/^[^(]*(\([^,]*\),.*/\1/p')
    if [ -z "$commit" ]; then
      echo "ci-core: cannot read the commit from «$version»; not comparing it with the pin" >&2
    elif [ "$commit" != "$want" ]; then
      die "the pin's tag says commit $want, but its digest is commit $commit: fix .github/core-image"
    fi
  fi

  if command -v psql >/dev/null 2>&1; then
    if [ "$(psql -X -At -d "$maint" -c "SELECT 1 FROM pg_database WHERE datname = '$dbname'")" != 1 ]; then
      psql -X -q -v ON_ERROR_STOP=1 -d "$maint" -c "CREATE DATABASE \"$dbname\""
      (umask 077 && printf '%s\n' "$DATABASE_URL" > "$DIR/created-db")
      echo "created the database $dbname"
    fi
  else
    echo "no psql here: taking the database $dbname to exist"
  fi
  core migrate up </dev/null
  core seed </dev/null

  local password session
  password=$(openssl rand -hex 16)
  if in_actions; then echo "::add-mask::$password"; fi
  # Root signs in with this email and password once Core is up (sign_in,
  # below). What bootstrap says goes to the log; its standard output, where
  # a Core from before people held no API tokens prints root's, goes nowhere.
  printf '%s\n' "$password" | core bootstrap --name Root --email root@e2e.test --password-stdin >/dev/null 2>>"$DIR/core.log" ||
    die "bootstrap failed; a database that was bootstrapped before cannot be used again: $(tail -n 3 "$DIR/core.log")"
  echo "(scripts/ci-core.sh keeps no API token for root, and threw away any printed here: root signs in with its password)" >> "$DIR/core.log"

  # The identity providers the tests set up keep their client secrets sealed
  # under SECRETS_KEY, which Core takes only with SIGNING_KEY. Both are made
  # up for the run, as root's password is, and reach Core in its
  # environment, on no command line; a Core from before them ignores them.
  SIGNING_KEY=$(openssl rand -hex 32)
  SECRETS_KEY=$(openssl rand -base64 32)
  if in_actions; then echo "::add-mask::$SIGNING_KEY" && echo "::add-mask::$SECRETS_KEY"; fi
  export SIGNING_KEY SECRETS_KEY

  # Tests sign in dozens of times a minute from one address, and a proposal
  # the tests make should not wait a minute to be swept.
  local -a settings=(
    "HTTP_ADDR=127.0.0.1:$PORT"
    "PUBLIC_URL=$URL"
    "TRUSTED_ORIGINS=http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT"
    INSECURE_COOKIES=true
    RATE_LIMIT_PER_MINUTE=0
    SIGN_IN_ATTEMPTS_PER_MINUTE=10000
    JOBS_INTERVAL=5s
    "BLOB_FS_ROOT=$DIR/blobs"
  )
  if [ "$mode" = binary ]; then
    # What it runs, as its command line reads once nohup has made way
    # for it: stop signals the pid only while it runs this (is_core).
    printf '%s serve\n' "$CORE_BIN" > "$DIR/command"
    # Its output goes to the log, not to the step's: GitHub Actions would
    # otherwise wait for it to end before ending the step.
    env "${settings[@]}" nohup "$CORE_BIN" serve </dev/null >>"$DIR/core.log" 2>&1 &
    echo $! > "$DIR/pid"
  else
    local -a flags=()
    local e
    for e in "${settings[@]}"; do flags+=(-e "$e"); done
    # One left by a run of this script that was killed.
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$CONTAINER" --network host --user "$(id -u):$(id -g)" \
      -v "$DIR/blobs:$DIR/blobs" -e DATABASE_URL -e SIGNING_KEY -e SECRETS_KEY "${flags[@]}" "$IMAGE" serve >/dev/null
    echo "$CONTAINER" > "$DIR/container"
  fi

  local i
  for i in $(seq 1 60); do
    if curl -fsS --max-time 2 "$URL/healthz" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
    if ! running || [ "$i" = 60 ]; then
      if [ "$mode" = docker ]; then docker logs --tail 20 "$CONTAINER" 2>&1 | cat >&2 || true; else tail -n 20 "$DIR/core.log" >&2; fi
      die "Core did not come up on $URL"
    fi
    sleep 0.5
  done

  session=$(sign_in root@e2e.test "$password") || die "root could not sign in with the password bootstrap was given"
  if in_actions; then echo "::add-mask::$session"; fi

  (
    umask 077
    # E2E_ROOT_TOKEN is root's signed-in session, not an API token (see the
    # top of this script); the name stays, so that nothing reading it changes.
    printf "export E2E_CORE_URL='%s'\nexport E2E_ROOT_TOKEN='%s'\nexport E2E_PASSWORD='%s'\n" "$URL" "$session" "$password" > "$DIR/env"
  )
  if in_actions; then
    printf 'E2E_CORE_URL=%s\nE2E_ROOT_TOKEN=%s\nE2E_PASSWORD=%s\n' "$URL" "$session" "$password" >> "$GITHUB_ENV"
  fi
  echo "Core is up on $URL, on the database $dbname; root's session and password are in $DIR/env:"
  echo "  . $DIR/env"
  trap - EXIT
}

# sign_in EMAIL PASSWORD prints the session Core gives for them at
# POST /v1/auth/login, as the sign-in page asks: the value of the ais_session
# cookie it sets (the body says only whose it is and until when). The body,
# password and all, reaches curl on its standard input, never on a command
# line. A sign-in Core refuses, or one whose password must be changed first,
# fails with what Core said, which holds no secret.
sign_in() {
  local headers session
  headers=$(printf '{"email":"%s","password":"%s"}' "$1" "$2" |
    curl -sS --max-time 30 -D - -o "$DIR/sign-in.json" -H 'Content-Type: application/json' --data-binary @- "$URL/v1/auth/login" |
    tr -d '\r') || return 1
  session=$(printf '%s\n' "$headers" | sed -n 's/^[Ss]et-[Cc]ookie: *ais_session=\([^;]*\).*/\1/p' | head -n 1)
  if ! [[ $session =~ ^ais_[A-Za-z0-9_-]+$ ]]; then
    echo "ci-core: POST /v1/auth/login: $(printf '%s\n' "$headers" | head -n 1), and no session: $(cat "$DIR/sign-in.json")" >&2
    return 1
  fi
  if grep -q '"password_change_required": *true' "$DIR/sign-in.json"; then
    echo "ci-core: $1 signed in, but must change their password before anything else" >&2
    return 1
  fi
  rm -f "$DIR/sign-in.json"
  printf '%s\n' "$session"
}

# command_of PID prints the command line PID runs, its arguments joined by
# spaces; nothing when there is no such process, or it has ended.
command_of() {
  if [ -r "/proc/$1/cmdline" ]; then
    tr '\0' ' ' <"/proc/$1/cmdline" | sed 's/ $//'
  else
    ps -o args= -p "$1" 2>/dev/null || true
  fi
}

# is_core PID: whether PID still runs the command start recorded with it,
# and is the Core start ran, not a process that has taken its number since.
is_core() {
  local want
  want=$(cat "$DIR/command" 2>/dev/null) || return 1
  [ -n "$want" ] && [ "$(command_of "$1")" = "$want" ]
}

running() {
  if [ -f "$DIR/pid" ]; then
    kill -0 "$(cat "$DIR/pid")" 2>/dev/null
  else
    [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = true ]
  fi
}

# The container's log, into core.log; the binary writes there itself.
logs() {
  if [ -f "$DIR/container" ]; then docker logs "$CONTAINER" >>"$DIR/core.log" 2>&1 || true; fi
}

stop() {
  local pid i
  if [ -f "$DIR/pid" ]; then
    pid=$(cat "$DIR/pid")
    if is_core "$pid"; then
      kill "$pid" 2>/dev/null || true
      for i in $(seq 1 40); do is_core "$pid" || break; sleep 0.5; done
      if is_core "$pid"; then kill -9 "$pid" 2>/dev/null || true; fi
      echo "stopped Core ($pid)"
    elif [ ! -s "$DIR/command" ]; then
      echo "ci-core: pid $pid was recorded with no command to know it by (by an older scripts/ci-core.sh): not signalled, and forgotten; stop it yourself if it is still Core" >&2
    else
      echo "ci-core: process $pid is not the Core this script started, which has ended: left alone, and forgotten" >&2
    fi
    rm -f "$DIR/pid" "$DIR/command"
  fi
  if [ -f "$DIR/container" ]; then
    logs
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    rm -f "$DIR/container"
    echo "stopped Core ($CONTAINER); its log is $DIR/core.log"
  fi
  if [ -f "$DIR/created-db" ]; then
    DATABASE_URL=$(cat "$DIR/created-db")
    database
    psql -X -q -d "$maint" -c "DROP DATABASE IF EXISTS \"$dbname\" WITH (FORCE)" && echo "dropped the database $dbname"
    rm -f "$DIR/created-db"
  fi
  rm -rf "$DIR/env" "$DIR/blobs" "$DIR/sign-in.json"
}

case ${1:-} in
  start) start ;;
  stop) stop ;;
  *) echo "usage: scripts/ci-core.sh start|stop (see the top of the script)" >&2; exit 2 ;;
esac
