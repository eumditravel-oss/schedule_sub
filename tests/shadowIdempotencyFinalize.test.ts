import { describe, expect, it } from 'vitest';
import { idempotentShadowMutation } from '../worker/services/shadowScheduleService';

describe('Shadow idempotency finalization', () => {
  it('does not delete an in-progress reservation when finalization changes zero rows', async () => {
    const rows: any[] = [];
    const db: any = {
      prepare(sql: string) {
        return {
          bind(...args: any[]) {
            return {
              async first() {
                if (sql.startsWith('SELECT *')) return rows.find((row) => row.idempotency_key === args[0]) || null;
                return null;
              },
              async run() {
                if (sql.startsWith('INSERT OR IGNORE')) {
                  if (rows.some((row) => row.idempotency_key === args[0])) return { meta: { changes: 0 } };
                  rows.push({ idempotency_key: args[0], operation: args[1], payload_hash: args[2], response_json: args[3] });
                  return { meta: { changes: 1 } };
                }
                if (sql.startsWith('UPDATE shadow_engine_idempotency_keys')) return { meta: { changes: 0 } };
                if (sql.startsWith('DELETE')) return { meta: { changes: 1 } };
                return { meta: { changes: 0 } };
              },
            };
          },
        };
      },
    };
    await expect(idempotentShadowMutation(db, 'finalize-failure', 'TEST', { value: 1 }, async () => ({ ok: true })))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(rows).toHaveLength(1);
    expect(rows[0].response_json).toBe('{"status":"IN_PROGRESS"}');
  });
});
