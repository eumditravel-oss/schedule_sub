// src/utils/calendarVisualTokens.ts
import React from 'react';
import { Worker, WorkDayStatus, CountryCode, CountryHoliday, CalendarOverride } from '../types';
import { getCountryOffState, CountryOffState } from './workCalendar';

export type CalendarVisualState =
  | 'BOTH_OFF'
  | 'KR_ONLY_OFF'
  | 'VN_ONLY_OFF'
  | 'PERSONAL_LEAVE'
  | 'WORK_OVERRIDE'
  | 'WORKDAY';

export interface CalendarVisualHatch {
  enabled: boolean;
  type: 'cross' | 'single' | 'vertical' | 'none';
  angle: number;
  stripePx: number;
  gapPx: number;
  color: string;
  alpha: number;
  pattern: string;
}

export interface CalendarVisualToken {
  visualState: CalendarVisualState;
  baseClass: string;
  headerClass: string;
  borderClass: string;
  textClass: string;
  baseColor: string;
  accentColor: string;
  textColor: string;
  hatchColor: string | null;
  hatch: CalendarVisualHatch;
  labelKo: string;
  labelVi: string;
  label: string;
}

export const CALENDAR_VISUAL_TOKENS: Record<CalendarVisualState, CalendarVisualToken> = {
  BOTH_OFF: {
    visualState: 'BOTH_OFF',
    baseClass: 'bg-rose-50',
    headerClass: 'bg-rose-50 border-rose-300 text-rose-950 font-bold',
    borderClass: 'border-rose-300',
    textClass: 'text-rose-950',
    baseColor: '#FFF1F2',
    accentColor: '#E11D48',
    textColor: '#881337',
    hatchColor: 'rgba(225, 29, 72, 0.20)',
    hatch: {
      enabled: true,
      type: 'cross',
      angle: 45,
      stripePx: 3,
      gapPx: 8,
      color: '#E11D48',
      alpha: 0.20,
      pattern:
        'repeating-linear-gradient(45deg, rgba(225, 29, 72, 0.20) 0px, rgba(225, 29, 72, 0.20) 3px, transparent 3px, transparent 11px), repeating-linear-gradient(135deg, rgba(225, 29, 72, 0.20) 0px, rgba(225, 29, 72, 0.20) 3px, transparent 3px, transparent 11px)',
    },
    labelKo: '양국 휴무',
    labelVi: 'Nghỉ cả hai nước',
    label: '양국 휴무',
  },
  KR_ONLY_OFF: {
    visualState: 'KR_ONLY_OFF',
    baseClass: 'bg-orange-50',
    headerClass: 'bg-orange-50 border-orange-200 text-orange-950 font-bold',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-950',
    baseColor: '#FFF7ED',
    accentColor: '#F97316',
    textColor: '#7C2D12',
    hatchColor: 'rgba(249, 115, 22, 0.22)',
    hatch: {
      enabled: true,
      type: 'single',
      angle: 135,
      stripePx: 3,
      gapPx: 8,
      color: '#F97316',
      alpha: 0.22,
      pattern:
        'repeating-linear-gradient(135deg, rgba(249, 115, 22, 0.22) 0px, rgba(249, 115, 22, 0.22) 3px, transparent 3px, transparent 11px)',
    },
    labelKo: '한국만 휴무',
    labelVi: 'Chỉ Hàn Quốc nghỉ',
    label: '한국만 휴무',
  },
  VN_ONLY_OFF: {
    visualState: 'VN_ONLY_OFF',
    baseClass: 'bg-sky-50',
    headerClass: 'bg-sky-50 border-sky-200 text-sky-950 font-bold',
    borderClass: 'border-sky-200',
    textClass: 'text-sky-950',
    baseColor: '#F0F9FF',
    accentColor: '#0284C7',
    textColor: '#0C4A6E',
    hatchColor: 'rgba(2, 132, 199, 0.22)',
    hatch: {
      enabled: true,
      type: 'single',
      angle: 45,
      stripePx: 3,
      gapPx: 8,
      color: '#0284C7',
      alpha: 0.22,
      pattern:
        'repeating-linear-gradient(45deg, rgba(2, 132, 199, 0.22) 0px, rgba(2, 132, 199, 0.22) 3px, transparent 3px, transparent 11px)',
    },
    labelKo: '베트남만 휴무',
    labelVi: 'Chỉ Việt Nam nghỉ',
    label: '베트남만 휴무',
  },
  PERSONAL_LEAVE: {
    visualState: 'PERSONAL_LEAVE',
    baseClass: 'bg-violet-50',
    headerClass: 'bg-violet-50 border-violet-200 text-violet-950 font-bold',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-950',
    baseColor: '#F5F3FF',
    accentColor: '#7C3AED',
    textColor: '#4C1D95',
    hatchColor: 'rgba(124, 58, 237, 0.22)',
    hatch: {
      enabled: true,
      type: 'single',
      angle: 135,
      stripePx: 3,
      gapPx: 11,
      color: '#7C3AED',
      alpha: 0.22,
      pattern:
        'repeating-linear-gradient(135deg, rgba(124, 58, 237, 0.22) 0px, rgba(124, 58, 237, 0.22) 3px, transparent 3px, transparent 14px)',
    },
    labelKo: '개인 휴가',
    labelVi: 'Nghỉ phép cá nhân',
    label: '개인 휴가',
  },
  WORK_OVERRIDE: {
    visualState: 'WORK_OVERRIDE',
    baseClass: 'bg-emerald-50',
    headerClass: 'bg-emerald-50 border-emerald-200 text-emerald-950 font-bold',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-950',
    baseColor: '#ECFDF5',
    accentColor: '#059669',
    textColor: '#064E3B',
    hatchColor: null,
    hatch: {
      enabled: false,
      type: 'none',
      angle: 0,
      stripePx: 0,
      gapPx: 0,
      color: '#059669',
      alpha: 0,
      pattern: '',
    },
    labelKo: '근무일 지정',
    labelVi: 'Đi làm bổ sung',
    label: '근무일 지정',
  },
  WORKDAY: {
    visualState: 'WORKDAY',
    baseClass: 'bg-white',
    headerClass: 'bg-white border-slate-200 text-slate-700',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-700',
    baseColor: '#FFFFFF',
    accentColor: '#94A3B8',
    textColor: '#334155',
    hatchColor: null,
    hatch: {
      enabled: false,
      type: 'none',
      angle: 0,
      stripePx: 0,
      gapPx: 0,
      color: 'transparent',
      alpha: 0,
      pattern: '',
    },
    labelKo: '일반 근무',
    labelVi: 'Làm việc bình thường',
    label: '일반 근무',
  },
};

export const TODAY_OUTLINE_STYLE: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 2px rgb(59, 130, 246)',
  zIndex: 30,
  pointerEvents: 'none',
};

/**
 * Builds a parameterized CSS background pattern string with explicit opacity adjustment.
 */
export function buildCalendarHatchPattern(
  token: CalendarVisualToken,
  opacityMultiplier: number = 1.0
): string {
  if (!token.hatch.enabled || token.hatch.type === 'none') {
    return '';
  }

  const alpha = Math.max(0, Math.min(1, token.hatch.alpha * opacityMultiplier));
  const hex = token.hatch.color;

  // Convert hex color to rgb
  let r = 0, g = 0, b = 0;
  if (hex.startsWith('#')) {
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    }
  }

  const rgbaStr = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  const stripePx = token.hatch.stripePx;
  const gapPx = token.hatch.gapPx;
  const totalPx = stripePx + gapPx;

  if (token.hatch.type === 'cross') {
    return `repeating-linear-gradient(45deg, ${rgbaStr} 0px, ${rgbaStr} ${stripePx}px, transparent ${stripePx}px, transparent ${totalPx}px), repeating-linear-gradient(135deg, ${rgbaStr} 0px, ${rgbaStr} ${stripePx}px, transparent ${stripePx}px, transparent ${totalPx}px)`;
  }

  const angle = token.hatch.angle;
  return `repeating-linear-gradient(${angle}deg, ${rgbaStr} 0px, ${rgbaStr} ${stripePx}px, transparent ${stripePx}px, transparent ${totalPx}px)`;
}

export function resolveCalendarVisualState(
  dateStr: string,
  worker?: Partial<Worker> | null,
  dayStatus?: WorkDayStatus | null,
  countryOffState?: CountryOffState | { state: CountryOffState } | null,
  countryHolidays?: CountryHoliday[],
  calendarOverrides?: CalendarOverride[]
): CalendarVisualToken {
  const offStateObj =
    countryOffState && typeof countryOffState === 'object' && 'state' in countryOffState
      ? countryOffState
      : getCountryOffState(dateStr, calendarOverrides || [], countryHolidays || []);

  const offState: CountryOffState = typeof offStateObj === 'string' ? offStateObj : offStateObj.state;

  const workerCountry: CountryCode = worker?.country_code || dayStatus?.country_code || 'KR';
  const dayType = dayStatus?.day_type || 'WORKDAY';
  const isWorking = dayStatus ? dayStatus.is_working_day : true;

  // 1. Priority: WORK_OVERRIDE
  if (dayType === 'WORK_OVERRIDE') {
    return CALENDAR_VISUAL_TOKENS.WORK_OVERRIDE;
  }

  // 2. Priority: PERSONAL_LEAVE (also maps legacy MANUAL_OFF to PERSONAL_LEAVE for safety)
  if (dayType === 'LEAVE' || dayType === 'MANUAL_OFF') {
    return CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE;
  }

  // 3. Working day (no off)
  if (isWorking) {
    return CALENDAR_VISUAL_TOKENS.WORKDAY;
  }

  // 4. Non-working day (COUNTRY_OFF / PUBLIC_HOLIDAY / WEEKLY_OFF) -> Map to Country Off Visual States
  if (offState === 'BOTH_OFF') {
    return CALENDAR_VISUAL_TOKENS.BOTH_OFF;
  }

  if (offState === 'KR_ONLY_OFF') {
    return workerCountry === 'KR' ? CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF : CALENDAR_VISUAL_TOKENS.WORKDAY;
  }

  if (offState === 'VN_ONLY_OFF') {
    return workerCountry === 'VN' ? CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF : CALENDAR_VISUAL_TOKENS.WORKDAY;
  }

  // Default fallback for Sunday or general off
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  if (dow === 0) {
    return CALENDAR_VISUAL_TOKENS.BOTH_OFF;
  }

  return workerCountry === 'VN' ? CALENDAR_VISUAL_TOKENS.VN_ONLY_OFF : CALENDAR_VISUAL_TOKENS.KR_ONLY_OFF;
}

export function getCalendarVisualStyle(state: CalendarVisualState): CalendarVisualToken {
  return CALENDAR_VISUAL_TOKENS[state] || CALENDAR_VISUAL_TOKENS.WORKDAY;
}


