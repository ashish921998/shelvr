-- Synthetic validation for trial-baselines.sql. Runs read-only against
-- PostHog's SQL engine: every source CTE below is literal rows, no events are
-- read or written, and nothing here says anything about production.
--
-- Each statement keeps the transform block of its production twin byte for
-- byte (the `-- transform:begin <q>` ... `-- transform:end <q>` region) and
-- replaces only the source CTEs and the final SELECT. The source rows carry
-- the raw environment, analytics_version, store_environment and id columns,
-- so the shared filter at the top of each transform block is exercised too:
-- rows tagged development or sandbox, with analytics_version 0, or with an
-- empty required id must not appear in the output. The final SELECT lists
-- one row per synthetic case instead of aggregating, so each expected
-- outcome in trial-baselines.md can be checked by eye. Run the drift check
-- there after editing either file.
--
-- Time offsets are seconds before now(). 86400 = 1 day, 172800 = 2 days,
-- 864000 = 10 days, 1728000 = 20 days. Case ids double as account or person
-- ids.

-- ============================================================================
-- Query 1 validation: pre-trial progression, one row per synthetic person
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- source:begin q1 (synthetic)
onboarding_rows AS (
    SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179800 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179700 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'onboarding_demo_picked' AS event, now() - INTERVAL 179600 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 1 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'anon-full' AS distinct_id, 'auth_succeeded' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179490 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'onboarding_demo_result' AS event, now() - INTERVAL 179400 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, 'ready' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179300 SECOND AS timestamp, 'notifications' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179200 SECOND AS timestamp, 'share_practice' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'onboarding_completed' AS event, now() - INTERVAL 179100 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_full' AS person_id, 'acct-full' AS distinct_id, 'paywall_presentation_started' AS event, now() - INTERVAL 179090 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, 'onboarding' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dropped_setup' AS person_id, 'anon-dropped' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dropped_setup' AS person_id, 'anon-dropped' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dropped_setup' AS person_id, 'anon-dropped' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179800 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_anon_demo' AS person_id, 'anon-demo' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_anon_demo' AS person_id, 'anon-demo' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_anon_demo' AS person_id, 'anon-demo' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179800 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_anon_demo' AS person_id, 'anon-demo' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179700 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_anon_demo' AS person_id, 'anon-demo' AS distinct_id, 'onboarding_demo_picked' AS event, now() - INTERVAL 179600 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 1 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'anon-returning' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'anon-returning' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179700 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'anon-returning' AS distinct_id, 'onboarding_demo_picked' AS event, now() - INTERVAL 179600 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'acct-returning' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'acct-returning' AS distinct_id, 'onboarding_demo_result' AS event, now() - INTERVAL 179400 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, 'ready' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'acct-returning' AS distinct_id, 'onboarding_completed' AS event, now() - INTERVAL 179100 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_returning' AS person_id, 'acct-returning' AS distinct_id, 'paywall_presentation_started' AS event, now() - INTERVAL 179090 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, 'onboarding' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal' AS person_id, 'anon-internal' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal' AS person_id, 'acct-internal' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal' AS person_id, 'acct-internal' AS distinct_id, 'paywall_presentation_started' AS event, now() - INTERVAL 179090 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, 'onboarding' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_two_accounts' AS person_id, 'anon-two' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_two_accounts' AS person_id, 'acct-two-a' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_two_accounts' AS person_id, 'acct-two-b' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 100000 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_immature' AS person_id, 'anon-immature' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 3600 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_immature' AS person_id, 'anon-immature' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 3000 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_demo_failed' AS person_id, 'anon-failed' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_demo_failed' AS person_id, 'anon-failed' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179700 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_demo_failed' AS person_id, 'anon-failed' AS distinct_id, 'onboarding_demo_picked' AS event, now() - INTERVAL 179600 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_demo_failed' AS person_id, 'acct-failed' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_demo_failed' AS person_id, 'acct-failed' AS distinct_id, 'onboarding_demo_result' AS event, now() - INTERVAL 179400 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, 'failed' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_old_flow' AS person_id, 'anon-old' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 4 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_old_flow' AS person_id, 'anon-old' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179800 SECOND AS timestamp, 'setup' AS step_id, 4 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_other_placement' AS person_id, 'anon-other' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_other_placement' AS person_id, 'acct-other' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_other_placement' AS person_id, 'acct-other' AS distinct_id, 'paywall_presentation_started' AS event, now() - INTERVAL 100000 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, 'add' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_no_opener' AS person_id, 'anon-noopener' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'anon-replay' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 500000 SECOND AS timestamp, 'opener' AS step_id, 6 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'anon-replay' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 499000 SECOND AS timestamp, 'interests' AS step_id, 6 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'anon-replay' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'anon-replay' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179800 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'anon-replay' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179700 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_replay_later' AS person_id, 'acct-replay' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_late_step' AS person_id, 'anon-late' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_late_step' AS person_id, 'anon-late' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 93600 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_late_step' AS person_id, 'anon-late' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 93599 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dev_account' AS person_id, 'anon-devacct' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dev_account' AS person_id, 'acct-devcreated' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 179500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dev_env' AS person_id, 'anon-devenv' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_dev_env' AS person_id, 'anon-devenv' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_version_0' AS person_id, 'anon-v0' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 0 AS analytics_version
    UNION ALL SELECT 'p_mixed_env' AS person_id, 'anon-mixed' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_mixed_env' AS person_id, 'anon-mixed' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'anon-sameday' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'opener' AS step_id, 6 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'anon-sameday' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'interests' AS step_id, 6 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'anon-sameday' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'anon-sameday' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'setup' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'anon-sameday' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 172600 SECOND AS timestamp, 'live_demo' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'acct-sameday' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 172500 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'acct-sameday' AS distinct_id, 'onboarding_completed' AS event, now() - INTERVAL 172400 SECOND AS timestamp, '' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_same_day_replay' AS person_id, 'acct-sameday' AS distinct_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172390 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, 'onboarding' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal_late_auth' AS person_id, 'anon-lateinternal' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 300000 SECOND AS timestamp, 'opener' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal_late_auth' AS person_id, 'anon-lateinternal' AS distinct_id, 'onboarding_step_viewed' AS event, now() - INTERVAL 299900 SECOND AS timestamp, 'interests' AS step_id, 7 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'p_internal_late_auth' AS person_id, 'acct-internal' AS distinct_id, 'auth_completed' AS event, now() - INTERVAL 100000 SECOND AS timestamp, '' AS step_id, 0 AS flow_version, 0 AS sample, '' AS outcome, '' AS placement, 'production' AS environment, 1 AS analytics_version
),
account_rows AS (
    SELECT 'acct-full' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-two-a' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-two-b' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-failed' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-other' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-orphan' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-replay' AS account_id, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-devcreated' AS account_id, 'development' AS environment, 1 AS analytics_version
),
-- source:end q1 (synthetic)
-- transform:begin q1
onboarding_events AS (
    SELECT person_id, distinct_id, event, timestamp, step_id, flow_version, sample, outcome, placement
    FROM onboarding_rows
    WHERE environment = 'production'
      AND analytics_version = 1
),
created_accounts AS (
    SELECT account_id
    FROM account_rows
    WHERE environment = 'production'
      AND analytics_version = 1
    GROUP BY account_id
),
openers AS (
    SELECT
        person_id,
        minIf(timestamp, event = 'onboarding_step_viewed' AND step_id = 'opener') AS opened_at,
        argMinIf(flow_version, timestamp, event = 'onboarding_step_viewed' AND step_id = 'opener') AS first_flow_version,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'opener') AS opener_views,
        arraySort(groupArrayIf(timestamp, event = 'onboarding_step_viewed' AND step_id = 'opener')) AS opener_times
    FROM onboarding_events
    GROUP BY person_id
    HAVING opener_views > 0
),
person_internal AS (
    SELECT
        person_id,
        max(distinct_id IN (SELECT account_id FROM internal_accounts)) AS any_internal
    FROM onboarding_events
    WHERE event = 'auth_completed'
    GROUP BY person_id
),
windowed AS (
    SELECT
        e.person_id AS person_id,
        e.distinct_id AS distinct_id,
        e.event AS event,
        e.timestamp AS timestamp,
        e.step_id AS step_id,
        e.sample AS sample,
        e.outcome AS outcome,
        e.placement AS placement
    FROM onboarding_events AS e
    INNER JOIN openers AS o ON o.person_id = e.person_id
    WHERE e.timestamp >= o.opened_at
      AND e.timestamp <= o.opened_at + INTERVAL 1 DAY
      AND (length(o.opener_times) < 2 OR e.timestamp < arrayElement(o.opener_times, 2))
),
person_accounts AS (
    SELECT
        person_id,
        distinct_id AS account_id,
        max(distinct_id IN (SELECT account_id FROM created_accounts)) AS is_new_account
    FROM windowed
    WHERE event = 'auth_completed'
    GROUP BY person_id, distinct_id
),
accounts_by_person AS (
    SELECT
        person_id,
        count() AS account_count,
        countIf(is_new_account) AS new_accounts
    FROM person_accounts
    GROUP BY person_id
),
per_person AS (
    SELECT
        person_id,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'interests') > 0 AS reached_interests,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'setup') > 0 AS reached_setup,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'live_demo') > 0 AS reached_demo,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'notifications') > 0 AS reached_notifications,
        countIf(event = 'onboarding_step_viewed' AND step_id = 'share_practice') > 0 AS reached_share,
        countIf(event = 'onboarding_demo_picked') > 0 AS demo_picked,
        countIf(event = 'onboarding_demo_picked' AND sample) > 0 AS sample_picked,
        countIf(event = 'onboarding_demo_result' AND outcome = 'ready') > 0 AS demo_ready,
        countIf(event = 'auth_succeeded') > 0 AS auth_succeeded,
        countIf(event = 'onboarding_completed') > 0 AS completed,
        countIf(event = 'paywall_presentation_started' AND placement = 'onboarding') AS onboarding_paywall_attempts
    FROM windowed
    GROUP BY person_id
),
cohort AS (
    SELECT
        o.person_id AS person_id,
        o.first_flow_version AS flow_version,
        o.opener_views AS opener_views,
        o.opened_at <= now() - INTERVAL 1 DAY AS mature,
        p.reached_interests AS reached_interests,
        p.reached_setup AS reached_setup,
        p.reached_demo AS reached_demo,
        p.reached_notifications AS reached_notifications,
        p.reached_share AS reached_share,
        p.demo_picked AS demo_picked,
        p.sample_picked AS sample_picked,
        p.demo_ready AS demo_ready,
        p.auth_succeeded OR coalesce(a.account_count, 0) > 0 AS signed_in,
        p.completed AS completed,
        p.onboarding_paywall_attempts > 0 AS paywall_attempted,
        p.onboarding_paywall_attempts AS onboarding_paywall_attempts,
        coalesce(a.account_count, 0) AS account_count,
        coalesce(i.any_internal, 0) AS is_internal,
        coalesce(a.new_accounts, 0) AS new_accounts
    FROM openers AS o
    INNER JOIN per_person AS p ON p.person_id = o.person_id
    LEFT JOIN accounts_by_person AS a ON a.person_id = o.person_id
    LEFT JOIN person_internal AS i ON i.person_id = o.person_id
)
-- transform:end q1
SELECT
    person_id AS case_id,
    flow_version,
    opener_views,
    mature,
    reached_interests,
    reached_setup,
    reached_demo,
    demo_picked,
    sample_picked,
    demo_ready,
    signed_in,
    new_accounts,
    account_count,
    is_internal,
    reached_notifications,
    reached_share,
    completed,
    paywall_attempted
FROM cohort
ORDER BY case_id

-- ============================================================================
-- Query 2a validation: paywall attempts, one row per synthetic attempt
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- source:begin q2a (synthetic)
attempt_rows AS (
    SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172740 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172740 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_failed' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_failed' AS event, now() - INTERVAL 172790 SECOND AS timestamp, 'att_failed' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_restored' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-u' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_unresolved_mature' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-v' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 3600 SECOND AS timestamp, 'att_unresolved_recent' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-c' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_unresolved_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172799 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172600 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_internal' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_internal' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'att_repeat_1' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'att_repeat_1' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 190000 SECOND AS timestamp, 'att_f_far_unresolved' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_f_near_purchase' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_f_near_purchase' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 260000 SECOND AS timestamp, 'att_g_outside_window' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 259900 SECOND AS timestamp, 'att_g_outside_window' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-o' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_orphan_outcome' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-o' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_orphan_outcome' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_dev_env' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_dev_env' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-v0' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_version_0' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 0 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, '' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_sandbox_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_sandbox_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_noid_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_noid_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
),
trial_rows AS (
    SELECT 'acct-b' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-b' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-b' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-c' AS account_id, now() - INTERVAL 171000 SECOND AS trial_at, 'rc-trial-c' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, now() - INTERVAL 172500 SECOND AS trial_at, 'rc-trial-e' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, now() - INTERVAL 172500 SECOND AS trial_at, 'rc-trial-f' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-g' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-h' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-h' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-i' AS account_id, now() - INTERVAL 2000000 SECOND AS trial_at, 'rc-trial-i1' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-i' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-i2' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-internal' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-sandbox' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'sandbox' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, '' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-dev' AS event_id, 'annual_1999' AS product_id, 'development' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-x' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-v0' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 0 AS analytics_version
),
-- source:end q2a (synthetic)
-- transform:begin q2a
attempt_events AS (
    SELECT account_id, event, timestamp, attempt_id, placement, offering_id, trial_eligible
    FROM attempt_rows
    WHERE environment = 'production'
      AND analytics_version = 1
      AND notEmpty(attempt_id)
),
trial_events AS (
    SELECT account_id, trial_at, event_id, product_id
    FROM trial_rows
    WHERE environment = 'production'
      AND store_environment != 'sandbox'
      AND analytics_version = 1
      AND notEmpty(event_id)
),
attempts AS (
    SELECT
        attempt_id,
        argMin(account_id, timestamp) AS account,
        argMinIf(placement, timestamp, event = 'paywall_presentation_started') AS started_placement,
        argMinIf(offering_id, timestamp, event = 'paywall_presentation_started') AS started_offering_id,
        argMinIf(trial_eligible, timestamp, event = 'paywall_presentation_started') AS started_trial_eligible,
        minIf(timestamp, event = 'paywall_presentation_started') AS started_at,
        countIf(event = 'paywall_presentation_started') AS presentation_events,
        countIf(event = 'paywall_shown') > 0 AS shown_confirmed,
        arraySort(x -> x.1, groupArrayIf(tuple(timestamp, event),
            event IN ('paywall_cancelled', 'paywall_failed', 'paywall_purchase_completed', 'paywall_restored'))) AS outcome_events
    FROM attempt_events
    GROUP BY attempt_id
),
attempt_outcomes AS (
    SELECT
        attempt_id,
        account AS account_id,
        started_placement AS placement,
        started_offering_id AS offering_id,
        started_trial_eligible AS trial_eligible,
        started_at,
        presentation_events,
        shown_confirmed,
        multiIf(
            length(outcome_events) = 0, 'unresolved',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_cancelled', 'cancelled',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_failed', 'failed',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_purchase_completed', 'purchase_completed',
            'restored') AS outcome,
        length(outcome_events) AS outcome_event_count,
        started_at <= now() - INTERVAL 1 DAY AS mature,
        account IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM attempts
),
trials AS (
    SELECT
        event_id,
        argMin(account_id, trial_at) AS account,
        min(trial_at) AS trial_started_at,
        argMin(product_id, trial_at) AS product,
        count() AS deliveries
    FROM trial_events
    GROUP BY event_id
),
trials_per_account AS (
    SELECT account, count() AS account_trial_count, min(trial_started_at) AS first_trial_at
    FROM trials
    GROUP BY account
),
trial_candidates AS (
    SELECT
        t.event_id AS trial_event_id,
        a.attempt_id AS attempt_id,
        if(a.outcome = 'purchase_completed', 'purchase_completed_attempt', 'unresolved_attempt') AS attribution,
        if(a.outcome = 'purchase_completed', 0, 1) AS priority,
        abs(dateDiff('second', a.started_at, t.trial_started_at)) AS distance_seconds
    FROM trials AS t
    INNER JOIN attempt_outcomes AS a ON a.account_id = t.account
    WHERE a.presentation_events > 0
      AND a.outcome IN ('purchase_completed', 'unresolved')
      AND a.started_at >= t.trial_started_at - INTERVAL 6 HOUR
      AND a.started_at <= t.trial_started_at + INTERVAL 6 HOUR
),
trial_attribution AS (
    SELECT
        trial_event_id,
        argMin(attempt_id, tuple(priority, distance_seconds)) AS matched_attempt_id,
        argMin(attribution, tuple(priority, distance_seconds)) AS matched_attribution,
        count() AS candidate_attempts
    FROM trial_candidates
    GROUP BY trial_event_id
),
attempt_attribution AS (
    SELECT matched_attempt_id, any(matched_attribution) AS trial_attribution, count() AS trials_attributed
    FROM trial_attribution
    GROUP BY matched_attempt_id
),
attempt_report AS (
    SELECT
        o.attempt_id AS attempt_id,
        o.account_id AS account_id,
        o.placement AS placement,
        o.offering_id AS offering_id,
        o.trial_eligible AS trial_eligible,
        o.started_at AS started_at,
        o.presentation_events AS presentation_events,
        o.shown_confirmed AS shown_confirmed,
        o.outcome AS outcome,
        o.outcome_event_count AS outcome_event_count,
        o.mature AS mature,
        o.is_internal AS is_internal,
        coalesce(x.trial_attribution, '') AS trial_attribution,
        coalesce(x.trials_attributed, 0) AS trials_attributed
    FROM attempt_outcomes AS o
    LEFT JOIN attempt_attribution AS x ON x.matched_attempt_id = o.attempt_id
),
trial_report AS (
    SELECT
        t.event_id AS trial_event_id,
        t.account AS account_id,
        t.trial_started_at AS trial_at,
        t.product AS product_id,
        t.deliveries AS deliveries,
        coalesce(x.matched_attempt_id, '') AS attempt_id,
        if(empty(coalesce(x.matched_attribution, '')), 'unmatched', x.matched_attribution) AS attribution,
        coalesce(x.candidate_attempts, 0) AS candidate_attempts,
        c.account_trial_count AS account_trial_count,
        t.trial_started_at = c.first_trial_at AS is_first_trial,
        t.account IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM trials AS t
    LEFT JOIN trial_attribution AS x ON x.trial_event_id = t.event_id
    INNER JOIN trials_per_account AS c ON c.account = t.account
)
-- transform:end q2a
SELECT
    attempt_id AS case_id,
    placement,
    presentation_events,
    shown_confirmed,
    outcome,
    outcome_event_count,
    mature,
    is_internal,
    trial_attribution,
    trials_attributed
FROM attempt_report
ORDER BY case_id

-- ============================================================================
-- Query 2b validation: confirmed trials, one row per synthetic trial event
-- Same synthetic sources as 2a.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- source:begin q2b (synthetic)
attempt_rows AS (
    SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172740 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172740 SECOND AS timestamp, 'att_cancelled' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_failed' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_failed' AS event, now() - INTERVAL 172790 SECOND AS timestamp, 'att_failed' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-m' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_purchase_no_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-r' AS account_id, 'paywall_restored' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_restored' AS attempt_id, 'profile' AS placement, 'default' AS offering_id, 'ineligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-u' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_unresolved_mature' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-v' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 3600 SECOND AS timestamp, 'att_unresolved_recent' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-c' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_unresolved_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172799 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d1' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_dup_presentation' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-d2' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172600 SECOND AS timestamp, 'att_two_outcomes' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_internal' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_internal' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 180000 SECOND AS timestamp, 'att_repeat_1' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 179900 SECOND AS timestamp, 'att_repeat_1' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_repeat_2' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 190000 SECOND AS timestamp, 'att_f_far_unresolved' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_f_near_purchase' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_f_near_purchase' AS attempt_id, 'add' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 260000 SECOND AS timestamp, 'att_g_outside_window' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 259900 SECOND AS timestamp, 'att_g_outside_window' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-o' AS account_id, 'paywall_shown' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_orphan_outcome' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-o' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_orphan_outcome' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_dev_env' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, 'paywall_cancelled' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_dev_env' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'development' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-v0' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_version_0' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 0 AS analytics_version
    UNION ALL SELECT 'acct-a' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, '' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_sandbox_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_sandbox_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, 'paywall_presentation_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'att_noid_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, 'paywall_purchase_completed' AS event, now() - INTERVAL 172700 SECOND AS timestamp, 'att_noid_trial' AS attempt_id, 'onboarding' AS placement, 'default' AS offering_id, 'eligible' AS trial_eligible, 'production' AS environment, 1 AS analytics_version
),
trial_rows AS (
    SELECT 'acct-b' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-b' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-b' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-b' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-c' AS account_id, now() - INTERVAL 171000 SECOND AS trial_at, 'rc-trial-c' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-e' AS account_id, now() - INTERVAL 172500 SECOND AS trial_at, 'rc-trial-e' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-f' AS account_id, now() - INTERVAL 172500 SECOND AS trial_at, 'rc-trial-f' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-g' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-g' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-h' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-h' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-i' AS account_id, now() - INTERVAL 2000000 SECOND AS trial_at, 'rc-trial-i1' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-i' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-i2' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-internal' AS account_id, now() - INTERVAL 172800 SECOND AS trial_at, 'rc-trial-internal' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-s' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-sandbox' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'sandbox' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-n' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, '' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-dev' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-dev' AS event_id, 'annual_1999' AS product_id, 'development' AS environment, 'production' AS store_environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-x' AS account_id, now() - INTERVAL 172600 SECOND AS trial_at, 'rc-trial-v0' AS event_id, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 0 AS analytics_version
),
-- source:end q2b (synthetic)
-- transform:begin q2b
attempt_events AS (
    SELECT account_id, event, timestamp, attempt_id, placement, offering_id, trial_eligible
    FROM attempt_rows
    WHERE environment = 'production'
      AND analytics_version = 1
      AND notEmpty(attempt_id)
),
trial_events AS (
    SELECT account_id, trial_at, event_id, product_id
    FROM trial_rows
    WHERE environment = 'production'
      AND store_environment != 'sandbox'
      AND analytics_version = 1
      AND notEmpty(event_id)
),
attempts AS (
    SELECT
        attempt_id,
        argMin(account_id, timestamp) AS account,
        argMinIf(placement, timestamp, event = 'paywall_presentation_started') AS started_placement,
        argMinIf(offering_id, timestamp, event = 'paywall_presentation_started') AS started_offering_id,
        argMinIf(trial_eligible, timestamp, event = 'paywall_presentation_started') AS started_trial_eligible,
        minIf(timestamp, event = 'paywall_presentation_started') AS started_at,
        countIf(event = 'paywall_presentation_started') AS presentation_events,
        countIf(event = 'paywall_shown') > 0 AS shown_confirmed,
        arraySort(x -> x.1, groupArrayIf(tuple(timestamp, event),
            event IN ('paywall_cancelled', 'paywall_failed', 'paywall_purchase_completed', 'paywall_restored'))) AS outcome_events
    FROM attempt_events
    GROUP BY attempt_id
),
attempt_outcomes AS (
    SELECT
        attempt_id,
        account AS account_id,
        started_placement AS placement,
        started_offering_id AS offering_id,
        started_trial_eligible AS trial_eligible,
        started_at,
        presentation_events,
        shown_confirmed,
        multiIf(
            length(outcome_events) = 0, 'unresolved',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_cancelled', 'cancelled',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_failed', 'failed',
            tupleElement(arrayElement(outcome_events, 1), 2) = 'paywall_purchase_completed', 'purchase_completed',
            'restored') AS outcome,
        length(outcome_events) AS outcome_event_count,
        started_at <= now() - INTERVAL 1 DAY AS mature,
        account IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM attempts
),
trials AS (
    SELECT
        event_id,
        argMin(account_id, trial_at) AS account,
        min(trial_at) AS trial_started_at,
        argMin(product_id, trial_at) AS product,
        count() AS deliveries
    FROM trial_events
    GROUP BY event_id
),
trials_per_account AS (
    SELECT account, count() AS account_trial_count, min(trial_started_at) AS first_trial_at
    FROM trials
    GROUP BY account
),
trial_candidates AS (
    SELECT
        t.event_id AS trial_event_id,
        a.attempt_id AS attempt_id,
        if(a.outcome = 'purchase_completed', 'purchase_completed_attempt', 'unresolved_attempt') AS attribution,
        if(a.outcome = 'purchase_completed', 0, 1) AS priority,
        abs(dateDiff('second', a.started_at, t.trial_started_at)) AS distance_seconds
    FROM trials AS t
    INNER JOIN attempt_outcomes AS a ON a.account_id = t.account
    WHERE a.presentation_events > 0
      AND a.outcome IN ('purchase_completed', 'unresolved')
      AND a.started_at >= t.trial_started_at - INTERVAL 6 HOUR
      AND a.started_at <= t.trial_started_at + INTERVAL 6 HOUR
),
trial_attribution AS (
    SELECT
        trial_event_id,
        argMin(attempt_id, tuple(priority, distance_seconds)) AS matched_attempt_id,
        argMin(attribution, tuple(priority, distance_seconds)) AS matched_attribution,
        count() AS candidate_attempts
    FROM trial_candidates
    GROUP BY trial_event_id
),
attempt_attribution AS (
    SELECT matched_attempt_id, any(matched_attribution) AS trial_attribution, count() AS trials_attributed
    FROM trial_attribution
    GROUP BY matched_attempt_id
),
attempt_report AS (
    SELECT
        o.attempt_id AS attempt_id,
        o.account_id AS account_id,
        o.placement AS placement,
        o.offering_id AS offering_id,
        o.trial_eligible AS trial_eligible,
        o.started_at AS started_at,
        o.presentation_events AS presentation_events,
        o.shown_confirmed AS shown_confirmed,
        o.outcome AS outcome,
        o.outcome_event_count AS outcome_event_count,
        o.mature AS mature,
        o.is_internal AS is_internal,
        coalesce(x.trial_attribution, '') AS trial_attribution,
        coalesce(x.trials_attributed, 0) AS trials_attributed
    FROM attempt_outcomes AS o
    LEFT JOIN attempt_attribution AS x ON x.matched_attempt_id = o.attempt_id
),
trial_report AS (
    SELECT
        t.event_id AS trial_event_id,
        t.account AS account_id,
        t.trial_started_at AS trial_at,
        t.product AS product_id,
        t.deliveries AS deliveries,
        coalesce(x.matched_attempt_id, '') AS attempt_id,
        if(empty(coalesce(x.matched_attribution, '')), 'unmatched', x.matched_attribution) AS attribution,
        coalesce(x.candidate_attempts, 0) AS candidate_attempts,
        c.account_trial_count AS account_trial_count,
        t.trial_started_at = c.first_trial_at AS is_first_trial,
        t.account IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM trials AS t
    LEFT JOIN trial_attribution AS x ON x.trial_event_id = t.event_id
    INNER JOIN trials_per_account AS c ON c.account = t.account
)
-- transform:end q2b
SELECT
    trial_event_id AS case_id,
    attempt_id,
    attribution,
    candidate_attempts,
    deliveries,
    account_trial_count,
    is_first_trial,
    is_internal
FROM trial_report
ORDER BY case_id

-- ============================================================================
-- Query 3 validation: trial save and return, one row per synthetic account
-- Anchor for most cases: trial_started 864000 s (10 days) ago.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- source:begin q3 (synthetic)
activity_rows AS (
    SELECT 't_missing_store_env' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-ideal' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_missing_store_env' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i1' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_store_env' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i1' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_at_24h' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-at24' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_save_at_24h' AS account_id, 'item_saved' AS event, now() - INTERVAL 777600 SECOND AS timestamp, 'i24' AS item_id, 's1' AS save_session, '' AS open_session, 'manual_link' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_after_24h' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-after24' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_save_after_24h' AS account_id, 'item_saved' AS event, now() - INTERVAL 777599 SECOND AS timestamp, 'i25' AS item_id, 's1' AS save_session, '' AS open_session, 'manual_link' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_at_72h' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-at72' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_save_at_72h' AS account_id, 'item_saved' AS event, now() - INTERVAL 604800 SECOND AS timestamp, 'i72' AS item_id, 's1' AS save_session, '' AS open_session, 'note' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_after_72h' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-after72' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_save_after_72h' AS account_id, 'item_saved' AS event, now() - INTERVAL 604799 SECOND AS timestamp, 'i73' AS item_id, 's1' AS save_session, '' AS open_session, 'note' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_demo_only' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-demo' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_demo_only' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'd1' AS item_id, 's1' AS save_session, '' AS open_session, 'onboarding_demo' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_demo_only' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'd1' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_unknown_source' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-unknown' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_unknown_source' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'u1' AS item_id, 's1' AS save_session, '' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_duplicate_save' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-dupsave' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_duplicate_save' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i2' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_duplicate_save' AS account_id, 'item_saved' AS event, now() - INTERVAL 860399 SECOND AS timestamp, 'i2' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_two_items' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-two' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_two_items' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i3' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_two_items' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i4' AS item_id, 's1' AS save_session, '' AS open_session, 'camera' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_foreign_item' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-foreign' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_foreign_item' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i5' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_foreign_item' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i_foreign' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 'acct-other' AS account_id, 'item_saved' AS event, now() - INTERVAL 861000 SECOND AS timestamp, 'i_foreign' AS item_id, 's9' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_pre_save_open' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-presave' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_pre_save_open' AS account_id, 'item_opened' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i6' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_pre_save_open' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i6' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_same_session' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-same' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_same_session' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i7' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_same_session' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i7' AS item_id, '' AS save_session, 's1' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_save_session' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-nosavesess' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_missing_save_session' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i8' AS item_id, '' AS save_session, '' AS open_session, 'share_extension' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_save_session' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i8' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_open_session' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-noopensess' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_missing_open_session' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i9' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_open_session' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i9' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_open_after_72h' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-late' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_open_after_72h' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i10' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_open_after_72h' AS account_id, 'item_opened' AS event, now() - INTERVAL 576000 SECOND AS timestamp, 'i10' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_before_anchor' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-before' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_save_before_anchor' AS account_id, 'item_saved' AS event, now() - INTERVAL 867600 SECOND AS timestamp, 'i11' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_save_before_anchor' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i11' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_immature' AS account_id, 'trial_started' AS event, now() - INTERVAL 36000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-immature' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_immature' AS account_id, 'item_saved' AS event, now() - INTERVAL 32400 SECOND AS timestamp, 'i12' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_immature_72h' AS account_id, 'trial_started' AS event, now() - INTERVAL 172800 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-immature72' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_immature_72h' AS account_id, 'item_saved' AS event, now() - INTERVAL 169200 SECOND AS timestamp, 'i13' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_repeat_trial' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-rep-1' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_repeat_trial' AS account_id, 'trial_started' AS event, now() - INTERVAL 432000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-rep-2' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_repeat_trial' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i14' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_dup_trial_delivery' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-dup' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_dup_trial_delivery' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-dup' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 'acct-internal' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-internal' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 'acct-internal' AS account_id, 'item_saved' AS event, now() - INTERVAL 860400 SECOND AS timestamp, 'i15' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_trial_id' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_missing_trial_id' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i16' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_missing_trial_id' AS account_id, 'item_opened' AS event, now() - INTERVAL 756000 SECOND AS timestamp, 'i16' AS item_id, '' AS save_session, 's2' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_mixed_trial_id' AS account_id, 'trial_started' AS event, now() - INTERVAL 1036800 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_mixed_trial_id' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-mixed' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_mixed_trial_id' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i17' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_sandbox_trial' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-sandbox' AS event_id, 'production' AS environment, 1 AS analytics_version, 'sandbox' AS store_environment
    UNION ALL SELECT 't_sandbox_trial' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i18' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'production' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_dev_env' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-devenv' AS event_id, 'development' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_dev_env' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i19' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'development' AS environment, 1 AS analytics_version, NULL AS store_environment
    UNION ALL SELECT 't_version_0' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-v0' AS event_id, 'production' AS environment, 0 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_dev_save' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, '' AS item_id, '' AS save_session, '' AS open_session, '' AS save_source, 'rc-devsave' AS event_id, 'production' AS environment, 1 AS analytics_version, 'production' AS store_environment
    UNION ALL SELECT 't_dev_save' AS account_id, 'item_saved' AS event, now() - INTERVAL 856800 SECOND AS timestamp, 'i20' AS item_id, 's1' AS save_session, '' AS open_session, 'paste' AS save_source, '' AS event_id, 'development' AS environment, 1 AS analytics_version, NULL AS store_environment
),
-- source:end q3 (synthetic)
-- transform:begin q3
activity_events AS (
    SELECT account_id, event, timestamp, item_id, save_session, open_session, save_source, event_id
    FROM activity_rows
    WHERE environment = 'production'
      AND analytics_version = 1
      -- Only payment webhooks carry store_environment; saves and opens do not.
      AND (event != 'trial_started' OR (event = 'trial_started' AND store_environment != 'sandbox'))
),
per_account AS (
    SELECT
        account_id,
        uniqExactIf(event_id, event = 'trial_started' AND notEmpty(event_id)) AS trial_starts,
        countIf(event = 'trial_started' AND empty(event_id)) AS trial_starts_missing_id,
        minIf(timestamp, event = 'trial_started' AND notEmpty(event_id)) AS trial_at,
        groupArrayIf(tuple(timestamp, item_id, save_session),
            event = 'item_saved' AND notEmpty(item_id) AND notEmpty(save_source) AND save_source != 'onboarding_demo') AS personal_saves,
        countIf(event = 'item_saved' AND save_source = 'onboarding_demo') AS demo_saves,
        countIf(event = 'item_saved' AND empty(save_source)) AS unknown_source_saves,
        groupArrayIf(tuple(timestamp, item_id, open_session), event = 'item_opened' AND notEmpty(item_id)) AS opens
    FROM activity_events
    GROUP BY account_id
    HAVING trial_starts > 0 OR trial_starts_missing_id > 0
),
trial_windows AS (
    SELECT
        account_id,
        trial_at,
        trial_starts,
        trial_starts > 0 AS has_anchor,
        trial_starts_missing_id,
        demo_saves,
        unknown_source_saves,
        personal_saves,
        opens,
        arrayFilter(s -> trial_starts > 0 AND s.1 >= trial_at AND s.1 <= trial_at + INTERVAL 72 HOUR, personal_saves) AS window_saves
    FROM per_account
),
trial_outcomes AS (
    SELECT
        account_id,
        trial_at,
        has_anchor,
        trial_starts_missing_id,
        trial_starts > 1 AS repeat_trial_starts,
        has_anchor AND trial_at <= now() - INTERVAL 24 HOUR AS mature_24h,
        has_anchor AND trial_at <= now() - INTERVAL 72 HOUR AS mature_72h,
        arrayExists(s -> has_anchor AND s.1 >= trial_at AND s.1 <= trial_at + INTERVAL 24 HOUR, personal_saves) AS saved_within_24h,
        length(arrayDistinct(arrayMap(s -> s.2, window_saves))) AS distinct_saves_72h,
        length(arrayFilter(s -> has_anchor AND s.1 < trial_at, personal_saves)) AS saves_before_anchor,
        arrayExists(s -> notEmpty(s.3), window_saves) AS reopen_measurable,
        arrayExists(
            s -> notEmpty(s.3) AND arrayExists(
                o -> o.2 = s.2
                    AND o.1 > s.1
                    AND o.1 <= trial_at + INTERVAL 72 HOUR
                    AND notEmpty(o.3) AND o.3 != s.3,
                opens),
            window_saves) AS reopened_own_72h,
        demo_saves,
        unknown_source_saves,
        account_id IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM trial_windows
)
-- transform:end q3
SELECT
    account_id AS case_id,
    has_anchor,
    trial_starts_missing_id,
    mature_24h,
    mature_72h,
    saved_within_24h,
    distinct_saves_72h,
    saves_before_anchor,
    reopen_measurable,
    reopened_own_72h,
    demo_saves,
    unknown_source_saves,
    repeat_trial_starts,
    is_internal
FROM trial_outcomes
ORDER BY case_id

-- ============================================================================
-- Query 4 validation: trial lifecycle, one row per synthetic account
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- source:begin q4 (synthetic)
lifecycle_rows AS (
    SELECT 'l_converted' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'c-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_converted' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'c-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_expired' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'e-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_expired' AS account_id, 'trial_expired' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'e-2' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_expired' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'ce-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_expired' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 1555200 SECOND AS timestamp, 'ce-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'voluntary' AS cancel_category
    UNION ALL SELECT 'l_cancel_expired' AS account_id, 'trial_expired' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'ce-3' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_converted' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'cr-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_converted' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 1555200 SECOND AS timestamp, 'cr-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'voluntary' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_converted' AS account_id, 'subscription_uncancelled' AS event, now() - INTERVAL 1382400 SECOND AS timestamp, 'cr-3' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_converted' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'cr-4' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_pending' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'cp-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_pending' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'cp-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'voluntary' AS cancel_category
    UNION ALL SELECT 'l_pending_clean' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'pc-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_unknown_overdue' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'uo-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_renewal' AS account_id, 'trial_started' AS event, now() - INTERVAL 3456000 SECOND AS timestamp, 'rn-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_renewal' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 2851200 SECOND AS timestamp, 'rn-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_renewal' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'rn-3' AS event_id, 'renewal' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_direct_initial' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 432000 SECOND AS timestamp, 'di-1' AS event_id, 'initial' AS payment_kind, 'monthly_499' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_initial_after_expiry' AS account_id, 'trial_started' AS event, now() - INTERVAL 2592000 SECOND AS timestamp, 'ia-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_initial_after_expiry' AS account_id, 'trial_expired' AS event, now() - INTERVAL 1987200 SECOND AS timestamp, 'ia-2' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_initial_after_expiry' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 864000 SECOND AS timestamp, 'ia-3' AS event_id, 'initial' AS payment_kind, 'monthly_499' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_duplicate_delivery' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'dd-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_duplicate_delivery' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'dd-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_duplicate_delivery' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'dd-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_pre_anchor_event' AS account_id, 'trial_expired' AS event, now() - INTERVAL 2160000 SECOND AS timestamp, 'pa-0' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_pre_anchor_event' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'pa-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'acct-internal' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'in-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'acct-internal' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'in-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_trials' AS account_id, 'trial_started' AS event, now() - INTERVAL 3456000 SECOND AS timestamp, 'rt-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_trials' AS account_id, 'trial_expired' AS event, now() - INTERVAL 2851200 SECOND AS timestamp, 'rt-2' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_trials' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, 'rt-3' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_trials' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'rt-4' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_paid_uncancel_ignored' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'pu-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_paid_uncancel_ignored' AS account_id, 'subscription_uncancelled' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'pu-2' AS event_id, 'subscription' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_uncancel_then_cancel' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'uc-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_uncancel_then_cancel' AS account_id, 'subscription_uncancelled' AS event, now() - INTERVAL 216000 SECOND AS timestamp, 'uc-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_uncancel_then_cancel' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'uc-3' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'voluntary' AS cancel_category
    UNION ALL SELECT 'l_repeat_first_open' AS account_id, 'trial_started' AS event, now() - INTERVAL 3456000 SECOND AS timestamp, 'rf-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_first_open' AS account_id, 'trial_started' AS event, now() - INTERVAL 864000 SECOND AS timestamp, 'rf-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_repeat_first_open' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'rf-3' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_converted_recent' AS account_id, 'trial_started' AS event, now() - INTERVAL 432000 SECOND AS timestamp, 'crr-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_converted_recent' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 86400 SECOND AS timestamp, 'crr-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_expired_recent' AS account_id, 'trial_started' AS event, now() - INTERVAL 432000 SECOND AS timestamp, 'exr-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_expired_recent' AS account_id, 'trial_expired' AS event, now() - INTERVAL 86400 SECOND AS timestamp, 'exr-2' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_refund_cancel_converted' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'rc-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_refund_cancel_converted' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 1555200 SECOND AS timestamp, 'rc-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'refund' AS cancel_category
    UNION ALL SELECT 'l_refund_cancel_converted' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'rc-3' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_unknown_cancel_pending' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'uk-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_unknown_cancel_pending' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'uk-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'unknown' AS cancel_category
    UNION ALL SELECT 'l_billing_cancel_expired' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'bc-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_billing_cancel_expired' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 1555200 SECOND AS timestamp, 'bc-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'billing' AS cancel_category
    UNION ALL SELECT 'l_billing_cancel_expired' AS account_id, 'trial_expired' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'bc-3' AS event_id, 'trial_lapsed' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_pending' AS account_id, 'trial_started' AS event, now() - INTERVAL 259200 SECOND AS timestamp, 'crp-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_pending' AS account_id, 'trial_cancelled' AS event, now() - INTERVAL 216000 SECOND AS timestamp, 'crp-2' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, 'voluntary' AS cancel_category
    UNION ALL SELECT 'l_cancel_reenable_pending' AS account_id, 'subscription_uncancelled' AS event, now() - INTERVAL 172800 SECOND AS timestamp, 'crp-3' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_missing_id_conversion' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'mi-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_missing_id_conversion' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, '' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_missing_id_trial' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, '' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_sandbox' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'sb-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'sandbox' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_sandbox' AS account_id, 'payment_succeeded' AS event, now() - INTERVAL 1123200 SECOND AS timestamp, 'sb-2' AS event_id, 'trial_conversion' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'sandbox' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_dev_env' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'de-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'development' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
    UNION ALL SELECT 'l_version_0' AS account_id, 'trial_started' AS event, now() - INTERVAL 1728000 SECOND AS timestamp, 'v0-1' AS event_id, 'trial' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 0 AS analytics_version, '' AS cancel_category
),
-- source:end q4 (synthetic)
-- transform:begin q4
lifecycle_events AS (
    SELECT account_id, event, timestamp, event_id, payment_kind, cancel_category, product_id
    FROM lifecycle_rows
    WHERE environment = 'production'
      AND store_environment != 'sandbox'
      AND analytics_version = 1
      AND notEmpty(event_id)
),
deduped AS (
    SELECT
        event_id,
        argMin(account_id, timestamp) AS account,
        min(timestamp) AS event_at,
        argMin(event, timestamp) AS event_name,
        argMin(payment_kind, timestamp) AS kind_raw,
        argMin(cancel_category, timestamp) AS cancel_category_raw,
        argMin(product_id, timestamp) AS product,
        count() AS deliveries
    FROM lifecycle_events
    GROUP BY event_id
),
classified AS (
    SELECT
        account AS account_id,
        event_at AS timestamp,
        product AS product_id,
        deliveries,
        multiIf(
            event_name = 'trial_started', 'trial_started',
            event_name = 'trial_cancelled' AND cancel_category_raw = 'voluntary', 'cancel',
            event_name = 'trial_cancelled', 'cancel_other',
            event_name = 'subscription_uncancelled' AND kind_raw = 'trial', 'uncancel',
            event_name = 'trial_expired', 'expired',
            event_name = 'payment_succeeded' AND kind_raw = 'trial_conversion', 'converted',
            event_name = 'payment_succeeded' AND kind_raw = 'initial', 'direct_initial',
            event_name = 'payment_succeeded' AND kind_raw = 'renewal', 'renewal',
            'other') AS kind
    FROM deduped
),
per_account AS (
    SELECT
        account_id,
        countIf(kind = 'trial_started') AS trial_starts,
        arraySort(groupArrayIf(timestamp, kind = 'trial_started')) AS trial_times,
        minIf(timestamp, kind = 'trial_started') AS trial_at,
        argMinIf(product_id, timestamp, kind = 'trial_started') AS trial_product_id,
        argMinIf(product_id, timestamp, kind = 'direct_initial') AS direct_product_id,
        arraySort(x -> x.1, groupArrayIf(tuple(timestamp, kind), kind IN ('cancel', 'cancel_other', 'uncancel', 'expired', 'converted'))) AS lifecycle,
        countIf(kind = 'direct_initial') AS direct_initial_payments,
        minIf(timestamp, kind = 'direct_initial') AS first_direct_initial_at,
        countIf(kind = 'renewal') AS renewals,
        countIf(kind = 'other') AS other_events,
        sum(deliveries) - count() AS duplicate_deliveries_collapsed
    FROM classified
    GROUP BY account_id
    HAVING trial_starts > 0 OR direct_initial_payments > 0
),
trial_terminal AS (
    SELECT
        account_id,
        if(trial_starts > 0, 'trial', 'direct_initial_no_trial') AS population,
        if(trial_starts > 0, trial_product_id, direct_product_id) AS product_id,
        trial_starts,
        trial_at,
        direct_initial_payments,
        trial_starts > 0 AND direct_initial_payments > 0 AND first_direct_initial_at > trial_at AS direct_initial_after_trial,
        renewals,
        other_events,
        duplicate_deliveries_collapsed,
        arrayFilter(x -> x.1 >= trial_at AND (length(trial_times) < 2 OR x.1 < arrayElement(trial_times, 2)), lifecycle) AS bounded,
        length(arrayFilter(x -> x.2 IN ('expired', 'converted'), bounded)) AS terminal_count,
        arrayFirst(x -> x.2 IN ('expired', 'converted'), bounded) AS terminal
    FROM per_account
),
trial_pre_terminal AS (
    SELECT
        account_id,
        population,
        product_id,
        trial_starts,
        trial_at,
        direct_initial_payments,
        direct_initial_after_trial,
        renewals,
        other_events,
        duplicate_deliveries_collapsed,
        terminal_count,
        terminal,
        arrayFilter(x -> terminal_count = 0 OR x.1 <= tupleElement(terminal, 1), bounded) AS pre_terminal
    FROM trial_terminal
),
trial_state AS (
    SELECT
        account_id,
        population,
        product_id,
        trial_at,
        population = 'trial' AND trial_at <= now() - INTERVAL 14 DAY AS mature,
        trial_starts > 1 AS repeat_trial_starts,
        direct_initial_payments,
        direct_initial_after_trial,
        renewals,
        other_events,
        duplicate_deliveries_collapsed,
        multiIf(
            population != 'trial', 'not_a_trial',
            terminal_count > 0 AND tupleElement(terminal, 2) = 'converted', 'converted',
            terminal_count > 0, 'expired',
            trial_at > now() - INTERVAL 14 DAY, 'pending',
            'unknown_no_terminal_event') AS outcome,
        arrayExists(x -> x.2 = 'cancel', pre_terminal) AS ever_cancelled,
        length(arrayFilter(x -> x.2 = 'cancel_other', pre_terminal)) AS other_cancels,
        multiIf(
            length(arrayFilter(x -> x.2 IN ('cancel', 'uncancel'), pre_terminal)) = 0, 'never_cancelled',
            tupleElement(arrayElement(arrayFilter(x -> x.2 IN ('cancel', 'uncancel'), pre_terminal), -1), 2) = 'cancel', 'off',
            're_enabled') AS auto_renew_state,
        account_id IN (SELECT account_id FROM internal_accounts) AS is_internal
    FROM trial_pre_terminal
)
-- transform:end q4
SELECT
    account_id AS case_id,
    population,
    product_id,
    mature,
    outcome,
    ever_cancelled,
    other_cancels,
    auto_renew_state,
    repeat_trial_starts,
    direct_initial_payments,
    direct_initial_after_trial,
    renewals,
    other_events,
    duplicate_deliveries_collapsed,
    is_internal
FROM trial_state
ORDER BY case_id
