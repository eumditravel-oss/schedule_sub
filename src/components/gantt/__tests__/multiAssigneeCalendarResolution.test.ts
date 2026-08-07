import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { resolveWorkDayStatus } from '../../../utils/workCalendar';
import { Worker, CountryHoliday, CalendarOverride, TaskAssignee } from '../../../types';
import { WorkerDayCellBackground } from '../WorkerDayCellBackground';

describe('multiAssigneeCalendarResolution & WorkerDayCellBackground', () => {
  const wThanh: Worker = {
    id: 'wrk_03',
    name: 'Thanh Phuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    is_active: 1,
    sort_order: 1,
    access_role: 'EDITOR',
  };

  const wManh: Worker = {
    id: 'wrk_04',
    name: 'Manh Cuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    is_active: 1,
    sort_order: 2,
    access_role: 'EDITOR',
  };

  const wKorean: Worker = {
    id: 'wrk_01',
    name: '유종욱 실장',
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
    is_active: 1,
    sort_order: 3,
    access_role: 'EDITOR',
  };

  const assignees2VN: TaskAssignee[] = [
    { worker_id: 'wrk_03', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'PRIMARY', allocation_percent: 50, sort_order: 0 },
    { worker_id: 'wrk_04', name: 'Manh Cuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50, sort_order: 1 },
  ];

  const workersList = [wThanh, wManh, wKorean];

  const holidays: CountryHoliday[] = [
    {
      id: 'hol_KR_2026-05-05',
      country_code: 'KR',
      holiday_date: '2026-05-05',
      name_local: 'Children Day',
      name_ko: '어린이날',
      name_vi: '어린이날',
      source: 'NAGER',
      source_year: 2026,
      is_verified: 1,
    },
  ];

  it('1. 2 WORK: renders ALL_WORKING / Badge 0 / Hatch 0', () => {
    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-09',
        taskId: 'tsk_test',
        assignees: assignees2VN,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: [],
      })
    );

    expect(html).toContain('data-assignee-availability="ALL_WORKING"');
    expect(html).toContain('data-working-count="2"');
    expect(html).toContain('data-off-count="0"');
    expect(html).not.toContain('data-testid="worker-partial-off-badge"');
    expect(html).not.toContain('data-testid="task-worker-hatch-tsk_test-2026-05-09"');
  });

  it('2. 1 OFF: renders PARTIAL_OFF / 1/2 수동휴무', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_test_off',
        scope_type: 'WORKER',
        scope_key: 'wrk_03',
        work_date: '2026-05-09',
        override_type: 'OFF',
        label_ko: '수동 휴무',
      },
    ];

    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-09',
        taskId: 'tsk_test',
        assignees: assignees2VN,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: overrides,
      })
    );

    expect(html).toContain('data-assignee-availability="PARTIAL_OFF"');
    expect(html).toContain('data-working-count="1"');
    expect(html).toContain('data-off-count="1"');
    expect(html).toMatch(/1.*\/.*2.*휴가/);
    expect(html).toContain('data-testid="worker-partial-off-badge"');
  });

  it('3. 1 LEAVE: renders PARTIAL_OFF / 1/2 휴가', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_test_leave',
        scope_type: 'WORKER',
        scope_key: 'wrk_03',
        work_date: '2026-05-09',
        override_type: 'LEAVE',
        label_ko: '개인 휴가',
      },
    ];

    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-09',
        taskId: 'tsk_test',
        assignees: assignees2VN,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: overrides,
      })
    );

    expect(html).toContain('data-assignee-availability="PARTIAL_OFF"');
    expect(html).toMatch(/1.*\/.*2.*휴가/);
    expect(html).toContain('bg-purple-600');
  });

  it('4. 2 OFF: renders ALL_OFF / Full Hatch', () => {
    // On Sunday 2026-05-10, both VN MON_SAT workers are WEEKLY_OFF
    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-10',
        taskId: 'tsk_test',
        assignees: assignees2VN,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: [],
      })
    );

    expect(html).toContain('data-assignee-availability="ALL_OFF"');
    expect(html).toContain('data-working-count="0"');
    expect(html).toContain('data-off-count="2"');
    expect(html).toContain('data-testid="task-worker-hatch-tsk_test-2026-05-10"');
    expect(html).not.toContain('data-testid="worker-partial-off-badge"');
  });

  it('5. 1 Invalid + 1 WORK: renders PROFILE_ERROR badge, ratio badge NOT displayed', () => {
    const invalidAssignees: TaskAssignee[] = [
      { worker_id: 'wrk_invalid', name: 'Unknown', country_code: 'VN', assignment_role: 'PRIMARY', allocation_percent: 50, sort_order: 0 },
      { worker_id: 'wrk_04', name: 'Manh Cuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50, sort_order: 1 },
    ];

    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-09',
        taskId: 'tsk_test',
        assignees: invalidAssignees,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: [],
      })
    );

    expect(html).toContain('data-assignee-availability="PROFILE_ERROR"');
    expect(html).toContain('data-profile-error-count="1"');
    expect(html).toContain('data-testid="worker-profile-error-badge"');
    expect(html).toContain('작업자 정보 오류');
    expect(html).not.toContain('data-testid="worker-partial-off-badge"');
  });

  it('6. KR_ONLY_OFF + VN 2명: renders ALL_WORKING / Hatch 0', () => {
    const html = renderToString(
      React.createElement(WorkerDayCellBackground, {
        dateStr: '2026-05-05',
        taskId: 'tsk_test',
        assignees: assignees2VN,
        workers: workersList,
        countryHolidays: holidays,
        calendarOverrides: [],
      })
    );

    expect(html).toContain('data-assignee-availability="ALL_WORKING"');
    expect(html).toContain('data-working-count="2"');
    expect(html).toContain('data-off-count="0"');
    expect(html).not.toContain('data-testid="task-worker-hatch-tsk_test-2026-05-05"');
    expect(html).not.toContain('data-testid="worker-partial-off-badge"');
  });
});
