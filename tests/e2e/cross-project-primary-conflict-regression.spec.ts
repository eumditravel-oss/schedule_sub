// tests/e2e/cross-project-primary-conflict-regression.spec.ts
import { test, expect } from '@playwright/test';

const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';

test.describe('Cross-Project PRIMARY Conflict Regression Suite', () => {
  test('1. Verify GET /api/projects/:id/conflicts uses V2 PRIMARY-only engine and policy version cross_project_v2_primary_only', async () => {
    const res = await fetch(`${QA_BASE_URL}/api/projects/prj_1786324719846_dmo5/conflicts`);
    expect(res.status).toBe(200);
    const data: any = await res.json();

    expect(data.total_conflict_count).toBeDefined();
    expect(data.groups).toBeDefined();

    if (data.groups.length > 0) {
      expect(data.groups[0].policy_version).toBe('cross_project_v2_primary_only');
    }
  });
});
