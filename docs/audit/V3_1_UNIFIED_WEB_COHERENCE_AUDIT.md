# Dynamic Scheduler V3.1 — Unified Web Experience Audit

Audit date: 2026-08-14 (KST)
Repository: `F:/Schedule`
Baseline source expected by the task: `0c67566a05583a8e479dc3f698ea7844060948da`
Production: `https://concost-dev-scheduler.eumditravel.workers.dev` (unchanged)
Pilot: `https://concost-dev-scheduler-pilot.eumditravel.workers.dev`

## Status boundary

V3 Core remains **100% complete**. V3.1 Unified Web Experience implementation is committed on `codex/v31-unified-web` and validated on Pilot. No authentication redesign, migration, Production cleanup, AUTO_APPLY change, or scheduling-engine rewrite was performed.

The existing Production release contract remains `SCHEDULER_ACCESS_MODE=internal_trust`, `AUTO_APPLY=false`, and `WAITING_FOR_FIRST_REAL_EMPLOYEE_WORKLOG`.

## Pilot provenance and safety

- Final Pilot branch SHA: audit-close HEAD (recorded in the release handoff)
- Pilot Worker version ID: audit-close deployment (recorded in the release handoff)
- Pilot access: `open_test`
- Pilot D1: `concost-db-pilot` (`67085415-318a-4a88-bb89-8aa7342ea5c1`)
- `DYNAMIC_SCHEDULER_AUTO_APPLY_ENABLED=false`
- Pre-deploy Pilot D1 backup: `qa/v31-pilot-backups/pilot-before-v31-20260814.sql`
- Backup SHA256: `240F71B06F2BA44A624A5FD22740C4D882D7C9DFB387B9CEC93FC4FC33CA64B6` (1,164,004 bytes)
- Production Worker, Production D1, and Production migrations were not changed.

Cache-busted Pilot provenance matched the audit-close branch deployment, with `environment=pilot` and `autoApplyEnabled=false`.

## Before IA

The product opened directly into the Scheduler. Project setup, Scheduler, Worklog, Manager Operations, reporting, and schedule-impact review were individually available, but the first-screen decision was not role-aware. Employees had to find Worklog separately; managers had to move between Operations and approval; CEO/COO had no dedicated read-only landing distinction.

## After IA

| Role | First screen | Primary path |
|---|---|---|
| Primary / Support / Regular | Personal Dashboard | `/dashboard` → `/worklog/today` |
| Schedule Manager | Team Dashboard | `/dashboard` → `/manager/worklog-approvals` or `/manager/operations` |
| CEO / COO Viewer | Scheduler | `/projects` (read-only) |

The root route resolves the current server worker row and redirects by role. Client-selected names are not used as authority.

## App shell and navigation

`AppShell` provides a shared responsive header, role-aware navigation, current-user display, environment/build indicator, and mobile navigation. The Dashboard uses the shell as the operating home. Existing Scheduler and Worklog pages retain their purpose-specific layouts while linking through the same route vocabulary.

Navigation now has these top-level destinations:

- Dashboard
- Projects / Scheduler
- Worklog Today and History
- Manager Operations and Worklog Approval (manager only)
- Reports / History

The Scheduler Overview no longer renders employee Worklog cards, Worklog editors, approval widgets, or Today-status cards. Full timeline and schedule-impact views remain in Scheduler; daily reporting remains in Worklog.

## Employee journey

1. Open `/` and land on `/dashboard`.
2. See local work date, office, capacity, Morning/EOD state, official Task list, plan minutes, and Approved Actual progress.
3. Open `/worklog/today` to submit Morning or EOD. EOD carries Morning plan minutes and labels Pending versus Approved Actual.
4. Follow a Task link to `/projects/:projectId?taskId=...`; Project Detail expands the relevant group and highlights the same Task.

No Shadow candidate is used as the Employee Today source. Only the current Official Forecast is used.

## Manager journey

Managers land on a Team Dashboard backed by `getManagerOperations()`. It exposes managed employee status, Morning/EOD completion, approval counts, exceptions, schedule delay, Shadow status, and links to detailed Operations and Worklog Approval. The existing queue remains the authoritative approval UI; bulk approval continues to use the server CAS/idempotency path and is limited to NORMAL rows.

## CEO/COO journey

CEO/COO Viewer sessions land on the Scheduler. They have read-only project, baseline, Official Forecast, Actual, Shadow, schedule delta, report, and history visibility. Worklog submission, approval, Project publish, and schedule mutations remain server-gated.

## Pilot browser validation

The route-level validation used the real Pilot Worker in the browser with the open-test actor selector and no fabricated Worklog/Actual records.

| Journey | Result | Evidence |
|---|---|---|
| Employee / Support root landing | PASS | `/` redirected to `/dashboard`; `personal-dashboard` rendered with official task count, Morning/EOD, Capacity, Approved Actual, Worklog CTA |
| Manager root landing | PASS | `/` redirected to `/dashboard`; `manager-dashboard`, Worklog Approval, and Operations CTAs rendered |
| CEO root landing | PASS | `/` redirected to `/projects`; Scheduler table rendered, no Today/Worklog cards or employee dashboard |
| Employee Worklog | PASS | `/worklog/today` rendered Morning/EOD controls, official task cards, VN policy/capacity, no alert/500 |
| Worklog → Scheduler | PASS | CTA preserved `project_id` and `taskId` in `/projects/:projectId?taskId=...` |
| Project Publish | PASS | Marker-owned Pilot draft published one Baseline + one initial Official Forecast in one batch |
| Publish idempotency | PASS | Repeated Publish kept Baseline count `1` and Official version count `1` |
| Mobile employee | PASS | Dashboard and Worklog rendered at 375/390/430 widths; measured document width matched viewport after Pilot-selector and dashboard overflow fixes |
| Mobile manager | PASS | Team Dashboard rendered with mobile navigation and approval/operations CTAs |
| Scheduler-only executive UI | PASS | CEO Scheduler contained timeline/report controls, with Worklog operation widgets absent |

The marker Project Publish fixture was intentionally Pilot-owned. Its post-publish deletion was correctly refused with `OFFICIAL_FORECAST_HISTORY_PROTECTED`; it remains an explicitly labelled Pilot evidence row so immutable Official history is not destroyed.

## Project publish journey

Project creation and WBS/task/assignment editing remain in the Project module. Project Detail now exposes a single **Project Publish** action. `POST /api/projects/:id/publish` is idempotent and creates, in one batch, the initial immutable Baseline and `schedule_versions`/`schedule_version_tasks` Official Forecast snapshot. Existing history is never replaced and repeated publish returns the existing version. No second Scheduler registration is created.

## Worklog journey

Worklog remains an independent module:

- `/worklog/today`: Morning → EOD carry-forward → submission state
- `/worklog/history`: revision and approval history
- `/manager/worklog-approvals`: manager approval only

EOD submission remains Pending until approval. Approved Worklog becomes authoritative Actual; Actual feeds Shadow; Forecast approval remains a separate action and does not run automatically.

## Duplicate-entry audit

| Entry | Result |
|---|---|
| Project → Scheduler | Project publish creates the Official snapshot once; Scheduler reads it |
| Task recreation in EOD | Completed/confirmed Tasks are excluded from Worklog context |
| Morning → EOD | Morning entries are carried forward; employee edits minutes/results instead of re-adding the same Task |
| Worklog approval → Actual | Existing revision/CAS/idempotency path is reused |
| Actual → Shadow | Existing Shadow recalculation path is reused |
| Shadow → Forecast | Separate approval/apply path remains; `AUTO_APPLY=false` |
| Reports | Official Forecast selectors are shared across desktop, mobile, and print |

## Context continuity

- Employee identity: authenticated `session.actor.employeeId` → worker row
- Project identity: stable `project_id`
- Task identity: stable `task_id`, including Worklog → Scheduler deep link
- Forecast identity: `official_forecast_version_id` / `schedule_versions.id`
- Shadow identity: `shadow_version_id` and `run_id`

## Domain causality

```text
Baseline (immutable)
  → Official Forecast (current approved schedule)
  → Today’s Official Work
  → Morning plan
  → EOD submitted report (Pending)
  → Manager Worklog approval
  → Approved Actual
  → Shadow candidate
  → Schedule-impact review
  → Forecast approval
  → new Official Forecast version
```

Worklog approval is not Forecast approval. Pending Worklog is not Actual. Shadow is not Today Task source. Restore creates history and does not roll back Actual.

## Role matrix

| Capability | Primary/Support | Manager | CEO/COO |
|---|---:|---:|---:|
| Read own dashboard/worklog | Yes | Yes | Read-only operations |
| Submit own Morning/EOD | Yes | Yes | No |
| Progress authority | Primary only | Review/approve | No |
| Support progress authority | No | No | No |
| Worklog approval | No | Yes | No |
| Forecast approval/apply | No | Capability-gated | No |
| Project/task publish/edit | Capability-gated | Yes | No |
| Scheduler read | Yes | Yes | Yes |

KR/VN local date and calendar policy are derived from the employee country/timezone. The Dashboard displays office and capacity without changing the scheduling engine.

## Findings

### Fixed

- **HIGH — Official date drift:** Overview/mobile/print surfaces used baseline/raw dates after append-only Forecast apply. Shared official-date selectors now cover project/task display surfaces.
- **HIGH — Worklog approval race:** different client idempotency keys could compete for one revision. A deterministic per-worklog/revision resolution reservation now serializes the decision.
- **MEDIUM — Completed Task re-suggestion:** Worklog context now excludes completed/confirmed Tasks.
- **MEDIUM — Multi-project Shadow summary:** manager employee rows now aggregate status, approval, and schedule variance deterministically.
- **MEDIUM — Viewer approval affordance:** Manager Operations now shows a read-only marker instead of an approval link when `scope.can_manage=false`.
- **HIGH — Pilot Worklog schema mismatch:** the context query referenced non-existent legacy `tasks.actual_progress` in the production-shaped Pilot schema. The query now uses canonical aggregate/legacy Actual fallbacks followed by `tasks.progress`; browser Worklog validation is green.
- **MEDIUM — Mobile dashboard overflow:** long official Task content could widen a single-column grid beyond 375px. Dashboard cards and the Pilot actor selector now allow min-width collapse/wrapping; 375/390/430 measurements are within viewport.

### Deferred after independent audit

- `wrangler types --check` remains an environment/tooling check requiring a writable Wrangler cache; TypeScript, Vite build, focused D1, and full local Vitest are green. Non-blocking for this Pilot-only gate.
- Restored full D1 integration suites remain CI/Linux workerd validation; focused migration-backed local D1 provisioning passes. No browser/domain blocker was found.
- Manager Digest project rows remain empty until a digest consumer is activated; this is outside the V3.1 daily employee/manager workflow and does not change official data.

### Independent audit result

Fresh review after the Pilot fixes found **0 Critical, 0 High, and 0 blocking Medium findings**. The audit specifically rechecked role landing, official-vs-shadow source separation, Worklog/Scheduler identity continuity, publish idempotency, pending-vs-approved semantics, scheduler-only executive UI, mobile overflow, and Production safety. The remaining items above are non-blocking, documented, and do not require duplicate core input.

No Critical finding was introduced by this UX scope. No Production business data was created or changed.

## Tests

| Check | Result |
|---|---|
| TypeScript | PASS |
| Vite build | PASS |
| Vitest local | 48 files passed, 342 tests passed, 5 files / 33 tests skipped |
| Focused role landing tests | PASS |
| Focused Worklog policy/role tests | 19 passed |
| Local D1 provisioning + QA clock | 4 passed |
| `git diff --check` | PASS; only CRLF normalization warnings |
| Pilot browser matrix | PASS: employee, manager, CEO, Worklog, Project Publish/idempotency, 375/390/430 mobile |

## Release gate

Final result:

```text
V3_CORE: 100%
V3.1_UNIFIED_WEB_EXPERIENCE: PILOT_VALIDATED
SYSTEM_COHERENCE: PASS_WITH_NONBLOCKING_DEFERRED
CANARY_STATUS: WAITING_FOR_FIRST_REAL_EMPLOYEE_WORKLOG
READY_FOR_V31_GITHUB_MERGE: YES
```

The bounded V3.1 branch is ready for the next GitHub merge/review step. Do not merge main or deploy Production as part of this task. Production must remain free of fabricated Worklog, Actual, Shadow, or Project records.
