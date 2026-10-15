-- Validation parts, not paste-ready SQL.
-- Run node tools/assemble-analytics-validation.mjs from the repository root.
-- Paste each emitted statement into PostHog; every ok must be 1.
-- expected literals were transcribed from the original methodology tables.
-- No production events are read. Offsets are seconds before now().

-- inputs:begin q1
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- inputs:end q1
-- source:begin q1
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
    SELECT 'acct-full' AS account_id, now() - INTERVAL 179495 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-two-a' AS account_id, now() - INTERVAL 179505 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-two-b' AS account_id, now() - INTERVAL 100010 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-failed' AS account_id, now() - INTERVAL 179505 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-other' AS account_id, now() - INTERVAL 179505 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-returning' AS account_id, now() - INTERVAL 400000 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-orphan' AS account_id, now() - INTERVAL 300000 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-replay' AS account_id, now() - INTERVAL 179510 SECOND AS created_at, 'production' AS environment, 1 AS analytics_version
    UNION ALL SELECT 'acct-devcreated' AS account_id, now() - INTERVAL 179505 SECOND AS created_at, 'development' AS environment, 1 AS analytics_version
),
-- source:end q1
-- final:begin q1
,
actual AS (
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
FROM onboarding_cohort
),
expected AS (
    SELECT 'p_anon_demo' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 1 AS reached_interests, 1 AS reached_setup, 1 AS reached_demo, 1 AS demo_picked, 1 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_demo_failed' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 1 AS reached_demo, 1 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 1 AS signed_in, 1 AS new_accounts, 1 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_dev_account' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 1 AS signed_in, 0 AS new_accounts, 1 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_dropped_setup' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 1 AS reached_interests, 1 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_full' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 1 AS reached_interests, 1 AS reached_setup, 1 AS reached_demo, 1 AS demo_picked, 1 AS sample_picked, 1 AS demo_ready, 1 AS signed_in, 1 AS new_accounts, 1 AS account_count, 0 AS is_internal, 1 AS reached_notifications, 1 AS reached_share, 1 AS completed, 1 AS paywall_attempted
    UNION ALL SELECT 'p_immature' AS case_id, 7 AS flow_version, 1 AS opener_views, 0 AS mature, 1 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_internal' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 1 AS signed_in, 0 AS new_accounts, 1 AS account_count, 1 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 1 AS paywall_attempted
    UNION ALL SELECT 'p_internal_late_auth' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 1 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 1 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_late_step' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 1 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_mixed_env' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_old_flow' AS case_id, 4 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 1 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_other_placement' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 1 AS signed_in, 1 AS new_accounts, 1 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_replay_later' AS case_id, 6 AS flow_version, 2 AS opener_views, 1 AS mature, 1 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_returning' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 1 AS reached_demo, 1 AS demo_picked, 0 AS sample_picked, 1 AS demo_ready, 1 AS signed_in, 0 AS new_accounts, 1 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 1 AS completed, 1 AS paywall_attempted
    UNION ALL SELECT 'p_same_day_replay' AS case_id, 6 AS flow_version, 2 AS opener_views, 1 AS mature, 1 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 0 AS signed_in, 0 AS new_accounts, 0 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
    UNION ALL SELECT 'p_two_accounts' AS case_id, 7 AS flow_version, 1 AS opener_views, 1 AS mature, 0 AS reached_interests, 0 AS reached_setup, 0 AS reached_demo, 0 AS demo_picked, 0 AS sample_picked, 0 AS demo_ready, 1 AS signed_in, 2 AS new_accounts, 2 AS account_count, 0 AS is_internal, 0 AS reached_notifications, 0 AS reached_share, 0 AS completed, 0 AS paywall_attempted
)
SELECT
    expected.case_id AS case_id,
    notEmpty(coalesce(actual.case_id, '')) AND length(mismatching_columns) = 0 AS ok,
    arrayFilter(column -> notEmpty(column), [
        if(coalesce(actual.flow_version = expected.flow_version, false), '', 'flow_version'),
        if(coalesce(actual.opener_views = expected.opener_views, false), '', 'opener_views'),
        if(coalesce(actual.mature = expected.mature, false), '', 'mature'),
        if(coalesce(actual.reached_interests = expected.reached_interests, false), '', 'reached_interests'),
        if(coalesce(actual.reached_setup = expected.reached_setup, false), '', 'reached_setup'),
        if(coalesce(actual.reached_demo = expected.reached_demo, false), '', 'reached_demo'),
        if(coalesce(actual.demo_picked = expected.demo_picked, false), '', 'demo_picked'),
        if(coalesce(actual.sample_picked = expected.sample_picked, false), '', 'sample_picked'),
        if(coalesce(actual.demo_ready = expected.demo_ready, false), '', 'demo_ready'),
        if(coalesce(actual.signed_in = expected.signed_in, false), '', 'signed_in'),
        if(coalesce(actual.new_accounts = expected.new_accounts, false), '', 'new_accounts'),
        if(coalesce(actual.account_count = expected.account_count, false), '', 'account_count'),
        if(coalesce(actual.is_internal = expected.is_internal, false), '', 'is_internal'),
        if(coalesce(actual.reached_notifications = expected.reached_notifications, false), '', 'reached_notifications'),
        if(coalesce(actual.reached_share = expected.reached_share, false), '', 'reached_share'),
        if(coalesce(actual.completed = expected.completed, false), '', 'completed'),
        if(coalesce(actual.paywall_attempted = expected.paywall_attempted, false), '', 'paywall_attempted')
    ]) AS mismatching_columns
FROM expected
LEFT JOIN actual ON actual.case_id = expected.case_id
UNION ALL
SELECT
    '__row_count__' AS case_id,
    (SELECT count() FROM actual) = 16
        AND (SELECT uniqExact(case_id) FROM actual) = 16 AS ok,
    if(ok, [], ['row_count_or_duplicate_case_id']) AS mismatching_columns
ORDER BY case_id
-- final:end q1

-- inputs:begin q2a
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- inputs:end q2a
-- source:begin q2a
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
-- source:end q2a
-- final:begin q2a
,
actual AS (
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
),
expected AS (
    SELECT 'att_cancelled' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 1 AS shown_confirmed, 'cancelled' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_dup_presentation' AS case_id, 'add' AS placement, 2 AS presentation_events, 0 AS shown_confirmed, 'cancelled' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_f_far_unresolved' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'unresolved' AS outcome, 0 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_f_near_purchase' AS case_id, 'add' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, 'purchase_completed_attempt' AS trial_attribution
    UNION ALL SELECT 'att_failed' AS case_id, 'add' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'failed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_g_outside_window' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_internal' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'cancelled' AS outcome, 1 AS outcome_event_count, 1 AS mature, 1 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_noid_trial' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_orphan_outcome' AS case_id, '' AS placement, 0 AS presentation_events, 1 AS shown_confirmed, 'cancelled' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_purchase_no_trial' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 1 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_purchase_trial' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 1 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, 'purchase_completed_attempt' AS trial_attribution
    UNION ALL SELECT 'att_repeat_1' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'cancelled' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_repeat_2' AS case_id, 'add' AS placement, 1 AS presentation_events, 1 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, 'purchase_completed_attempt' AS trial_attribution
    UNION ALL SELECT 'att_restored' AS case_id, 'profile' AS placement, 1 AS presentation_events, 1 AS shown_confirmed, 'restored' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_sandbox_trial' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'purchase_completed' AS outcome, 1 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_two_outcomes' AS case_id, 'add' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'cancelled' AS outcome, 2 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_unresolved_mature' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'unresolved' AS outcome, 0 AS outcome_event_count, 1 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_unresolved_recent' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'unresolved' AS outcome, 0 AS outcome_event_count, 0 AS mature, 0 AS is_internal, '' AS trial_attribution
    UNION ALL SELECT 'att_unresolved_trial' AS case_id, 'onboarding' AS placement, 1 AS presentation_events, 0 AS shown_confirmed, 'unresolved' AS outcome, 0 AS outcome_event_count, 1 AS mature, 0 AS is_internal, 'unresolved_attempt' AS trial_attribution
)
SELECT
    expected.case_id AS case_id,
    notEmpty(coalesce(actual.case_id, '')) AND length(mismatching_columns) = 0 AS ok,
    arrayFilter(column -> notEmpty(column), [
        if(coalesce(actual.placement = expected.placement, false), '', 'placement'),
        if(coalesce(actual.presentation_events = expected.presentation_events, false), '', 'presentation_events'),
        if(coalesce(actual.shown_confirmed = expected.shown_confirmed, false), '', 'shown_confirmed'),
        if(coalesce(actual.outcome = expected.outcome, false), '', 'outcome'),
        if(coalesce(actual.outcome_event_count = expected.outcome_event_count, false), '', 'outcome_event_count'),
        if(coalesce(actual.mature = expected.mature, false), '', 'mature'),
        if(coalesce(actual.is_internal = expected.is_internal, false), '', 'is_internal'),
        if(coalesce(actual.trial_attribution = expected.trial_attribution, false), '', 'trial_attribution')
    ]) AS mismatching_columns
FROM expected
LEFT JOIN actual ON actual.case_id = expected.case_id
UNION ALL
SELECT
    '__row_count__' AS case_id,
    (SELECT count() FROM actual) = 19
        AND (SELECT uniqExact(case_id) FROM actual) = 19 AS ok,
    if(ok, [], ['row_count_or_duplicate_case_id']) AS mismatching_columns
ORDER BY case_id
-- final:end q2a

-- final:begin q2b
,
actual AS (
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
),
expected AS (
    SELECT 'rc-trial-b' AS case_id, 'att_purchase_trial' AS attempt_id, 'purchase_completed_attempt' AS attribution, 1 AS candidate_attempts, 2 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-c' AS case_id, 'att_unresolved_trial' AS attempt_id, 'unresolved_attempt' AS attribution, 1 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-e' AS case_id, 'att_repeat_2' AS attempt_id, 'purchase_completed_attempt' AS attribution, 1 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-f' AS case_id, 'att_f_near_purchase' AS attempt_id, 'purchase_completed_attempt' AS attribution, 2 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-g' AS case_id, '' AS attempt_id, 'unmatched' AS attribution, 0 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-h' AS case_id, '' AS attempt_id, 'unmatched' AS attribution, 0 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-i1' AS case_id, '' AS attempt_id, 'unmatched' AS attribution, 0 AS candidate_attempts, 1 AS deliveries, 2 AS account_trial_count, 1 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-i2' AS case_id, '' AS attempt_id, 'unmatched' AS attribution, 0 AS candidate_attempts, 1 AS deliveries, 2 AS account_trial_count, 0 AS is_first_trial, 0 AS is_internal
    UNION ALL SELECT 'rc-trial-internal' AS case_id, '' AS attempt_id, 'unmatched' AS attribution, 0 AS candidate_attempts, 1 AS deliveries, 1 AS account_trial_count, 1 AS is_first_trial, 1 AS is_internal
)
SELECT
    expected.case_id AS case_id,
    notEmpty(coalesce(actual.case_id, '')) AND length(mismatching_columns) = 0 AS ok,
    arrayFilter(column -> notEmpty(column), [
        if(coalesce(actual.attempt_id = expected.attempt_id, false), '', 'attempt_id'),
        if(coalesce(actual.attribution = expected.attribution, false), '', 'attribution'),
        if(coalesce(actual.candidate_attempts = expected.candidate_attempts, false), '', 'candidate_attempts'),
        if(coalesce(actual.deliveries = expected.deliveries, false), '', 'deliveries'),
        if(coalesce(actual.account_trial_count = expected.account_trial_count, false), '', 'account_trial_count'),
        if(coalesce(actual.is_first_trial = expected.is_first_trial, false), '', 'is_first_trial'),
        if(coalesce(actual.is_internal = expected.is_internal, false), '', 'is_internal')
    ]) AS mismatching_columns
FROM expected
LEFT JOIN actual ON actual.case_id = expected.case_id
UNION ALL
SELECT
    '__row_count__' AS case_id,
    (SELECT count() FROM actual) = 9
        AND (SELECT uniqExact(case_id) FROM actual) = 9 AS ok,
    if(ok, [], ['row_count_or_duplicate_case_id']) AS mismatching_columns
ORDER BY case_id
-- final:end q2b

-- inputs:begin q3
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- inputs:end q3
-- source:begin q3
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
-- source:end q3
-- final:begin q3
,
actual AS (
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
),
expected AS (
    SELECT 'acct-internal' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 1 AS is_internal
    UNION ALL SELECT 't_demo_only' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 1 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_dev_save' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_dup_trial_delivery' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_duplicate_save' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_foreign_item' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_missing_store_env' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 1 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_immature' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 0 AS mature_24h, 0 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_immature_72h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 0 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_missing_open_session' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_missing_save_session' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_missing_trial_id' AS case_id, 0 AS has_anchor, 1 AS trial_starts_missing_id, 0 AS mature_24h, 0 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_mixed_trial_id' AS case_id, 1 AS has_anchor, 1 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_open_after_72h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_pre_save_open' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_repeat_trial' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 1 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_same_session' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_save_after_24h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_save_after_72h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_save_at_24h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_save_at_72h' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 1 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_save_before_anchor' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 1 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_two_items' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 1 AS saved_within_24h, 2 AS distinct_saves_72h, 0 AS saves_before_anchor, 1 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 0 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
    UNION ALL SELECT 't_unknown_source' AS case_id, 1 AS has_anchor, 0 AS trial_starts_missing_id, 1 AS mature_24h, 1 AS mature_72h, 0 AS saved_within_24h, 0 AS distinct_saves_72h, 0 AS saves_before_anchor, 0 AS reopen_measurable, 0 AS reopened_own_72h, 0 AS demo_saves, 1 AS unknown_source_saves, 0 AS repeat_trial_starts, 0 AS is_internal
)
SELECT
    expected.case_id AS case_id,
    notEmpty(coalesce(actual.case_id, '')) AND length(mismatching_columns) = 0 AS ok,
    arrayFilter(column -> notEmpty(column), [
        if(coalesce(actual.has_anchor = expected.has_anchor, false), '', 'has_anchor'),
        if(coalesce(actual.trial_starts_missing_id = expected.trial_starts_missing_id, false), '', 'trial_starts_missing_id'),
        if(coalesce(actual.mature_24h = expected.mature_24h, false), '', 'mature_24h'),
        if(coalesce(actual.mature_72h = expected.mature_72h, false), '', 'mature_72h'),
        if(coalesce(actual.saved_within_24h = expected.saved_within_24h, false), '', 'saved_within_24h'),
        if(coalesce(actual.distinct_saves_72h = expected.distinct_saves_72h, false), '', 'distinct_saves_72h'),
        if(coalesce(actual.saves_before_anchor = expected.saves_before_anchor, false), '', 'saves_before_anchor'),
        if(coalesce(actual.reopen_measurable = expected.reopen_measurable, false), '', 'reopen_measurable'),
        if(coalesce(actual.reopened_own_72h = expected.reopened_own_72h, false), '', 'reopened_own_72h'),
        if(coalesce(actual.demo_saves = expected.demo_saves, false), '', 'demo_saves'),
        if(coalesce(actual.unknown_source_saves = expected.unknown_source_saves, false), '', 'unknown_source_saves'),
        if(coalesce(actual.repeat_trial_starts = expected.repeat_trial_starts, false), '', 'repeat_trial_starts'),
        if(coalesce(actual.is_internal = expected.is_internal, false), '', 'is_internal')
    ]) AS mismatching_columns
FROM expected
LEFT JOIN actual ON actual.case_id = expected.case_id
UNION ALL
SELECT
    '__row_count__' AS case_id,
    (SELECT count() FROM actual) = 24
        AND (SELECT uniqExact(case_id) FROM actual) = 24 AS ok,
    if(ok, [], ['row_count_or_duplicate_case_id']) AS mismatching_columns
ORDER BY case_id
-- final:end q3

-- inputs:begin q4
WITH internal_accounts AS (
    SELECT arrayJoin(['acct-internal']) AS account_id
),
-- inputs:end q4
-- source:begin q4
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
    UNION ALL SELECT 'l_paid_uncancel_ignored' AS account_id, 'subscription_cancelled' AS event, now() - INTERVAL 86400 SECOND AS timestamp, 'pu-3' AS event_id, 'subscription' AS payment_kind, 'annual_1999' AS product_id, 'production' AS environment, 'production' AS store_environment, 1 AS analytics_version, '' AS cancel_category
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
-- source:end q4
-- final:begin q4
,
actual AS (
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
),
expected AS (
    SELECT 'acct-internal' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 1 AS is_internal
    UNION ALL SELECT 'l_billing_cancel_expired' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'expired' AS outcome, 0 AS ever_cancelled, 1 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_cancel_expired' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'expired' AS outcome, 1 AS ever_cancelled, 0 AS other_cancels, 'off' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_cancel_pending' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 1 AS ever_cancelled, 0 AS other_cancels, 'off' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_cancel_reenable_converted' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 1 AS ever_cancelled, 0 AS other_cancels, 're_enabled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_cancel_reenable_pending' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 1 AS ever_cancelled, 0 AS other_cancels, 're_enabled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_converted' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_converted_recent' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_direct_initial' AS case_id, 'direct_initial_no_trial' AS population, 'monthly_499' AS product_id, 0 AS mature, 'not_a_trial' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 1 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_duplicate_delivery' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 1 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_expired' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'expired' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_expired_recent' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'expired' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_initial_after_expiry' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'expired' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 1 AS direct_initial_payments, 1 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_missing_id_conversion' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'unknown_no_terminal_event' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_paid_uncancel_ignored' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 2 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_pending_clean' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_pre_anchor_event' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_refund_cancel_converted' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 1 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_renewal' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'converted' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 1 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_repeat_first_open' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'unknown_no_terminal_event' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 1 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_repeat_trials' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'expired' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 1 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_uncancel_then_cancel' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 1 AS ever_cancelled, 0 AS other_cancels, 'off' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_unknown_cancel_pending' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 0 AS mature, 'pending' AS outcome, 0 AS ever_cancelled, 1 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
    UNION ALL SELECT 'l_unknown_overdue' AS case_id, 'trial' AS population, 'annual_1999' AS product_id, 1 AS mature, 'unknown_no_terminal_event' AS outcome, 0 AS ever_cancelled, 0 AS other_cancels, 'never_cancelled' AS auto_renew_state, 0 AS repeat_trial_starts, 0 AS direct_initial_payments, 0 AS direct_initial_after_trial, 0 AS renewals, 0 AS other_events, 0 AS duplicate_deliveries_collapsed, 0 AS is_internal
)
SELECT
    expected.case_id AS case_id,
    notEmpty(coalesce(actual.case_id, '')) AND length(mismatching_columns) = 0 AS ok,
    arrayFilter(column -> notEmpty(column), [
        if(coalesce(actual.population = expected.population, false), '', 'population'),
        if(coalesce(actual.product_id = expected.product_id, false), '', 'product_id'),
        if(coalesce(actual.mature = expected.mature, false), '', 'mature'),
        if(coalesce(actual.outcome = expected.outcome, false), '', 'outcome'),
        if(coalesce(actual.ever_cancelled = expected.ever_cancelled, false), '', 'ever_cancelled'),
        if(coalesce(actual.other_cancels = expected.other_cancels, false), '', 'other_cancels'),
        if(coalesce(actual.auto_renew_state = expected.auto_renew_state, false), '', 'auto_renew_state'),
        if(coalesce(actual.repeat_trial_starts = expected.repeat_trial_starts, false), '', 'repeat_trial_starts'),
        if(coalesce(actual.direct_initial_payments = expected.direct_initial_payments, false), '', 'direct_initial_payments'),
        if(coalesce(actual.direct_initial_after_trial = expected.direct_initial_after_trial, false), '', 'direct_initial_after_trial'),
        if(coalesce(actual.renewals = expected.renewals, false), '', 'renewals'),
        if(coalesce(actual.other_events = expected.other_events, false), '', 'other_events'),
        if(coalesce(actual.duplicate_deliveries_collapsed = expected.duplicate_deliveries_collapsed, false), '', 'duplicate_deliveries_collapsed'),
        if(coalesce(actual.is_internal = expected.is_internal, false), '', 'is_internal')
    ]) AS mismatching_columns
FROM expected
LEFT JOIN actual ON actual.case_id = expected.case_id
UNION ALL
SELECT
    '__row_count__' AS case_id,
    (SELECT count() FROM actual) = 24
        AND (SELECT uniqExact(case_id) FROM actual) = 24 AS ok,
    if(ok, [], ['row_count_or_duplicate_case_id']) AS mismatching_columns
ORDER BY case_id
-- final:end q4
