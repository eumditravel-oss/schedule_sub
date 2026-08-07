import { describe, it, expect } from 'vitest';
import { CALENDAR_VISUAL_TOKENS, resolveCalendarVisualState } from '../calendarVisualTokens';

describe('CALENDAR_VISUAL_TOKENS & Unified Hatch System', () => {
  it('1. BOTH_OFF: Rose base, Rose accent, Cross Hatch pattern (45deg + 135deg)', () => {
    const token = CALENDAR_VISUAL_TOKENS.BOTH_OFF;
    expect(token.baseColor).toBe('#FFF1F2');
    expect(token.accentColor).toBe('#E11D48');
    expect(token.hatch.enabled).toBe(true);
    expect(token.hatch.type).toBe('cross');
    expect(token.hatch.pattern).toContain('45deg');
    expect(token.hatch.pattern).toContain('135deg');
  });

  it('2. KR_ONLY_OFF: Orange base, Orange accent, 135deg single diagonal', () => {
    const token = CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF;
    expect(token.baseColor).toBe('#FFF7ED');
    expect(token.accentColor).toBe('#F97316');
    expect(token.hatch.enabled).toBe(true);
    expect(token.hatch.angle).toBe(135);
    expect(token.hatch.pattern).toContain('135deg');
    expect(token.hatch.pattern).not.toContain('45deg');
  });

  it('3. VN_ONLY_OFF: Sky base, Sky accent, 45deg single diagonal', () => {
    const token = CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF;
    expect(token.baseColor).toBe('#F0F9FF');
    expect(token.accentColor).toBe('#0284C7');
    expect(token.hatch.enabled).toBe(true);
    expect(token.hatch.angle).toBe(45);
    expect(token.hatch.pattern).toContain('45deg');
    expect(token.hatch.pattern).not.toContain('135deg');
  });

  it('4. PERSONAL_LEAVE: Violet base, Violet accent, 135deg single diagonal with wider gap', () => {
    const token = CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE;
    expect(token.baseColor).toBe('#F5F3FF');
    expect(token.accentColor).toBe('#7C3AED');
    expect(token.hatch.enabled).toBe(true);
    expect(token.hatch.gapPx).toBe(11);
    expect(token.hatch.pattern).toContain('14px');
  });

  it('5. WORK_OVERRIDE: Emerald base, Emerald accent, Hatch disabled', () => {
    const token = CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE;
    expect(token.baseColor).toBe('#ECFDF5');
    expect(token.accentColor).toBe('#059669');
    expect(token.hatch.enabled).toBe(false);
  });

  it('7. WORKDAY: White base, Hatch disabled', () => {
    const token = CALENDAR_VISUAL_TOKENS.WORKDAY;
    expect(token.baseColor).toBe('#FFFFFF');
    expect(token.hatch.enabled).toBe(false);
  });

  it('8. resolveCalendarVisualState resolves expected tokens correctly', () => {
    const tokenBothOff = resolveCalendarVisualState('2026-05-10', null, { is_working_day: false, day_type: 'WEEKLY_OFF', country_code: 'KR' } as any, 'BOTH_OFF');
    expect(tokenBothOff.visualState).toBe('BOTH_OFF');

    const tokenKrOff = resolveCalendarVisualState('2026-05-09', { country_code: 'KR' }, { is_working_day: false, day_type: 'WEEKLY_OFF', country_code: 'KR' } as any, 'KR_ONLY_OFF');
    expect(tokenKrOff.visualState).toBe('KR_ONLY_OFF');

    const tokenVnWork = resolveCalendarVisualState('2026-05-09', { country_code: 'VN' }, { is_working_day: true, day_type: 'WORKDAY', country_code: 'VN' } as any, 'KR_ONLY_OFF');
    expect(tokenVnWork.visualState).toBe('WORKDAY');
  });
});
