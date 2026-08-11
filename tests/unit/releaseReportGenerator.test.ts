// tests/unit/releaseReportGenerator.test.ts
import { describe, it, expect, vi } from 'vitest';
// @ts-ignore
import { generateReleaseReport } from '../../scripts/generate-release-report.mjs';

describe('Release Report Generator & 5-Way SHA Verification Unit Suite', () => {
  it('1. Returns sha_match: false when QA or Production SHA differs from Source Commit SHA', async () => {
    // Mock fetch for mismatched endpoints
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('-qa.eumditravel.workers.dev/api/version')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { commit: '0182a543ede8c0c9b9e13253722a87b1de03a9e8' } }),
        });
      }
      if (url.includes('.eumditravel.workers.dev/api/version')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { commit: '0182a543ede8c0c9b9e13253722a87b1de03a9e8' } }),
        });
      }
      return Promise.reject(new Error('Network error'));
    });

    const report = await generateReleaseReport({
      gitSha: 'different_git_sha_0000000000000000000000000',
      frontendSha: 'different_git_sha_0000000000000000000000000',
    });

    expect(report.sha_match).toBe(false);
    expect(report.source_commit_sha).toBe('different_git_sha_0000000000000000000000000');
    expect(report.qa_sha).toBe('0182a543ede8c0c9b9e13253722a87b1de03a9e8');
  });

  it('2. Returns UNKNOWN / ERROR when Health endpoints are unreachable (No Hardcoded PASS)', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.reject(new Error('API Unreachable')));

    const report = await generateReleaseReport({
      gitSha: '0182a543ede8c0c9b9e13253722a87b1de03a9e8',
      frontendSha: '0182a543ede8c0c9b9e13253722a87b1de03a9e8',
    });

    expect(report.scheduler_health.status).toBe('ERROR');
    expect(report.completion_health.inconsistent_projects).toBe('UNKNOWN');
    expect(report.completion_health.inconsistent_tasks).toBe('UNKNOWN');
    expect(report.critical_release_gate.status).toBe('NOT_RUN');
    expect(report.browsers.chromium).toBe('NOT_RUN');
    expect(report.build_indicator_sha).toBe('unknown');
  });

  it('3. Returns sha_match: true when all 5 SHAs match', async () => {
    const testSha = '0182a543ede8c0c9b9e13253722a87b1de03a9e8';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { commit: testSha } }),
        });
      }
      if (url.includes('/api/health/scheduler-integrity')) {
        return Promise.resolve({
          json: () => Promise.resolve({ status: 'PASS' }),
        });
      }
      if (url.includes('/api/health/completion-integrity')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { inconsistent_projects: 0, inconsistent_tasks: 0 } }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const report = await generateReleaseReport({
      gitSha: testSha,
      frontendSha: testSha,
      buildIndicatorSha: testSha,
      gateStatus: 'PASS',
      chromiumStatus: 'PASS',
    });

    expect(report.sha_match).toBe(true);
    expect(report.source_commit_sha).toBe(testSha);
    expect(report.qa_sha).toBe(testSha);
    expect(report.production_sha).toBe(testSha);
    expect(report.build_indicator_sha).toBe(testSha);
    expect(report.scheduler_health.status).toBe('PASS');
    expect(report.completion_health.inconsistent_projects).toBe(0);
    expect(report.full_repository_e2e.executed).toBe(false);
    expect(report.full_repository_e2e.status).toBe('NOT_RUN');
    expect(report.browsers.chromium).toBe('PASS');
    expect(report.browsers.msedge).toBe('NOT_RUN');
    expect(report.browsers.webkit).toBe('NOT_RUN');
  });
});
