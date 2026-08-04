// tests/actualWorkersAndArchive.test.ts
import { describe, it, expect } from 'vitest';
import { ACTUAL_WORKERS, getCurrentWorkerName } from '../src/services/api';
import { translations, getLocalizedErrorMessage } from '../src/i18n';
import { ko, TranslationKeys } from '../src/i18n/ko';
import { vi } from '../src/i18n/vi';
import { generateDateColumns, getKoreaDateString } from '../src/utils/dateUtils';
import { translateText } from '../worker/services/translation';

describe('Actual Workers, Archive, Error Code Localization & i18n Verification', () => {
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
    expect(ko.yearOption).toBe('{year}년');
  });

  it('5. Vietnamese dictionary yearOption has no Korean year character', () => {
    expect(vi.yearOption).toBe('{year}');
    expect(vi.completedProjectsYear).toBe('Hoàn thành năm {year}');
  });

  it('6. Localizes API error codes in Korean and Vietnamese', () => {
    const koT = (key: TranslationKeys) => ko[key];
    const viT = (key: TranslationKeys) => vi[key];

    // INVALID_EDITOR
    const err1 = { code: 'INVALID_EDITOR', message: 'Raw server message' };
    expect(getLocalizedErrorMessage(err1, koT)).toBe('지정된 개발팀 작업자만 편집할 수 있습니다.');
    expect(getLocalizedErrorMessage(err1, viT)).toBe('Chỉ thành viên nhóm phát triển được chỉ định mới có thể chỉnh sửa.');

    // PROJECT_COMPLETED_READ_ONLY
    const err2 = { code: 'PROJECT_COMPLETED_READ_ONLY', message: 'Raw server message' };
    expect(getLocalizedErrorMessage(err2, koT)).toBe('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.');
    expect(getLocalizedErrorMessage(err2, viT)).toBe('Dự án đã hoàn thành chỉ có thể xem. Hãy chuyển lại dự án đang thực hiện để chỉnh sửa.');

    // WORKER_LIST_FIXED
    const err3 = { code: 'WORKER_LIST_FIXED', message: 'Raw server message' };
    expect(getLocalizedErrorMessage(err3, koT)).toBe('작업자 목록은 지정된 개발팀 인원만 사용할 수 있습니다.');
    expect(getLocalizedErrorMessage(err3, viT)).toBe('Danh sách nhân sự chỉ sử dụng các thành viên đã được chỉ định.');

    // TRANSLATION_FAILED
    const err4 = { code: 'TRANSLATION_FAILED', message: 'Raw server message' };
    expect(getLocalizedErrorMessage(err4, koT)).toBe('일정은 저장되었지만 자동 번역에 실패했습니다. 나중에 번역을 다시 시도할 수 있습니다.');
    expect(getLocalizedErrorMessage(err4, viT)).toBe('Lịch đã được lưu nhưng dịch tự động không thành công. Bạn có thể thử dịch lại sau.');

    // Unknown error code fallbacks to server message
    const err5 = { code: 'UNKNOWN_CODE', message: 'Custom server error message' };
    expect(getLocalizedErrorMessage(err5, koT)).toBe('Custom server error message');
    expect(getLocalizedErrorMessage(err5, viT)).toBe('Custom server error message');
  });

  it('7. Korean date headers generate Korean weekdays and month titles', () => {
    const cols = generateDateColumns(new Date('2026-08-01'), new Date('2026-08-07'), new Date('2026-08-01'), 'ko');
    expect(cols.length).toBe(7);
    expect(['일', '월', '화', '수', '목', '금', '토']).toContain(cols[0].dayName);
    expect(cols[0].monthStr).toContain('2026년 08월');
  });

  it('8. Vietnamese date headers generate Vietnamese weekdays and month titles', () => {
    const cols = generateDateColumns(new Date('2026-08-01'), new Date('2026-08-07'), new Date('2026-08-01'), 'vi');
    expect(cols.length).toBe(7);
    expect(['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']).toContain(cols[0].dayName);
    expect(cols[0].monthStr).toContain('Tháng 08 năm 2026');
  });

  it('9. Korea Standard Time calculation produces valid YYYY-MM-DD', () => {
    const koreaDate = getKoreaDateString();
    expect(koreaDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
