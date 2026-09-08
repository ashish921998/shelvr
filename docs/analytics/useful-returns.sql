WITH per_item AS (
    SELECT
        distinct_id,
        properties.item_id AS item_id,
        anyIf(properties.item_type, event = 'item_saved') AS item_type,
        minIf(timestamp, event = 'item_saved') AS saved_at,
        argMinIf(coalesce(properties.save_session_id, ''), timestamp, event = 'item_saved') AS save_session,
        countIf(event = 'item_saved') AS save_events,
        groupArrayIf(tuple(timestamp, coalesce(properties.$session_id, '')), event = 'item_opened') AS opens,
        groupArrayIf(tuple(timestamp, coalesce(properties.$session_id, '')), event = 'item_action' AND properties.action IN ('copy', 'share')) AS actions
    FROM events
    WHERE timestamp >= now() - INTERVAL 37 DAY
      AND timestamp <= now()
      AND event IN ('item_saved', 'item_opened', 'item_action')
      AND properties.environment = 'production'
      AND properties.analytics_version = 1
      AND notEmpty(coalesce(properties.item_id, ''))
    GROUP BY distinct_id, item_id
), outcomes AS (
    SELECT
        item_type,
        save_session,
        notEmpty(save_session) AND arrayExists(
            opened -> opened.1 > saved_at
                AND opened.1 <= saved_at + INTERVAL 7 DAY
                AND notEmpty(opened.2) AND opened.2 != save_session,
            opens
        ) AS reopened,
        notEmpty(save_session) AND arrayExists(
            action -> action.1 > saved_at
                AND action.1 <= saved_at + INTERVAL 7 DAY
                AND notEmpty(action.2) AND action.2 != save_session
                AND arrayExists(
                    opened -> opened.1 > saved_at
                        AND opened.1 <= action.1
                        AND opened.2 = action.2,
                    opens
                ),
            actions
        ) AS useful_return
    FROM per_item
    WHERE save_events > 0
      AND saved_at <= now() - INTERVAL 7 DAY
)
SELECT
    item_type,
    count() AS mature_saves,
    countIf(notEmpty(save_session)) AS measurable_saves,
    countIf(empty(save_session)) AS saves_without_session,
    countIf(reopened) AS reopened_within_7_days,
    countIf(useful_return) AS useful_returns_within_7_days,
    round(100.0 * countIf(reopened) / nullIf(countIf(notEmpty(save_session)), 0), 1) AS reopen_percent,
    round(100.0 * countIf(useful_return) / nullIf(countIf(notEmpty(save_session)), 0), 1) AS useful_return_percent,
    round(100.0 * countIf(useful_return) / nullIf(countIf(reopened), 0), 1) AS action_after_reopen_percent
FROM outcomes
GROUP BY item_type
ORDER BY mature_saves DESC
