import { describe, expect, it } from 'vitest';
import { isManagerWorker, resolveLandingRoute } from '../roleLanding';

describe('V3.1 role landing', () => {
  it('sends CEO/COO viewers to the schedule viewer', () => {
    expect(resolveLandingRoute({ access_role: 'VIEWER', name: 'CEO' })).toBe('/projects');
  });

  it('sends employees and managers to the dashboard', () => {
    expect(resolveLandingRoute({ access_role: 'EDITOR', name: 'Primary' })).toBe('/dashboard');
    expect(isManagerWorker({ access_role: 'EDITOR', can_manage_schedule_engine: 1 })).toBe(true);
  });
});
