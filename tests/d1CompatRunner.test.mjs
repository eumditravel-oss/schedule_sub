import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EXPECTED_MIGRATION_SHA,
  inspectSource,
  parseSqlStatements,
  statementType,
  transportSql,
  compatibilitySql,
  validateStatePreconditions,
} from '../scripts/d1/apply-0030-remote-compat.mjs';

const source = readFileSync(new URL('../migrations/0030_dependency_graph_guard.sql', import.meta.url), 'utf8');

describe('0030 remote compatibility parser', () => {
  it('preserves trigger-body semicolons as one complete statement', () => {
    const statements = parseSqlStatements(source);
    const triggers = statements.filter((sql) => statementType(sql) === 'CREATE TRIGGER');
    expect(triggers.length).toBe(76);
    expect(triggers.every((sql) => /\bBEGIN\b[\s\S]*\bEND\s*;\s*$/i.test(sql))).toBe(true);
    expect(statements.join('').replaceAll('\r\n', '\n').trimEnd())
      .toBe(source.replaceAll('\r\n', '\n').trimEnd());
  });

  it('locks the immutable source SHA and emits statement metadata', () => {
    const result = inspectSource(source);
    expect(result.sha256).toBe(EXPECTED_MIGRATION_SHA);
    expect(result.metadata).toHaveLength(81);
    expect(result.counts).toEqual({
      'CREATE TABLE': 2,
      'ALTER TABLE': 1,
      INSERT: 2,
      'CREATE TRIGGER': 76,
    });
    expect(result.metadata.every((item) => item.length > 0 && /^[A-F0-9]{64}$/.test(item.sha256))).toBe(true);
    const trigger = result.statements.find((sql) => statementType(sql) === 'CREATE TRIGGER');
    expect(transportSql(trigger)).not.toMatch(/END;\s*$/);
    const guard = result.statements.find((sql) => sql.includes('trg_shadow_run_authority_guard'));
    expect(compatibilitySql(guard)).toContain("SELECT RAISE(ABORT, 'SHADOW_RUN_INPUT_CHANGED') WHERE");
    expect(compatibilitySql(guard)).not.toContain('\nWHEN NEW.authority_revision');
  });

  it('blocks a source SHA mismatch before any remote request', () => {
    expect(() => inspectSource(source, '0'.repeat(64))).toThrow('MIGRATION_SHA_MISMATCH');
  });

  it('fails closed for wrong ledger or partial 0030 objects', () => {
    expect(() => validateStatePreconditions({ ledger: [{ name: '0028_shadow_schedule_recalculation.sql' }], objects: [], authorityRevision: [] })).toThrow('LEDGER_PRECONDITION_FAILED');
    expect(() => validateStatePreconditions({ ledger: [{ name: '0029_shadow_engine_idempotency.sql' }], objects: [{ name: 'dependency_graph_guard' }], authorityRevision: [] })).toThrow('PARTIAL_STATE_DETECTED');
    expect(validateStatePreconditions({ ledger: [{ name: '0030_dependency_graph_guard.sql' }], objects: [{ name: 'dependency_graph_guard' }], authorityRevision: [] })).toEqual({ alreadyApplied: true });
  });
});
