// src/utils/calendarVisualTokens.ts
import React from 'react';
import { Worker, WorkDayStatus, CountryCode, CountryHoliday, CalendarOverride } from '../types';
import { getCountryOffState, CountryOffState } from './workCalendar';

export type CalendarVisualState =
  | 'BOTH_OFF'
  | 'KR_ONLY_OFF'
  | 'VN_ONLY_OFF'
  | 'PERSONAL_LEAVE'
  | 'MANUAL_OFF'
  | 'WORK_OVERRIDE'
  | 'WORKDAY';

export interface CalendarVisualToken {
  visualState: CalendarVisualState;
  baseClass: string;
  headerClass: string;
  borderClass: string;
  textClass: string;
  hatchColor: string | null;
  label: string;
}

export const CALENDAR_VISUAL_TOKENS: Record<CalendarVisualState, CalendarVisualToken> = {
  BOTH_OFF: {
    visualState: 'BOTH_OFF',
    baseClass: 'bg-rose-100',
    headerClass: 'bg-rose-100 border-rose-300 text-rose-900 font-bold',
    borderClass: 'border-rose-300',
    textClass: 'text-rose-900',
    hatchColor: 'rgba(244, 63, 94, 0.20)',
    label: '양국 휴무',
  },
  KR_ONLY_OFF: {
    visualState: 'KR_ONLY_OFF',
    baseClass: 'bg-orange-50',
    headerClass: 'bg-orange-50 border-orange-200 text-orange-900 font-bold',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-900',
    hatchColor: 'rgba(249, 115, 22, 0.18)',
    label: '한국만 휴무',
  },
  VN_ONLY_OFF: {
    visualState: 'VN_ONLY_OFF',
    baseClass: 'bg-amber-50',
    headerClass: 'bg-amber-50 border-amber-200 text-amber-900 font-bold',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-900',
    hatchColor: 'rgba(245, 158, 11, 0.20)',
    label: '베트남만 휴무',
  },
  PERSONAL_LEAVE: {
    visualState: 'PERSONAL_LEAVE',
    baseClass: 'bg-violet-50',
    headerClass: 'bg-violet-50 border-violet-200 text-violet-900 font-bold',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-900',
    hatchColor: 'rgba(139, 92, 246, 0.20)',
    label: '개인 휴가',
  },
  MANUAL_OFF: {
    visualState: 'MANUAL_OFF',
    baseClass: 'bg-orange-50',
    headerClass: 'bg-orange-50 border-orange-300 text-orange-950 font-bold',
    borderClass: 'border-orange-300',
    textClass: 'text-orange-950',
    hatchColor: 'rgba(234, 88, 12, 0.22)',
    label: '수동 휴무',
  },
  WORK_OVERRIDE: {
    visualState: 'WORK_OVERRIDE',
    baseClass: 'bg-cyan-50',
    headerClass: 'bg-cyan-50 border-cyan-200 text-cyan-900 font-bold',
    borderClass: 'border-cyan-200',
    textClass: 'text-cyan-900',
    hatchColor: null,
    label: '근무일 지정',
  },
  WORKDAY: {
    visualState: 'WORKDAY',
    baseClass: 'bg-white',
    headerClass: 'bg-white border-slate-200 text-slate-700',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-700',
    hatchColor: null,
    label: '일반 근무',
  },
};

export const TODAY_OUTLINE_STYLE: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 2px rgb(59, 130, 246)',
  zIndex: 30,
  pointerEvents: 'none',
};

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

  // 2. Priority: PERSONAL_LEAVE
  if (dayType === 'LEAVE') {
    return CALENDAR_VISUAL_TOKENS.PERSONAL_LEAVE;
  }

  // 3. Priority: Personal MANUAL_OFF
  if (dayType === 'MANUAL_OFF') {
    return CALENDAR_VISUAL_TOKENS.MANUAL_OFF;
  }

  // 4. Working day (no off)
  if (isWorking) {
    return CALENDAR_VISUAL_TOKENS.WORKDAY;
  }

  // 5. Non-working day (WEEKLY_OFF / PUBLIC_HOLIDAY / COUNTRY_SATURDAY_OFF) -> Map to Country Off Visual States
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
