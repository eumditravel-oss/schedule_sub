# Pilot Daily Health (read-only)

Run this checklist once per Pilot business day from a manager read session. It must not create Worklogs, revisions, Shadow runs, approvals, notifications, or schedule changes.

## Sources

- `GET /api/v3/manager/operations/today`
- `GET /api/v3/manager/digest/today` (or the current Digest route)
- `GET /api/v3/manager/notifications`
- `GET /api/projects?status=ALL`
- `GET /api/projects/:id/comparison`
- `GET /api/projects/:id/forecast/history`
- Worker/Wrangler logs for HTTP 500, D1, FK, timeout, and unhandled exceptions

## Record

```text
PILOT DAILY HEALTH
Date:
Active Employees:
Morning Submitted:
Morning Late:
Morning Missing:
EOD Submitted:
EOD Missing:
Worklogs Created:
Revisions:
Actual Updates:
Fresh Shadows:
Stale Shadows:
Schedule Advanced:
Schedule Delayed:
Approval Required:
Blocked:
Manager Approvals:
Rejects:
Notifications:
Overtime:
Corrections:
HTTP 500:
Unexpected 4xx:
P0:
P1:
P2:
P3:
```

If a value is unavailable, record `N/A` rather than inferring it. Any P0/P1, data-integrity anomaly, or repeated HTTP 500 opens an entry in `PILOT_ISSUE_REGISTER.md`.
