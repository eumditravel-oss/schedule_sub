# V3.1 Workspace-Style Card Dashboard Integration Audit

Audit date: 2026-08-14 (KST)  
Repository: `F:/Schedule`  
Source branch: `codex/v31-unified-web`  
Workspace branch: `codex/v31-workspace-card-dashboard`  
Base SHA before this scope: `ee50d2ec7fd9835baf3ad40c9780723c9da09b87`  
Code implementation commit: `21d2c3941d167c382f94889ce04178532c79c2d5`  
Pilot: `https://concost-dev-scheduler-pilot.eumditravel.workers.dev`  
Final branch HEAD and Pilot Worker version are recorded in the release handoff after the final documentation commit.  
Production: unchanged

## Scope and safety boundary

This scope adds a role-based operating home and Workspace-style visual card language around the existing V3.1 surfaces. It does not redesign the scheduler engine, authentication model, Forecast/Baseline authority, migrations, or AUTO_APPLY. No Production Worker, Production D1, migration, or business record was changed. Pilot remains `DYNAMIC_SCHEDULER_AUTO_APPLY_ENABLED=false`.

The reference repository was inspected read-only at `eumditravel-oss/workspace`. Its stores, mock data, routes, authentication, and JSON import/export behavior were not copied.

## Reference repository analysis

The inspected reference files establish a visual vocabulary rather than an application architecture:

| Reference | Visual element used as reference | Dynamic Scheduler treatment |
|---|---|---|
| `src/components/dashboard/SummaryCard.tsx` | Rounded surface, border, icon tile, title/value/subtitle hierarchy, optional click affordance | Re-expressed by local `Stat` cards and existing V3.1 cards; no component import |
| `WorkerDashboard.tsx` | Role-specific KPI row, recent work list, status badges, empty state | Employee official-task/context cards backed by Worklog context |
| `DepartmentManagerDashboard.tsx`, `PMDashboard.tsx` | Manager KPI grouping, progress/urgency treatment, project summary | Manager attention strip, employee status, processing-needed and schedule-impact sections |
| `Header.tsx` | Compact identity/context header, action affordances, environment/data indicator | Local `AppShell` with authenticated actor and Pilot build indicator |
| `Sidebar.tsx` | Role-aware navigation and responsive collapse concept | Local responsive header/nav; no permanent sidebar on Scheduler |
| `globals.css` | Surface/background/border tokens and 14px card radius | Local Tailwind classes and existing design tokens; Scheduler CSS untouched |

The reference app is a Next/Zustand/mock-data application. Importing it would have created a second authority path, so only visual relationships were ported.

## Implemented operating home

### Employee / Primary / Support

`/` resolves the authenticated server actor to `/dashboard`. `DashboardPage` reads the existing `/api/v3/worklogs/context` and `/api/v3/capacity/day` read models. The page shows:

- local work date and country office;
- Morning/EOD state and the direct Today Worklog CTA;
- current Official Forecast tasks, project, assignment role, official date range;
- Morning planned minutes and Approved Actual progress from the server context;
- daily capacity and plan-vs-capacity signal;
- task-preserving links to `/projects/:projectId?taskId=...`.

The Dashboard does not calculate schedule dates, create Actual, or read Shadow as Today-task authority.

### Schedule Manager

`/` resolves to the Team Dashboard. The dashboard uses the existing `getManagerOperations()` read model and displays managed employee count, Morning/EOD completion, approval pending, schedule delay, the attention strip (missing/review/exception/aging/notifications), employee status rows, processing-needed counts, and Scheduler/approval links. It does not introduce a second approval or schedule mutation path.

### CEO / COO Viewer

`/` resolves to `/projects` and opens the existing read-only Scheduler. Direct `/dashboard` is normalized back to `/projects`, and the shared shell no longer exposes employee Dashboard or Worklog links to Viewer actors. This keeps the role operating home unambiguous while preserving the existing Scheduler route.

## Existing Scheduler preservation

The Scheduler remains a purpose-specific full-width surface in `ProjectOverviewPage`:

- project information column and horizontal timeline remain intact;
- month/day controls, month boundaries, holiday hatching, today marker, Gantt bars, and horizontal overflow remain Scheduler-owned;
- Project Detail and print/report routes remain separate;
- the large operational Today/approval block is not embedded in the Scheduler;
- no permanent left sidebar was added to `/projects`;
- the existing build/version indicator remains visible.

Pilot browser evidence after data load (`/projects`, CEO actor): 5 project rows rendered, 2026-07 and 2026-08 month labels rendered, holiday hatch columns and timeline controls visible, `Today operations` text absent, `body.scrollWidth=1265` at a 1280px viewport, and the Pilot build badge visible.

Screenshots captured in this audit (untracked evidence, not Production data):

- [employee desktop](../../qa/v31-workspace-card-dashboard/employee-desktop.png)
- [manager desktop](../../qa/v31-workspace-card-dashboard/manager-desktop.png)
- [CEO Scheduler desktop](../../qa/v31-workspace-card-dashboard/ceo-scheduler-desktop.png)
- [Production Scheduler desktop](../../qa/v31-workspace-card-dashboard/production-scheduler-desktop.png)
- [employee mobile 375](../../qa/v31-workspace-card-dashboard/employee-mobile-375.png)
- [manager mobile 390](../../qa/v31-workspace-card-dashboard/manager-mobile-390.png)

## Required route/role audit

| Route | Support/Primary | Manager | CEO/COO | Result |
|---|---|---|---|---|
| `/` | Dashboard | Team Dashboard | Scheduler | PASS |
| `/dashboard` | Personal Dashboard | Team Dashboard | Redirects to Scheduler | PASS after hardening |
| `/projects` | Scheduler | Scheduler | Read-only Scheduler | PASS |
| Project Detail | Task/project context and Worklog link | Manager controls as previously gated | Read-only | PASS |
| `/worklog/today` | Morning/EOD + official task context | Same employee workflow | Not exposed in Viewer shell; server-gated | PASS |
| `/worklog/history` | Revision/history view | Same read path | Not exposed in Viewer shell; server-gated | PASS |
| `/manager/operations` | Not a manager action surface | Existing operations read model | Read-only marker where applicable | PASS |
| `/manager/worklog-approvals` | Not exposed | Existing approval queue, including triage/aging/bulk NORMAL approval | Not exposed | PASS |

Responsive checks used Chrome Pilot browser overrides at 375px and 390px. Employee and manager pages rendered with `scrollWidth` no greater than the viewport (375px run measured 360px content width; 390px run measured 375px content width). Desktop employee, manager, and CEO Scheduler screenshots were captured at the normal desktop viewport.

## API and read-model mapping

| UI context | Existing source | Identity continuity |
|---|---|---|
| Employee Dashboard task/capacity | `GET /api/v3/worklogs/context`, `GET /api/v3/capacity/day` | `session.actor.employeeId` → `workers.id` → `project_id`/`task_id` |
| Manager Dashboard | `GET /api/v3/manager/operations/today` | Server-derived supervision scope and existing aggregates |
| Approval queue | `GET /api/v3/manager/worklog-approvals`, existing review/bulk endpoints | Worklog ID + revision ID; existing CAS/idempotency path |
| Worklog Today/History | Existing Worklog routes and revisions | Worklog header → effective revision → pending/approved Actual |
| Scheduler/Project Detail | Existing project/detail and official-date selectors | Stable project/task IDs; `taskId` query deep link |
| Shadow/Forecast controls | Existing Shadow/Forecast routes | Run ID, Shadow version, Official Forecast version remain separate |

No name-based task matching, duplicate Worklog submission UI, or frontend authority calculation was added.

## Duplicate and continuity audit

- Dashboard task cards link to the existing Scheduler task focus; they do not recreate a Task.
- Morning planned minutes are carried into EOD through the existing Worklog flow; the Dashboard only labels the server value.
- Manager approval remains in `/manager/worklog-approvals`; the dashboard links to it rather than implementing a second approval mutation.
- Approved Actual, Shadow, and Official Forecast remain separate lifecycle stages.
- Project Publish remains the existing idempotent Baseline + initial Official Forecast path.
- `LegacyManagerDashboard` remains an unused legacy function in `DashboardPage.tsx`; it is not routed or rendered. It is a LOW cleanup item to remove later to prevent visual drift, not a duplicate user-facing entry point.

## Findings and fixes

### Fixed in this scope

**MEDIUM — Viewer direct Dashboard exposed employee operating UI**  
File/symbol: `src/pages/DashboardPage.tsx`, `DashboardPage`; `src/components/layout/AppShell.tsx`, navigation.  
Failure: root landing was correct, but a direct `/dashboard` URL showed a CEO personal Worklog/capacity page and exposed employee navigation.  
Fix: Viewer actors redirect `/dashboard` to `/projects`; Viewer navigation hides Dashboard and Worklog links.  
Verification: CEO direct `/dashboard` now returns to Scheduler after Pilot deployment; no Viewer Worklog CTA remains in the shared shell.

### Deferred / non-blocking

**LOW — Dead legacy dashboard implementation**  
`LegacyManagerDashboard` is retained but unreachable. Remove it in a later cleanup-only change after the card layout is stable; it does not create a second route or authority path.

Existing V3.1 non-blocking deferred items remain documented in `V3_1_UNIFIED_WEB_COHERENCE_AUDIT.md` and are outside this visual integration scope.

## Validation

| Check | Result |
|---|---|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| Full local Vitest baseline before this UI-only change | 48 files / 342 passed / 33 skipped |
| Focused local D1 + QA clock | 4 passed |
| `npm.cmd run typecheck:worker-bindings` | PASS on writable Wrangler cache |
| `git diff --check` | PASS (CRLF normalization warnings only) |
| Pilot desktop/mobile route audit | PASS |
| Production mutation/deploy | NONE |

## Independent conclusion and release gate

The Workspace reference was used only for visual card hierarchy and responsive composition. The existing Scheduler remains intact and authoritative. Employee, Manager, and CEO/COO operating homes are role-separated; Worklog, Project, Scheduler, Shadow, Forecast, and reporting contexts retain stable IDs and existing server read models.

```text
V3_CORE: 100%
V3.1_CORE_IMPLEMENTATION: COMPLETE
V3.1_WORKSPACE_CARD_DASHBOARD: PILOT_VALIDATED
SYSTEM_COHERENCE: PASS_WITH_NONBLOCKING_DEFERRED
AUTO_APPLY: false
PRODUCTION: UNCHANGED
READY_FOR_V31_CARD_DASHBOARD_GITHUB_MERGE: YES
```

The Pilot handoff above was followed by PR #23, CI verification, and the Production release recorded below.

## Production release result (2026-08-15 KST)

### Source / GitHub

| Field | Result |
|---|---|
| Starting branch | `codex/v31-workspace-card-dashboard` |
| Starting branch SHA | `a272d9ae35aad243bc5e658b05dc6dfea00e43ce` |
| PR | [#23](https://github.com/eumditravel-oss/schedule_sub/pull/23) |
| CI | `verify` PASS, 48s |
| Merge method | GitHub merge commit |
| Merge SHA | `d7eed09247516a03abf5e520af949a27d7f67d62` |
| Local main | `d7eed09247516a03abf5e520af949a27d7f67d62` |
| Origin main | `d7eed09247516a03abf5e520af949a27d7f67d62` |
| Production `/api/version` and `/api/build-info` | `d7eed09247516a03abf5e520af949a27d7f67d62` |

### Production backup

- Path: `qa/production-backups/concost-db-production-before-v31-card-dashboard-d7eed092-20260815-003249.sql`
- SHA-256: `CCFA765AB67024E56FA52C0BF6E4A6C74A2CB80A53DA27819535159041B6C3FF`
- Size: `1,204,992` bytes
- Created: `2026-08-15 00:33:18 KST`
- Production D1 ID: `feb39a05-c98e-455f-a2b1-ff75e1c0b94f`
- Post-deploy export: same size and same SHA; post-deploy SQL is retained locally and is not committed.

### Deployment

- Worker: `concost-dev-scheduler`
- Worker version: `b9d6deb6-a31c-48bc-a8aa-27bb63d892fa`
- Deployed: `2026-08-15 00:39:37 KST`
- Build SHA: `d7eed09247516a03abf5e520af949a27d7f67d62`
- `SCHEDULER_ACCESS_MODE=internal_trust`
- `DYNAMIC_SCHEDULER_AUTO_APPLY_ENABLED=false`
- No migration was added or applied.

### Production role and route smoke

Read-only smoke passed with the existing internal-trust actor selector; no Worklog, approval, project, Actual, Shadow, or Forecast writes were performed.

| Check | Result |
|---|---|
| Employee `/` → Personal Dashboard | PASS; official tasks, Capacity, Morning/EOD state, Worklog CTA |
| Manager `/` → Team Dashboard | PASS; employee count, Morning/EOD, triage, exceptions, employee status, schedule impact, approval CTA |
| CEO `/` → `/projects` | PASS; no Dashboard detour, read-only Scheduler |
| COO `/` → `/projects` | PASS; no Dashboard detour, read-only Scheduler |
| `/worklog/today` and `/worklog/history` | PASS; independent module, no alert/500 |
| `/manager/operations` and `/manager/worklog-approvals` | PASS; read-only/approval surfaces load without error |
| Viewer navigation | PASS; personal Dashboard/Worklog links are hidden in the merged shell |
| Runtime browser logs | PASS; no error or warning entries observed |
| Mobile 375/390 | PASS on the exact merged SHA in Pilot; Production internal-trust mobile actor session was not available in the fresh external browser, so no Production data or auth state was altered |

Production read-only health endpoints also passed: completion integrity `inconsistent_projects=0`, `inconsistent_tasks=0`; scheduler integrity `status=PASS` with zero lifecycle, task, workforce, calendar, integration, and build errors.

### Production Scheduler preservation

`/projects` rendered 5 project rows, month headers for July/August 2026, 30-day/month controls, previous/today/next controls, project column, holiday hatch, today marker, Gantt bars, progress/variance values, horizontal timeline behavior, print control, and build indicator. The large Today Operations block, Morning/EOD summary, Worklog editor, approval queue, and Capacity editor were absent (`0`).

### Production data integrity

Pre/post counts were identical:

```text
projects=5, tasks=93
project_baselines=6, task_baselines=122
schedule_versions=5, schedule_version_tasks=93
daily_worklogs=0, daily_worklog_revisions=0
task_actual_aggregates=0, task_actuals=93
shadow_schedule_versions=0, shadow_schedule_tasks=0
worklog_approval_events=0, forecast_approval_requests=0
schedule_adjustment_events=0, notification_events=0
shadow_schedule_authority_guard.revision=76
```

Deployment-caused business-data mutations: **0**. The pre/post full D1 export SHA match is an additional integrity check.

### Final release decision

```text
V3_CORE: 100%
V3.1_WORKSPACE_CARD_DASHBOARD: PRODUCTION LIVE
SCHEDULER_CURRENT_METHOD_PRESERVED: PASS
EMPLOYEE_CARD_DASHBOARD: PASS
MANAGER_CARD_DASHBOARD: PASS
EXECUTIVE_SCHEDULER_LANDING: PASS
WORKSPACE_VISUAL_ONLY_INTEGRATION: PASS
SOURCE_ORIGIN_PRODUCTION_LIVE_SHA_MATCH: YES
V31_PRODUCTION_BUSINESS_DATA_UNCHANGED_BY_DEPLOY: PASS
V31_PRODUCTION_RUNTIME_ERRORS_ZERO: PASS
CURRENT_OPERATIONAL_STATUS: WAITING_FOR_FIRST_REAL_EMPLOYEE_WORKLOG
```

The backup and evidence files remain untracked and were not committed. No additional cleanup or UX phase was started after release.

## V3.1 Hotfix 01 — dashboard navigation and schedule comparison surface

### Scope and source alignment

This hotfix is intentionally UI-only. No migration, D1 write, Scheduler geometry, Gantt calculation, Worklog, Actual, Shadow, Forecast, Publish, or official schedule domain code was changed.

| Field | Result |
|---|---|
| Base / source | `d7eed09247516a03abf5e520af949a27d7f67d62` |
| Branch | `codex/v31-hotfix-dashboard-nav-schedule-duplication` |
| Production mode | `internal_trust`; `AUTO_APPLY=false` |
| Intended Pilot gate | Pilot first; Production only after PR/CI/merge and backup |

### Defect audit and root cause

Production read-only counts at the aligned source were internally consistent: 5 projects, 93 tasks, 5 Official Forecast versions with 93 version-task rows, and zero Shadow versions/tasks. Task IDs were unique and no second official task set or publish duplication was present in the available pre/post D1 exports. The Project Detail page fetched one comparison API response but rendered `ScheduleComparisonPanel` unconditionally above the primary Gantt. Classification: **`UI_DUPLICATE_SURFACE_ONLY`**.

The fix preserves the comparison API/domain model and moves the panel behind an explicit secondary action. Project Detail now opens one comparison dialog only on demand and starts closed, leaving the primary Gantt as the default schedule surface. The Scheduler page and Detail page add a compact Dashboard action for non-executive actors; CEO/COO/VIEWER sessions retain the Scheduler root and do not receive the Dashboard action. Mobile uses the same role policy and compact icon control.

### Validation

| Check | Result |
|---|---|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| Full Vitest | 48 files / 343 passed / 33 skipped |
| Dashboard navigation policy test | 3 passed |
| Scheduler/official data changes | NONE |
| New migration | NONE |

Pilot browser validation, PR/CI, merge SHA, Production backup/deploy, and post-deploy smoke are recorded below when complete. 
