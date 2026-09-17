---
name: qa-backend
description: >
  QA tests for the Shelvr Convex backend. Drives the public HTTP surface
  (GET /health, POST /waitlist/join, POST /webhooks/revenuecat) with curl:
  read-only health + negative auth flows against production, positive
  waitlist flows against the dev deployment with qa+ pattern emails. Use
  when a diff touches apps/native/convex/**.
---

# qa-backend — Convex HTTP Surface

**What this covers:** the public HTTP routes declared in
`apps/native/convex/http.ts`, plus the auth contract they enforce. All flows
run with `curl` + `jq`. Read URLs from `.factory/skills/qa/config.yaml`:

- production site: `https://amiable-setter-120.convex.site` — READ-ONLY
- development site: `https://amicable-antelope-639.convex.site`
- Never derive a site URL by guessing; both are in config.yaml.

**Environment rules (hard):**

- Production: health probe and negative auth tests ONLY. Never send a valid
  waitlist secret, never POST a webhook event with a valid bearer, never call
  any Convex function endpoint on production.
- Development: positive flows allowed, but waitlist emails MUST match
  `qa+<RUN_ID>@example.com`. Anything a run creates stays in dev (no delete
  endpoint exists; the user accepted this).

**Credential:** `QA_WAITLIST_SHARED_SECRET` (env var) holds the dev
deployment's `WAITLIST_SHARED_SECRET`. Provided as an env var for local runs
or a GitHub secret for CI. When unset, report the secret-gated flows as
BLOCKED ("QA_WAITLIST_SHARED_SECRET not provided") — the no-secret flows
below still run. NEVER attempt to read the secret from `convex env list`
(values print masked) or from the dashboard.

## Flow Menu

The orchestrator picks flows relevant to the diff. Pick by what changed:

### 1. health-probe — health endpoint answers correctly

Run on BOTH environments.

```bash
curl -sS -o body.json -w '%{http_code}' "<site>/health"; cat body.json
```

- PASS: status `200`, body `{"ok":true}`.
- FAIL: anything else (a `503` with `{"ok":false}` means the backing query
  failed — report FAIL with the body).
- Relevant when: `http.ts`, `health.ts`, or general deployment changes.

### 2. waitlist-unauthorized — missing or wrong shared secret rejected

Run on BOTH environments. No secret needed.

- POST `<site>/waitlist/join` with valid JSON
  `{"email":"qa+probe@example.com","product":"shelvr-android"}` and NO
  `x-waitlist-secret` header → `401` with `{"message":"Unauthorized."}`.
- Same POST with a wrong secret (`x-waitlist-secret: definitely-wrong`) →
  `401`.
- PASS: both `401`. A `500` ("Waitlist secret not configured") means the
  deployment lacks `WAITLIST_SHARED_SECRET` — report BLOCKED with that
  remediation, not FAIL.
- Relevant when: `http.ts`, `waitlist.ts`, or auth changes.

### 3. waitlist-validation — invalid input rejected (dev, needs secret)

Development ONLY. Requires `QA_WAITLIST_SHARED_SECRET`.

- POST with secret + `{"email":"not-an-email","product":"shelvr-android"}` →
  `400` with `{"message":"Enter a valid email address."}`.
- POST with secret + invalid JSON body (e.g. `not json`) → `400` with
  `{"message":"Invalid request."}`.
- POST with secret + `{"email":"qa+<RUN_ID>@example.com","product":"bogus"}` →
  `400` with `{"message":"Invalid request."}` (product whitelist).
- PASS: all three `400` with those bodies.

### 4. waitlist-valid-signup — a real signup persists (dev, needs secret)

Development ONLY.

- POST with secret +
  `{"email":"qa+<RUN_ID>@example.com","product":"shelvr-android","source":"hero"}`
  plus `x-shelvr-client-ip: 198.51.100.<n>` (TEST-NET-2, unique per run) →
  `200` with `{"saved":true,...}`. `emailProviderSynced` may be true or false
  depending on Resend config — do not assert it.
- Repeat the same POST (same email) → still `200`; the row is idempotent by
  email. Assert `saved` is true again.
- PASS: `200` + `saved:true` on both calls. Rows stay in dev by design.

### 5. waitlist-rate-limit — per-IP limiter trips (dev, needs secret)

Development ONLY.

- Send the same valid POST (fixed `x-shelvr-client-ip: 198.51.100.<n>`) in a
  loop, up to 20 attempts, capturing statuses, until one returns `429`
  `{"message":"Too many attempts."}`.
- PASS: `429` observed within the cap. If 20 attempts all return `200`,
  report INCONCLUSIVE (limiter threshold higher than the cap) — do not keep
  hammering past 20.
- Use a distinct IP per run so you do not poison later runs' limiter state.

### 6. revenuecat-unauthorized — webhook rejects unauthenticated posts

Run on BOTH environments. No secret needed.

- POST `<site>/webhooks/revenuecat` with a valid-JSON event body and NO
  Authorization header → `401`.
- Same with `Authorization: Bearer wrong-secret` → `401`.
- PASS: both `401`. A `500` ("Webhook secret not configured") → BLOCKED with
  remediation (`REVENUECAT_WEBHOOK_SECRET` missing on deployment).
- NEVER send a request with the real webhook secret; QA does not hold it and
  must never attempt a positive webhook delivery.

### 7. routing-negative — unknown paths and wrong methods

Run on BOTH environments. No secret needed.

- GET `<site>/health` is `200` (sanity), GET `<site>/waitlist/join` (a
  POST-only route) → `404` with `No matching routes found` (verified:
  Convex's httpRouter answers a wrong method with 404, not 405).
- GET `<site>/definitely-not-a-route` → `404` with the same body.
- PASS: both `404`.

## Per-flow evidence

For every flow, embed a trimmed fenced block per request:

```text
POST https://amicable-antelope-639.convex.site/waitlist/join (no secret)
→ 401
{"message":"Unauthorized."}
```

Label each block with the flow name and what it proves. Do not paste full
headers; never echo the shared secret into the report (replace with
`<secret set>`).

## Known Failure Modes

1. **`500` where `401` expected** — the deployment env var
   (`WAITLIST_SHARED_SECRET` / `REVENUECAT_WEBHOOK_SECRET`) is unset, so the
   route bails before the auth check. Report BLOCKED; remediation:
   `pnpm --filter native-app exec convex env set <NAME> <value>` on the dev
   deployment (or dashboard on prod).
2. **Masked `convex env list`** — secret values print as `***`; never try to
   source credentials from it.
3. **Transient CI network timeouts** — retry once after 5s before declaring
   FAIL.
4. **429 from earlier runs** — the per-IP waitlist limiter persists in dev.
   Always use a run-unique `x-shelvr-client-ip` (e.g. last octet from the
   RUN_ID); if a fresh IP still gets 429, report BLOCKED noting limiter
   state.
5. **Production URL guard** — `app.config.js` hard-rejects the production
   Convex URL in dev/preview builds; this is expected product behavior, not
   a QA blocker. Backend QA hits the site URLs directly, so it is unaffected.
