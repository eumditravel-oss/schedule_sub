// src/utils/printVisualTokens.ts
import React from 'react';
import { CalendarVisualState, CalendarVisualToken, CALENDAR_VISUAL_TOKENS } from './calendarVisualTokens';
import { getCountryOffState } from './workCalendar';
import { Task, Worker, WorkDayStatus, CountryCode, CountryHoliday, CalendarOverride, getPicAssignee, getSupportAssignees } from '../types';

export type PrintColorMode = 'color' | 'mono';

export const PRINT_DAY_CELL_MM = '8mm';

export const PRINT_DAY_CELL_STYLE: React.CSSProperties = {
  minWidth: '8mm',
  width: '8mm',
  boxSizing: 'border-box',
};

export interface PrintGanttBarStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  pattern: string;
  borderStyle: string;
}

export interface PrintStatusBadgeStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  label: string;
}

/**
 * Returns project's PRIMARY PIC names strictly derived from Task PRIMARY assignees.
 * NEVER uses Project Workforce Allocation[0] or participating_workers[0] as PIC.
 */
export function getProjectPicNames(
  projectTasks: Task[],
  workerMap: Map<string, string>
): string[] {
  const picNames = new Set<string>();

  for (const t of projectTasks) {
    const pic = getPicAssignee(t);
    if (pic) {
      const name = pic.name || workerMap.get(pic.worker_id) || (pic.worker_id && !pic.worker_id.startsWith('wrk_') ? pic.worker_id : '');
      if (name) picNames.add(name);
    } else if (t.primary_worker_id) {
      const name = workerMap.get(t.primary_worker_id) || (t.worker_name && !t.worker_name.startsWith('wrk_') ? t.worker_name : '');
      if (name) picNames.add(name);
    } else if (t.worker_name && t.worker_name !== '-' && !t.worker_name.startsWith('wrk_')) {
      picNames.add(t.worker_name);
    }
  }

  return Array.from(picNames);
}

export function getProjectPicSummary(
  projectTasks: Task[],
  workerMap: Map<string, string>,
  lang: 'ko' | 'vi' = 'ko'
): string {
  const pics = getProjectPicNames(projectTasks, workerMap);
  if (pics.length === 0) {
    return lang === 'vi' ? 'Chưa chỉ định' : '미지정';
  }
  return pics.join(', ');
}

export function getProjectPicWithSupportSummary(
  projectTasks: Task[],
  workerMap: Map<string, string>,
  lang: 'ko' | 'vi' = 'ko'
): string {
  const pics = getProjectPicNames(projectTasks, workerMap);
  const supportNames = new Set<string>();

  for (const t of projectTasks) {
    const supports = getSupportAssignees(t);
    for (const sup of supports) {
      const name = sup.name || workerMap.get(sup.worker_id);
      if (name && !pics.includes(name)) supportNames.add(name);
    }
  }

  if (pics.length === 0) {
    return lang === 'vi' ? 'Chưa chỉ định' : '미지정';
  }

  const primaryName = pics[0];
  const supportCount = supportNames.size + Math.max(0, pics.length - 1);

  if (supportCount > 0) {
    return `${primaryName} + Support ${supportCount}`;
  }
  return primaryName;
}

/**
 * Returns project's Support Worker names strictly derived from Task CO_ASSIGNEE assignees.
 */
export function getProjectSupportSummary(
  projectTasks: Task[],
  workerMap: Map<string, string>
): string {
  const supportNames = new Set<string>();

  for (const t of projectTasks) {
    const supports = getSupportAssignees(t);
    for (const sup of supports) {
      const name = sup.name || workerMap.get(sup.worker_id);
      if (name) supportNames.add(name);
    }
  }

  const supports = Array.from(supportNames);
  if (supports.length === 0) {
    return '-';
  }
  return supports.join(', ');
}

/**
 * Resolves calendar visual token for Print views without dayStatus=null WORKDAY short-circuit bug.
 * Uses getCountryOffState to accurately detect BOTH_OFF, KR_ONLY_OFF, VN_ONLY_OFF, and WORKDAY.
 */
export function resolvePrintCalendarVisualState(
  dateStr: string,
  krHolidays: CountryHoliday[] = [],
  vnHolidays: CountryHoliday[] = [],
  calendarOverrides: CalendarOverride[] = [],
  colorMode: PrintColorMode = 'color',
  dayStatus?: WorkDayStatus | null,
  workerCountryCode?: CountryCode
): CalendarVisualToken {
  // 1. If specific task worker dayStatus is provided (e.g. LEAVE or WORK_OVERRIDE)
  if (dayStatus) {
    if (dayStatus.day_type === 'WORK_OVERRIDE') {
      return getPrintCalendarVisualStyle('WORK_OVERRIDE', colorMode);
    }
    if (dayStatus.day_type === 'LEAVE' || dayStatus.day_type === 'MANUAL_OFF') {
      return getPrintCalendarVisualStyle('PERSONAL_LEAVE', colorMode);
    }
  }

  // 2. Global / Project Off State via getCountryOffState
  const offInfo = getCountryOffState(dateStr, calendarOverrides, [...krHolidays, ...vnHolidays]);

  let state: CalendarVisualState = 'WORKDAY';
  if (offInfo.state === 'BOTH_OFF') {
    state = 'BOTH_OFF';
  } else if (offInfo.state === 'KR_ONLY_OFF') {
    state = workerCountryCode === 'VN' ? 'WORKDAY' : 'KR_ONLY_OFF';
  } else if (offInfo.state === 'VN_ONLY_OFF') {
    state = workerCountryCode === 'KR' ? 'WORKDAY' : 'VN_ONLY_OFF';
  } else {
    // Check Sunday fallback
    const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    if (dow === 0) {
      state = 'BOTH_OFF';
    }
  }

  return getPrintCalendarVisualStyle(state, colorMode);
}

/**
 * Returns print-optimized calendar visual tokens for either Color or Mono mode.
 * Mono mode uses calibrated low-opacity grayscale hatch patterns (10-18%) to ensure high text contrast.
 */
export function getPrintCalendarVisualStyle(
  state: CalendarVisualState,
  colorMode: PrintColorMode = 'color'
): CalendarVisualToken {
  const baseToken = CALENDAR_VISUAL_TOKENS[state] || CALENDAR_VISUAL_TOKENS.WORKDAY;

  if (colorMode === 'color') {
    return baseToken;
  }

  // Mono (Grayscale) Print Tokens
  switch (state) {
    case 'BOTH_OFF':
      return {
        ...baseToken,
        baseClass: 'bg-slate-100',
        headerClass: 'bg-slate-200 border-slate-400 text-slate-900 font-bold',
        borderClass: 'border-slate-400',
        textClass: 'text-slate-900',
        baseColor: '#F1F5F9',
        accentColor: '#475569',
        textColor: '#0F172A',
        hatchColor: 'rgba(71, 85, 105, 0.16)',
        hatch: {
          enabled: true,
          type: 'cross',
          angle: 45,
          stripePx: 2,
          gapPx: 8,
          color: '#475569',
          alpha: 0.16,
          pattern:
            'repeating-linear-gradient(45deg, rgba(71, 85, 105, 0.16) 0px, rgba(71, 85, 105, 0.16) 2px, transparent 2px, transparent 10px), repeating-linear-gradient(135deg, rgba(71, 85, 105, 0.16) 0px, rgba(71, 85, 105, 0.16) 2px, transparent 2px, transparent 10px)',
        },
      };

    case 'KR_ONLY_OFF':
      return {
        ...baseToken,
        baseClass: 'bg-slate-50',
        headerClass: 'bg-slate-100 border-slate-300 text-slate-900 font-bold',
        borderClass: 'border-slate-300',
        textClass: 'text-slate-900',
        baseColor: '#F8FAFC',
        accentColor: '#64748B',
        textColor: '#1E293B',
        hatchColor: 'rgba(100, 116, 139, 0.14)',
        hatch: {
          enabled: true,
          type: 'single',
          angle: 135,
          stripePx: 2,
          gapPx: 8,
          color: '#64748B',
          alpha: 0.14,
          pattern:
            'repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.14) 0px, rgba(100, 116, 139, 0.14) 2px, transparent 2px, transparent 10px)',
        },
      };

    case 'VN_ONLY_OFF':
      return {
        ...baseToken,
        baseClass: 'bg-slate-50',
        headerClass: 'bg-slate-100 border-slate-300 text-slate-900 font-bold',
        borderClass: 'border-slate-300',
        textClass: 'text-slate-900',
        baseColor: '#F8FAFC',
        accentColor: '#64748B',
        textColor: '#1E293B',
        hatchColor: 'rgba(100, 116, 139, 0.14)',
        hatch: {
          enabled: true,
          type: 'single',
          angle: 45,
          stripePx: 2,
          gapPx: 8,
          color: '#64748B',
          alpha: 0.14,
          pattern:
            'repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.14) 0px, rgba(100, 116, 139, 0.14) 2px, transparent 2px, transparent 10px)',
        },
      };

    case 'PERSONAL_LEAVE':
      return {
        ...baseToken,
        baseClass: 'bg-slate-100',
        headerClass: 'bg-slate-200 border-slate-300 text-slate-900 font-bold',
        borderClass: 'border-slate-300',
        textClass: 'text-slate-900',
        baseColor: '#F1F5F9',
        accentColor: '#475569',
        textColor: '#0F172A',
        hatchColor: 'rgba(71, 85, 105, 0.16)',
        hatch: {
          enabled: true,
          type: 'single',
          angle: 135,
          stripePx: 2,
          gapPx: 10,
          color: '#475569',
          alpha: 0.16,
          pattern:
            'repeating-linear-gradient(135deg, rgba(71, 85, 105, 0.16) 0px, rgba(71, 85, 105, 0.16) 2px, transparent 2px, transparent 12px)',
        },
      };

    case 'WORK_OVERRIDE':
      return {
        ...baseToken,
        baseClass: 'bg-white',
        headerClass: 'bg-white border-slate-400 text-slate-900 font-bold',
        borderClass: 'border-slate-400',
        textClass: 'text-slate-900',
        baseColor: '#FFFFFF',
        accentColor: '#334155',
        textColor: '#0F172A',
        hatchColor: null,
        hatch: {
          enabled: false,
          type: 'none',
          angle: 0,
          stripePx: 0,
          gapPx: 0,
          color: '#334155',
          alpha: 0,
          pattern: '',
        },
      };

    case 'WORKDAY':
    default:
      return {
        ...baseToken,
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
      };
  }
}

/**
 * Returns Gantt Bar styles for task/project statuses according to Color/Mono settings.
 * Green = COMPLETED/Completed, Blue = IN_PROGRESS, Yellow/Orange = BLOCKED/DELAYED, Gray = NOT_STARTED.
 */
export function getPrintGanttBarStyle(
  status: string = 'NOT_STARTED',
  colorMode: PrintColorMode = 'color'
): PrintGanttBarStyle {
  const normStatus = (status || '').toUpperCase();

  if (colorMode === 'color') {
    switch (normStatus) {
      case 'COMPLETED':
        return {
          backgroundColor: '#10B981', // Emerald green
          borderColor: '#059669',
          textColor: '#FFFFFF',
          pattern: 'none',
          borderStyle: 'solid',
        };
      case 'IN_PROGRESS':
        return {
          backgroundColor: '#3B82F6', // Blue
          borderColor: '#1D4ED8',
          textColor: '#FFFFFF',
          pattern: 'none',
          borderStyle: 'solid',
        };
      case 'BLOCKED':
        return {
          backgroundColor: '#EF4444', // Red
          borderColor: '#B91C1C',
          textColor: '#FFFFFF',
          pattern: 'none',
          borderStyle: 'solid',
        };
      case 'DELAYED':
        return {
          backgroundColor: '#F59E0B', // Amber/Orange
          borderColor: '#D97706',
          textColor: '#FFFFFF',
          pattern: 'none',
          borderStyle: 'solid',
        };
      case 'NOT_STARTED':
      default:
        return {
          backgroundColor: '#94A3B8', // Slate light gray
          borderColor: '#64748B',
          textColor: '#FFFFFF',
          pattern: 'none',
          borderStyle: 'solid',
        };
    }
  }

  // Mono (Grayscale) Bar Styles
  switch (normStatus) {
    case 'COMPLETED':
      return {
        backgroundColor: '#1E293B', // Dark slate / almost black
        borderColor: '#0F172A',
        textColor: '#FFFFFF',
        pattern: 'none',
        borderStyle: 'solid',
      };
    case 'IN_PROGRESS':
      return {
        backgroundColor: '#64748B', // Medium slate gray
        borderColor: '#475569',
        textColor: '#FFFFFF',
        pattern: 'none',
        borderStyle: 'solid',
      };
    case 'BLOCKED':
      return {
        backgroundColor: '#E2E8F0', // Light background with heavy cross hatch
        borderColor: '#0F172A',
        textColor: '#0F172A',
        pattern: 'repeating-linear-gradient(45deg, #0F172A 0px, #0F172A 2px, transparent 2px, transparent 6px)',
        borderStyle: 'dashed',
      };
    case 'DELAYED':
      return {
        backgroundColor: '#CBD5E1', // Light gray with diagonal hatch
        borderColor: '#334155',
        textColor: '#0F172A',
        pattern: 'repeating-linear-gradient(135deg, #334155 0px, #334155 2px, transparent 2px, transparent 6px)',
        borderStyle: 'solid',
      };
    case 'NOT_STARTED':
    default:
      return {
        backgroundColor: '#E2E8F0',
        borderColor: '#94A3B8',
        textColor: '#475569',
        pattern: 'none',
        borderStyle: 'solid',
      };
  }
}

/**
 * Returns Status Badge styling for tables and headers.
 */
export function getPrintStatusBadgeStyle(
  status: string = 'NOT_STARTED',
  colorMode: PrintColorMode = 'color',
  lang: 'ko' | 'vi' = 'ko'
): PrintStatusBadgeStyle {
  const normStatus = (status || '').toUpperCase();
  const labelMapKo: Record<string, string> = {
    COMPLETED: '완료',
    IN_PROGRESS: '진행중',
    BLOCKED: '막힘',
    DELAYED: '지연',
    NOT_STARTED: '미시작',
    ACTIVE: '진행중',
  };
  const labelMapVi: Record<string, string> = {
    COMPLETED: 'Hoàn thành',
    IN_PROGRESS: 'Đang thực hiện',
    BLOCKED: 'Bị tắc nghẽn',
    DELAYED: 'Trễ hạn',
    NOT_STARTED: 'Chưa bắt đầu',
    ACTIVE: 'Đang thực hiện',
  };

  const label = lang === 'vi' ? (labelMapVi[normStatus] || normStatus) : (labelMapKo[normStatus] || normStatus);

  if (colorMode === 'color') {
    switch (normStatus) {
      case 'COMPLETED':
        return { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', textColor: '#065F46', label };
      case 'IN_PROGRESS':
      case 'ACTIVE':
        return { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', textColor: '#1E40AF', label };
      case 'BLOCKED':
        return { backgroundColor: '#FEF2F2', borderColor: '#FECACA', textColor: '#991B1B', label };
      case 'DELAYED':
        return { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', textColor: '#92400E', label };
      case 'NOT_STARTED':
      default:
        return { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', textColor: '#475569', label };
    }
  }

  // Mono Badge
  switch (normStatus) {
    case 'COMPLETED':
      return { backgroundColor: '#1E293B', borderColor: '#0F172A', textColor: '#FFFFFF', label };
    case 'IN_PROGRESS':
    case 'ACTIVE':
      return { backgroundColor: '#F1F5F9', borderColor: '#475569', textColor: '#0F172A', label };
    case 'BLOCKED':
      return { backgroundColor: '#FFFFFF', borderColor: '#0F172A', textColor: '#0F172A', label: `${label} (!)` };
    case 'DELAYED':
      return { backgroundColor: '#E2E8F0', borderColor: '#334155', textColor: '#0F172A', label };
    case 'NOT_STARTED':
    default:
      return { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', textColor: '#64748B', label };
  }
}
