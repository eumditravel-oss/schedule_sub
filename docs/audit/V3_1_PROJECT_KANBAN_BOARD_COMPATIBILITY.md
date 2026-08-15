# V3.1 Project Kanban Board Compatibility Audit

## Scope and release boundary

- Branch: `codex/v31-project-kanban-board-redesign`
- Base/Origin/Production baseline: `10f871e54776ce43518a6035eb681bbf097efb92`
- Pilot-only change. No Production D1 writes, no migration, no official Forecast apply, no drag/drop mutation.
- The board remains a read model over Projects, Tasks, Task Groups, Task Assignees, Official Forecast, Approved Actual, Worklog review, Shadow status, and adjustment history.

## Server-derived board model

`GET /api/v3/project-card-board` now returns `board_column`, `display_name`, `unique_assignees`, `official_start`, `official_end`, `approved_actual_progress`, `remaining_task_count`, `blocked_task_count`, `project_revision_count`, `attention_badges`, and `allowed_actions` in addition to the existing compatibility fields. The browser does not infer lifecycle state from raw project status, does not count duplicate worker names, and does not treat worklog review as a project revision.

Lane mapping is deterministic:

1. `REVISION`: active project-level revision/reopen marker (including post-completion active revision).
2. `COMPLETED`: official project status `COMPLETED` when no active revision exists.
3. `PRE_WORK`: not completed/revision, no confirmed Approved Actual, and official work is upcoming, unpublished, or starts after the actor's local business date.
4. `IN_PROGRESS`: all other active projects.

Delayed, blocked, and review-required values remain attention badges and never become lanes. Sorting is attention, priority, official end, localized name, then stable ID.

## UI compatibility

- Desktop uses four independent, vertically scrollable lanes with a four-column layout at wide widths.
- Mobile exposes one lane at a time with status tabs and one-column compact cards.
- Cards show localized project name (two-line clamp), unique assignees, official end/range, Approved Actual progress, remaining count, and attention badges.
- Whole-card click opens a Task Drawer. Inline task expansion and drag mutation are intentionally absent.
- Drawer groups tasks by server-provided Task Group, shows Primary/Support, official dates, Approved Actual, blocked reason, and exact Worklog/Scheduler links preserving `projectId` and `taskId`.
- Project Add opens the existing `ProjectModal` and calls `api.createProject`; it does not navigate to a second creation flow.
- Existing `/projects` and `/projects/:projectId` Scheduler routes remain unchanged. Worklog links remain `/worklog/today?projectId=...&taskId=...`.
- No inferred source tabs or duplicate ALL/ACTIVE/REVIEW/COMPLETED filter row is present.

## Role and authority audit

- Existing server actor/session and visibility scope is reused by the board endpoint.
- Viewer/executive reads remain read-only. Manager controls are limited to the existing schedule-manager capability; card actions are navigation/creation-flow entry points, not client authority.
- No `allocation_percent` or client-supplied progress is used to derive the board columns.
- No official dates, baselines, Actuals, Forecast versions, Shadow versions, or schedule adjustments are written by the board.

## Validation

- `npm run typecheck`: PASS
- `npm run build`: PASS
- `tests/projectCardBoard.test.ts`: 9 PASS (lane derivation, revision precedence, delayed badge behavior, compact four-lane/drawer/mobile/link/creation-flow contract)
- `git diff --check`: PASS with existing LF/CRLF normalization warnings only
- Wrangler bindings check is re-run with a workspace-local config directory before Pilot deployment.

## Pilot evidence

- Pilot URL: `https://concost-dev-scheduler-pilot.eumditravel.workers.dev/project-board`
- Pilot Worker version: `76e08b8e-670e-4c5d-82fa-b960a321b751`
- `/api/build-info`: `b97c747`, `environment=pilot`, `AUTO_APPLY=false`, `accessMode=open_test`.
- Read-only board checks for manager and employee actors: 5 projects / 93 tasks; `COMPLETED=3`, `PRE_WORK=1`, `IN_PROGRESS=1`, `REVISION=0`; no duplicate assignee within a card.
- Browser evidence: [desktop board](../../qa/v31-project-kanban-board-redesign-pilot.png), [mobile 375px](../../qa/v31-project-kanban-board-redesign/pilot-mobile-375.png), [mobile 390px](../../qa/v31-project-kanban-board-redesign/pilot-mobile-390.png), [mobile 430px](../../qa/v31-project-kanban-board-redesign/pilot-mobile-430.png), [Task Drawer](../../qa/v31-project-kanban-board-redesign/pilot-drawer.png).
- Scheduler handoff verified at `/projects/:projectId?taskId=:taskId`; no official schedule mutation was performed.

## Final gate matrix

| Gate | Result |
| --- | --- |
| Four status lanes | PASS |
| Single-lane uniqueness (visible board) | PASS |
| Compact cards / no inline expansion | PASS |
| Task Drawer and exact context links | PASS |
| Scheduler compatibility | PASS (deep-link smoke; Scheduler source untouched) |
| Worklog compatibility | PASS (exact project/task query parameters) |
| Board load write-zero | PASS (Pilot authority revision 777 before/after; D1 metadata reported `rows_written=0`) |
| Duplicate visible project/task identities | PASS (5 visible projects, 93 unique tasks, 93 unique Official Task identities) |
| Mobile 375 / 390 / 430 | PASS (status tabs, one lane, one-column card screenshots) |
| AUTO_APPLY | PASS (`false`) |
| Production Worker / D1 | PASS (unchanged) |

Pilot contains one pre-existing marker-owned project named `[V3.1 UX PILOT QA] ...` with an Official Forecast history row but no tasks. CEO/COO read scope therefore sees six Pilot rows, while the production-like employee/manager board scope used for this release sees five projects and 93 tasks. It was not deleted because the existing history-protection guard correctly rejects deletion of a project with Official Forecast history; no manual destructive SQL was used.

## Findings

- Fixed: old three-column large-card grid, inline Task expansion, duplicated filter row, and Scheduler-only Project Add navigation.
- Fixed: future-start project classification, completed-project separation, worker-ID assignee deduplication, localized project display selection, and mobile lane presentation.
- Deferred/non-blocking: the existing Pilot marker fixture is retained as history-protected evidence; it is not part of the visible production-like employee/manager board scope.

## Release recommendation

`PROJECT_KANBAN_REFERENCE_CONFORMANCE: PASS`

`FOUR_LANE_PROJECT_BOARD: PASS`

`COMPACT_PROJECT_CARD: PASS`

`PROJECT_TASK_DRAWER: PASS`

`SCHEDULER_COMPATIBILITY: PASS`

`WORKLOG_COMPATIBILITY: PASS`

`ZERO_DUPLICATE_DATA: PASS`

`READY_FOR_V31_PROJECT_KANBAN_GITHUB_MERGE: YES`

## Deferred / non-blocking

- Browser screenshots and responsive measurements are captured only against the Pilot deployment; Production remains unchanged.
- No new database migration is required for this read-model/UI redesign.
