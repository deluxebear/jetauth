#!/usr/bin/env bash
# rebac-e2e-smoke.sh — CP-8 end-to-end smoke for the ReBAC stack.
#
# Walks a fresh ReBAC app through the full lifecycle:
#   1. Wait for the JetAuth admin API to answer.
#   2. Create an organization + application with ModelType=rebac.
#   3. Save a 4-type authorization model.
#   4. Write three tuples.
#   5. Check: /api/biz-enforce (exercises the BizEnforce→ReBACCheck dispatcher).
#   6. Check: /api/biz-list-objects returns at least one reachable object.
#   7. Guidance: /api/biz-get-user-roles on a ReBAC app returns HTTP 400
#      with msg=BIZ_API_NOT_SUPPORTED_IN_REBAC.
#   8. Teardown: delete app + organization.
#
# The script exits 0 on success, 1 on the first failing assertion.
# Designed for hand-run + release-pipeline smoke; NOT wired into CI
# because it needs a live backend.
#
# Usage:
#   BASE_URL=http://localhost:8000 \
#   ADMIN_USER=admin ADMIN_PASSWORD=123 \
#     bash web/scripts/rebac-e2e-smoke.sh
#
# Env:
#   BASE_URL        (default: http://localhost:8000)
#   ADMIN_USER      (default: admin)
#   ADMIN_PASSWORD  (default: 123)
#   ORG_NAME        (default: rebac-smoke-<timestamp>)
#   APP_NAME        (default: rebac-smoke-app-<timestamp>)
#   WAIT_TIMEOUT    (default: 30 — seconds spent polling the health endpoint)
#   KEEP_ON_FAIL    (default: 0 — set to 1 to skip teardown on failure for inspection)
#
# Dependencies: bash, curl, jq.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123}"
TS="$(date +%s)"
ORG_NAME="${ORG_NAME:-rebac-smoke-${TS}}"
# App name is used verbatim as the Casbin policy-table suffix; that
# table name must match `[a-zA-Z_][a-zA-Z0-9_]{0,63}`, so no hyphens.
APP_NAME="${APP_NAME:-rebac_smoke_app_${TS}}"
APP_ID="${ORG_NAME}/${APP_NAME}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-30}"
KEEP_ON_FAIL="${KEEP_ON_FAIL:-0}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 2; }; }
need curl
need jq

COOKIE_JAR="$(mktemp -t rebac-smoke.XXXXXX)"
cleanup_jar() { rm -f "$COOKIE_JAR"; }
trap cleanup_jar EXIT

log() { printf '[rebac-smoke] %s\n' "$*" >&2; }
fail() { log "FAIL: $*"; exit 1; }

curl_admin() {
  curl --silent --show-error --fail-with-body \
    --cookie-jar "$COOKIE_JAR" --cookie "$COOKIE_JAR" \
    "$@"
}

# ─── 1. Health wait ───────────────────────────────────────────────────────
log "waiting for ${BASE_URL} (timeout ${WAIT_TIMEOUT}s)"
for ((i = 0; i < WAIT_TIMEOUT; i++)); do
  if curl --silent --fail "${BASE_URL}/api/get-version-info" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl --silent --fail "${BASE_URL}/api/get-version-info" >/dev/null \
  || fail "server did not respond within ${WAIT_TIMEOUT}s at ${BASE_URL}"

# ─── 2. Login as admin ────────────────────────────────────────────────────
log "signing in as ${ADMIN_USER}"
LOGIN_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/login" \
  -d "$(jq -cn --arg u "$ADMIN_USER" --arg p "$ADMIN_PASSWORD" \
        '{application:"app-built-in",organization:"built-in",username:$u,password:$p,autoSignin:true,type:"login"}')")" \
  || fail "login failed"
[[ "$(echo "$LOGIN_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "login rejected: $LOGIN_RESP"

# ─── 3. Create organization + application ────────────────────────────────
log "creating organization ${ORG_NAME}"
ORG_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/add-organization" \
  -d "$(jq -cn --arg n "$ORG_NAME" \
        '{owner:"admin",name:$n,displayName:$n,websiteUrl:"",passwordType:"plain"}')")" \
  || fail "add-organization failed"
[[ "$(echo "$ORG_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "add-organization rejected: $ORG_RESP"

teardown() {
  if [[ "$1" == "fail" && "$KEEP_ON_FAIL" == "1" ]]; then
    log "KEEP_ON_FAIL=1 — leaving org/app in place for inspection"
    return
  fi
  log "teardown: deleting biz app ${APP_ID} + organization ${ORG_NAME}"
  curl_admin -H 'Content-Type: application/json' \
    -X POST "${BASE_URL}/api/biz-delete-app-config" \
    -d "$(jq -cn --arg o "$ORG_NAME" --arg n "$APP_NAME" '{owner:$o,name:$n}')" \
    >/dev/null 2>&1 || true
  curl_admin -H 'Content-Type: application/json' \
    -X POST "${BASE_URL}/api/delete-organization" \
    -d "$(jq -cn --arg n "$ORG_NAME" '{owner:"admin",name:$n}')" \
    >/dev/null 2>&1 || true
}

on_err() {
  log "aborting; attempting teardown"
  teardown fail
  exit 1
}
trap on_err ERR

log "creating biz app ${APP_ID} (ModelType=rebac)"
BIZ_APP_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/biz-add-app-config" \
  -d "$(jq -cn --arg o "$ORG_NAME" --arg a "$APP_NAME" \
        '{owner:$o,appName:$a,displayName:"rebac smoke",description:"CP-8 smoke",modelType:"rebac",policyTable:("biz_"+$a+"_policy"),isEnabled:true}')")" \
  || fail "biz-add-app-config failed"
[[ "$(echo "$BIZ_APP_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "biz-add-app-config rejected: $BIZ_APP_RESP"

# ─── 4. Save schema ───────────────────────────────────────────────────────
log "saving authorization model"
SCHEMA='model
  schema 1.1

type user

type group
  relations
    define member: [user]

type folder
  relations
    define owner: [user]
    define viewer: [user, group#member]

type document
  relations
    define owner: [user]
    define viewer: [user, group#member] or owner'

SCHEMA_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/biz-write-authorization-model?appId=${APP_ID}" \
  -d "$(jq -cn --arg s "$SCHEMA" '{schemaDsl:$s}')")" \
  || fail "biz-write-authorization-model failed"
[[ "$(echo "$SCHEMA_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "schema save rejected: $SCHEMA_RESP"

# ─── 5. Write tuples ──────────────────────────────────────────────────────
log "writing tuples"
TUPLES_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/biz-write-tuples" \
  -d "$(jq -cn --arg a "$APP_ID" '{
    appId:$a,
    writes:[
      {object:"document:readme", relation:"owner",  user:"user:alice"},
      {object:"document:readme", relation:"viewer", user:"user:bob"},
      {object:"document:roadmap", relation:"viewer", user:"user:alice"}
    ]}')")" \
  || fail "biz-write-tuples failed"
[[ "$(echo "$TUPLES_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "tuple write rejected: $TUPLES_RESP"

# ─── 6. Enforce via dispatcher ────────────────────────────────────────────
log "POST /api/biz-enforce alice viewer document:readme (expect allowed)"
ENFORCE_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/biz-enforce?appId=${APP_ID}" \
  -d '["document:readme","viewer","user:alice"]')" \
  || fail "biz-enforce failed"
[[ "$(echo "$ENFORCE_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "biz-enforce rejected: $ENFORCE_RESP"
[[ "$(echo "$ENFORCE_RESP" | jq -r '.data // .data2')" == "true" ]] \
  || fail "biz-enforce: expected allowed=true, got: $ENFORCE_RESP"

# ─── 7. List-objects ──────────────────────────────────────────────────────
log "POST /api/biz-list-objects alice viewer document (expect ≥1 object)"
LIST_RESP="$(curl_admin \
  -H 'Content-Type: application/json' \
  -X POST "${BASE_URL}/api/biz-list-objects" \
  -d "$(jq -cn --arg a "$APP_ID" '{appId:$a,objectType:"document",relation:"viewer",user:"user:alice"}')")" \
  || fail "biz-list-objects failed"
[[ "$(echo "$LIST_RESP" | jq -r '.status')" == "ok" ]] \
  || fail "biz-list-objects rejected: $LIST_RESP"
OBJ_COUNT="$(echo "$LIST_RESP" | jq -r '(.data.objects // []) | length')"
[[ "$OBJ_COUNT" -ge 1 ]] \
  || fail "biz-list-objects: expected ≥1 object, got $OBJ_COUNT — resp: $LIST_RESP"

# ─── 8. Guidance error on Casbin-only endpoint ───────────────────────────
log "GET /api/biz-get-user-roles on ReBAC app (expect 400 + BIZ_API_NOT_SUPPORTED_IN_REBAC)"
# --fail-with-body returns non-zero but still prints body. Bypass set -e
# for this call so we can inspect both status and body.
set +e
ROLES_RESP="$(curl --silent --show-error --write-out 'HTTPSTATUS:%{http_code}' \
  --cookie-jar "$COOKIE_JAR" --cookie "$COOKIE_JAR" \
  "${BASE_URL}/api/biz-get-user-roles?appId=${APP_ID}&user=user:alice")"
set -e
ROLES_STATUS="${ROLES_RESP##*HTTPSTATUS:}"
ROLES_BODY="${ROLES_RESP%HTTPSTATUS:*}"
[[ "$ROLES_STATUS" == "400" ]] \
  || fail "guidance error: expected HTTP 400, got $ROLES_STATUS — body: $ROLES_BODY"
[[ "$(echo "$ROLES_BODY" | jq -r '.msg')" == "BIZ_API_NOT_SUPPORTED_IN_REBAC" ]] \
  || fail "guidance error: expected msg=BIZ_API_NOT_SUPPORTED_IN_REBAC, got: $ROLES_BODY"

# ─── 9. Teardown ──────────────────────────────────────────────────────────
trap - ERR
teardown ok
log "PASS: all CP-8 smoke assertions green"
exit 0
