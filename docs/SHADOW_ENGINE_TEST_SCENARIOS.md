# Shadow Engine Test Scenarios — Checkpoint 3A

The executable source of truth is `tests/shadowScheduleEngine.test.ts`.

| Test | Contract |
|---|---|
| A | Early completion and next-valid-capacity release |
| B | Other-project Actual consumes capacity and creates cross-project approval |
| C | Same-project outside work does not add an arbitrary day |
| D | Company duty capacity zero and approval |
| E | Emergency leave no double deduction |
| F | Primary remaining/Support double-count guard |
| G | NOT_BEFORE |
| H | Missing Worklog data gap |
| I | Same-run fingerprint/result |
| J | Revision changes fingerprint/staleness |
| K | Weekend capacity zero |
| L | Public holiday capacity zero |
| M | Work override precedence |
| N | Vietnam partial leave 240-minute capacity |
| O | Deterministic multi-project collision priority |
| P | Cycle blocks the run |
| Q | FIXED_START conflict remains visible |
| R | FIXED_END overrun remains visible |
| S | Pending overtime approval reason |
| T | Effective-dated Temporary Primary |
| U | Actual fact preserved despite dependency conflict |
| V | Korea/Vietnam timezone handoff |
| W | Official Forecast immutable |
| X | Baseline immutable |
| Y | Ten identical deterministic executions |
| Z | Project Actual progress immutable |

The D1 integration suite additionally proves role guards, proposal state, Shadow-only persistence, same-input reuse without duplicate rows, idempotency conflict, and official source hash invariance.
