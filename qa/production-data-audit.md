# Production & QA Database Audit Report

- **Execution Timestamp**: 2026-08-05 08:53:00 KST
- **Production Database**: `concost-db` (`feb39a05-c98e-455f-a2b1-ff75e1c0b94f`)
- **QA Database**: `concost-db-qa` (`cae30591-5d3f-4441-8684-b79a9e789359`)

## Record Metrics Summary

| Database Target | Projects | Tasks | Calendar Overrides | Country Holidays | Orphan Logs | Pending Events |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Production (`concost-db`)** | 1 | 1 | 2 | 15 | 0 | 0 |
| **QA (`concost-db-qa`)** | 3 | 2 | 3 | 22 | 0 | 0 |

## Audit Assertions & Security Integrity

- **Production Mutation Guard**: All mutation tests and E2E test runs were strictly isolated to `concost-db-qa` and `concost-dev-scheduler-qa.eumditravel.workers.dev`.
- **Missing / Restored Records**: 0 missing production records, 0 corrupted records.
- **Orphan Logs / Residuals**: 0 orphan leave logs or orphan daily statuses detected.
- **Restore Token Security**: Tokens generated randomly per leave deletion event, zero leakage in API responses.
