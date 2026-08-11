// tests/progressAndConflicts.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTaskProgress, calculateProjectProgress } from '../src/utils/progressCalculator';
import { detectWorkerTaskConflicts } from '../src/utils/conflictDetector';
import { calculateTaskWorkdayBreakdown, resolveWorkDayStatus } from '../src/utils/workCalendar';
import { calculateWorkerUtilization } from '../src/components/common/WorkerUtilizationBadge';
import { Task, Project, Worker, CountryHoliday, CalendarOverride } from '../src/types';

describe('Phase 2 Automated Progress & Worker Conflict Test Suite (Requirement 21)', () => {
  const krWorker: Worker = {
    id: 'wrk_02',
    name: '박용진 수석',
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
    is_active: 1,
    sort_order: 1,
  };

  const vnWorker: Worker = {
    id: 'wrk_03',
    name: 'Thanh Phuong(탄 프엉)',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    is_active: 1,
    sort_order: 2,
  };

  // 1. Planned progress before start_date = 0%
  it('1. Planned progress before start_date resolves to 0%', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '미래 작업',
      start_date: '2026-09-01',
      end_date: '2026-09-10',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.planned_progress).toBe(0);
    expect(res.schedule_state).toBe('UPCOMING');
  });

  // 2. First working day start = 0%
  it('2. First working day start resolves to 0%', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '오늘 시작 작업',
      start_date: '2026-08-05',
      end_date: '2026-08-07',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.planned_progress).toBe(0);
  });

  // 3. In-progress working day ratio calculation
  it('3. In-progress working days calculate exact planned progress percentage', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '진행 작업',
      start_date: '2026-08-03', // Mon
      end_date: '2026-08-07',   // Fri (5 working days)
      progress: 0,
    };
    // On Thursday (2026-08-06), Mon-Wed (3 days) elapsed before today => 3/5 = 60%
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-06');
    expect(res.planned_working_days).toBe(5);
    expect(res.planned_progress).toBe(60);
  });

  // 4. Past end_date = 100%
  it('4. Planned progress after end_date resolves to 100%', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '과거 작업',
      start_date: '2026-08-01',
      end_date: '2026-08-04',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.planned_progress).toBe(100);
  });

  // 5. KR excludes Saturday and Sunday
  it('5. KR worker excludes Saturday and Sunday from planned working days', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '주말 포함 작업',
      start_date: '2026-08-07', // Fri
      end_date: '2026-08-10',   // Mon (Fri, Sat, Sun, Mon => 2 working days)
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.planned_working_days).toBe(2);
  });

  // 6. VN includes Saturday
  it('6. VN MON_SAT worker includes Saturday in planned working days', () => {
    const task: Task = {
      id: 't2',
      project_id: 'p1',
      worker_name: 'Thanh Phuong(탄 프엉)',
      task_name: '베트남 주말 포함 작업',
      start_date: '2026-08-07', // Fri
      end_date: '2026-08-10',   // Mon (Fri, Sat, Mon => 3 working days)
      progress: 0,
    };
    const res = calculateTaskProgress(task, vnWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.planned_working_days).toBe(3);
  });

  // 7. Public Holiday exclusion
  it('7. Excludes public holiday dates from planned working days', () => {
    const holidays: CountryHoliday[] = [
      { id: 'h1', country_code: 'KR', holiday_date: '2026-08-05', name_local: '광복절 대체', source: 'KASI', source_year: 2026, is_verified: 1 },
    ];
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '공휴일 포함 작업',
      start_date: '2026-08-04',
      end_date: '2026-08-06', // 3 days - 1 holiday = 2 working days
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, holidays, [], 'ACTIVE', '2026-08-04');
    expect(res.planned_working_days).toBe(2);
  });

  // 8. LEAVE exclusion
  it('8. Excludes LEAVE override dates from planned working days', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o1', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-08-05', override_type: 'LEAVE', label_ko: '여름휴가' },
    ];
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '휴가 포함 작업',
      start_date: '2026-08-04',
      end_date: '2026-08-06',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], overrides, 'ACTIVE', '2026-08-04');
    expect(res.planned_working_days).toBe(2);
  });

  // 9. OFF exclusion
  it('9. Excludes MANUAL_OFF override dates from planned working days', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o2', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-08-05', override_type: 'OFF', label_ko: '수동 휴무' },
    ];
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '휴무 포함 작업',
      start_date: '2026-08-04',
      end_date: '2026-08-06',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], overrides, 'ACTIVE', '2026-08-04');
    expect(res.planned_working_days).toBe(2);
  });

  // 10. WORK inclusion
  it('10. Includes WORK override dates on weekend as planned working days', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o3', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-08-08', override_type: 'WORK', label_ko: '특별 근무' },
    ];
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '주말 특근 작업',
      start_date: '2026-08-07', // Fri
      end_date: '2026-08-09',   // Sun (Fri + Sat WORK = 2 working days)
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], overrides, 'ACTIVE', '2026-08-07');
    expect(res.planned_working_days).toBe(2);
  });

  // 11. Actual progress calculation
  it('11. Actual progress calculates completed working days ratio', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '완료 진행 작업',
      start_date: '2026-08-03',
      end_date: '2026-08-07', // 5 working days
      progress: 0,
      progress_mode: 'STATUS_BASED',
      daily_statuses: {
        '2026-08-03': 'COMPLETED',
        '2026-08-04': 'COMPLETED',
      },
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.completed_working_days).toBe(2);
    expect(res.actual_progress).toBe(40);
  });

  // 12. Non-working day COMPLETED exclusion from denominator and numerator
  it('12. Excludes non-working day COMPLETED status from actual progress ratio', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '주말 체크 작업',
      start_date: '2026-08-07', // Fri
      end_date: '2026-08-10',   // Mon (Fri, Mon = 2 working days)
      progress: 0,
      daily_statuses: {
        '2026-08-08': 'COMPLETED', // Saturday non-working day
      },
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-09');
    expect(res.completed_working_days).toBe(0);
    expect(res.actual_progress).toBe(0);
  });

  // 13 & 14. Weighted Project Progress
  it('13 & 14. Project progress uses task planned working days weighting', () => {
    const project: Project = {
      id: 'p1',
      name: '가중치 테스트 프로젝트',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      progress: 0,
      status: 'ACTIVE',
    };
    const tasks: Task[] = [
      {
        id: 't1',
        project_id: 'p1',
        worker_name: '박용진 수석',
        task_name: '작업 A',
        start_date: '2026-08-03',
        end_date: '2026-08-07', // 5 working days, 100% completed
        progress: 0,
        progress_mode: 'STATUS_BASED',
        daily_statuses: {
          '2026-08-03': 'COMPLETED',
          '2026-08-04': 'COMPLETED',
          '2026-08-05': 'COMPLETED',
          '2026-08-06': 'COMPLETED',
          '2026-08-07': 'COMPLETED',
        },
      },
      {
        id: 't2',
        project_id: 'p1',
        worker_name: 'Thanh Phuong(탄 프엉)',
        task_name: '작업 B',
        start_date: '2026-08-10',
        end_date: '2026-08-25', // 14 working days, 0% completed
        progress: 0,
      },
    ];
    const res = calculateProjectProgress(project, tasks, [krWorker, vnWorker], [], [], '2026-08-05');
    // Total planned days = 5 + 14 = 19
    // Total completed days = 5
    // Project actual progress = 5 / 19 * 100 = 26%
    expect(res.planned_working_days).toBe(19);
    expect(res.completed_working_days).toBe(5);
    expect(res.actual_progress).toBe(26);
  });

  // 15. Zero task project progress = 0%
  it('15. Project with zero tasks resolves to 0% progress', () => {
    const project: Project = {
      id: 'p_empty',
      name: '빈 프로젝트',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      progress: 0,
      status: 'ACTIVE',
    };
    const res = calculateProjectProgress(project, [], [], [], [], '2026-08-05');
    expect(res.planned_progress).toBe(0);
    expect(res.actual_progress).toBe(0);
  });

  // 16. DELAYED schedule state
  it('16. Unfinished task past end_date resolves to DELAYED state', () => {
    const task: Task = {
      id: 't1',
      project_id: 'p1',
      worker_name: '박용진 수석',
      task_name: '지연 작업',
      start_date: '2026-08-01',
      end_date: '2026-08-04',
      progress: 0,
    };
    const res = calculateTaskProgress(task, krWorker, [], [], 'ACTIVE', '2026-08-05');
    expect(res.schedule_state).toBe('DELAYED');
  });

  // 17 ~ 19. Schedule states UPCOMING, IN_PROGRESS, COMPLETED
  it('17 ~ 19. Correctly resolves UPCOMING, IN_PROGRESS, and COMPLETED states', () => {
    const taskUpcoming: Task = { id: 'u1', project_id: 'p1', worker_name: '박용진 수석', task_name: '예정', start_date: '2026-08-10', end_date: '2026-08-15', progress: 0 };
    const taskProgress: Task = { id: 'u2', project_id: 'p1', worker_name: '박용진 수석', task_name: '진행', start_date: '2026-08-03', end_date: '2026-08-10', progress: 0 };
    const taskDone: Task = { id: 'u3', project_id: 'p1', worker_name: '박용진 수석', task_name: '완료', start_date: '2026-08-03', end_date: '2026-08-05', progress: 0, daily_statuses: { '2026-08-03': 'COMPLETED', '2026-08-04': 'COMPLETED', '2026-08-05': 'COMPLETED' } };
    taskDone.progress_mode = 'STATUS_BASED';

    expect(calculateTaskProgress(taskUpcoming, krWorker, [], [], 'ACTIVE', '2026-08-05').schedule_state).toBe('UPCOMING');
    expect(calculateTaskProgress(taskProgress, krWorker, [], [], 'ACTIVE', '2026-08-05').schedule_state).toBe('IN_PROGRESS');
    expect(calculateTaskProgress(taskDone, krWorker, [], [], 'ACTIVE', '2026-08-05').schedule_state).toBe('COMPLETED');
  });

  // 20 ~ 23. Worker schedule conflict detection
  it('20 ~ 23. Worker schedule conflict detector calculates overlapping working days and excludes self & completed projects', () => {
    const projects: Project[] = [
      { id: 'p1', name: '프로젝트 1', start_date: '2026-08-01', end_date: '2026-08-31', progress: 0, status: 'ACTIVE' },
      { id: 'p2', name: '프로젝트 2', start_date: '2026-08-01', end_date: '2026-08-31', progress: 0, status: 'ACTIVE' },
      { id: 'p3', name: '완료 프로젝트', start_date: '2026-08-01', end_date: '2026-08-31', progress: 100, status: 'COMPLETED' },
    ];

    const tasks: Task[] = [
      { id: 't1', project_id: 'p1', worker_name: '박용진 수석', task_name: '기존 작업 1', start_date: '2026-08-03', end_date: '2026-08-07', progress: 0 },
      { id: 't2', project_id: 'p3', worker_name: '박용진 수석', task_name: '완료 작업', start_date: '2026-08-03', end_date: '2026-08-07', progress: 100 },
    ];

    const newTarget = {
      id: 't_new',
      project_id: 'p2',
      worker_name: '박용진 수석',
      start_date: '2026-08-05',
      end_date: '2026-08-10',
    };

    const conflicts = detectWorkerTaskConflicts(newTarget, projects, tasks, [krWorker], [], []);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].conflict_project_name).toBe('프로젝트 1');
    expect(conflicts[0].conflict_task_name).toBe('기존 작업 1');
    // Overlap: 2026-08-05 (Wed), 2026-08-06 (Thu), 2026-08-07 (Fri) => 3 working days
    expect(conflicts[0].overlapping_working_days).toBe(3);
  });

  // 24. KR Saturday Auto Exclusion
  it('24. KR MON_FRI worker Saturday auto exclusion', () => {
    const bd = calculateTaskWorkdayBreakdown(krWorker, '2026-05-09', '2026-05-09', [], []);
    expect(bd.calendar_span_days).toBe(1);
    expect(bd.planned_working_days).toBe(0);
    expect(bd.excluded_weekly_off_days).toBe(1);
    expect(bd.excluded_non_working_days).toBe(1);
  });

  // 25. VN Saturday Workday Inclusion
  it('25. VN MON_SAT worker Saturday workday inclusion', () => {
    const bd = calculateTaskWorkdayBreakdown(vnWorker, '2026-05-09', '2026-05-09', [], []);
    expect(bd.calendar_span_days).toBe(1);
    expect(bd.planned_working_days).toBe(1);
    expect(bd.excluded_weekly_off_days).toBe(0);
  });

  // 26. All Workers Sunday Exclusion
  it('26. All workers Sunday auto exclusion', () => {
    const krBd = calculateTaskWorkdayBreakdown(krWorker, '2026-05-10', '2026-05-10', [], []);
    const vnBd = calculateTaskWorkdayBreakdown(vnWorker, '2026-05-10', '2026-05-10', [], []);
    expect(krBd.planned_working_days).toBe(0);
    expect(vnBd.planned_working_days).toBe(0);
  });

  // 27. Public Holiday Exclusions
  it('27. KR and VN public holiday exclusions', () => {
    const krHolidays: CountryHoliday[] = [{ id: 'h_kr', country_code: 'KR', holiday_date: '2026-05-05', name_local: '어린이날', source: 'KASI', source_year: 2026, is_verified: 1 }];
    const vnHolidays: CountryHoliday[] = [{ id: 'h_vn', country_code: 'VN', holiday_date: '2026-04-30', name_local: 'Ngày Giải phóng', source: 'NAGER', source_year: 2026, is_verified: 1 }];

    const krBd = calculateTaskWorkdayBreakdown(krWorker, '2026-05-05', '2026-05-05', krHolidays, []);
    const vnBd = calculateTaskWorkdayBreakdown(vnWorker, '2026-04-30', '2026-04-30', vnHolidays, []);
    expect(krBd.excluded_public_holiday_days).toBe(1);
    expect(vnBd.excluded_public_holiday_days).toBe(1);
  });

  // 28. LEAVE and OFF Exclusions
  it('28. LEAVE and OFF overrides excluded from planned working days', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o_leave', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-05-11', override_type: 'LEAVE' },
      { id: 'o_off', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-05-12', override_type: 'OFF' },
    ];
    const bd = calculateTaskWorkdayBreakdown(krWorker, '2026-05-11', '2026-05-12', [], overrides);
    expect(bd.planned_working_days).toBe(0);
    expect(bd.excluded_leave_days).toBe(2);
  });

  // 29. WORK Override Inclusion
  it('29. WORK override includes weekend in planned working days', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o_work', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-05-09', override_type: 'WORK' },
    ];
    const bd = calculateTaskWorkdayBreakdown(krWorker, '2026-05-09', '2026-05-09', [], overrides);
    expect(bd.planned_working_days).toBe(1);
    expect(bd.included_work_override_days).toBe(1);
  });

  // 30. KR Saturday Overlap No Conflict vs VN Saturday Overlap Conflict
  it('30. KR Saturday overlap has 0 working days conflict; VN Saturday overlap has 1 day conflict', () => {
    const projects: Project[] = [
      { id: 'p1', name: 'P1', start_date: '2026-05-01', end_date: '2026-05-31', progress: 0, status: 'ACTIVE' },
      { id: 'p2', name: 'P2', start_date: '2026-05-01', end_date: '2026-05-31', progress: 0, status: 'ACTIVE' },
    ];

    const krTask: Task = { id: 't_kr1', project_id: 'p1', worker_name: '박용진 수석', task_name: 'KR1', start_date: '2026-05-09', end_date: '2026-05-09', progress: 0 };
    const krTarget = { id: 't_kr2', project_id: 'p2', worker_name: '박용진 수석', start_date: '2026-05-09', end_date: '2026-05-09' };
    const krConflicts = detectWorkerTaskConflicts(krTarget, projects, [krTask], [krWorker], [], []);
    expect(krConflicts.length).toBe(0);

    const vnTask: Task = { id: 't_vn1', project_id: 'p1', worker_name: 'Thanh Phuong(탄 프엉)', task_name: 'VN1', start_date: '2026-05-09', end_date: '2026-05-09', progress: 0 };
    const vnTarget = { id: 't_vn2', project_id: 'p2', worker_name: 'Thanh Phuong(탄 프엉)', start_date: '2026-05-09', end_date: '2026-05-09' };
    const vnConflicts = detectWorkerTaskConflicts(vnTarget, projects, [vnTask], [vnWorker], [], []);
    expect(vnConflicts.length).toBe(1);
    expect(vnConflicts[0].overlapping_working_days).toBe(1);
  });

  // 31. Worker Profile Missing Error
  it('31. Missing worker profile returns profile error', () => {
    const st = resolveWorkDayStatus('2026-05-09', null as any, [], []);
    expect(st.source).toBe('ERROR');
    expect(st.label_ko).toBe('작업자 캘린더 정보 오류');
  });

  // 32. Worker Utilization Calculation
  it('32. Calculates worker monthly utilization rate and status level', () => {
    const tasks: Task[] = [
      { id: 't1', project_id: 'p1', worker_name: '박용진 수석', task_name: 'Task 1', start_date: '2026-08-01', end_date: '2026-08-31', progress: 0 },
    ];
    const util = calculateWorkerUtilization(krWorker, tasks, [], [], '2026-08-05');
    expect(util.available_working_days).toBeGreaterThan(0);
    expect(util.assigned_working_days).toBe(util.available_working_days);
    expect(util.utilization_rate).toBe(100);
    expect(util.status_level).toBe('OPTIMAL');
  });
});
