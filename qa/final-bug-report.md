# CON-COST × VIETQS Dev Scheduler - Final Bug Report

## P0 / P1 / P2 Defect Summary

- **P0 Defects**: 0
- **P1 Defects**: 0
- **P2 Defects**: 0
- **P3 Defects**: 0

All discovered issues during development and QA cycles have been 100% resolved and regression-tested.

---

### Resolved Defects Log

#### DEF-001 (Resolved)
- **Severity**: P1
- **Screen**: `/projects` & `/projects/:projectId`
- **Environment**: Desktop / Mobile direct URL access & F5 / Ctrl+F5 refresh
- **Description**: Pressing F5 on `/projects` or `/projects/:projectId` returned HTTP 404 Not Found error from Cloudflare Workers.
- **Root Cause**: Missing SPA not_found_handling configuration in `wrangler.jsonc` and missing explicit SPA asset rewrite fallback for GET/HEAD page routes in `worker/index.ts`.
- **Resolution**:
  1. Added `"not_found_handling": "single-page-application"` to `wrangler.jsonc`.
  2. Added explicit `/index.html` asset rewrite fallback in `worker/index.ts` for non-API GET/HEAD page routes.
  3. Protected all unmatched `/api/*` endpoints to return JSON HTTP 404 with code `API_NOT_FOUND`.
- **Verification**: `curl.exe -I https://concost-dev-scheduler.eumditravel.workers.dev/projects` returns `HTTP 200 OK` (`text/html`). Added `tests/spaFallback.test.ts` (100% Passed).
- **Status**: PASSED / RESOLVED

#### DEF-002 (Resolved)
- **Severity**: P1
- **Screen**: All screens
- **Environment**: All environments
- **Description**: Updating Korean project or task title preserved old Vietnamese translation on backend/frontend.
- **Root Cause**: PATCH endpoints did not trigger Workers AI re-translation when source text changed.
- **Resolution**:
  1. Added debounced `useAutoTranslation` hook with 700ms timer and race-condition prevention.
  2. Updated backend PATCH endpoints to force Workers AI re-translation whenever source title changes.
  3. Ran `--refresh-auto` backfill script updating 16 remote D1 records.
- **Verification**: Added `tests/translationSync.test.ts` (100% Passed).
- **Status**: PASSED / RESOLVED

#### DEF-003 (Resolved)
- **Severity**: P1
- **Screen**: All screens
- **Environment**: All environments
- **Description**: Worker selector contained legacy demo workers (`김개발`, `박개발`, etc.) instead of the 7 active team members.
- **Root Cause**: Initial seed migration `0002_seed_data.sql` contained dummy workers and seed projects.
- **Resolution**:
  1. Created and executed Migration `0005_add_executives_and_remove_demo_data.sql`.
  2. Added `CEO` and `COO` to team list (7 active members total).
  3. Updated backend `requireActiveWorker` validation to strictly enforce 7 active members.
- **Verification**: Added `tests/actualWorkersAndArchive.test.ts` (100% Passed).
- **Status**: PASSED / RESOLVED
