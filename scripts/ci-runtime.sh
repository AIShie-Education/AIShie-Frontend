#!/usr/bin/env bash
# Starts the pinned agent runtime's API for the provider-privacy end-to-end
# test, against the throwaway Core from scripts/ci-core.sh. It has its own
# scratch PostgreSQL database and keyring. No credential or key is printed.
#
#   scripts/ci-core.sh start
#   scripts/ci-runtime.sh start
#   npx playwright test e2e/provider-privacy.spec.ts
#   scripts/ci-runtime.sh stop
#   scripts/ci-core.sh stop
#
# RUNTIME_IMAGE overrides .github/runtime-image; RUNTIME_API_PORT (9091),
# RUNTIME_DATABASE_URL and RUNTIME_CONTAINER may be set for an isolated run.
set -euo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
CORE_DIR=${CORE_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aishie-ci-core}
DIR=${RUNTIME_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aishie-ci-runtime}
PORT=${RUNTIME_API_PORT:-9091}
MODEL_PORT=${E2E_MODEL_PORT:-9092}
CONTAINER=${RUNTIME_CONTAINER:-aishie-ci-runtime}
IMAGE=${RUNTIME_IMAGE:-$(grep -v -e '^#' -e '^[[:space:]]*$' "$here/.github/runtime-image" | tail -n 1)}
DATABASE_URL=${RUNTIME_DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/aishie_runtime_e2e?sslmode=disable}
export DATABASE_URL

fail() { echo "ci-runtime: $*" >&2; exit 1; }
in_actions() { [ "${GITHUB_ACTIONS:-}" = true ]; }
[ -n "$IMAGE" ] || fail ".github/runtime-image names no image"
[ -f "$CORE_DIR/env" ] || fail "start the throwaway Core first: $CORE_DIR/env is missing"
# E2E_CORE_URL, E2E_ROOT_TOKEN, E2E_RUNTIME_AUDIENCE; no value is echoed.
# shellcheck disable=SC1090,SC1091
. "$CORE_DIR/env"
[ -n "${E2E_CORE_URL:-}" ] && [ -n "${E2E_ROOT_TOKEN:-}" ] && [ -n "${E2E_RUNTIME_AUDIENCE:-}" ] ||
  fail "the Core's env does not name its URL, root session and runtime audience"

base=${DATABASE_URL%%\?*}
query=${DATABASE_URL#"$base"}
dbname=${base##*/}
maint=${base%/*}/postgres$query
[[ $dbname =~ ^[a-z_][a-z0-9_]*$ ]] || fail "database name is not a plain lower-case name: $dbname"
[ "$dbname" != postgres ] || fail "use a scratch runtime database, not postgres"

unowned_agent() {
  curl -fsS --max-time 30 \
    -H "Authorization: Bearer $E2E_ROOT_TOKEN" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: ci-runtime-agent-$(openssl rand -hex 16)" \
    --data '{"kind":"agent","display_name":"E2E unowned course bot","hosting":"runtime"}' \
    "$E2E_CORE_URL/v1/actors" > "$DIR/unowned-agent.json"
  node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(r.status!=="executed"||typeof r.result?.actor_id!=="string") process.exit(1); process.stdout.write(r.result.actor_id)' "$DIR/unowned-agent.json"
}

credential() {
  curl -fsS --max-time 30 \
    -H "Authorization: Bearer $E2E_ROOT_TOKEN" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: ci-runtime-$(openssl rand -hex 16)" \
    --data '{"label":"frontend provider privacy e2e","replace":true}' \
    "$E2E_CORE_URL/v1/services/agent_runtime/credentials" > "$DIR/credential.json"
  node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(r.status!=="executed"||typeof r.result?.token!=="string") process.exit(1); process.stdout.write(r.result.token)' "$DIR/credential.json"
}

start() {
  [ ! -e "$DIR/container" ] || fail "a runtime is already recorded in $DIR: run scripts/ci-runtime.sh stop first"
  local rc=0
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/runtime/api/v1/info" || rc=$?
  [ "$rc" = 7 ] || fail "something already listens on 127.0.0.1:$PORT"
  # Root registers an agent with no owner; AR's owner-only API is never used
  # for it. The token manager hosts this operator-owned YAML agent normally.
  mkdir -p "$DIR"
  local unowned
  unowned=$(unowned_agent) || fail "Core did not register the unowned runtime agent"
  mkdir -p "$DIR/secrets/kek"
  : > "$DIR/runtime.log"
  # No static agents: tests host them through the API. One operator-owned,
  # local OpenAI-compatible offer makes the real TS Runner deterministic.
  mkdir -p "$DIR/secrets/school/keys"
  (umask 077 && printf 'e2e-not-a-secret\n' > "$DIR/secrets/school/keys/e2e")
  printf '[]\n' > "$DIR/model-rules.json"
  cat > "$DIR/runtime.yaml" <<EOF
runtime:
  tenants:
    ten_e2e:
      per_day: {answers: 1000}
  school:
    offers:
      - id: e2e
        label: E2E deterministic model
        adapter: openai_chat
        provider: openai
        model: e2e-model
        base_url: http://127.0.0.1:$MODEL_PORT/v1
        key_ref: secret://school/keys/e2e
        capabilities: {file_input: true}
EOF
  cat > "$DIR/unowned-agent.yaml" <<EOF
agent:
  id: e2e-unowned
  display_name: E2E unowned course bot
  tenant_id: ten_e2e
  core:
    base_url: $E2E_CORE_URL
    agent_id: $unowned
  model:
    adapter: openai_chat
    provider: openai
    model: e2e-model
    offer: e2e
    base_url: http://127.0.0.1:$MODEL_PORT/v1
    key_ref: secret://school/keys/e2e
    key_source: school
  tools:
    writes: false
EOF
  (umask 077 && openssl rand -base64 32 > "$DIR/secrets/kek/v1")
  local model_rc=0
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$MODEL_PORT/v1/chat/completions" || model_rc=$?
  [ "$model_rc" = 7 ] || fail "something already listens on 127.0.0.1:$MODEL_PORT"
  E2E_MODEL_PORT=$MODEL_PORT E2E_MODEL_RULES="$DIR/model-rules.json" \
    node "$here/scripts/ci-model-server.mjs" > "$DIR/model.log" 2>&1 &
  echo "$!" > "$DIR/model.pid"

  local token
  token=$(credential) || fail "Core did not issue the runtime credential"
  rm -f "$DIR/credential.json"
  if in_actions; then echo "::add-mask::$token"; fi
  export E2E_SERVICE_CREDENTIAL=$token
  unset token

  if [ "$(psql -X -At -d "$maint" -c "SELECT 1 FROM pg_database WHERE datname = '$dbname'")" != 1 ]; then
    psql -X -q -v ON_ERROR_STOP=1 -d "$maint" -c "CREATE DATABASE \"$dbname\""
    (umask 077 && printf '%s\n' "$DATABASE_URL" > "$DIR/created-db")
  fi
  docker pull -q "$IMAGE" >/dev/null || fail "could not pull $IMAGE"
  docker run --rm -i --network host --user "$(id -u):$(id -g)" \
    -v "$DIR/secrets:/secrets" -e DATABASE_URL -e 'KMS_KEY_ID=local:/secrets/kek/v1' \
    "$IMAGE" migrate up >/dev/null
  # A leftover of a killed run only; a running one was refused above.
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --network host --user "$(id -u):$(id -g)" \
    -v "$DIR/secrets:/secrets" \
    -v "$DIR/runtime.yaml:/config/runtime.yaml:ro" \
    -v "$DIR/unowned-agent.yaml:/config/unowned-agent.yaml:ro" \
    -e 'CONFIG=/config/runtime.yaml,/config/unowned-agent.yaml' \
    -e DATABASE_URL \
    -e 'KMS_KEY_ID=local:/secrets/kek/v1' \
    -e 'SECRETS_DIR=/secrets' \
    -e "CORE_BASE_URL=$E2E_CORE_URL" \
    -e "CORE_BASE_URL_ALLOWLIST=$E2E_CORE_URL" \
    -e "PUBLIC_URL=$E2E_CORE_URL" \
    -e 'CORE_SERVICE_CREDENTIAL=env://E2E_SERVICE_CREDENTIAL' \
    -e E2E_SERVICE_CREDENTIAL \
    -e "API_ADDR=127.0.0.1:$PORT" \
    -e "API_AUDIENCE=$E2E_RUNTIME_AUDIENCE" \
    -e 'HTTP_ADDR=127.0.0.1:9090' \
    -e 'OCR=off' -e 'OFFICE_PDF=off' -e 'RENDITIONS=off' \
    "$IMAGE" run >/dev/null
  echo "$CONTAINER" > "$DIR/container"

  local i
  for i in $(seq 1 60); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/runtime/api/v1/info" >/dev/null 2>&1; then break; fi
    if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true || [ "$i" = 60 ]; then
      docker logs --tail 30 "$CONTAINER" >&2 || true
      fail "runtime did not come up on 127.0.0.1:$PORT"
    fi
    sleep 0.5
  done
  (
    umask 077
    printf "export E2E_RUNTIME_URL='%s'\nexport E2E_MODEL_RULES='%s'\nexport E2E_UNOWNED_AGENT_ID='%s'\n" \
      "http://127.0.0.1:$PORT" "$DIR/model-rules.json" "$unowned" >> "$CORE_DIR/env"
  )
  if in_actions; then
    {
      printf 'E2E_RUNTIME_URL=%s\n' "http://127.0.0.1:$PORT"
      printf 'E2E_MODEL_RULES=%s\n' "$DIR/model-rules.json"
      printf 'E2E_UNOWNED_AGENT_ID=%s\n' "$unowned"
    } >> "$GITHUB_ENV"
  fi
  echo "Runtime is up on http://127.0.0.1:$PORT; its scratch database is $dbname"
}

stop() {
  if [ -f "$DIR/container" ]; then
    local container
    container=$(cat "$DIR/container")
    docker logs "$container" >> "$DIR/runtime.log" 2>&1 || true
    docker rm -f "$container" >/dev/null 2>&1 || true
    rm -f "$DIR/container"
  fi
  if [ -f "$DIR/created-db" ]; then
    psql -X -q -d "$maint" -c "DROP DATABASE IF EXISTS \"$dbname\" WITH (FORCE)"
    rm -f "$DIR/created-db"
  fi
  if [ -f "$DIR/model.pid" ]; then
    local model_pid
    model_pid=$(cat "$DIR/model.pid")
    kill "$model_pid" >/dev/null 2>&1 || true
    rm -f "$DIR/model.pid"
  fi
  rm -f "$DIR/credential.json" "$DIR/unowned-agent.json"
}

case ${1:-} in
  start) start ;;
  stop) stop ;;
  *) echo "usage: scripts/ci-runtime.sh start|stop" >&2; exit 2 ;;
esac
