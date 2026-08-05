// src/components/common/WorkerUtilizationBadge.tsx
import React from 'react';
import { Worker, Task, CountryHoliday, CalendarOverride, WorkerUtilization } from '../../types';
import { resolveWorkDayStatus } from '../../utils/workCalendar';
import { useI18n } from '../../hooks/useI18n';

interface WorkerUtilizationBadgeProps {
  worker: Worker | null;
  tasks?: Task[];
  holidays?: CountryHoliday[];
  overrides?: CalendarOverride[];
  compact?: boolean;
}

export function calculateWorkerUtilization(
  worker: Worker | null | undefined,
  tasks: Task[] = [],
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = [],
  referenceDateStr?: string
): WorkerUtilization {
  if (!worker || !worker.country_code || !worker.workweek_profile) {
    return {
      worker_id: worker?.id || '',
      worker_name: worker?.name || '',
      country_code: 'KR',
      workweek_profile: 'MON_FRI',
      available_working_days: 0,
      assigned_working_days: 0,
      utilization_rate: 0,
      overloaded_working_days: 0,
      status_level: 'EASY',
    };
  }

  const now = referenceDateStr ? new Date(`${referenceDateStr}T00:00:00Z`) : new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();

  // First day to last day of current month
  const firstDay = new Date(yyyy, mm, 1);
  const lastDay = new Date(yyyy, mm + 1, 0);

  let available_working_days = 0;
  const daysInMonth: string[] = [];

  let cur = new Date(firstDay);
  while (cur <= lastDay) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    daysInMonth.push(dateStr);

    const st = resolveWorkDayStatus(dateStr, worker, holidays, overrides);
    if (st.is_working_day) {
      available_working_days += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Count active assigned working days for this worker
  const activeWorkerTasks = tasks.filter(
    (t) => t.worker_name === worker.id || t.worker_name === worker.name
  );

  let assigned_working_days = 0;
  for (const dateStr of daysInMonth) {
    const st = resolveWorkDayStatus(dateStr, worker, holidays, overrides);
    if (!st.is_working_day) continue;

    const hasAssignedTask = activeWorkerTasks.some(
      (t) => t.start_date <= dateStr && t.end_date >= dateStr
    );
    if (hasAssignedTask) {
      assigned_working_days += 1;
    }
  }

  const utilization_rate = available_working_days > 0
    ? Math.round((assigned_working_days / available_working_days) * 100)
    : 0;

  const overloaded_working_days = Math.max(0, assigned_working_days - available_working_days);

  let status_level: 'EASY' | 'OPTIMAL' | 'OVERLOADED' = 'EASY';
  if (utilization_rate > 100) {
    status_level = 'OVERLOADED';
  } else if (utilization_rate > 80) {
    status_level = 'OPTIMAL';
  } else {
    status_level = 'EASY';
  }

  return {
    worker_id: worker.id,
    worker_name: worker.name,
    country_code: worker.country_code,
    workweek_profile: worker.workweek_profile,
    available_working_days,
    assigned_working_days,
    utilization_rate,
    overloaded_working_days,
    status_level,
  };
}

export const WorkerUtilizationBadge: React.FC<WorkerUtilizationBadgeProps> = ({
  worker,
  tasks = [],
  holidays = [],
  overrides = [],
  compact = false,
}) => {
  const { lang } = useI18n();
  const util = calculateWorkerUtilization(worker, tasks, holidays, overrides);

  if (!worker || !worker.country_code || !worker.workweek_profile) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-rose-600 border border-slate-200">
        {lang === 'vi' ? 'Lỗi thông tin nhân viên' : '작업자 프로필 누락'}
      </span>
    );
  }

  let colorStyle = '';
  let statusText = '';
  if (util.status_level === 'OVERLOADED') {
    colorStyle = 'bg-rose-100 text-rose-800 border-rose-300';
    statusText = lang === 'vi' ? 'Quá tải' : '과부하';
  } else if (util.status_level === 'OPTIMAL') {
    colorStyle = 'bg-blue-100 text-blue-800 border-blue-300';
    statusText = lang === 'vi' ? 'Phù hợp' : '적정';
  } else {
    colorStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    statusText = lang === 'vi' ? 'Thư thả' : '여유';
  }

  if (compact) {
    return (
      <span
        data-testid="worker-utilization-badge"
        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${colorStyle} shrink-0 inline-flex items-center gap-1`}
        title={lang === 'vi'
          ? `Khả dụng ${util.available_working_days}d · Phân công ${util.assigned_working_days}d · Tải ${util.utilization_rate}%`
          : `가용 ${util.available_working_days}일 · 배정 ${util.assigned_working_days}일 · 부하 ${util.utilization_rate}%`}
      >
        <span>{statusText}</span>
        <span className="opacity-80">({util.utilization_rate}%)</span>
      </span>
    );
  }

  return (
    <div
      data-testid="worker-utilization-badge"
      className={`px-2.5 py-1 rounded-xl text-xs font-bold border ${colorStyle} inline-flex items-center gap-1.5`}
    >
      <span>
        {lang === 'vi'
          ? `Khả dụng ${util.available_working_days}d · Phân công ${util.assigned_working_days}d · Tải ${util.utilization_rate}%`
          : `가용 ${util.available_working_days}일 · 배정 ${util.assigned_working_days}일 · 부하 ${util.utilization_rate}%`}
      </span>
      <span className="px-1.5 py-0.2 rounded bg-white/60 text-[10px] font-black uppercase">
        {statusText}
      </span>
    </div>
  );
};
