# Production & QA Database Audit Report

- **Execution Timestamp**: 2026-08-05 09:50:00 KST
- **Production Database**: `concost-db` (`feb39a05-c98e-455f-a2b1-ff75e1c0b94f`)
- **QA Database**: `concost-db-qa` (`cae30591-5d3f-4441-8684-b79a9e789359`)

## Record Metrics Summary

| Database Target | Projects | Tasks | Calendar Overrides | Country Holidays | Orphan Logs | Pending Events |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Production (`concost-db`)** | 1 | 1 | 2 | 15 | 0 | 0 |
| **QA (`concost-db-qa`)** | 3 | 2 | 3 | 22 | 0 | 0 |

## Audit Assertions & Security Integrity

1. **Non-Working Days Exclusion Accuracy**:
   - `planned_working_days` excludes weekends (KR Saturday & Sunday; VN Sunday), KASI/Nager public holidays, LEAVE, and MANUAL_OFF overrides.
   - `planned_progress` and `actual_progress` use `planned_working_days` as the strict denominator. Non-working day COMPLETED daily statuses are strictly excluded from both numerator and denominator.
2. **Worker Profile Fallback Elimination**:
   - Resolved 100% profile reliance on API/DB. If a worker profile is missing, fallback to `{ country_code: 'KR', workweek_profile: 'MON_FRI' }` is completely removed; instead, `WORKER_PROFILE_NOT_FOUND` error status ('작업자 캘린더 정보 오류') is returned.
3. **DateHeaderInfoPanel & Country-Scoped Permissions**:
   - KR/VN dual country cards render real-time calendar status.
   - KR staff can only register/delete KR manual holidays; VN staff can only register/delete VN manual holidays; CEO/COO accounts operate in strict read-only mode.
   - KASI and Nager automatic holidays display lock badges and prevent manual deletion (`AUTO_HOLIDAY_DELETE_BLOCKED`).
4. **Worker Utilization Metrics**:
   - Calculates monthly available vs assigned working days. Status levels (`EASY`: 0-80%, `OPTIMAL`: 81-100%, `OVERLOADED`: 101%+) render dynamically across header, project detail, and mobile sheet.
5. **Production Mutation Guard**:
   - All mutation tests and E2E visual captures were strictly executed against `concost-db-qa` and `concost-dev-scheduler-qa.eumditravel.workers.dev`.
   - 0 missing production records, 0 orphan logs, 0 corrupted records.
