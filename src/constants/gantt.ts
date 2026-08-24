// src/constants/gantt.ts

export { GANTT_DAY_WIDTH_PX } from '../utils/ganttGeometry';

/**
 * Row Height Constants for Compact Gantt Layout (Desktop)
 */
export const TASK_ROW_HEIGHT_PX = 44;
export const TASK_GROUP_ROW_HEIGHT_PX = 36;
export const EMPTY_GROUP_ROW_HEIGHT_PX = 32;

/**
 * Header Height Constants for 2-Row CSS Grid Header (72px total)
 */
export const GANTT_MONTH_HEADER_HEIGHT_PX = 28;
export const GANTT_DATE_HEADER_HEIGHT_PX = 44;
export const GANTT_HEADER_TOTAL_HEIGHT_PX =
  GANTT_MONTH_HEADER_HEIGHT_PX + GANTT_DATE_HEADER_HEIGHT_PX;

/**
 * Width thresholds for text display inside Gantt bars
 */
export const GANTT_BAR_TEXT_THRESHOLD_PX = 128;
export const GANTT_BAR_FULL_THRESHOLD_PX = 224;

/**
 * Standard button height and styling classes
 */
export const BUTTON_H36_CLASS =
  'h-9 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 shadow-sm transition flex items-center justify-center gap-1.5 shrink-0';

export const PRIMARY_BUTTON_H36_CLASS =
  'h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition flex items-center justify-center gap-1.5 shrink-0';
