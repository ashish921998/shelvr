-- Trial baselines: reusable PostHog SQL (HogQL). Methodology and reading
-- rules are in trial-baselines.md; read it before running any of these.
--
-- Five standalone statements. Paste one at a time into a PostHog SQL insight.
-- Every statement repeats the same two operator inputs, then its source CTEs
-- (the only ones that read `events`; they extract typed columns and apply
-- only the time range and event-name predicates), then its transform CTEs
-- between `-- transform:begin <q>` and `-- transform:end <q>`, then a final
-- SELECT. The first transform CTE is the row filter (environment, analytics
-- version, store environment, required ids), so the filter is exercised by
-- validate-trial-baselines.sql, which swaps the source CTEs for literal rows
-- and reuses each transform block byte for byte. trial-baselines.md has the
-- drift check that proves they still match.
--
-- Operator inputs (identical in every statement):
--   internal_accounts  Convex user ids of internal and test accounts. The
--                      placeholder matches nobody, so an unfilled list
--                      excludes nothing. Read the internal_* columns before
--                      trusting a rate: zero there means the list is empty.
--   cohort start       toDateTime('2026-09-20 00:00:00'): the first day
--                      item_saved carried save_source. Move it later for a
--                      narrower cohort, never earlier.
--
-- Nothing here writes events. Every output is a count or a rate.

-- ============================================================================
-- Query 1: pre-trial onboarding and sample progression
-- Unit: person (PostHog person_id), grouped by the flow version of the first
-- opener view. Progression counts only events from that opener until one day
-- later or the person's next opener view, whichever is first, so a replayed
-- onboarding (later build, or the same day) is not credited to the first
-- flow. The internal flag reads every auth_completed of the person, inside
-- or outside that window, so an internal sign-in days later still excludes
-- the person. No save metric: before a trial nobody can make a personal save.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['__internal_account_placeholder__']) AS account_id
),
-- source:begin q1
onboarding_rows AS (
    SELECT
        person_id,
        distinct_id,
        event,
        timestamp,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.step_id), '') AS step_id,
        coalesce(toInt(properties.flow_version), 0) AS flow_version,
        coalesce(properties.sample, false) = true AS sample,
        coalesce(toString(properties.outcome), '') AS outcome,
        coalesce(toString(properties.placement), '') AS placement
    FROM events
    WHERE timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
      AND event IN ('onboarding_step_viewed', 'onboarding_demo_picked', 'onboarding_demo_result',
                    'auth_succeeded', 'auth_completed', 'onboarding_completed',
                    'paywall_presentation_started')
),
account_rows AS (
    SELECT
        distinct_id AS account_id,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version
    FROM events
    WHERE event = 'account_created'
      AND timestamp >= toDateTime('2026-09-20 00:00:00') - INTERVAL 1 DAY
      AND timestamp <= now()
),
-- source:end q1
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
    flow_version,
    countIf(is_internal = 0) AS openers,
    countIf(is_internal = 1) AS internal_persons_excluded,
    countIf(is_internal = 0 AND opener_views > 1) AS persons_with_repeated_opener,
    countIf(is_internal = 0 AND mature = 0) AS immature_openers,
    countIf(is_internal = 0 AND mature) AS mature_openers,
    countIf(is_internal = 0 AND mature AND reached_interests) AS persons_reached_interests,
    countIf(is_internal = 0 AND mature AND reached_setup) AS persons_reached_setup,
    countIf(is_internal = 0 AND mature AND reached_demo) AS persons_reached_demo,
    countIf(is_internal = 0 AND mature AND demo_picked) AS persons_demo_picked,
    countIf(is_internal = 0 AND mature AND sample_picked) AS persons_sample_picked,
    countIf(is_internal = 0 AND mature AND demo_ready) AS persons_demo_ready,
    countIf(is_internal = 0 AND mature AND signed_in) AS persons_signed_in,
    countIf(is_internal = 0 AND mature AND new_accounts > 0) AS persons_new_account,
    countIf(is_internal = 0 AND mature AND account_count > 1) AS persons_with_several_accounts,
    countIf(is_internal = 0 AND mature AND reached_notifications) AS persons_reached_notifications,
    countIf(is_internal = 0 AND mature AND reached_share) AS persons_reached_share,
    countIf(is_internal = 0 AND mature AND completed) AS persons_completed_onboarding,
    countIf(is_internal = 0 AND mature AND paywall_attempted) AS persons_onboarding_paywall_attempted,
    sumIf(onboarding_paywall_attempts, is_internal = 0 AND mature) AS onboarding_paywall_attempt_events,
    round(100.0 * persons_demo_ready / nullIf(mature_openers, 0), 1) AS demo_ready_percent,
    round(100.0 * persons_signed_in / nullIf(mature_openers, 0), 1) AS signed_in_percent,
    round(100.0 * persons_onboarding_paywall_attempted / nullIf(mature_openers, 0), 1) AS paywall_attempted_percent
FROM cohort
GROUP BY flow_version
ORDER BY flow_version

-- ============================================================================
-- Query 2a: paywall attempts and their outcomes
-- Unit: attempt (paywall_attempt_id), grouped by placement. The denominator
-- is paywall_presentation_started. Trial confirmation comes from the webhook
-- trial_started event, attributed to one attempt by the rule in
-- trial-baselines.md, never from paywall_purchase_completed alone.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['__internal_account_placeholder__']) AS account_id
),
-- source:begin q2a
attempt_rows AS (
    SELECT
        distinct_id AS account_id,
        event,
        timestamp,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.paywall_attempt_id), '') AS attempt_id,
        coalesce(toString(properties.placement), '') AS placement,
        coalesce(toString(properties.offering_id), '') AS offering_id,
        coalesce(toString(properties.trial_eligible), '') AS trial_eligible
    FROM events
    WHERE timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
      AND event IN ('paywall_presentation_started', 'paywall_shown', 'paywall_cancelled',
                    'paywall_failed', 'paywall_purchase_completed', 'paywall_restored')
),
trial_rows AS (
    SELECT
        distinct_id AS account_id,
        timestamp AS trial_at,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toString(properties.store_environment), '') AS store_environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.revenuecat_event_id), '') AS event_id,
        coalesce(toString(properties.product_id), '') AS product_id
    FROM events
    WHERE event = 'trial_started'
      AND timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
),
-- source:end q2a
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
    placement,
    countIf(is_internal = 0 AND presentation_events > 0) AS attempts,
    countIf(is_internal = 1 AND presentation_events > 0) AS internal_attempts_excluded,
    countIf(presentation_events = 0) AS outcome_only_attempt_ids,
    uniqExactIf(account_id, is_internal = 0 AND presentation_events > 0) AS persons,
    countIf(is_internal = 0 AND presentation_events > 1) AS duplicate_presentation_rows,
    countIf(is_internal = 0 AND presentation_events > 0 AND outcome_event_count > 1) AS attempts_with_several_outcomes,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature = 0) AS immature_attempts,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature) AS mature_attempts,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND shown_confirmed) AS shown_confirmed_attempts,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND outcome = 'cancelled') AS cancelled,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND outcome = 'failed') AS failed,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND outcome = 'purchase_completed') AS purchase_completed,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND outcome = 'restored') AS restored,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND outcome = 'unresolved') AS unresolved,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND trial_attribution = 'purchase_completed_attempt') AS purchases_with_confirmed_trial,
    countIf(is_internal = 0 AND presentation_events > 0 AND mature AND trial_attribution = 'unresolved_attempt') AS unresolved_with_confirmed_trial,
    uniqExactIf(account_id, is_internal = 0 AND presentation_events > 0 AND mature AND trial_attribution != '') AS persons_with_confirmed_trial,
    round(100.0 * cancelled / nullIf(mature_attempts, 0), 1) AS cancelled_percent,
    round(100.0 * failed / nullIf(mature_attempts, 0), 1) AS failed_percent,
    round(100.0 * purchase_completed / nullIf(mature_attempts, 0), 1) AS purchase_completed_percent,
    round(100.0 * unresolved / nullIf(mature_attempts, 0), 1) AS unresolved_percent,
    round(100.0 * purchases_with_confirmed_trial / nullIf(mature_attempts, 0), 1) AS confirmed_trial_percent
FROM attempt_report
GROUP BY placement
ORDER BY attempts DESC

-- ============================================================================
-- Query 2b: confirmed trial starts and which attempt each one matched
-- Unit: trial_started webhook event (deduplicated on revenuecat_event_id),
-- grouped by product. Same inputs and transform as Query 2a; only the final
-- SELECT differs.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['__internal_account_placeholder__']) AS account_id
),
-- source:begin q2b
attempt_rows AS (
    SELECT
        distinct_id AS account_id,
        event,
        timestamp,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.paywall_attempt_id), '') AS attempt_id,
        coalesce(toString(properties.placement), '') AS placement,
        coalesce(toString(properties.offering_id), '') AS offering_id,
        coalesce(toString(properties.trial_eligible), '') AS trial_eligible
    FROM events
    WHERE timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
      AND event IN ('paywall_presentation_started', 'paywall_shown', 'paywall_cancelled',
                    'paywall_failed', 'paywall_purchase_completed', 'paywall_restored')
),
trial_rows AS (
    SELECT
        distinct_id AS account_id,
        timestamp AS trial_at,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toString(properties.store_environment), '') AS store_environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.revenuecat_event_id), '') AS event_id,
        coalesce(toString(properties.product_id), '') AS product_id
    FROM events
    WHERE event = 'trial_started'
      AND timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
),
-- source:end q2b
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
    product_id,
    countIf(is_internal = 0) AS trial_starts,
    countIf(is_internal = 1) AS internal_trial_starts_excluded,
    sumIf(deliveries - 1, is_internal = 0) AS duplicate_deliveries_removed,
    uniqExactIf(account_id, is_internal = 0) AS accounts,
    countIf(is_internal = 0 AND is_first_trial = 0) AS repeat_trial_starts,
    countIf(is_internal = 0 AND attribution = 'purchase_completed_attempt') AS matched_purchase_completed_attempt,
    countIf(is_internal = 0 AND attribution = 'unresolved_attempt') AS matched_unresolved_attempt,
    countIf(is_internal = 0 AND attribution = 'unmatched') AS unmatched,
    countIf(is_internal = 0 AND candidate_attempts > 1) AS trials_with_several_candidates,
    round(100.0 * unmatched / nullIf(trial_starts, 0), 1) AS unmatched_percent
FROM trial_report
GROUP BY product_id
ORDER BY trial_starts DESC

-- ============================================================================
-- Query 3: trial-anchored personal save and return
-- Unit: account with a confirmed trial (anchor = first production
-- trial_started that carries a revenuecat_event_id). Day 3 is 72 elapsed
-- hours from the anchor. Reopen follows the strict useful-returns rule: the
-- same account's own item, saved inside the window, opened after its save in
-- a different nonempty session. Accounts whose only trial_started rows lack
-- the webhook id are reported as a gap and enter no rate.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['__internal_account_placeholder__']) AS account_id
),
-- source:begin q3
activity_rows AS (
    SELECT
        distinct_id AS account_id,
        event,
        timestamp,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.store_environment), '') AS store_environment,
        coalesce(toString(properties.item_id), '') AS item_id,
        coalesce(toString(properties.save_session_id), '') AS save_session,
        coalesce(toString(properties.$session_id), '') AS open_session,
        coalesce(toString(properties.save_source), '') AS save_source,
        coalesce(toString(properties.revenuecat_event_id), '') AS event_id
    FROM events
    WHERE timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
      AND event IN ('trial_started', 'item_saved', 'item_opened')
),
-- source:end q3
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
    countIf(is_internal = 0 AND has_anchor) AS trial_accounts,
    countIf(is_internal = 1 AND has_anchor) AS internal_accounts_excluded,
    countIf(is_internal = 0 AND has_anchor = 0) AS accounts_without_webhook_id,
    sumIf(trial_starts_missing_id, is_internal = 0) AS trial_start_events_missing_id,
    countIf(is_internal = 0 AND has_anchor AND repeat_trial_starts) AS accounts_with_repeat_trial_starts,
    countIf(is_internal = 0 AND has_anchor AND mature_24h = 0) AS immature_24h_trials,
    countIf(is_internal = 0 AND mature_24h) AS mature_24h_trials,
    countIf(is_internal = 0 AND mature_24h AND saved_within_24h) AS first_personal_save_within_24h,
    round(100.0 * first_personal_save_within_24h / nullIf(mature_24h_trials, 0), 1) AS first_save_24h_percent,
    countIf(is_internal = 0 AND has_anchor AND mature_72h = 0) AS immature_72h_trials,
    countIf(is_internal = 0 AND mature_72h) AS mature_72h_trials,
    countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h = 0) AS no_personal_save_by_72h,
    countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h = 1) AS one_save_by_72h,
    countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h = 2) AS two_saves_by_72h,
    countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h >= 3) AS three_plus_saves_by_72h,
    round(100.0 * countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h > 0) / nullIf(mature_72h_trials, 0), 1) AS saved_by_72h_percent,
    countIf(is_internal = 0 AND mature_72h AND reopen_measurable) AS reopen_measurable_72h,
    countIf(is_internal = 0 AND mature_72h AND distinct_saves_72h > 0 AND reopen_measurable = 0) AS saves_without_session_72h,
    countIf(is_internal = 0 AND mature_72h AND reopened_own_72h) AS reopened_own_item_by_72h,
    round(100.0 * reopened_own_item_by_72h / nullIf(reopen_measurable_72h, 0), 1) AS reopen_percent_of_measurable,
    sumIf(saves_before_anchor, is_internal = 0) AS personal_saves_before_anchor,
    sumIf(demo_saves, is_internal = 0) AS demo_saves_excluded,
    sumIf(unknown_source_saves, is_internal = 0) AS unknown_source_saves_excluded
FROM trial_outcomes

-- ============================================================================
-- Query 4: trial lifecycle outcomes
-- Unit: account, grouped by population (trial, or direct initial charge with
-- no trial) and product. The lifecycle of the first trial is bounded at the
-- next trial_started of the same account, so a later trial's events are
-- never credited to the first. Conversion is payment_succeeded with
-- payment_kind = trial_conversion only. Only a trial_cancelled with
-- cancel_category = voluntary turns auto-renew off; refund, billing,
-- developer and unknown cancellations are counted apart. Rates use anchors
-- at least 14 days old; younger anchors are reported as immature even when
-- a terminal event has already arrived.
-- ============================================================================
WITH internal_accounts AS (
    SELECT arrayJoin(['__internal_account_placeholder__']) AS account_id
),
-- source:begin q4
lifecycle_rows AS (
    SELECT
        distinct_id AS account_id,
        event,
        timestamp,
        coalesce(toString(properties.environment), '') AS environment,
        coalesce(toString(properties.store_environment), '') AS store_environment,
        coalesce(toInt(properties.analytics_version), 0) AS analytics_version,
        coalesce(toString(properties.revenuecat_event_id), '') AS event_id,
        coalesce(toString(properties.payment_kind), '') AS payment_kind,
        coalesce(toString(properties.cancel_category), '') AS cancel_category,
        coalesce(toString(properties.product_id), '') AS product_id
    FROM events
    WHERE timestamp >= toDateTime('2026-09-20 00:00:00')
      AND timestamp <= now()
      AND event IN ('trial_started', 'trial_cancelled', 'subscription_uncancelled',
                    'trial_expired', 'payment_succeeded')
),
-- source:end q4
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
    population,
    product_id,
    countIf(is_internal = 0) AS accounts,
    countIf(is_internal = 1) AS internal_accounts_excluded,
    sumIf(duplicate_deliveries_collapsed, is_internal = 0) AS duplicate_deliveries_removed,
    countIf(is_internal = 0 AND repeat_trial_starts) AS accounts_with_repeat_trial_starts,
    countIf(is_internal = 0 AND population = 'trial' AND mature = 0) AS immature_trials,
    countIf(is_internal = 0 AND mature = 0 AND outcome = 'converted') AS immature_converted,
    countIf(is_internal = 0 AND mature = 0 AND outcome = 'expired') AS immature_expired,
    countIf(is_internal = 0 AND outcome = 'pending') AS pending,
    countIf(is_internal = 0 AND outcome = 'pending' AND auto_renew_state = 'off') AS pending_auto_renew_off,
    countIf(is_internal = 0 AND outcome = 'pending' AND auto_renew_state = 're_enabled') AS pending_re_enabled,
    countIf(is_internal = 0 AND outcome = 'pending' AND auto_renew_state = 'never_cancelled') AS pending_never_cancelled,
    countIf(is_internal = 0 AND mature) AS mature_trials,
    countIf(is_internal = 0 AND mature AND outcome = 'converted') AS converted,
    countIf(is_internal = 0 AND mature AND outcome = 'expired') AS expired,
    countIf(is_internal = 0 AND mature AND outcome = 'unknown_no_terminal_event') AS unknown_no_terminal_event,
    countIf(is_internal = 0 AND mature AND outcome = 'converted' AND ever_cancelled) AS converted_after_cancel,
    countIf(is_internal = 0 AND mature AND outcome = 'expired' AND ever_cancelled) AS expired_after_cancel,
    round(100.0 * converted / nullIf(converted + expired, 0), 1) AS conversion_percent_of_settled,
    countIf(is_internal = 0 AND other_cancels > 0) AS accounts_with_non_voluntary_cancel,
    sumIf(other_cancels, is_internal = 0) AS non_voluntary_cancel_events,
    countIf(is_internal = 0 AND direct_initial_after_trial) AS accounts_direct_initial_after_trial,
    sumIf(direct_initial_payments, is_internal = 0) AS direct_initial_payment_events,
    sumIf(renewals, is_internal = 0) AS renewals_excluded,
    sumIf(other_events, is_internal = 0) AS other_lifecycle_events_ignored
FROM trial_state
GROUP BY population, product_id
ORDER BY population, accounts DESC
