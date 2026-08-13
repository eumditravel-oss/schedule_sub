import process from 'node:process';
import { requestJson, readState } from './apply-0030-remote-compat.mjs';

const accountId = process.env.CF_FORENSICS_ACCOUNT_ID;
const databaseId = process.env.CF_FORENSICS_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
if (!accountId || !databaseId || !token) throw new Error('Missing CF_FORENSICS_ACCOUNT_ID, CF_FORENSICS_DATABASE_ID, or CLOUDFLARE_API_TOKEN');
const config = { accountId, databaseId, token };

async function batch(batch) {
  return requestJson({ ...config, body: { batch } });
}
async function query(sql, params = []) {
  const result = await batch([{ sql, params }]);
  return result[0]?.results ?? [];
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const atomicTable = `compat_atomicity_${Date.now()}`;
let failed = false;
try {
  await batch([
    { sql: `CREATE TABLE ${atomicTable}(id INTEGER PRIMARY KEY, value TEXT NOT NULL)` },
    { sql: `INSERT INTO ${atomicTable}(id,value) VALUES (1,'rollback')` },
    { sql: 'SELECT * FROM definitely_missing_compat_table' },
  ]);
} catch { failed = true; }
assert(failed, 'REMOTE_BATCH_FAILURE_NOT_TRIGGERED');
assert((await query(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name=?`, [atomicTable]))[0]?.c === 0, 'REMOTE_BATCH_NOT_ATOMIC');
console.log('REMOTE_BATCH_ATOMICITY_PASS');

const triggerNames = [`compat_trigger_one_${Date.now()}`, `compat_trigger_two_${Date.now()}`, `compat_trigger_three_${Date.now()}`];
failed = false;
try {
  await batch([
    { sql: `CREATE TRIGGER ${triggerNames[0]} AFTER INSERT ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'; END` },
    { sql: `CREATE TRIGGER ${triggerNames[1]} AFTER UPDATE ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'; END` },
    { sql: `CREATE TRIGGER ${triggerNames[2]} AFTER DELETE ON task_groups BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'; END` },
    { sql: 'SELECT * FROM definitely_missing_compat_table' },
  ]);
} catch { failed = true; }
assert(failed, 'TRIGGER_BATCH_FAILURE_NOT_TRIGGERED');
const triggerRows = await query(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN (${triggerNames.map(() => '?').join(',')})`, triggerNames);
assert(triggerRows[0]?.c === 0, 'TRIGGER_BATCH_NOT_ATOMIC');
console.log('TRIGGER_BATCH_ROLLBACK_PASS');

const before = await readState(config);
assert(before.ledger.at(-1)?.name === '0029_shadow_engine_idempotency.sql', `DISPOSABLE_LEDGER_NOT_0029:${before.ledger.at(-1)?.name}`);
const runner = await import('./apply-0030-remote-compat.mjs');
const plan = await runner.run({ accountId, databaseId, token, allowDisposable: true, dryRun: true });
console.log(JSON.stringify({ dryRun: plan }, null, 2));

const source = (await import('node:fs')).readFileSync(new URL('../../migrations/0030_dependency_graph_guard.sql', import.meta.url), 'utf8');
const inspected = runner.inspectSource(source);
const ledgerFailureStatements = [...inspected.statements.map(runner.compatibilitySql), 'INSERT INTO d1_migrations (name, applied_at) VALUES (\'0030_dependency_graph_guard.sql\', CURRENT_TIMESTAMP)', 'SELECT * FROM definitely_missing_compat_table'];
failed = false;
try { await batch(ledgerFailureStatements.map((sql) => ({ sql }))); } catch { failed = true; }
assert(failed, 'LEDGER_FAILURE_NOT_TRIGGERED');
const afterFailed = await readState(config);
assert(!afterFailed.ledger.some((row) => row.name === '0030_dependency_graph_guard.sql'), 'LEDGER_FAILURE_SCHEMA_OR_LEDGER_PERSISTED');
assert(!afterFailed.objects.some((row) => row.name === 'dependency_graph_guard'), 'LEDGER_FAILURE_SCHEMA_PERSISTED');
console.log('LEDGER_ATOMICITY_PASS');

const applied = await runner.run({ accountId, databaseId, token, allowDisposable: true, dryRun: false, execute: true, confirm: true });
console.log(JSON.stringify({ applied }, null, 2));
const finalState = await readState(config);
assert(finalState.ledger.at(-1)?.name === '0030_dependency_graph_guard.sql', 'DISPOSABLE_LEDGER_0030_MISSING');
const finalTriggerCount = finalState.objects.filter((row) => row.type === 'trigger' && row.name.startsWith('trg_shadow_')).length;
assert(finalTriggerCount === 76, `DISPOSABLE_TRIGGER_COUNT_${finalTriggerCount}`);
console.log('DISPOSABLE_0030_COMPAT_APPLY_PASS');
console.log(`DISPOSABLE_TRIGGER_COUNT=${finalTriggerCount}`);

const revisionBefore = Number((await query("SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'"))[0]?.revision);
await batch([{ sql: "INSERT INTO task_groups(id) VALUES ('compat_task_group')" }]);
const revisionAfterInsert = Number((await query("SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'"))[0]?.revision);
assert(revisionAfterInsert === revisionBefore + 1, `TASKGROUP_INSERT_REVISION_${revisionBefore}_${revisionAfterInsert}`);
await batch([{ sql: "UPDATE task_groups SET id='compat_task_group_updated' WHERE id='compat_task_group'" }]);
const revisionAfterUpdate = Number((await query("SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'"))[0]?.revision);
assert(revisionAfterUpdate === revisionAfterInsert + 1, `TASKGROUP_UPDATE_REVISION_${revisionAfterInsert}_${revisionAfterUpdate}`);
console.log('TASKGROUP_AUTHORITY_REVISION_PASS');

let staleBlocked = false;
try { await batch([{ sql: "INSERT INTO schedule_recalculation_runs(run_id,authority_revision) VALUES ('stale_run',0)" }]); } catch { staleBlocked = true; }
assert(staleBlocked, 'STALE_SHADOW_GUARD_NOT_BLOCKING');
console.log('SHADOW_STALE_GUARD_PASS');

const rerun = await runner.run({ accountId, databaseId, token, allowDisposable: true, dryRun: false, execute: true, confirm: true });
assert(rerun.skipped === true, 'RERUN_NOT_IDEMPOTENT');
console.log('DISPOSABLE_RERUN_NOOP_PASS');
