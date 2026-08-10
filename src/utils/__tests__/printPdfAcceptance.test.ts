// src/utils/__tests__/printPdfAcceptance.test.ts
import { describe, test, expect } from 'vitest';
import {
  PRINT_DAY_CELL_MM,
  PRINT_DAY_CELL_STYLE,
  getProjectPicSummary,
  getProjectSupportSummary,
  getPrintCalendarVisualStyle,
  getPrintGanttBarStyle,
  getPrintStatusBadgeStyle,
} from '../printVisualTokens';
import { Task } from '../../types';

describe('V2.5 Print Acceptance & Data Semantics Suite', () => {
  const workerMap = new Map<string, string>([
    ['wrk-1', 'Thanh Phuong'],
    ['wrk-2', 'Manh Cuong'],
    ['wrk-3', 'Minh Tuan'],
  ]);

  test('1. Day Cell 8mm Contract Single Source', () => {
    expect(PRINT_DAY_CELL_MM).toBe('8mm');
    expect(PRINT_DAY_CELL_STYLE.minWidth).toBe('8mm');
    expect(PRINT_DAY_CELL_STYLE.width).toBe('8mm');
  });

  test('2. Project PIC derived strictly from Task PRIMARY (Never Workforce Allocation[0])', () => {
    const mockTasks: Task[] = [
      {
        id: 't1',
        project_id: 'p1',
        task_name: 'Drawing Review',
        task_group_id: 'g1',
        primary_worker_id: 'wrk-1',
        assignees: [
          { worker_id: 'wrk-1', name: 'Thanh Phuong', assignment_role: 'PRIMARY' },
          { worker_id: 'wrk-3', name: 'Minh Tuan', assignment_role: 'CO_ASSIGNEE' },
        ],
      } as any,
      {
        id: 't2',
        project_id: 'p1',
        task_name: 'Site Audit',
        task_group_id: 'g1',
        primary_worker_id: 'wrk-2',
        assignees: [
          { worker_id: 'wrk-2', name: 'Manh Cuong', assignment_role: 'PRIMARY' },
        ],
      } as any,
    ];

    const picResult = getProjectPicSummary(mockTasks, workerMap, 'ko');
    expect(picResult).toBe('Thanh Phuong, Manh Cuong');

    const supportResult = getProjectSupportSummary(mockTasks, workerMap);
    expect(supportResult).toBe('Minh Tuan');
  });

  test('3. Returns unassigned when no task primary PIC exists (0 workforce allocation fallback)', () => {
    const mockTasks: Task[] = [];
    const picResult = getProjectPicSummary(mockTasks, workerMap, 'ko');
    expect(picResult).toBe('미지정');

    const picResultVi = getProjectPicSummary(mockTasks, workerMap, 'vi');
    expect(picResultVi).toBe('Chưa chỉ định');
  });

  test('4. Combined Project Validation (Exactly 2 to 3 projects allowed)', () => {
    const checkCombinedValidity = (selectedCount: number, validCount: number) => {
      return selectedCount >= 2 && selectedCount <= 3 && selectedCount === validCount;
    };

    expect(checkCombinedValidity(0, 0)).toBe(false); // 0: FAIL
    expect(checkCombinedValidity(1, 1)).toBe(false); // 1: FAIL
    expect(checkCombinedValidity(2, 2)).toBe(true);  // 2: PASS
    expect(checkCombinedValidity(3, 3)).toBe(true);  // 3: PASS
    expect(checkCombinedValidity(4, 4)).toBe(false); // 4+: FAIL
    expect(checkCombinedValidity(3, 2)).toBe(false); // Invalid ID present: FAIL
  });

  test('5. Mono Mode Hatch Low Opacity & High Contrast Text Contract', () => {
    const monoOff = getPrintCalendarVisualStyle('BOTH_OFF', 'mono');
    expect(monoOff.hatch.enabled).toBe(true);
    expect(monoOff.hatch.alpha).toBeLessThanOrEqual(0.22); // Low opacity (<=22%)
    expect(monoOff.textColor).toBe('#0F172A'); // High contrast dark slate

    const monoKr = getPrintCalendarVisualStyle('KR_ONLY_OFF', 'mono');
    expect(monoKr.hatch.alpha).toBeLessThanOrEqual(0.18);
  });

  test('6. Color Mode Status Badges match web tokens (Green = COMPLETED)', () => {
    const greenBadge = getPrintStatusBadgeStyle('COMPLETED', 'color', 'ko');
    expect(greenBadge.label).toBe('완료');
    expect(greenBadge.backgroundColor).toBe('#ECFDF5');

    const inProgressBadge = getPrintStatusBadgeStyle('IN_PROGRESS', 'color', 'ko');
    expect(inProgressBadge.label).toBe('진행중');
  });
});
