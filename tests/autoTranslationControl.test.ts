import { describe, expect, it } from 'vitest';
import { shouldAutomaticallyTranslate } from '../src/utils/translationControl';

describe('automatic translation control', () => {
  it('automatically translates a changed source before the target is edited manually', () => {
    expect(shouldAutomaticallyTranslate('변경된 원문', '기존 원문', true)).toBe(true);
  });

  it('does not automatically translate after the target is edited manually', () => {
    expect(shouldAutomaticallyTranslate('변경된 원문', '기존 원문', false)).toBe(false);
  });

  it('does not translate blank or unchanged source text', () => {
    expect(shouldAutomaticallyTranslate('   ', '기존 원문', true)).toBe(false);
    expect(shouldAutomaticallyTranslate('같은 원문', '같은 원문', true)).toBe(false);
  });
});
