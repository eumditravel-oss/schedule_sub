# V3.1 Project Card Board Navigation — Pilot Audit

## Source

| Field | Result |
|---|---|
| Starting main/origin | `64d3ca1789aca1eb3851861aa05b1bcf7eab168e` |
| Working branch | `codex/v31-project-card-board-navigation` |
| Final branch SHA | `7167ff6` |
| Pilot Worker version | `c5a65421-b392-437e-a960-ad1ad194f040` |
| Production | Unchanged; remains on `64d3ca1` |
| Migration | None |
| `AUTO_APPLY` | `false` |

## Navigation

Non-executive desktop and mobile order is:

```text
Dashboard → Project → Worklog → Scheduler → Report / History
Manager: Dashboard → Project → Worklog → Scheduler → Report / History → Operations
```

The new Project route is `/project-board`. The existing Scheduler remains `/projects`, including `/projects/:projectId`, Shadow, Schedule Control, and print routes. Scheduler is active only for `/projects` descendants; Project is active only for `/project-board` descendants. The Scheduler action is directly to the right of Worklog.

CEO/COO/VIEWER retain the Scheduler-oriented read-only navigation: Project Board, Scheduler, and Reports. Personal Dashboard and Worklog are hidden according to the existing policy.

## Project Card Board

`/project-board` is a card-only read model. It contains no Gantt, date grid, month boundary, holiday hatch, Today line, horizontal timeline, or 30-day control. The responsive grid is one column on mobile, two on tablet, and three on desktop.

Cards use the new read-only `GET /api/v3/project-card-board` projection. The Worker reads existing Projects, Tasks, TaskGroups, assignments, current Official Forecast snapshot, Approved Actual aggregates, Shadow summary, and Worklog approval summary in one batch-shaped response. No board-specific authority table or write is created.

Project cards expose official date range, Approved Actual progress, schedule variance, Primary/team, active/completed/blocked counts, pending review counts, and role-safe actions. Expanding a card reveals Task cards with TaskGroup, Task ID, Primary/Support, status, official dates, Approved Actual, blocked reason, Worklog state, and direct Worklog/Scheduler links using `projectId` and `taskId`.

## Data and duplicate audit

Pilot D1 read-only audit:

| Entity | Count | Unique |
|---|---:|---:|
| Projects | 6 | 6 |
| Tasks | 93 | 93 |
| Current Official Forecast Tasks | 93 | 93 |
| Approved Actual Aggregates | 0 | N/A |
| Shadow Versions | 0 | N/A |

Duplicate project IDs: **NONE**  
Duplicate task IDs: **NONE**  
Duplicate current Official Forecast task IDs: **NONE**  
Shadow rows leaking into the ordinary Project Board: **NONE**  
Board load writes: **NONE**

The Project Board is therefore a read-model separation change, not a data migration or duplicate-authority remediation.

## Scheduler preservation

Pilot browser verification on final SHA `7167ff6`:

- Existing `/projects` opens the full-width Scheduler.
- Project status tabs, 30-day/month controls, month boundaries, holiday hatch, Today behavior, Gantt bars, horizontal schedule behavior, and print entry remain present.
- Project Board does not render a Gantt.
- Existing Project Detail and Dashboard routes remain available.
- Project Task cards preserve direct Worklog and Scheduler context with the same Project/Task IDs.

## Role and mobile validation

- Employee/Primary/Support: assigned Project Board scope and Worklog/Scheduler actions.
- Manager: management-scope cards and existing project-management link; Operations remains a separate menu item.
- CEO/COO/Viewer: read-only cards; no Project create/manage, Dashboard, or Worklog write navigation.
- Mobile 375/390/430: no page horizontal overflow; one-column cards; Dashboard → Project → Worklog → Scheduler order visible for an eligible employee.

Evidence is retained untracked in `qa/v31-project-card-board-navigation/`:

- `employee-project-board-430.png`
- `employee-task-cards-430.png`
- `scheduler-preserved-430.png`
- `employee-project-board-375.png`

## Tests

| Check | Result |
|---|---|
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS from final `7167ff6` |
| `npm.cmd run typecheck:worker-bindings` | PASS (Wrangler log ACL warning only) |
| Full Vitest | 49 files / 347 passed / 33 skipped |
| Focused navigation policy | 7 passed |
| Local D1 provisioner | 4 passed |
| `git diff --check` | PASS (CRLF normalization warnings only) |
| Pilot browser | PASS |

The first Pilot deployment attempt used stale Vite output after the final one-line type correction. It was not accepted as validation; the final source was rebuilt from `7167ff6` and redeployed as Worker version `c5a65421-b392-437e-a960-ad1ad194f040`. The final Pilot build indicator and Worker build SHA match `7167ff6`.

## Independent coherence findings

| Severity | Finding | Disposition |
|---|---|---|
| Critical | Duplicate authority data, board write, Production binding, or pending-to-Actual promotion | 0 |
| High | Project menu still opens Scheduler, Scheduler menu missing/wrong order, Board contains Gantt, role scope leak, Scheduler regression | 0 |
| Blocking Medium | Ambiguous card purpose, inaccessible mobile actions, wrong active state, excessive per-project API requests | 0 |
| Nonblocking | Existing repository mojibake in unrelated legacy screens | Deferred; not introduced by this phase |

## Release recommendation

```text
V31_PROJECT_MENU_CARD_BOARD_PASS
V31_PROJECT_CARD_GRID_PASS
V31_PROJECT_TASK_CARD_PASS
V31_PROJECT_BOARD_GANTT_ZERO
V31_WORKLOG_NAV_PASS
V31_DEDICATED_SCHEDULER_NAV_PASS
V31_SCHEDULER_RIGHT_OF_WORKLOG_PASS
V31_PROJECT_SCHEDULER_ACTIVE_STATE_PASS
V31_EMPLOYEE_PROJECT_SCOPE_PASS
V31_MANAGER_PROJECT_SCOPE_PASS
V31_EXECUTIVE_PROJECT_READONLY_PASS
V31_VIEWER_PROJECT_READONLY_PASS
V31_PROJECT_CARD_WORKLOG_CONTEXT_PASS
V31_PROJECT_CARD_SCHEDULER_CONTEXT_PASS
V31_PROJECT_TASK_ID_CONTINUITY_PASS
V31_PROJECT_DATA_DUPLICATION_ZERO
V31_TASK_DATA_DUPLICATION_ZERO
V31_PROJECT_BOARD_LOAD_WRITE_ZERO
V31_EXISTING_SCHEDULER_LAYOUT_PRESERVED
V31_EXISTING_SCHEDULER_GANTT_PRESERVED
V31_EXISTING_SCHEDULER_HATCH_PRESERVED
V31_EXISTING_SCHEDULER_SCROLL_PRESERVED
V31_EXISTING_SCHEDULER_PRINT_PRESERVED
V31_PROJECT_BOARD_KR_VN_PASS
V31_PROJECT_BOARD_MOBILE_PASS
V31_AUTO_APPLY_FALSE_PASS
V31_PROJECT_BOARD_CRITICAL_FINDINGS_ZERO
V31_PROJECT_BOARD_HIGH_FINDINGS_ZERO
V31_PROJECT_BOARD_BLOCKING_MEDIUM_FINDINGS_ZERO
PRODUCTION_WORKER_UNCHANGED_PROJECT_BOARD
PRODUCTION_D1_UNCHANGED_PROJECT_BOARD
READY_FOR_V31_PROJECT_CARD_BOARD_GITHUB_MERGE
```

Per the task gate, this phase stops after Pilot validation and audit. No PR, merge, Production deployment, migration, Production fixture, or `AUTO_APPLY` change was performed.
