// tests/e2e/productionMutationGuard.ts
/**
 * Production Mutation Safety Guard
 * Rejects any E2E mutation or data-altering action targeting Production Workers.
 */
export function assertMutationSafety(targetUrl: string, actionName: string = 'Mutation Test') {
  const url = targetUrl || process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || '';
  if (url.includes('concost-dev-scheduler.eumditravel.workers.dev')) {
    throw new Error(`PRODUCTION_MUTATION_TEST_BLOCKED: Attempted to run mutation action '${actionName}' against Production environment (${url}).`);
  }
}
