#!/usr/bin/env bash
#
# Deterministic backend QA for Shelvr — the subscription-free CI baseline.
#
# Runs the fixed curl flows from .factory/skills/qa-backend/SKILL.md against
# the Convex HTTP surface and writes a report in the qa REPORT-TEMPLATE.md
# format. No agent and no Factory subscription required.
#
#   Without QA_WAITLIST_SHARED_SECRET: read-only + negative auth flows only.
#   Zero data is created on either deployment; secret-gated flows report
#   BLOCKED.
#
#   With QA_WAITLIST_SHARED_SECRET (development only): valid waitlist signup
#   (idempotent), validation errors, and the email-keyed rate limit. Creates
#   at most two dev rows per run, both from qa+<run>@example.com addresses.
#
# Environment overrides: QA_PROD_SITE_URL, QA_DEV_SITE_URL, QA_RESULTS_DIR,
# QA_RATE_LIMIT_ATTEMPTS. Defaults mirror the site URLs in
# .factory/skills/qa/config.yaml (environments.*.site_url); update both
# together.
#
# Exit codes: 0 = no FAIL, 1 = at least one FAIL.

set -o pipefail

PROD_SITE="${QA_PROD_SITE_URL:-https://amiable-setter-120.convex.site}"
DEV_SITE="${QA_DEV_SITE_URL:-https://amicable-antelope-639.convex.site}"
SECRET="${QA_WAITLIST_SHARED_SECRET:-}"
OUT_DIR="${QA_RESULTS_DIR:-qa-results}"
RUN_ID="${GITHUB_RUN_ID:-local-$(date +%Y%m%d%H%M%S)}-$RANDOM"
RL_ATTEMPTS="${QA_RATE_LIMIT_ATTEMPTS:-5}"

# TEST-NET-2 documentation range. Unique-ish per run so limiter state left by
# an earlier run cannot poison this one.
CLIENT_IP="198.51.100.$((RANDOM % 254 + 1))"

mkdir -p "$OUT_DIR"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

STATUS=""
BODY=""
ROWS=()
EVIDENCE=""
FAILED_NAMES=""
FAILED=0
N=0

PASS=":white_check_mark: PASS"
FAIL=":x: FAIL"
BLOCK=":no_entry: BLOCKED"
INCONCLUSIVE=":grey_question: INCONCLUSIVE"

# http <url> [curl args...] — sets STATUS (000 on transport error) and BODY.
http() {
  local url="$1"
  shift
  local err_file
  err_file="$(mktemp)"
  if STATUS=$(curl -sS -m 20 -o "$BODY_FILE" -w '%{http_code}' "$@" "$url" 2>"$err_file"); then
    BODY="$(head -c 300 "$BODY_FILE" | tr -d '\n')"
  else
    STATUS="000"
    BODY="transport error: $(head -c 120 "$err_file" | tr -d '\n')"
  fi
  rm -f "$err_file"
}

body_has() {
  case "$BODY" in
    *"$1"*) return 0 ;;
    *) return 1 ;;
  esac
}

# record <result> <test case> <notes> <evidence line>
record() {
  N=$((N + 1))
  ROWS+=("| $N | $2 | backend | public_http | $1 | $3 |")
  EVIDENCE="$EVIDENCE
$4"
  if [ "$1" = "$FAIL" ]; then
    FAILED=1
    FAILED_NAMES="$FAILED_NAMES
- $2"
  fi
}

# check <desc> <url> <expected status> <expected body substring or -> [curl args...]
check() {
  local desc="$1" url="$2" want="$3" want_body="$4"
  shift 4
  http "$url" "$@"
  local result="$PASS" note="status $STATUS"
  if [ "$STATUS" = "000" ]; then
    result="$BLOCK"
    note="unreachable: $BODY"
  elif [ "$STATUS" != "$want" ]; then
    result="$FAIL"
    note="expected status $want, got $STATUS"
  elif [ "$want_body" != "-" ] && ! body_has "$want_body"; then
    result="$FAIL"
    note="expected body containing: $want_body"
  fi
  record "$result" "$desc" "$note" "- $desc -> $STATUS $BODY"
}

WAITLIST_JSON='{"email":"qa+probe@example.com","product":"shelvr-android"}'
WEBHOOK_JSON='{"type":"TEST"}'

# ---- Flows 1-2: health (both environments) ----
check "prod /health answers 200 ok" "$PROD_SITE/health" "200" '"ok":true'
check "dev /health answers 200 ok" "$DEV_SITE/health" "200" '"ok":true'

# ---- Flows 3-5: waitlist authentication ----
check "prod waitlist rejects missing secret" \
  "$PROD_SITE/waitlist/join" "401" "Unauthorized." \
  -X POST -H "content-type: application/json" -d "$WAITLIST_JSON"
check "dev waitlist rejects missing secret" \
  "$DEV_SITE/waitlist/join" "401" "Unauthorized." \
  -X POST -H "content-type: application/json" -d "$WAITLIST_JSON"
check "dev waitlist rejects wrong secret" \
  "$DEV_SITE/waitlist/join" "401" "Unauthorized." \
  -X POST -H "content-type: application/json" -H "x-waitlist-secret: definitely-wrong" -d "$WAITLIST_JSON"

# ---- Flows 6-7: RevenueCat webhook authentication ----
check "prod webhook rejects missing bearer" \
  "$PROD_SITE/webhooks/revenuecat" "401" "Unauthorized" \
  -X POST -H "content-type: application/json" -d "$WEBHOOK_JSON"
check "dev webhook rejects missing bearer" \
  "$DEV_SITE/webhooks/revenuecat" "401" "Unauthorized" \
  -X POST -H "content-type: application/json" -d "$WEBHOOK_JSON"

# ---- Flows 8-9: routing negatives (verified Convex httpRouter behavior) ----
check "dev waitlist rejects wrong method (GET)" \
  "$DEV_SITE/waitlist/join" "404" "No matching routes found"
check "dev unknown path 404s" \
  "$DEV_SITE/definitely-not-a-route" "404" "No matching routes found"

# ---- Secret-gated flows (development only) ----
if [ -z "$SECRET" ]; then
  record "$BLOCK" \
    "waitlist signup, validation, rate limit (dev)" \
    "QA_WAITLIST_SHARED_SECRET not provided" \
    "- secret-gated flows skipped; no data created on either deployment"
else
  EMAIL="qa+$RUN_ID@example.com"
  SIGNUP_BODY="{\"email\":\"$EMAIL\",\"product\":\"shelvr-android\",\"source\":\"hero\"}"

  check "dev waitlist accepts valid signup" \
    "$DEV_SITE/waitlist/join" "200" '"saved":true' \
    -X POST -H "content-type: application/json" \
    -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
    -d "$SIGNUP_BODY"

  check "dev waitlist signup is idempotent (repeat)" \
    "$DEV_SITE/waitlist/join" "200" '"saved":true' \
    -X POST -H "content-type: application/json" \
    -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
    -d "$SIGNUP_BODY"

  check "dev waitlist rejects invalid email" \
    "$DEV_SITE/waitlist/join" "400" "Enter a valid email address." \
    -X POST -H "content-type: application/json" \
    -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
    -d '{"email":"not-an-email","product":"shelvr-android"}'

  check "dev waitlist rejects invalid product" \
    "$DEV_SITE/waitlist/join" "400" "Invalid request." \
    -X POST -H "content-type: application/json" \
    -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
    -d '{"email":"qa+probe@example.com","product":"bogus"}'

  check "dev waitlist rejects non-JSON body" \
    "$DEV_SITE/waitlist/join" "400" "Invalid request." \
    -X POST -H "content-type: application/json" \
    -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
    -d 'not json'

  # Email-keyed limiter: capacity 3, 5/hour refill. A fresh run-unique email
  # deterministically trips 429 on the 4th request. One dev row is created.
  RL_EMAIL="qa+$RUN_ID-rl@example.com"
  rl_statuses=""
  rl_seen=""
  rl_attempt=0
  i=1
  while [ "$i" -le "$RL_ATTEMPTS" ]; do
    http "$DEV_SITE/waitlist/join" \
      -X POST -H "content-type: application/json" \
      -H "x-waitlist-secret: $SECRET" -H "x-shelvr-client-ip: $CLIENT_IP" \
      -d "{\"email\":\"$RL_EMAIL\",\"product\":\"shelvr-android\"}"
    rl_statuses="$rl_statuses [$i:$STATUS]"
    if [ "$STATUS" = "429" ]; then
      rl_seen="yes"
      rl_attempt=$i
      break
    fi
    i=$((i + 1))
  done
  if [ "$rl_seen" = "yes" ]; then
    record "$PASS" "dev waitlist rate limit trips on repeat" \
      "429 on attempt $rl_attempt (email-keyed bucket, capacity 3)" \
      "- rate limit attempts:$rl_statuses"
  else
    record "$INCONCLUSIVE" "dev waitlist rate limit" \
      "no 429 within $RL_ATTEMPTS attempts" \
      "- rate limit attempts:$rl_statuses"
  fi
fi

# ---- Report (same structure as .factory/skills/qa/REPORT-TEMPLATE.md) ----
REPORT="$OUT_DIR/report.md"
{
  echo "## QA Report"
  echo
  echo "| # | Test Case | App | Persona | Result | Notes |"
  echo "| --- | --------- | --- | ------- | ------ | ----- |"
  for row in "${ROWS[@]}"; do
    echo "$row"
  done
  echo
  echo "Result values: :white_check_mark: PASS, :x: FAIL, :no_entry: BLOCKED, :warning: FLAKY, :grey_question: INCONCLUSIVE"
  echo
  if [ "$FAILED" = "1" ]; then
    echo "### Action Required"
    echo
    echo "$FAILED_NAMES"
    echo
  fi
  echo "<details>"
  echo "<summary>Screenshots & Evidence</summary>"
  echo
  echo '```text'
  echo "run id: $RUN_ID"
  echo "production: $PROD_SITE"
  echo "development: $DEV_SITE"
  echo
  echo "$EVIDENCE"
  echo '```'
  echo
  echo "</details>"
} > "$REPORT"

cat "$REPORT"
echo
echo "report written to $REPORT"

if [ "$FAILED" = "1" ]; then
  exit 1
fi
exit 0
