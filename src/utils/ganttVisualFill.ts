// src/utils/ganttVisualFill.ts
//
// AUTO_TIME 모드용 Calendar Day 경과 기반 Visual Fill % 계산 유틸리티.
//
// Progress Metric (actual_progress, planned_progress) 과
// Gantt Visual Fill Geometry (Calendar Column 위치)를 분리한다.
//
// 정책:
//  - today <= startDate          → 0%
//  - startDate < today <= endDate → today Column Left Boundary까지 (today 자체는 완료되지 않은 날)
//  - today > endDate             → 100%
//
// 오늘 날짜 Cell 자체는 포함하지 않는다.
// Visual Fill Right === Today Column Left Boundary (오차 ≤ 0.5px)

import { GanttDateColumn } from '../types';

/**
 * dateA ~ dateB 사이의 Calendar Day 수를 반환한다 (dateA 포함, dateB 미포함).
 * 예: daysBetween('2026-07-06', '2026-08-07') = 32
 */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * AUTO_TIME 모드용 Calendar Column 기반 Visual Fill % 계산.
 *
 * @param startDate  Project/Task 시작 날짜 (YYYY-MM-DD)
 * @param endDate    Project/Task 종료 날짜 (YYYY-MM-DD)
 * @param todayStr   오늘 날짜 (YYYY-MM-DD)
 * @param dateColumns 현재 Gantt dateColumns 배열 (col.dateStr 순서)
 * @returns 0~100 범위의 Visual Fill %
 */
export function calcAutoTimeFillPercent(
  startDate: string,
  endDate: string,
  todayStr: string,
  dateColumns: GanttDateColumn[]
): number {
  // today가 startDate 이전이거나 같으면 Fill = 0
  if (todayStr <= startDate) return 0;

  // today가 endDate 다음이면 Fill = 100
  if (todayStr > endDate) return 100;

  // dateColumns에서 Grid Column Index를 탐색
  const startIdx = dateColumns.findIndex((c) => c.dateStr === startDate);
  const todayIdx = dateColumns.findIndex((c) => c.dateStr === todayStr);
  const endIdx = dateColumns.findIndex((c) => c.dateStr === endDate);

  // Gantt 현재 뷰에서 startDate, today, endDate 중 하나라도 보이지 않으면
  // Calendar Day 수 기반 fallback 사용 (Column Width 동일하므로 정확도 동일)
  if (startIdx < 0 || todayIdx < 0 || endIdx < 0) {
    // Inclusive span: startDate부터 endDate까지의 총 Calendar Days
    const totalDays = daysBetween(startDate, endDate) + 1;
    // today exclusive: startDate부터 today 전날까지의 경과 Calendar Days
    const elapsedDays = daysBetween(startDate, todayStr);
    return Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  }

  // Grid Column Index 기반 계산 (가장 정확한 방식):
  //   spanTotal = endIdx - startIdx + 1 (inclusive: startDate ~ endDate)
  //   elapsedColumns = todayIdx - startIdx (today column 미포함)
  //
  // 결과: Actual Fill Right === Today Column Left Boundary (서브픽셀 오차 없음)
  const spanTotal = endIdx - startIdx + 1;
  const elapsedColumns = todayIdx - startIdx;

  return Math.min(100, Math.max(0, (elapsedColumns / spanTotal) * 100));
}
