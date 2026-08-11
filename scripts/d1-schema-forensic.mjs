import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const TARGET_TABLES = [
  'projects',
  'tasks',
  'task_groups',
  'task_assignees',
  'workers',
  'daily_status',
  'country_holidays',
  'calendar_overrides',
  'project_baselines',
  'task_baselines',
  'project_worker_allocations',
  'project_worker_allocation_history',
  'project_completion_audit_logs',
  'integration_sync_runs',
  'task_structure_change_logs',
  'project_schedule_shift_logs',
  'leave_schedule_shift_logs',
  'cross_project_conflict_acknowledgements',
];

function fixedPragmaUnion(pragmaName, columns) {
  return TARGET_TABLES.map((tableName) => `
    SELECT '${tableName}' AS table_name, ${columns}
    FROM ${pragmaName}('${tableName}') p
  `).join('\nUNION ALL\n');
}

const READ_ONLY_QUERIES = {
  objects: `
    SELECT type, name, tbl_name, COALESCE(sql, '') AS sql
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `,
  columns: `${fixedPragmaUnion(
    'pragma_table_info',
    "p.cid, p.name, p.type, p.[notnull] AS not_null, COALESCE(p.dflt_value, '') AS dflt_value, p.pk",
  )} ORDER BY table_name, cid`,
  indexes: `${fixedPragmaUnion(
    'pragma_index_list',
    'p.seq, p.name, p.[unique] AS is_unique, p.origin, p.partial',
  )} ORDER BY table_name, seq, name`,
  foreignKeys: `${fixedPragmaUnion(
    'pragma_foreign_key_list',
    'p.id, p.seq, p.[table] AS target_table, p.[from] AS from_column, p.[to] AS to_column, p.on_update, p.on_delete, p.match',
  )} ORDER BY table_name, id, seq`,
  ledger: `
    SELECT id, name, applied_at
    FROM d1_migrations
    ORDER BY id
  `,
};

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function collect(environment, payload) {
  const queryNames = Object.keys(READ_ONLY_QUERIES);
  if (!Array.isArray(payload) || payload.length !== queryNames.length) {
    throw new Error(`Expected ${queryNames.length} statements for ${environment}, received ${payload?.length ?? 'invalid JSON'}`);
  }

  const sections = {};
  const metas = {};
  for (const [index, name] of queryNames.entries()) {
    const statement = payload[index];
    if (!statement?.success || statement.meta?.rows_written !== 0 || statement.meta?.changed_db !== false) {
      throw new Error(`Read-only invariant failed for ${environment}/${name}`);
    }
    sections[name] = statement.results ?? [];
    metas[name] = statement.meta;
  }

  sections.objects = sections.objects.map((row) => ({
    ...row,
    sql: normalizeSql(row.sql),
  }));

  const schema = {
    objects: sections.objects,
    columns: sections.columns,
    indexes: sections.indexes,
    foreignKeys: sections.foreignKeys,
  };

  return {
    environment,
    schemaFingerprint: fingerprint(schema),
    ledgerFingerprint: fingerprint(sections.ledger),
    schema,
    ledger: sections.ledger,
    readProof: Object.fromEntries(
      Object.entries(metas).map(([name, meta]) => [name, {
        rowsRead: meta.rows_read,
        rowsWritten: meta.rows_written,
        changedDb: meta.changed_db,
      }]),
    ),
  };
}

function diffRows(leftRows, rightRows, keySelector) {
  const left = new Map(leftRows.map((row) => [keySelector(row), row]));
  const right = new Map(rightRows.map((row) => [keySelector(row), row]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  return keys.flatMap((key) => {
    const a = left.get(key);
    const b = right.get(key);
    return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))
      ? []
      : [{ key, qa: a ?? null, production: b ?? null }];
  });
}

function readArgument(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument ${flag}`);
  }
  return process.argv[index + 1];
}

if (process.argv.includes('--print-sql')) {
  process.stdout.write(`${Object.values(READ_ONLY_QUERIES).map((sql) => sql.replace(/\s+/g, ' ').trim()).join(';')}\n`);
} else {
  const qaPayload = JSON.parse(readFileSync(readArgument('--qa-json'), 'utf8'));
  const productionPayload = JSON.parse(readFileSync(readArgument('--production-json'), 'utf8'));
  const qa = collect('qa', qaPayload);
  const production = collect('production', productionPayload);
  const differences = {
    objects: diffRows(qa.schema.objects, production.schema.objects, (row) => `${row.type}:${row.name}`),
    columns: diffRows(qa.schema.columns, production.schema.columns, (row) => `${row.table_name}:${row.cid}`),
    indexes: diffRows(qa.schema.indexes, production.schema.indexes, (row) => `${row.table_name}:${row.name}`),
    foreignKeys: diffRows(qa.schema.foreignKeys, production.schema.foreignKeys, (row) => `${row.table_name}:${row.id}:${row.seq}`),
    ledger: diffRows(qa.ledger, production.ledger, (row) => `${row.id}:${row.name}`),
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    qa: {
      schemaFingerprint: qa.schemaFingerprint,
      ledgerFingerprint: qa.ledgerFingerprint,
      objectCount: qa.schema.objects.length,
      tableCount: qa.schema.objects.filter((row) => row.type === 'table').length,
      indexCount: qa.schema.objects.filter((row) => row.type === 'index').length,
      triggerCount: qa.schema.objects.filter((row) => row.type === 'trigger').length,
      viewCount: qa.schema.objects.filter((row) => row.type === 'view').length,
      ledger: qa.ledger,
      readProof: qa.readProof,
    },
    production: {
      schemaFingerprint: production.schemaFingerprint,
      ledgerFingerprint: production.ledgerFingerprint,
      objectCount: production.schema.objects.length,
      tableCount: production.schema.objects.filter((row) => row.type === 'table').length,
      indexCount: production.schema.objects.filter((row) => row.type === 'index').length,
      triggerCount: production.schema.objects.filter((row) => row.type === 'trigger').length,
      viewCount: production.schema.objects.filter((row) => row.type === 'view').length,
      ledger: production.ledger,
      readProof: production.readProof,
    },
    differences,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
