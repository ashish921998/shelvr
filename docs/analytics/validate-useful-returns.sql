WITH per_item AS (SELECT 'valid' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 777600 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 776736 SECOND, 'return')] AS actions
UNION ALL
SELECT 'same_session' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 777600 SECOND, 'save')] AS opens, [tuple(now() - INTERVAL 776736 SECOND, 'save')] AS actions
UNION ALL
SELECT 'too_late' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 172800 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 171936 SECOND, 'return')] AS actions
UNION ALL
SELECT 'unknown_session' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, '' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 777600 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 776736 SECOND, 'return')] AS actions
UNION ALL
SELECT 'immature' AS item_type, now() - INTERVAL 86400 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 77760 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 69120 SECOND, 'return')] AS actions
UNION ALL
SELECT 'action_before_open' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 777600 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 786240 SECOND, 'return')] AS actions
UNION ALL
SELECT 'different_session' AS item_type, now() - INTERVAL 864000 SECOND AS saved_at, 'save' AS save_session, 1 AS save_events, [tuple(now() - INTERVAL 777600 SECOND, 'return')] AS opens, [tuple(now() - INTERVAL 776736 SECOND, 'another')] AS actions), outcomes AS (
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
