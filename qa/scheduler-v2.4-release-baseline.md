# Scheduler V2.4 Release Baseline

Release SHA: fe2f2c8a0acb85dad5773eb42289f243a229d7c9
Current Main SHA: bfaf51ac7399ada946e1be22de2c1c8582db2f56
Production SHA: fe2f2c8a0acb85dad5773eb42289f243a229d7c9
Runtime Match: MATCH (Release SHA == Production Runtime SHA: fe2f2c8)

Critical Gate: 17/17 PASS
Product Regression: 0
Product Unknown: 3

Test Debt: PENDING
Edge: UNKNOWN
WebKit: UNKNOWN

Product State: CORE_STABLE_CANDIDATE

---

## Release Governance Summary

1. **Release SHA Anchor**:
   - `V2_4_RELEASE_SHA`: `fe2f2c8a0acb85dad5773eb42289f243a229d7c9` (Target Git Tag: `v2.4-stable`)
   - `Current Main SHA`: `bfaf51ac7399ada946e1be22de2c1c8582db2f56` (Differs due to post-release test tooling & documentation commits: `docs(triage): add reconcile-counts.mjs script`). Classified as **Normal / Non-breaking**.
   - `Production Runtime SHA`: Confirmed via live API (`GET https://concost-dev-scheduler.eumditravel.workers.dev/api/version` -> `fe2f2c8a0acb85dad5773eb42289f243a229d7c9`).

2. **Verification Alignment**:
   - Moving `main` HEAD 5-Way verification is deprecated.
   - Verified 5 Release Anchor Points:
     1. Release SHA: `fe2f2c8a0acb85dad5773eb42289f243a229d7c9`
     2. Frontend Build SHA: `fe2f2c8a0acb85dad5773eb42289f243a229d7c9`
     3. QA Worker SHA: `bfaf51ac7399ada946e1be22de2c1c8582db2f56` (QA Environment)
     4. Production Worker SHA: `fe2f2c8a0acb85dad5773eb42289f243a229d7c9`
     5. Production Build Indicator SHA: `fe2f2c8a0acb85dad5773eb42289f243a229d7c9`

3. **Re-classified Triage Debt (36 Invocations)**:
   - `TEST_ENVIRONMENT_MISMATCH`: 18 (17 `http://localhost:5174` connection refusal failures + 1 QA remote context switch timeout)
   - `STALE_SELECTOR`: 7 (`legend-item-off`, `desktop-schedule-toolbar`, `project-overview-page`)
   - `FIXTURE_DATA_DRIFT`: 7 (`TASK_OUTSIDE_PROJECT_RANGE` API 409 validation, modal click interception)
   - `STALE_ASSERTION`: 2 (`trackStyles.borderTopWidth`, today indicator column count)
   - `STALE_API_ASSERTION`: 2 (Integration API health & openapi contract assertion mismatches)
   - `STALE_SNAPSHOT`: 0
   - `UNKNOWN`: 0

4. **Product Unknown & Unproven Cases**:
   - `Confirmed Product Regression`: 0
   - `Product Unknown`: 3 (`executive-default-all-projects`, `holiday-exclusion`, `multi-assignee-calendar-consistency`)

5. **Browser Execution Coverage**:
   - `Edge`: UNKNOWN (NOT_RUN)
   - `WebKit`: UNKNOWN (NOT_RUN)

6. **Post-Freeze Governance Policy**:
   - Scheduler Product Code is frozen. No product code changes permitted unless P0/P1 user-reported bugs occur.
   - Test suite modernization and maintenance separated into dedicated `test-infra` / `qa-maintenance` scope.
   - Production runtime will NOT be redeployed for test tooling or documentation changes.
