#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export const EXPECTED_ACCOUNT_ID = 'd2ba2a0f46ac7b4fd11feda26ca45562';
export const EXPECTED_PRODUCTION_DATABASE_ID = 'feb39a05-c98e-455f-a2b1-ff75e1c0b94f';
export const EXPECTED_MIGRATION_SHA = 'B0F81061EE94BA388698474486DDDCC764F47DD19A755BE936D8095159F7C9AB';
export const MIGRATION_NAME = '0030_dependency_graph_guard.sql';
export const MIGRATION_PATH = new URL('../../migrations/0030_dependency_graph_guard.sql', import.meta.url);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function canonicalMigrationSource(source) {
  return source.replace(/\r?\n/g, '\r\n');
}

function isWordStart(value) {
  return /[A-Za-z_]/.test(value ?? '');
}

function isWordChar(value) {
  return /[A-Za-z0-9_]/.test(value ?? '');
}

/**
 * Split SQLite source without treating semicolons inside trigger bodies as
 * statement boundaries. Comments and quoted literals are preserved exactly.
 */
export function parseSqlStatements(source) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let triggerBodyDepth = 0;
  let triggerSeen = false;
  let token = '';

  const flushToken = () => {
    if (!token) return;
    const upper = token.toUpperCase();
    if (upper === 'TRIGGER') triggerSeen = true;
    if (triggerSeen && upper === 'BEGIN') triggerBodyDepth += 1;
    if (triggerSeen && upper === 'END' && triggerBodyDepth > 0) triggerBodyDepth -= 1;
    token = '';
  };

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (source[i + 1] === quote && (quote === "'" || quote === '"')) i += 1;
        else quote = null;
      }
      continue;
    }
    if (c === '-' && next === '-') { flushToken(); lineComment = true; i += 1; continue; }
    if (c === '/' && next === '*') { flushToken(); blockComment = true; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') { flushToken(); quote = c; continue; }

    if (isWordStart(c)) {
      token += c;
      let j = i + 1;
      while (isWordChar(source[j])) { token += source[j]; i = j; j += 1; }
      flushToken();
      continue;
    }
    flushToken();
    if (c === ';' && triggerBodyDepth === 0) {
      const sql = source.slice(start, i + 1);
      if (sql.trim()) statements.push(sql);
      start = i + 1;
    }
  }
  flushToken();
  if (quote || blockComment || triggerBodyDepth !== 0) {
    throw new Error('SQL source is incomplete: unterminated quote/comment/trigger body');
  }
  if (source.slice(start).trim()) throw new Error('SQL source has a trailing incomplete statement');
  return statements;
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--.*$/gm, ' ');
}

export function statementType(sql) {
  const normalized = stripComments(sql).trim().toUpperCase();
  if (normalized.startsWith('CREATE TRIGGER')) return 'CREATE TRIGGER';
  if (normalized.startsWith('CREATE TABLE')) return 'CREATE TABLE';
  if (normalized.startsWith('ALTER TABLE')) return 'ALTER TABLE';
  if (normalized.startsWith('INSERT')) return 'INSERT';
  return normalized.split(/\s+/, 1)[0] || 'UNKNOWN';
}

export function transportSql(sql) {
  return sql.replace(/;\s*$/u, '');
}

/** D1's remote parser rejects this valid WHEN+RAISE trigger form. The
 * equivalent SELECT ... WHERE form preserves the condition and stable error.
 * The immutable source statement remains the audit/hash authority. */
export function compatibilitySql(sql) {
  const normalized = transportSql(sql).replaceAll('\r\n', '\n').trim();
  if (!normalized.includes('trg_shadow_run_authority_guard') || !normalized.includes('WHEN NEW.authority_revision')) return normalized;
  const header = normalized.slice(0, normalized.indexOf('WHEN NEW.authority_revision')).trimEnd();
  return `${header} BEGIN SELECT RAISE(ABORT, 'SHADOW_RUN_INPUT_CHANGED') WHERE NEW.authority_revision <> (SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'); END`;
}

export function inspectSource(source, expectedSha = EXPECTED_MIGRATION_SHA) {
  const actualSha = sha256(canonicalMigrationSource(source));
  if (actualSha !== expectedSha) throw new Error(`MIGRATION_SHA_MISMATCH expected=${expectedSha} actual=${actualSha}`);
  const statements = parseSqlStatements(source);
  const reconstructed = statements.join('');
  if (!source.startsWith(reconstructed) || source.slice(reconstructed.length).trim() !== '') {
    throw new Error('SQL_SOURCE_RECONSTRUCTION_MISMATCH');
  }
  const metadata = statements.map((sql, index) => ({ index: index + 1, type: statementType(sql), sha256: sha256(sql), length: Buffer.byteLength(sql) }));
  const counts = Object.fromEntries(['CREATE TABLE', 'ALTER TABLE', 'INSERT', 'CREATE TRIGGER'].map((type) => [type, metadata.filter((item) => item.type === type).length]));
  return { sha256: actualSha, statements, metadata, counts };
}

export function validateStatePreconditions(state) {
  const names = new Set(state.objects.map((row) => row.name));
  const latest = state.ledger.at(-1)?.name;
  if (state.ledger.some((row) => row.name === MIGRATION_NAME)) return { alreadyApplied: true };
  if (latest !== '0029_shadow_engine_idempotency.sql') throw new Error(`LEDGER_PRECONDITION_FAILED latest=${latest ?? 'none'}`);
  const partial = names.has('dependency_graph_guard')
    || names.has('shadow_schedule_authority_guard')
    || names.has('trg_shadow_run_authority_guard')
    || [...names].some((name) => name.startsWith('trg_shadow_auth_'))
    || state.authorityRevision.length > 0;
  if (partial) throw new Error('PARTIAL_STATE_DETECTED');
  return { alreadyApplied: false };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function has(name) { return process.argv.includes(name); }

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

export async function requestJson({ accountId, databaseId, token, body }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false || payload.errors?.length) {
    throw new Error(`D1_REMOTE_ERROR HTTP=${response.status} ${JSON.stringify(payload.errors ?? payload)}`);
  }
  const results = payload.result ?? [];
  const failed = results.find((result) => result?.success === false);
  if (failed) throw new Error(`D1_STATEMENT_ERROR ${JSON.stringify(failed)}`);
  return results;
}

export async function readState(config) {
  const [ledger, objects, columns] = await Promise.all([
    requestJson({ ...config, body: { batch: [{ sql: 'SELECT id,name,applied_at FROM d1_migrations ORDER BY id' }] } }),
    requestJson({ ...config, body: { batch: [{ sql: "SELECT type,name,tbl_name,COALESCE(sql,'') AS sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name" }] } }),
    requestJson({ ...config, body: { batch: [{ sql: "SELECT name FROM pragma_table_info('schedule_recalculation_runs') WHERE name='authority_revision'" }] } }),
  ]);
  return { ledger: ledger[0]?.results ?? [], objects: objects[0]?.results ?? [], authorityRevision: columns[0]?.results ?? [] };
}

function validatePreconditions(state) {
  return validateStatePreconditions(state);
}

export async function run(options = {}) {
  const source = readFileSync(new URL('../../migrations/0030_dependency_graph_guard.sql', import.meta.url), 'utf8');
  const inspected = inspectSource(source, options.expectedSha ?? EXPECTED_MIGRATION_SHA);
  const accountId = options.accountId ?? arg('--account-id') ?? EXPECTED_ACCOUNT_ID;
  const databaseId = options.databaseId ?? arg('--database-id') ?? EXPECTED_PRODUCTION_DATABASE_ID;
  if (accountId !== EXPECTED_ACCOUNT_ID) throw new Error('ACCOUNT_ID_MISMATCH');
  if (databaseId !== EXPECTED_PRODUCTION_DATABASE_ID && !(options.allowDisposable ?? has('--allow-disposable'))) throw new Error('PRODUCTION_DATABASE_ID_MISMATCH');
  const token = options.token ?? process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
  required(token, 'CLOUDFLARE_API_TOKEN');
  const config = { accountId, databaseId, token };
  const state = await readState(config);
  const precondition = validatePreconditions(state);
  const plan = { databaseId, accountId, migration: MIGRATION_NAME, sourceSha256: inspected.sha256, statementCount: inspected.statements.length, counts: inspected.counts, latestLedger: state.ledger.at(-1)?.name ?? null, precondition };
  if ((options.dryRun ?? has('--dry-run')) || !(options.execute ?? has('--execute'))) return plan;
  if (!(options.confirm ?? has('--confirm'))) throw new Error('EXECUTION_REQUIRES_CONFIRM');
  if (precondition.alreadyApplied) return { ...plan, skipped: true };
  const sqlStatements = [...inspected.statements, 'INSERT INTO d1_migrations (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)'];
  const body = { batch: sqlStatements.map((sql, index) => ({ sql: compatibilitySql(sql), ...(index === sqlStatements.length - 1 ? { params: [MIGRATION_NAME] } : {}) })) };
  await requestJson({ ...config, body });
  const after = await readState(config);
  if (!after.ledger.some((row) => row.name === MIGRATION_NAME)) throw new Error('LEDGER_POSTCONDITION_FAILED');
  return { ...plan, applied: true, postLedger: after.ledger.at(-1) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await run(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
