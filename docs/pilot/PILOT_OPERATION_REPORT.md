# Pilot Operation Report

## Pilot period

- Start: Day 0 baseline — 2026-08-14
- End: ongoing employee Pilot
- Environment: `PILOT` / `open_test`

## Build and safety

| Item | Value |
|---|---|
| Starting SHA | `b4275974ef2348441d3888a501be99ac3905f80f` |
| Final SHA | `bf4ceca7f852bda391a65db2b0fd9c1c1eff7f22` |
| Pilot Live | `bf4ceca7f852bda391a65db2b0fd9c1c1eff7f22` |
| AUTO_APPLY | `false` |
| Production SHA | `df2b1002feea374788c930f20fa4a6e95e72f0ec` |
| Production Worker/D1 changed | `NO` |
| Production migration | `NO` |

## Day 0 baseline

| Entity | Count |
|---|---:|
| Projects | 5 |
| Tasks | 93 |
| Official Forecast Versions | 5 |
| Actual Aggregates | 0 |
| Worklogs | 0 |
| Shadow Versions | 0 |
| Approvals | 0 |
| Notifications | 0 |
| Authority Revision | 772 |

Recovery backup: `qa/production-backups/checkpoint7-final-pilot-baseline-20260814.sql`  
SHA256: `A078E5AB7FDADD54CE8DC2F2157DE472FF19BE925E6106772561055AB6336439`

## Readiness result

- Employee Pilot: `READY_FOR_EMPLOYEE_PILOT`
- Production readiness: `NOT YET ASSESSED`
- Accepted limitation: `TEST_ACTOR_HEADER_CAN_BE_MANUALLY_CHANGED`
- Open blockers: none known at Day 0

This report is a template for subsequent Pilot days. It must not be used as evidence of Production readiness.
