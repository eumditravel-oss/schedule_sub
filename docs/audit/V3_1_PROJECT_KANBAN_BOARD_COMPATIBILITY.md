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

## Deferred / non-blocking

- Browser screenshots and responsive measurements are captured only against the Pilot deployment; Production remains unchanged.
- No new database migration is required for this read-model/UI redesign.
