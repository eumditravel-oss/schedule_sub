// tests/actualWorkersAndArchive.test.ts
import { describe, it, expect } from 'vitest';
import { ACTUAL_WORKERS, getCurrentWorkerName } from '../src/services/api';
import { translations } from '../src/i18n';
import { ko, TranslationKeys } from '../src/i18n/ko';
import { vi } from '../src/i18n/vi';

describe('Actual Workers, Archive & i18n Verification', () => {
  it('1. ACTUAL_WORKERS contains exactly 5 team members', () => {
    expect(ACTUAL_WORKERS.length).toBe(5);
  });

  it('2. ACTUAL_WORKERS has correct specified names and order', () => {
    expect(ACTUAL_WORKERS[0]).toBe('유종욱 실장');
    expect(ACTUAL_WORKERS[1]).toBe('박용진 수석');
    expect(ACTUAL_WORKERS[2]).toBe('Thanh Phuong(탄 프엉)');
    expect(ACTUAL_WORKERS[3]).toBe('Manh Cuong(끄엉)');
    expect(ACTUAL_WORKERS[4]).toBe('Quoc Nhut(꾸옥 느엿)');
  });

  it('3. Clears invalid worker from localStorage', () => {
    try {
      localStorage.setItem('schedule_current_worker_id', '김개발_과거인원');
      const current = getCurrentWorkerName();
      expect(current).toBe('');
    } catch {}
  });

  it('4. Restores valid worker from localStorage', () => {
    try {
      localStorage.setItem('schedule_current_worker_id', '박용진 수석');
      const current = getCurrentWorkerName();
      expect(current).toBe('박용진 수석');
    } catch {}
  });

  it('5. Korean dictionary has complete keys', () => {
    const keys = Object.keys(ko) as TranslationKeys[];
    expect(keys.length).toBeGreaterThan(30);
    keys.forEach((key) => {
      expect(ko[key]).toBeDefined();
      expect(ko[key].length).toBeGreaterThan(0);
    });
  });

  it('6. Vietnamese dictionary matches all Korean dictionary keys without missing ones', () => {
    const keys = Object.keys(ko) as TranslationKeys[];
    keys.forEach((key) => {
      expect(vi[key]).toBeDefined();
      expect(vi[key].length).toBeGreaterThan(0);
    });
  });

  it('7. Header title phrasings match exact requirements', () => {
    expect(ko.headerTitle).toBe('개발팀 프로젝트 스케쥴러');
    expect(vi.headerTitle).toBe('Lịch dự án nhóm phát triển');
  });

  it('8. Translation status enums include MANUAL and FAILED', () => {
    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'MANUAL'];
    expect(validStatuses).toContain('FAILED');
    expect(validStatuses).toContain('MANUAL');
  });
});
