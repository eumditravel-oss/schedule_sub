// tests/actualWorkersAndArchive.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ACTUAL_WORKERS, getCurrentWorkerName, setCurrentWorker, clearCurrentWorker } from '../src/services/api';
import { getLocalizedErrorMessage } from '../src/i18n';
import { ko } from '../src/i18n/ko';
import { vi } from '../src/i18n/vi';

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (typeof window === 'undefined' || !window.localStorage) {
  (global as any).localStorage = localStorageMock;
}

describe('Executives & Actual Workers List Verification (7 Members)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. ACTUAL_WORKERS list count must be exactly 7', () => {
    expect(ACTUAL_WORKERS.length).toBe(7);
  });

  it('2. ACTUAL_WORKERS must contain CEO and COO as first two items and exact 7 members in order', () => {
    expect(ACTUAL_WORKERS).toEqual([
      'CEO',
      'COO',
      '유종욱 실장',
      '박용진 수석',
      'Thanh Phuong(탄 프엉)',
      'Manh Cuong(끄엉)',
      'Quoc Nhut(꾸옥 느엿)',
    ]);
  });

  it('3. CEO and COO must be present in ACTUAL_WORKERS list', () => {
    expect(ACTUAL_WORKERS.includes('CEO')).toBe(true);
    expect(ACTUAL_WORKERS.includes('COO')).toBe(true);
  });

  it('4. Legacy worker names must not be present in ACTUAL_WORKERS', () => {
    const legacyNames = ['김개발', '박개발', '이프론트', '최백엔드', '정검증', '정검중'];
    for (const legacy of legacyNames) {
      expect(ACTUAL_WORKERS.includes(legacy)).toBe(false);
    }
  });

  it('5. localStorage must retain valid worker (CEO/COO) and reject invalid names', () => {
    setCurrentWorker('CEO');
    expect(getCurrentWorkerName()).toBe('CEO');

    setCurrentWorker('COO');
    expect(getCurrentWorkerName()).toBe('COO');

    setCurrentWorker('김개발');
    expect(getCurrentWorkerName()).toBe('COO'); // rejected!

    clearCurrentWorker();
    expect(getCurrentWorkerName()).toBe(''); // cleared!

    localStorage.setItem('schedule_current_worker_id', 'UnknownUser');
    localStorage.setItem('schedule_current_worker_name', 'UnknownUser');
    expect(getCurrentWorkerName()).toBe(''); // rejected invalid user!
  });

  it('6. Localized API Error Codes map correctly in KO and VI', () => {
    const tKo = (key: keyof typeof ko) => ko[key];
    const tVi = (key: keyof typeof ko) => vi[key];

    const invalidErr = { code: 'INVALID_EDITOR', message: 'Original' };
    expect(getLocalizedErrorMessage(invalidErr, tKo)).toBe('지정된 개발팀 작업자만 편집할 수 있습니다.');
    expect(getLocalizedErrorMessage(invalidErr, tVi)).toBe('Chỉ thành viên nhóm phát triển được chỉ định mới có thể chỉnh sửa.');

    const readOnlyErr = { code: 'PROJECT_COMPLETED_READ_ONLY', message: 'Original' };
    expect(getLocalizedErrorMessage(readOnlyErr, tKo)).toBe('완료된 프로젝트는 읽기 전용입니다. 수정하려면 진행 프로젝트로 복귀해 주세요.');
    expect(getLocalizedErrorMessage(readOnlyErr, tVi)).toBe('Dự án đã hoàn thành chỉ có thể xem. Hãy chuyển lại dự án đang thực hiện để chỉnh sửa.');

    const fixedErr = { code: 'WORKER_LIST_FIXED', message: 'Original' };
    expect(getLocalizedErrorMessage(fixedErr, tKo)).toBe('작업자 목록은 지정된 개발팀 인원만 사용할 수 있습니다.');
    expect(getLocalizedErrorMessage(fixedErr, tVi)).toBe('Danh sách nhân sự chỉ sử dụng các thành viên đã được chỉ định.');
  });
});
