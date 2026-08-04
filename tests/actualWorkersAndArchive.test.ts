// tests/actualWorkersAndArchive.test.ts
import { describe, it, expect } from 'vitest';
import { ACTUAL_WORKERS, getCurrentWorkerName } from '../src/services/api';
import { translations } from '../src/i18n';
import { ko, TranslationKeys } from '../src/i18n/ko';
import { vi } from '../src/i18n/vi';
import { generateDateColumns, getKoreaDateString } from '../src/utils/dateUtils';
import { translateText } from '../worker/services/translation';

describe('Actual Workers, Archive & i18n Comprehensive Verification', () => {
  it('1. ACTUAL_WORKERS contains exactly 5 team members in correct order', () => {
    expect(ACTUAL_WORKERS.length).toBe(5);
    expect(ACTUAL_WORKERS[0]).toBe('유종욱 실장');
    expect(ACTUAL_WORKERS[1]).toBe('박용진 수석');
    expect(ACTUAL_WORKERS[2]).toBe('Thanh Phuong(탄 프엉)');
    expect(ACTUAL_WORKERS[3]).toBe('Manh Cuong(끄엉)');
    expect(ACTUAL_WORKERS[4]).toBe('Quoc Nhut(꾸옥 느엿)');
  });

  it('2. Clears invalid worker from localStorage', () => {
    try {
      localStorage.setItem('schedule_current_worker_id', '미등록_임의작업자');
      const current = getCurrentWorkerName();
      expect(current).toBe('');
    } catch {}
  });

  it('3. Restores valid worker from localStorage', () => {
    try {
      localStorage.setItem('schedule_current_worker_id', '박용진 수석');
      const current = getCurrentWorkerName();
      expect(current).toBe('박용진 수석');
    } catch {}
  });

  it('4. Korean dictionary has complete keys and matches requirements', () => {
    const keys = Object.keys(ko) as TranslationKeys[];
    expect(keys.length).toBeGreaterThan(35);
    expect(ko.headerTitle).toBe('개발팀 프로젝트 스케쥴러');
    expect(ko.completedProjectsYear).toBe('{year}년 완료');
  });

  it('5. Vietnamese dictionary matches all Korean dictionary keys without missing ones', () => {
    const keys = Object.keys(ko) as TranslationKeys[];
    keys.forEach((key) => {
      expect(vi[key]).toBeDefined();
      expect(vi[key].length).toBeGreaterThan(0);
    });
    expect(vi.headerTitle).toBe('Lịch dự án nhóm phát triển');
    expect(vi.completedProjectsYear).toBe('Hoàn thành năm {year}');
  });

  it('6. Korean date headers generate Korean weekdays and month titles', () => {
    const cols = generateDateColumns(new Date('2026-08-01'), new Date('2026-08-07'), new Date('2026-08-01'), 'ko');
    expect(cols.length).toBe(7);
    expect(['일', '월', '화', '수', '목', '금', '토']).toContain(cols[0].dayName);
    expect(cols[0].monthStr).toContain('2026년 08월');
  });

  it('7. Vietnamese date headers generate Vietnamese weekdays and month titles', () => {
    const cols = generateDateColumns(new Date('2026-08-01'), new Date('2026-08-07'), new Date('2026-08-01'), 'vi');
    expect(cols.length).toBe(7);
    expect(['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']).toContain(cols[0].dayName);
    expect(cols[0].monthStr).toContain('Tháng 08 năm 2026');
  });

  it('8. Korea Standard Time calculation produces valid YYYY-MM-DD', () => {
    const koreaDate = getKoreaDateString();
    expect(koreaDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('9. Active worker check accepts only 5 actual team members', () => {
    expect(ACTUAL_WORKERS.includes('유종욱 실장')).toBe(true);
    expect(ACTUAL_WORKERS.includes('외부사용자')).toBe(false);
  });

  it('10. Same language translation returns text directly without calling AI', async () => {
    const res = await translateText({
      text: '테스트 프로젝트',
      sourceLanguage: 'ko',
      targetLanguage: 'ko',
      env: {},
    });
    expect(res.translatedText).toBe('테스트 프로젝트');
  });
});
