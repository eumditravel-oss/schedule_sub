# D1 0030 Remote Compatibility Procedure

## Root cause

Production is currently at migration 0029. The original Wrangler remote migration path returns `incomplete input` while applying `0030_dependency_graph_guard.sql`. The same failure was reproduced on a disposable remote D1 with Wrangler 4.120.1, while a complete `CREATE TRIGGER ... BEGIN ... END;` submitted as one SQL statement succeeds. QA already contains the expected 0030 schema and is not modified by this procedure.

## Immutable source

The repository migration remains immutable:

- File: `migrations/0030_dependency_graph_guard.sql`
- SHA-256: `B0F81061EE94BA388698474486DDDCC764F47DD19A755BE936D8095159F7C9AB`

The compatibility runner reads this exact file, verifies the SHA, parses complete SQLite statements, and never changes migration discovery or the migration file.

## Compatibility mechanism

`scripts/d1/apply-0030-remote-compat.mjs` uses the Cloudflare D1 REST query API with an explicit `batch` array. Trigger bodies remain one batch element; semicolons inside `BEGIN ... END` are never sent as independent fragments. The final ledger insert is included in the same batch, after the schema statements.

The remote parser rejects the valid `WHEN ... BEGIN SELECT RAISE ... END` form used by the authority guard trigger. The runner therefore performs one narrowly-scoped transport rewrite to the equivalent `BEGIN SELECT RAISE(...) WHERE ...; END` form. The source statement, source SHA, condition, stable error code, and migration semantics remain unchanged; the repository migration file is never edited.

Cloudflare documents `D1Database.batch()` as transactional. REST batch atomicity is not assumed: it must be proven on a disposable remote D1 before any Production execution is permitted.

## Safety gates

The runner is fail-closed:

- `--dry-run` performs reads and parsing only.
- Production execution requires `--execute --confirm`.
- Account ID, exact Production database ID, and source SHA are locked.
- The precondition is exactly ledger latest `0029`, with no 0030 ledger row and no 0030 objects.
- Existing 0030 ledger exits without writes; partial objects without the ledger stop with `PARTIAL_STATE_DETECTED`.
- There is no deployed SQL endpoint and no application-domain change.

## Required disposable evidence

Before Production is considered ready, record all of the following on a disposable remote D1:

1. REST batch rollback after an intentional final failure.
2. Trigger batch creation and rollback after an intentional final failure.
3. Successful exact 0030 compatibility apply with the ledger row included atomically.
4. Ledger-failure rollback proving schema objects do not persist without ledger 0030.
5. Schema/trigger comparison to QA 0030: authority revision, dependency guard, 76 Shadow triggers, and zero duplicates.
6. TaskGroup insert/update revision increments and Shadow stale/dependency guard checks.

If any proof fails, Production execution remains prohibited.

## Production preconditions and recovery

Production execution, when separately approved, requires a fresh full D1 backup, read-only counts/hashes, a runner dry-run, and a recheck immediately before the atomic batch. No baseline, official forecast, project/task dates, actuals, worklogs, or schedule adjustments may be changed. If the ledger or schema precondition differs, stop; do not repair by manually creating objects or inserting `d1_migrations`. Recovery is a separately reviewed operation using the verified backup, never an automatic runner action.
