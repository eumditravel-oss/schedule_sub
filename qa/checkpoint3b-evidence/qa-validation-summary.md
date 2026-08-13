# Checkpoint 3B QA validation summary

- Source branch: `codex/v3-checkpoint-3b-official-forecast`
- Final QA commit: `04cf5f9`
- QA Worker version: `dbfd60f5-a8a6-4ac8-a789-cd1d9edcc692`
- QA migrations: `0031`, `0032`, `0033`
- QA backups: `concost-db-qa-before-0031-ceecf72.sql`, `concost-db-qa-before-0033-09a5547.sql`
- Production: not accessed, migrated, deployed, or changed for Checkpoint 3B.

## Feature flags after validation

- Official Apply: true
- Auto Apply: false (temporarily enabled only for the isolated QA fixture, then restored)
- Approval: true
- Restore: true

## Validated behavior

- Cross-project manager approval appended one Official Forecast version for each project under one correlation ID; replay produced no duplicate versions.
- Baseline, Actual aggregate, task source dates, and original Forecast versions remained unchanged by apply.
- Manager reject recorded reason/audit and did not append an Official Forecast. Cross-project reject marked both related candidates rejected atomically.
- Restore preview and restore appended a new `MANAGER_RESTORE` version with the target snapshot while preserving Actual facts.
- Authority revision change returned `SHADOW_AUTHORITY_STALE` before mutation.
- CEO, COO, ordinary editor, and Primary approval attempts returned 403.
- Auto Apply OFF generated an eligible candidate without Official Forecast mutation.
- Auto Apply ON on the isolated fixture appended exactly one `SHADOW_AUTO_APPLY` Official Forecast version, then the QA flag was restored to false.
- Current forecast API exposes only a same-authority/current-base candidate and returns its Worklog ID, Revision ID, Engine Version, Shadow Version, approval state, and constraint results from the same run.
- A stale apply now persists `STALE`, marks a pending approval stale, and creates a deterministic pending recalculation request without changing Official data.
- Active date and UTC timestamp Fixed Start/End, Not Before, and Milestone constraints all block incompatible historical restores.
- Official Forecast history is protected both by API preflight and D1 task/project delete guards; mobile detail timelines now read the same Official Forecast projection as desktop.
- Forecast-version races (including final D1 CAS failures) now stale the full correlation and enqueue exactly one deterministic recalculation request. UTC timestamp constraints fail closed for historical date-only snapshots, so a Temporary Primary timezone change cannot bypass an exact-time constraint.

## Local validation

- `tests/forecastApplyLocalD1.integration.test.ts`: 20 passed
- Final focused regression suite: 86 passed
- TypeScript: passed
- Production build: passed
- `wrangler types --check`: passed
- `git diff --check`: passed

## QA integrity

- Completion integrity: 0 inconsistent projects, 0 inconsistent tasks
- Scheduler integrity: PASS

## Independent final audit

- Audit target: `04cf5f9`
- Result: `CHECKPOINT3B_INDEPENDENT_AUDIT_PASS`
- High findings: `0`
- Medium findings: `0`
- Final isolated Local D1 integration: `22/22` passed
- Official-date and apply-guard tests: `3/3` passed
