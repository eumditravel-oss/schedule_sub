# Pilot Issue Register

This register is the operational record for the open-test Pilot. It is intentionally separate from test fixtures and database backups.

## Classification

- `BUG`: implementation differs from the defined behavior.
- `WORKFLOW_MISMATCH`: implementation works, but does not match the employee or manager workflow.
- `USABILITY`: the workflow is valid but confusing or inefficient.
- `POLICY_CHANGE`: an approved operating-policy change.
- `NEW_FEATURE`: outside the current Pilot scope; record it here and backlog it.

Severity is `P0` (stop and protect data), `P1` (same-day stabilization), `P2` (schedule when operations are safe), or `P3` (cosmetic/minor).

## Issue template

```text
ID: PILOT-###
Reported At:
Reporter / Actor:
Office: KR | VN
Environment: PILOT
Route:
Project / Employee:
Category: BUG | WORKFLOW_MISMATCH | USABILITY | POLICY_CHANGE | NEW_FEATURE
Severity: P0 | P1 | P2 | P3
Description:
Expected:
Actual:
Reproduction:
Data Impact:
Schedule Impact:
Workaround:
Root Cause:
Fix SHA:
Regression Test:
Status: OPEN | INVESTIGATING | FIX_IN_PROGRESS | FIXED | VERIFIED | BACKLOG
```

## Stabilization history

| ID | Category | Severity | Summary | Fix SHA | Status |
|---|---|---:|---|---|---|
| PILOT-001 | BUG | P1 | Duplicate notification dedupe could reference a non-inserted event ID and fail the recipient FK. | `fba0868` | VERIFIED |
| PILOT-002 | BUG | P1 | Pending approvals remained actionable after their Shadow revision became stale. | `b6c978b` | VERIFIED |
| PILOT-003 | BUG | P1 | An applied Shadow could still be presented as a fresh/current candidate. | `4fadaf6`, `32104cb` | VERIFIED |

New issues must be added here before a fix branch is created. Do not edit Pilot data manually to close an issue.
