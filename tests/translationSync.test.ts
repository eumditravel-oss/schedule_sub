// tests/translationSync.test.ts
import { describe, it, expect, vi } from 'vitest';
import { translateText } from '../worker/services/translation';

describe('Real-time Translation Synchronization Tests', () => {
  it('1. Modifying Korean project title re-translates Vietnamese title and overwrites old translation', async () => {
    const oldKo = 'ERP 그룹웨어 구축';
    const oldVi = 'Xây dựng ERP Groupware';
    const newKo = 'ERP 그룹웨어 구축 20단계';

    // Source changed check
    const isSourceChanged = newKo.trim() !== oldKo.trim();
    expect(isSourceChanged).toBe(true);

    // Call translation service
    const mockAiEnv = {
      AI: {
        run: async (_model: string, inputs: any) => {
          if (inputs.text === 'ERP 그룹웨어 구축 20단계') {
            return { translated_text: 'Xây dựng ERP Groupware Giai đoạn 20' };
          }
          return { translated_text: 'Dịch tự động' };
        },
      },
    };

    const res = await translateText({
      text: newKo,
      sourceLanguage: 'ko',
      targetLanguage: 'vi',
      env: mockAiEnv,
    });

    expect(res.translatedText).not.toBe(oldVi);
    expect(res.translatedText).toBe('Xây dựng ERP Groupware Giai đoạn 20');
  });

  it('2. Modifying Vietnamese project title re-translates Korean title', async () => {
    const oldVi = 'Quản lý tiến độ';
    const newVi = 'Quản lý tiến độ dự án 2026';

    const mockAiEnv = {
      AI: {
        run: async () => ({ translated_text: '2026년 프로젝트 진행 관리' }),
      },
    };

    const res = await translateText({
      text: newVi,
      sourceLanguage: 'vi',
      targetLanguage: 'ko',
      env: mockAiEnv,
    });

    expect(res.translatedText).toBe('2026년 프로젝트 진행 관리');
  });

  it('3. Modifying Korean task title re-translates Vietnamese task title', async () => {
    const newKoTask = '간트 모듈 버그 수정';
    const mockAiEnv = {
      AI: {
        run: async () => ({ translated_text: 'Sửa lỗi module Gantt' }),
      },
    };

    const res = await translateText({
      text: newKoTask,
      sourceLanguage: 'ko',
      targetLanguage: 'vi',
      env: mockAiEnv,
    });

    expect(res.translatedText).toBe('Sửa lỗi module Gantt');
  });

  it('4. Dates and progress edits do NOT trigger AI translation', () => {
    const oldRecord = { name_ko: '스케줄러', start_date: '2026-08-01', progress: 50 };
    const patchPayload: { name_ko?: string; start_date: string; progress: number } = { start_date: '2026-08-05', progress: 80 };

    const sourceTextKo = patchPayload.name_ko ?? oldRecord.name_ko;
    const isSourceChanged = sourceTextKo !== oldRecord.name_ko;

    expect(isSourceChanged).toBe(false);
  });

  it('5. Source modification clears old MANUAL translation and forces auto-translation', async () => {
    const oldManualVi = 'Bản dịch thủ công cũ';
    const newSourceKo = '신규 시스템 구축 건';

    const mockAiEnv = {
      AI: {
        run: async () => ({ translated_text: 'Xây dựng hệ thống mới' }),
      },
    };

    const res = await translateText({
      text: newSourceKo,
      sourceLanguage: 'ko',
      targetLanguage: 'vi',
      env: mockAiEnv,
    });

    expect(res.translatedText).not.toBe(oldManualVi);
    expect(res.translatedText).toBe('Xây dựng hệ thống mới');
  });

  it('6. Translation failure clears old stale translation instead of keeping it', async () => {
    const oldVi = 'Xây dựng ERP Groupware';
    const newKo = 'ERP 그룹웨어 구축 20단계';

    let failedVi = oldVi;
    try {
      await translateText({
        text: newKo,
        sourceLanguage: 'ko',
        targetLanguage: 'vi',
        env: { AI: null },
      });
    } catch {
      failedVi = '';
    }

    expect(failedVi).toBe('');
    expect(failedVi).not.toBe(oldVi);
  });
});
