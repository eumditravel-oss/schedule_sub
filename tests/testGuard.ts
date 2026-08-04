// tests/testGuard.ts
export const QA_BASE_URL = 'https://concost-dev-scheduler-qa.eumditravel.workers.dev';
export const PROD_BASE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev';

export function getTestBaseUrl(): string {
  const targetUrl = process.env.TEST_BASE_URL || QA_BASE_URL;
  const isProd = targetUrl.includes('concost-dev-scheduler.eumditravel.workers.dev') && !targetUrl.includes('-qa.');
  const allowProd = process.env.ALLOW_PRODUCTION_MUTATION_TESTS === 'true';

  if (isProd && !allowProd) {
    throw new Error(
      `[SECURITY ERROR] Mutation tests on production URL (${targetUrl}) are BLOCKED! Set ALLOW_PRODUCTION_MUTATION_TESTS=true to explicitly override.`
    );
  }
  return targetUrl;
}

export class QATracker {
  projectIds: string[] = [];
  taskIds: string[] = [];
  overrideGroupIds: string[] = [];
  overrideIds: string[] = [];

  trackProject(id: string) {
    if (id && !this.projectIds.includes(id)) this.projectIds.push(id);
  }
  trackTask(id: string) {
    if (id && !this.taskIds.includes(id)) this.taskIds.push(id);
  }
  trackOverrideGroup(id: string) {
    if (id && !this.overrideGroupIds.includes(id)) this.overrideGroupIds.push(id);
  }
  trackOverride(id: string) {
    if (id && !this.overrideIds.includes(id)) this.overrideIds.push(id);
  }

  async cleanup(baseUrl: string, editorName = '박용진 수석') {
    // 1. Delete tracked override groups
    for (const gid of this.overrideGroupIds) {
      try {
        await fetch(`${baseUrl}/api/calendar/override-groups/${gid}`, {
          method: 'DELETE',
          headers: { 'x-editor-name': encodeURIComponent(editorName) },
        });
      } catch (e) {
        console.warn(`Cleanup group ${gid} error:`, e);
      }
    }

    // 2. Delete tracked individual overrides
    for (const oid of this.overrideIds) {
      try {
        await fetch(`${baseUrl}/api/calendar/overrides/${oid}`, {
          method: 'DELETE',
          headers: { 'x-editor-name': encodeURIComponent(editorName) },
        });
      } catch (e) {
        console.warn(`Cleanup override ${oid} error:`, e);
      }
    }

    // 3. Delete tracked projects
    for (const pid of this.projectIds) {
      try {
        await fetch(`${baseUrl}/api/projects/${pid}`, {
          method: 'DELETE',
          headers: { 'x-editor-name': encodeURIComponent(editorName) },
        });
      } catch (e) {
        console.warn(`Cleanup project ${pid} error:`, e);
      }
    }

    this.projectIds = [];
    this.taskIds = [];
    this.overrideGroupIds = [];
    this.overrideIds = [];
  }
}
