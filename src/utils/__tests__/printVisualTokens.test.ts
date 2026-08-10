// src/utils/__tests__/printVisualTokens.test.ts
import { describe, it, expect } from 'vitest';
import {
  getPrintCalendarVisualStyle,
  getPrintGanttBarStyle,
  getPrintStatusBadgeStyle,
} from '../printVisualTokens';

describe('printVisualTokens Suite', () => {
  it('should return standard color visual token in color mode', () => {
    const krOff = getPrintCalendarVisualStyle('KR_ONLY_OFF', 'color');
    expect(krOff.visualState).toBe('KR_ONLY_OFF');
    expect(krOff.baseColor).toBe('#FFF7ED');
    expect(krOff.hatch.enabled).toBe(true);
  });

  it('should return grayscale low opacity visual token in mono mode', () => {
    const bothOffMono = getPrintCalendarVisualStyle('BOTH_OFF', 'mono');
    expect(bothOffMono.visualState).toBe('BOTH_OFF');
    expect(bothOffMono.baseColor).toBe('#F1F5F9');
    expect(bothOffMono.hatch.alpha).toBeLessThanOrEqual(0.2);
    expect(bothOffMono.textClass).toContain('slate-900');
  });

  it('should return correct Gantt bar styles for color and mono modes', () => {
    const completedColor = getPrintGanttBarStyle('COMPLETED', 'color');
    expect(completedColor.backgroundColor).toBe('#10B981'); // Emerald green requirement

    const completedMono = getPrintGanttBarStyle('COMPLETED', 'mono');
    expect(completedMono.backgroundColor).toBe('#1E293B');

    const blockedMono = getPrintGanttBarStyle('BLOCKED', 'mono');
    expect(blockedMono.borderStyle).toBe('dashed');
  });

  it('should return appropriate status badges for KO and VI languages', () => {
    const badgeKo = getPrintStatusBadgeStyle('COMPLETED', 'color', 'ko');
    expect(badgeKo.label).toBe('완료');

    const badgeVi = getPrintStatusBadgeStyle('COMPLETED', 'color', 'vi');
    expect(badgeVi.label).toBe('Hoàn thành');
  });
});
