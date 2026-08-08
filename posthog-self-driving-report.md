# PostHog Self-driving Setup Report

**Project:** Shelvr (PostHog project 546847)
**Date:** 2026-08-07
**Inbox:** https://us.posthog.com/project/546847/inbox

## Summary

PostHog Self-driving is now configured for Shelvr. GitHub is connected, 6 native signal sources are enabled (health checks, error tracking, session replay, support), GitHub Issues is syncing, and 7 scouts are active (4 canonical + 3 custom). Findings should start appearing in the [Self-driving inbox](https://us.posthog.com/project/546847/inbox) within ~30 minutes.

---

## AI Data Processing

**Status:** Approved — organization-level AI data processing consent was granted before this run.

---

## GitHub

**Status:** Connected during this run
**Integration ID:** 204942
**Account:** ashish921998

GitHub gives Self-driving code access to research findings and open fix PRs.

---

## Products Enabled

The `products-enable` MCP tool was not available on this deploy. The products were not flipped server-side. Since this is a **mobile app** (posthog-react-native), the server flip is inert anyway until the SDK is configured in code — see Follow-ups.

| Product | Status | Notes |
|---|---|---|
| Session Replay | Enabled (inert) | Server flip deferred — see F1. Mobile SDK needs `sessionReplay` config — see F4. |
| Error Tracking | Enabled (inert) | SDK already configures `errorTracking.autocapture`. Server flip deferred — see F2. |
| Support / Conversations | Enabled (inert) | Server flip deferred — see F3. Tickets need an inbound channel — see F5. |

---

## Signal Sources

| source_product | source_type | Action |
|---|---|---|
| `signals_scout` | `cross_source_issue` | Skipped — on by default, no row needed |
| `health_checks` | `health_issue` | **Enabled** |
| `error_tracking` | `issue_created` | **Enabled** |
| `error_tracking` | `issue_reopened` | **Enabled** |
| `error_tracking` | `issue_spiking` | **Enabled** |
| `session_replay` | `session_analysis_cluster` | **Enabled** (server sample rate: 0.1) |
| `conversations` | `ticket` | **Enabled** (dormant until a support channel is connected — see F5) |

---

## Connected Tools

| Tool | Status |
|---|---|
| GitHub Issues | **Connected by this setup** — source id `019fdc2a-38d4-0000-736c-30e24351d9ca`, first sync started. Only the `issues` table is syncing; enable additional tables (PRs, etc.) in the Data Warehouse UI if needed. |

All other connected-tool sources (Linear, Jira, Sentry, Zendesk, etc.) were not selected and are not used.

---

## Scout Troop

**Run budget:** 100 runs/day (early access default, confirmed via `scout-metadata-get`). 0 runs used today.
**Banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled scouts (7)

| Scout | Type | Reason enabled |
|---|---|---|
| `signals-scout-general` | Canonical | Always on — cross-product correlations and uncovered surfaces |
| `signals-scout-product-analytics` | Canonical | Core surface: 16+ custom events, the product's primary analytics surface |
| `signals-scout-revenue-analytics` | Canonical | RevenueCat (`react-native-purchases`) in use for subscriptions |
| `signals-scout-observability-gaps` | Canonical | Useful for a growing project to catch events with no insight coverage |
| `signals-scout-onboarding-funnel` | **Custom** | See Custom Scouts section |
| `signals-scout-suggestion-quality` | **Custom** | See Custom Scouts section |
| `signals-scout-item-deletion-rate` | **Custom** | See Custom Scouts section |

### Disabled scouts (23)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | **Covered by native source** — error_tracking signal source handles this |
| `signals-scout-session-replay` | **Covered by native source** — session_replay signal source handles this |
| `signals-scout-web-analytics` | Not used — mobile app, no web analytics surface |
| `signals-scout-web-vitals` | Not used — mobile app, no Core Web Vitals |
| `signals-scout-feature-flags` | Not used — no feature flag usage found in codebase |
| `signals-scout-surveys` | Not used — no PostHog surveys in use |
| `signals-scout-ai-observability` | Not used — AI/LLM is a backend-only Convex action with no `$ai_*` events |
| `signals-scout-logs` | Not used — PostHog logs product not in use |
| `signals-scout-csp-violations` | Not used — no CSP reporting configured |
| `signals-scout-experiments` | Not used — no active A/B experiments |
| `signals-scout-customer-analytics` | Not used — no group/accounts analytics |
| `signals-scout-data-pipelines` | Not used — no CDP destinations or batch exports |
| `signals-scout-replay-vision` | Disabled — newly created Replay Vision scanners need observation history before trends can be analyzed; re-enable once recordings accumulate |
| `signals-scout-anomaly-detection` | Not picked — fresh project with insufficient history for anomaly baselines |
| `signals-scout-health-checks` | Not picked — native `health_checks` source already surfaces health issues |
| `signals-scout-inbox-validation` | Not picked — fresh setup with no shipped fixes to validate yet |
| `signals-scout-conversations` | Not picked — no support volume yet |
| `signals-scout-apm` | Not used — no OpenTelemetry/APM data |
| `signals-scout-data-warehouse` | Not used — only GitHub Issues is connected |
| `signals-scout-mcp-tool-calls` | Not applicable |
| `signals-scout-skills-store` | Not applicable |
| `signals-scout-tasks` | Not applicable |
| `signals-scout-insight-alerts` | Not applicable — no alerts configured |

---

## Custom Scouts

Three custom scouts were proposed and approved. To switch any to dry-run (runs but writes nothing to inbox), set `emit: false` on its config in PostHog.

### 1. `signals-scout-onboarding-funnel`

**Watches:** The `onboarding_completed` → first save conversion rate within 7 days (`article_saved`, `note_saved`, `images_saved`, `photo_captured`, `shared_content_saved`).

**Discriminator:** Drops >15 percentage points below the 4-week trailing average, or the first time the rate falls below 40% in 4 weeks, trigger investigation.

**Why no built-in covers it:** `signals-scout-product-analytics` watches saved PostHog funnel insights — but no funnels exist yet on this fresh project. Once a funnel insight is saved, that scout will cover this flow too and this custom scout can be disabled.

### 2. `signals-scout-suggestion-quality`

**Watches:** The acceptance vs dismissal ratio of AI space suggestions (`suggestion_accepted` / `suggestion_dismissed`), week over week.

**Discriminator:** Acceptance rate drops >10pp below the 4-week baseline, or falls below 50% for the first time in 4 weeks.

**Why no built-in covers it:** This is domain-specific to Shelvr's AI suggestion loop. No canonical scout watches this event pair or their ratio.

### 3. `signals-scout-item-deletion-rate`

**Watches:** `item_deleted` as a share of total saves per week. Flags rate spikes, especially when deletions cluster within 30 minutes of a save — a strong signal of AI classification mismatch.

**Discriminator:** Deletion rate >30% above the 4-week baseline AND ≥5 deletions in the window. Fast deletes (median under 30 min) escalate priority.

**Why no built-in covers it:** `signals-scout-observability-gaps` would flag that `item_deleted` has no insight coverage and recommend creating one. That's different — this scout watches for ratio *regressions* specifically.

**Surfaces considered and ruled out:**
- **AI classification pipeline**: no PostHog events for backend Convex classification success/failure — not watchable without adding explicit events.
- **Sharing/virality** (`item_shared`, `item_link_copied`): no clear funnel with a pass/fail signal; `signals-scout-observability-gaps` will catch the coverage gap.

---

## Replay Vision Scanners

Replay Vision scanners are LLMs that watch individual session recordings on a schedule and push findings to the Self-driving inbox. Each observation costs credits (15 credits/observation at gemini-3.6-flash). Findings arrive at half weight and need corroboration before being promoted into a full inbox report.

**Note:** This project has no session recordings yet. The scanners are armed and will start working as soon as recordings begin. Mobile session replay requires SDK configuration (see F4).

| Scanner | Status | Query | Sampling | Est. monthly credits |
|---|---|---|---|---|
| Broken experiences | **Created** (id: `019fdc35-b1f5-7deb-a93a-235d8e25093f`) | `$current_url icontains /add` — the save/add flow, where a broken classification or failed save costs the most | 0.5 | 0 (no recordings) |
| User frustration | **Created** (id: `019fdc35-c220-7745-adf0-9aca4a5fba38`) | Sessions with `$rageclick` events — disjoint from scanner 1 to prevent self-corroboration | 1.0 | 0 (no recordings) |

Org quota: 7,500 credits remaining this period (7,500 total, 0 used).

---

## Follow-ups

- [ ] **F1 — Enable Session Replay in PostHog:** Settings → Session replay → "Record user sessions"
- [ ] **F2 — Enable Error Tracking in PostHog:** Settings → Error tracking → "Enable exception autocapture"
- [ ] **F3 — Enable Support/Conversations in PostHog:** Click Support in the PostHog product sidebar
- [ ] **F4 — Configure mobile session replay in SDK:** Add `sessionReplay` options to the PostHog init in `apps/native/src/lib/posthog.ts` (see [posthog-react-native session replay docs](https://posthog.com/docs/session-replay/mobile))
- [ ] **F5 — Connect a support inbound channel:** PostHog Support → connect email, Slack, or another channel so that tickets begin reaching the inbox (the Conversations responder is enabled and dormant until this is done)
- [ ] **F6 — GitHub Issues table coverage:** Only `issues` is syncing. Enable additional tables (PRs, comments, etc.) in PostHog → Data Warehouse if needed
- [ ] **F7 — Re-enable `signals-scout-replay-vision` once recordings accumulate:** This analyst scout reads trends across Replay Vision observations — it's useful once the scanners above have run for a week or more

---

## What Happens Next

The scout coordinator picks up fresh configs within ~30 minutes. Each enabled scout draws one run from the project's daily budget (100 runs/day). Findings cluster into inbox reports — immediately-actionable ones can start coding tasks automatically. Check the inbox at: https://us.posthog.com/project/546847/inbox
