# Pilot Data Integrity Check (read-only)

Run after a Pilot health report or before a recovery decision. Use the manager read APIs and a read-only D1 export/query. Do not repair rows manually.

## Required assertions

- Baseline project/task rows are unchanged.
- The current Official Forecast pointer exists and its task snapshots are complete.
- Official Forecast history is append-only.
- Actual rows have valid Worklog/completion provenance.
- Effective Worklog revisions are unique and internally consistent.
- Current Shadow input is authoritative; applied or forecast-mismatched Shadow rows are not fresh.
- No pending approval references a stale Shadow.
- Notification logical events are deduplicated and every recipient has a valid event FK.
- No orphan forecast tasks or Worklog revisions exist.

## Result format

```text
PILOT DATA INTEGRITY
Date:
Baseline: PASS | FAIL
Official Forecast: PASS | FAIL
Actual provenance: PASS | FAIL
Worklog revisions: PASS | FAIL
Shadow authority/freshness: PASS | FAIL
Approval/stale linkage: PASS | FAIL
Notifications/FK/dedupe: PASS | FAIL
Orphans/current pointers: PASS | FAIL
Evidence path:
Follow-up issue ID:
```

Any `FAIL` is a data-safety event. Stop Pilot mutations, preserve a backup, and follow the P0/P1 triage procedure in the issue register.
