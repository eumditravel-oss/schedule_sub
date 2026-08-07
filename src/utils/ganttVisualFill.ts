// src/utils/ganttVisualFill.ts
//
// AUTO_TIME 모드용 Visual Fill % 계산 유틸리티.
//
// Progress Metric (actual_progress, planned_progress) 과
// Gantt Visual Fill Geometry (Calendar Column 위치)를 분리한다.
//
// 핵심 원칙:
//  - Fill %는 렌더링된 Track (spanInfo) 기준으로 계산한다.
//  - Full Project Span을 Clipped Track에 그대로 적용하면 오늘 날짜 Cell 침범이 발생한다.
//  - ScheduleBar의 border를 box-shadow inset으로 대체해야 pixel geometry가 정확해진다.
//
// Visual Fill Right === Today Column Left Boundary (오차 ≤ 0.5px)

import { GanttDateColumn } from '../types';
import { GanttSpanInfo } from './ganttOverlay';

/**
 * Rendered Track (spanInfo) 기준 AUTO_TIME Visual Fill % 계산.
 *
 * Full Project Span이 아닌, 현재 Gantt View에서 실제 렌더링된 Track Column을
 * Source of Truth로 사용하여 Clipped Track에서도 정확한 날짜 경계를 보장한다.
 *
 * 공식:
 *   elapsedVisible = todayIndex - renderStartIndex  (today column 미포함)
 *   fill% = elapsedVisible / renderSpan × 100
 *
 * 예:
 *   Project: 07-06 ~ 08-07 (33일 전체)
 *   View:    07-23 ~ 08-21
 *   Visible: 07-23 ~ 08-07 (16 col, renderStartIndex=0 내 span)
 *   Today:   08-07 (todayIndex - renderStartIndex = 15)
 *   Fill:    15 / 16 = 93.75%  → Fill Right === 08-07.left ✅
 *
 * 판단 규칙:
 *   A. today <= projectStartDate → 0%
 *   B. today > projectEndDate   → 100%
 *   C. todayIndex < renderStartIndex (today가 현재 View 왼쪽 밖) → 0%
 *   D. todayIndex > renderEndIndex  (today가 Rendered Track 오른쪽 밖) → 100%
 *   E. today가 Rendered Track 안 → elapsedVisible / renderSpan × 100
 */
export function calcVisibleTrackAutoTimeFillPercent(params: {
  projectStartDate: string;
  projectEndDate: string;
  todayStr: string;
  dateColumns: GanttDateColumn[];
  spanInfo: GanttSpanInfo;
}): number {
  const { projectStartDate, projectEndDate, todayStr, dateColumns, spanInfo } = params;

  // Rule A: today가 프로젝트 시작 이전 → 0
  if (todayStr <= projectStartDate) return 0;

  // Rule B: today가 프로젝트 종료 이후 → 100
  if (todayStr > projectEndDate) return 100;

  const renderStartIndex = spanInfo.startIndex;
  const renderSpan = spanInfo.spanCount;
  const renderEndIndex = renderStartIndex + renderSpan - 1;

  const todayIndex = dateColumns.findIndex((c) => c.dateStr === todayStr);

  // today가 현재 dateColumns 배열에 포함되지 않는 경우 (Gantt View 밖)
  if (todayIndex < 0) {
    if (todayStr < dateColumns[0].dateStr) return 0;
    if (todayStr > dateColumns[dateColumns.length - 1].dateStr) return 100;
    return 0;
  }

  // Rule C: today가 Rendered Track 왼쪽 밖 → 0
  if (todayIndex < renderStartIndex) return 0;

  // Rule D: today가 Rendered Track 오른쪽 밖 → 100
  if (todayIndex > renderEndIndex) return 100;

  // Rule E: today가 Rendered Track 안
  // today Column 자체는 완료된 하루가 아니므로 미포함
  const elapsedVisibleColumns = todayIndex - renderStartIndex;
  return Math.min(100, Math.max(0, (elapsedVisibleColumns / renderSpan) * 100));
}

/**
 * @deprecated calcVisibleTrackAutoTimeFillPercent 사용 권장.
 *
 * Full Project Span 기반 계산 - Clipped Track에 적용 시 날짜 경계 오차 발생.
 * 기존 호환성을 위해 유지하되 Project Overview에서는 사용하지 않는다.
 */
export function calcAutoTimeFillPercent(
  startDate: string,
  endDate: string,
  todayStr: string,
  dateColumns: GanttDateColumn[]
): number {
  if (todayStr <= startDate) return 0;
  if (todayStr > endDate) return 100;

  const startIdx = dateColumns.findIndex((c) => c.dateStr === startDate);
  const todayIdx = dateColumns.findIndex((c) => c.dateStr === todayStr);
  const endIdx = dateColumns.findIndex((c) => c.dateStr === endDate);

  if (startIdx < 0 || todayIdx < 0 || endIdx < 0) {
    const msPerDay = 86_400_000;
    const totalDays =
      Math.round((new Date(endDate + 'T00:00:00Z').getTime() - new Date(startDate + 'T00:00:00Z').getTime()) / msPerDay) + 1;
    const elapsedDays = Math.round((new Date(todayStr + 'T00:00:00Z').getTime() - new Date(startDate + 'T00:00:00Z').getTime()) / msPerDay);
    return Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  }

  const spanTotal = endIdx - startIdx + 1;
  const elapsedColumns = todayIdx - startIdx;
  return Math.min(100, Math.max(0, (elapsedColumns / spanTotal) * 100));
}
