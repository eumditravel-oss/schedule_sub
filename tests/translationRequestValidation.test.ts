import { describe, expect, it } from 'vitest';
import { translationRequestSchema } from '../worker/schemas/validation';

describe('translation request validation', () => {
  it('accepts Korean and Vietnamese translation requests', () => {
    expect(translationRequestSchema.parse({
      text: ' 프로젝트 일정 확인 ',
      source_lang: 'ko',
      target_lang: 'vi',
    })).toEqual({
      text: '프로젝트 일정 확인',
      source_lang: 'ko',
      target_lang: 'vi',
    });

    expect(translationRequestSchema.safeParse({
      text: 'Kiểm tra lịch dự án',
      source_lang: 'vi',
      target_lang: 'ko',
    }).success).toBe(true);
  });

  it('rejects blank text, unsupported languages, and oversized input', () => {
    expect(translationRequestSchema.safeParse({
      text: '   ',
      source_lang: 'ko',
      target_lang: 'vi',
    }).success).toBe(false);

    expect(translationRequestSchema.safeParse({
      text: 'Translate this',
      source_lang: 'en',
      target_lang: 'ko',
    }).success).toBe(false);

    expect(translationRequestSchema.safeParse({
      text: '가'.repeat(5001),
      source_lang: 'ko',
      target_lang: 'vi',
    }).success).toBe(false);
  });
});
