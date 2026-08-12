# Developer Scheduler V3 — Checkpoint Implementation Plan

## 0. Current checkpoint authority

Checkpoint 0.5 and Checkpoint 1 Foundation are authorized now, in strict order:

1. reconcile QA/Production schema and migration ledger;
2. remove date-based auto completion;
3. record resolved policy;
4. apply the minimal Baseline/Forecast/Actual shadow schema;
5. dry-run and apply deterministic Legacy Bootstrap;
6. verify QA;
7. backup, apply, deploy, and verify the current test-LIVE environment.

Any unexplained ledger/schema difference, `UNKNOWN`, or unsafe `PARTIALLY_APPLIED` stops the sequence. Checkpoint 2 implements Daily Worklog APIs and the minimal QA Harness. Checkpoint 3A implements dependency proposal/review inputs, deterministic Shadow recalculation, Before/After preview, and official-data invariance. Official apply, approval/rejection finalization, restore, schedule-adjustment application, notifications, messenger integration, and real authentication remain excluded.

Checkpoint 2 deliverables: 0027 additive schema, centralized office capacity, Morning/EOD/revision/correction APIs, Primary/Support/Executive guards, effective Actual contribution aggregation, idempotency, and `/qa/daily-worklog`. No scheduling date mutation is authorized.

Checkpoint 3A deliverables: 0028 additive schema, pure integer-minute engine, candidate-only dependencies with manager review, Task constraints/project priority, employee calendar capacity, Shadow versions/diffs/allocations/impact summaries, `/projects/:projectId/shadow-schedule`, and A–Z tests. Official apply flag is false and no apply endpoint exists.

Resolved implementation policy for this checkpoint:

- `TEST_SELECTOR` with separate actor/view context; CEO/COO view/export only;
- no date-based Actual/completion;
- immutable Baseline V1 and identical Forecast V1;
- deterministic `LEGACY_BOOTSTRAP` at configured cutover `2026-08-11`;
- VN 08:00–17:00/480 min and KR 09:00–17:00/420 min, 60-minute break `PROVISIONAL_CONFIG`;
- proposed effort from baseline valid workdays, no workforce weighting;
- `HYBRID_APPROVAL`, manager priority, manager-assigned temporary Primary;
- relationship-authorized rebaseline, next-working-day 09:00 self-edit cutoff;
- append-only Correction Event and grouped in-app/digest notification policy.

## 1. Delivery principles

- One checkpoint is one bounded architecture/implementation objective, preferably one PR.
- Do not combine schema, engine, UI, notification, and production activation in one patch.
- Every checkpoint starts from a known Git SHA and D1/schema/data snapshot.
- DDL deployment and feature activation are separate changes.
- QA must precede production; localhost is never reported as live evidence.
- Workforce allocation percentages remain non-authoritative until the deferred decision is resumed.
- Stop a checkpoint when its exit gate fails; do not carry hidden debt into the next checkpoint.

## 2. Required evidence for every implementation checkpoint

1. Pre-change Git SHA, D1 schema fingerprint, and scoped data counts.
2. Unit tests for pure rules.
3. Integration tests for D1/API transaction and idempotency behavior.
4. Migration dry run and idempotent second-run verification when schema changes.
5. Browser validation and screenshots for user-visible behavior.
6. Regression suite result for existing project/Gantt/calendar/print behavior.
7. QA runtime/frontend/build-indicator SHA match.
8. Production deployment only after approved QA evidence.

## Checkpoint 0 — Current State Audit and Decisions

### Scope

- Review and approve the seven V3 architecture documents.
- Resolve decision register dependencies.
- Reconcile production schema fingerprint with `d1_migrations` ledger.
- Define pilot project, employees, activation date, and identity provider.
- Freeze Baseline V1 snapshot acceptance criteria.

### Application/schema changes

None, except a separately reviewed migration-ledger reconciliation artifact if required. No business tables or live data change in the architecture-only task.

### Tests/evidence

- read-only schema fingerprint comparison;
- production GROUPWARE date/task count evidence;
- decision sign-off record;
- no-code diff verification.

### Exit gate

- required decisions resolved;
- migration numbering/ledger authority established;
- authenticated actor plan approved;
- Baseline hash algorithm approved.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `high` for audit/decision consistency. Use `xhigh` only if schema reconciliation reveals contradictory migration history.

## Checkpoint 1 — Baseline, Forecast, and Actual Schema

### Scope

- Add additive schema for identity links/offices, strengthened baseline metadata, schedule policies/versions/task rows, dependencies/constraints, worklog/actual/capacity, adjustments/approvals, and notification foundation.
- Add unique keys and indexes for versioning/idempotency.
- Do not snapshot production baseline yet.
- Add typed domain contracts without changing current API responses.

### Expected code areas

- new D1 migration files with unique sequence;
- Worker domain types/repositories;
- schema fingerprint and migration verification scripts;
- no UI feature activation.

### Tests

- migration first run and second run;
- old schema to new schema upgrade fixture;
- constraints/unique idempotency tests;
- current API regression against untouched compatibility tables;
- rollback/read-path feature flag tests.

### Exit gate

- QA schema matches reviewed fingerprint;
- zero current schedule/completion row changes;
- application behaves identically with feature flags off.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `high`; use `xhigh` for D1 transaction/constraint review.

## Checkpoint 2 — Worklog API and Daily Capacity

### Scope

- Implement authenticated actor middleware and actor/view-context separation.
- Implement Morning/EOD draft/submit/revision APIs.
- Implement work categories, duplicate-task protection, delegation audit, and idempotency.
- Implement employee-local work date and minute-level capacity events.
- Save actual facts/task actual projection; forecast remains preview-disabled or shadow-only.

### Explicit exclusions

- no confirmed schedule movement;
- no baseline mutation;
- no notification delivery beyond audit/debug if not ready;
- no allocation-percent weighting.

### Tests

- actor spoofing/selected view escalation denial;
- Primary versus Support progress authority;
- multiple projects/tasks per day;
- partial leave/meeting/company duty capacity;
- timezone boundary KR/VN;
- duplicate submit/retry;
- delegated submit with `submitted_by`/`on_behalf_of`;
- missing EOD creates state only.

### Browser evidence

- Morning and EOD API contract harness or minimal internal test UI;
- existing scheduler screenshots unchanged.

### Exit gate

- actual facts are auditable/rebuildable;
- zero schedule date mutation;
- idempotency and authorization tests pass.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `high` for backend/security; focused UI harness work may use `GPT-5.6 Terra`, reasoning `high`.

## Checkpoint 3 — Deterministic Schedule Engine

### Scope

- Implement pure engine with minute capacity, remaining effort, confirmed FS dependencies, constraints, parallel work, project priority hooks, and deterministic tie-breakers.
- Extract affected dependency/capacity subgraph.
- Produce tentative diff/explanation only.
- Implement forecast version CAS, idempotency, and engine trace.

### Explicit exclusions

- no automatic confirmed forecast apply in production;
- no generalized WBS dependency assumptions;
- no UI beyond test/debug output.

### Tests

- pure unit tests for every rule and failure state;
- mandatory CASE A–J fixtures with exact before/after values;
- property tests: deterministic repeat, no baseline mutation, no capacity over-allocation, dependency ordering, monotonic versions;
- cycle/fixed constraint/cross-project ambiguity;
- concurrent worklog version conflict and retry;
- rollback creates restoration version.

### Exit gate

- engine outputs are deterministic and explainable;
- initial Forecast V1 equals Baseline V1;
- no production schedule writes; QA shadow comparisons approved.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `xhigh` due to graph scheduling, capacity allocation, concurrency, and invariant risk.

## Checkpoint 4 — Worker Worklog UI

### Scope

- Add existing-style header actions and responsive worklog drawer/sheet.
- Implement Morning/EOD, category conditional fields, draft preservation, validation, and impact preview.
- Implement KR/VN strings and timezone/delegation labels.
- Hide all write actions for executives.
- Connect to shadow/tentative engine preview; main Gantt remains confirmed/legacy.

### Tests

- component and i18n tests;
- responsive desktop/mobile browser flows;
- keyboard/focus/accessibility;
- duplicate task and missing estimate states;
- Primary/Support field visibility;
- actor/view-context visual distinction;
- executive zero mutation controls;
- no regression to Gantt hatches, month boundaries, or print.

### Screenshots

- desktop Morning/EOD/impact preview;
- mobile bottom sheet;
- manager delegated indicator;
- KR and VN;
- executive view-only.

### Exit gate

- pilot users can submit facts safely;
- tentative preview matches engine test fixture;
- current project screens retain design consistency.

### Recommended Codex profile

`GPT-5.6 Terra`, reasoning `high` for iterative UI integration; `GPT-5.6 Sol`, reasoning `high` for authorization/API review.

## Checkpoint 5 — Manager Approval, Notification, and Audit

### Scope

- Implement HYBRID/ALWAYS approval states and manager queue.
- Implement grouped adjustment notifications, subscriptions, in-app center, daily digest data, and outbox retry.
- Implement worklog correction/revert actions and full adjustment history.
- Configure initial supervisor/subscription data through migration/admin UI, not names in code.

### Tests

- approval threshold matrix;
- stale-version approval denial;
- reject/recalculate/revert;
- one worklog/many tasks produces one summary notification;
- subscription relationship resolution;
- retry/backoff/dead-letter;
- delegated actor audit;
- manager and executive permission matrix.

### Exit gate

- every adjustment has a complete audit chain;
- notifications are durable and deduplicated;
- revert simulation J passes in QA.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `high`; use `xhigh` for concurrency/revert review.

## Checkpoint 6 — Progress KPI and Baseline/Forecast Gantt

### Scope

- Replace split progress formulas with one server-owned KPI projection.
- Add Baseline planned, Actual overall, progress variance, Baseline end, Forecast end, and schedule variance.
- Add Baseline/Forecast/Actual Gantt layers and signed variance badges/history links.
- Update print reports to use confirmed forecast and explicit KPI provenance.
- Deprecate date-driven `AUTO_TIME` actual completion and client business-rule fallback.

### Tests

- API/UI/print KPI equality;
- weight precedence and low-confidence fallback;
- expired incomplete Task remains delayed/overdue;
- active project at 100% actual remains lifecycle-active until explicit completion;
- baseline immutable across all worklog/approval/revert actions;
- Gantt geometry, hatches, month boundaries, PDFs, KR/VN.

### Browser/PDF evidence

- project overview KPI lines;
- detail three-layer Gantt at multiple widths;
- history badge interaction;
- A3/A4 parsed page sizes/page counts and visual screenshots.

### Exit gate

- Summary, Overview, Detail, Print, and API consume identical KPI values;
- zero elapsed-date actual completion path remains.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `high`; UI-only polish may use `GPT-5.6 Terra`, reasoning `high`.

## Checkpoint 7 — Migration, QA, and Production Rollout

### Scope

- Backup and schema-ledger reconciliation.
- Idempotent Baseline V1 snapshot.
- Initial Forecast V1 exact clone.
- Legacy actual/completion projection with migration provenance.
- Dependency candidate generation/review.
- Pilot activation date and feature flags.
- QA observation, approval, production rollout, rollback drill.

### Required verification

- GROUPWARE exact `2026-08-05` → `2026-11-10`, 29-task ID/date hash;
- zero baseline/forecast delta at initialization;
- completed data set equality;
- zero historical generated worklogs;
- second migration run creates zero duplicate snapshots;
- D1 backup restore drill or documented verified procedure;
- all critical unit/integration/browser/PDF regression gates;
- live QA five-way build fingerprint, then production fingerprint;
- production read-only smoke and integrity checks.

### Rollout stages

1. schema flags off;
2. shadow actual/engine;
3. pilot worklog writes;
4. tentative approval only;
5. low-risk confirmed auto-apply;
6. broader team expansion.

### Stop/rollback triggers

- baseline hash mismatch;
- unexplained forecast diff;
- identity/permission bypass;
- duplicate adjustment application;
- capacity/dependency invariant failure;
- notification loss/duplication beyond threshold;
- build SHA mismatch;
- current scheduler/print regression.

### Recommended Codex profile

`GPT-5.6 Sol`, reasoning `xhigh` for migration/release orchestration and evidence audit. Use no lightweight model for production data or rollback decisions.

## 3. Recommended PR sequence

1. `docs(v3): approve architecture and decisions`
2. `feat(v3-schema): add shadow scheduling domain`
3. `feat(v3-worklog): add authenticated actual facts and capacity`
4. `feat(v3-engine): add deterministic tentative forecast`
5. `feat(v3-ui): add daily worklog workflow`
6. `feat(v3-governance): add approvals notifications and revert`
7. `feat(v3-kpi): unify progress and gantt layers`
8. `release(v3-pilot): snapshot baseline and activate pilot`

Each PR must remain independently reviewable and safely disableable.

## 4. Definition of architecture complete

- Current-state audit is evidence-backed.
- All user-required decisions are resolved.
- Baseline/Forecast/Actual boundaries are accepted.
- Engine simulations A–J have approved expected results.
- Migration/rollback evidence contract is approved.
- Implementation has not started until the user explicitly authorizes the next checkpoint.
