// src/components/gantt/ScheduleBar.tsx
import React, { useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { Calendar, CheckCircle2, Flame, AlertTriangle, Clock, AlertCircle } from 'lucide-react';

export type ScheduleBarStatus = 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED';

export interface ScheduleBarProps {
  title: string;
  startDate: string;
  endDate: string;
  calendarSpanDays: number;
  plannedWorkingDays: number;
  plannedProgress: number; // 0 ~ 100
  actualProgress: number;  // 0 ~ 100
  status: ScheduleBarStatus;
  hasConflict?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ScheduleBar: React.FC<ScheduleBarProps> = ({
  title,
  startDate,
  endDate,
  calendarSpanDays,
  plannedWorkingDays,
  plannedProgress,
  actualProgress,
  status,
  hasConflict = false,
  onClick,
  className = '',
  style,
}) => {
  const { lang } = useI18n();
  const [showTooltip, setShowTooltip] = useState(false);

  // Status Styling Configuration
  let baseColorClass = 'bg-slate-200 border-slate-400 text-slate-800';
  let progressFillClass = 'bg-slate-500';
  let statusBadgeClass = 'bg-slate-200 text-slate-800 border-slate-300';
  let statusLabelKo = '예정';
  let statusLabelVi = 'Sắp tới';

  if (status === 'COMPLETED') {
    baseColorClass = 'bg-emerald-100 border-emerald-300 text-emerald-900';
    progressFillClass = 'bg-emerald-500';
    statusBadgeClass = 'bg-emerald-200 text-emerald-900 border-emerald-300';
    statusLabelKo = '완료';
    statusLabelVi = 'Hoàn thành';
  } else if (status === 'DELAYED') {
    baseColorClass = 'bg-rose-100 border-rose-300 text-rose-900';
    progressFillClass = 'bg-rose-500';
    statusBadgeClass = 'bg-rose-200 text-rose-900 border-rose-300';
    statusLabelKo = '지연';
    statusLabelVi = 'Trễ hạn';
  } else if (status === 'IN_PROGRESS') {
    baseColorClass = 'bg-blue-100 border-blue-300 text-blue-900';
    progressFillClass = 'bg-blue-500';
    statusBadgeClass = 'bg-blue-200 text-blue-900 border-blue-300';
    statusLabelKo = '진행 중';
    statusLabelVi = 'Đang làm';
  }

  const clampedActual = Math.min(100, Math.max(0, actualProgress));
  const clampedPlanned = Math.min(100, Math.max(0, plannedProgress));

  return (
    <div
      data-testid="gantt-schedule-bar"
      className={`relative group my-auto w-full min-w-0 pointer-events-auto cursor-pointer ${className}`}
      style={style}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
    >
      {/* Outer Continuous Bar Track */}
      <div
        data-testid="gantt-schedule-track"
        className={`w-full min-w-0 h-5 rounded-md border text-xs font-bold relative overflow-hidden transition-all duration-150 shadow-2xs flex items-center ${baseColorClass}`}
      >
        {/* Actual Progress Overlay Fill */}
        {clampedActual > 0 && (
          <div
            data-testid="gantt-bar-actual-overlay"
            style={{ width: `${clampedActual}%` }}
            className={`h-full transition-all duration-300 ${progressFillClass}`}
          />
        )}

        {/* Planned Progress Marker Line */}
        {clampedPlanned > 0 && clampedPlanned < 100 && (
          <div
            data-testid="gantt-bar-planned-marker"
            style={{ left: `${clampedPlanned}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-800/60 z-10"
            title={`${lang === 'vi' ? 'Dự kiến' : '예정'}: ${clampedPlanned}%`}
          />
        )}

        {/* Conflict Warning Indicator */}
        {hasConflict && (
          <div className="absolute right-1 z-20 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          </div>
        )}
      </div>

      {/* Interactive Tooltip Popover */}
      {showTooltip && (
        <div
          data-testid="gantt-bar-tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-64 p-3 bg-slate-900/95 text-white rounded-xl shadow-2xl text-xs space-y-1.5 backdrop-blur-xs border border-slate-700 animate-in fade-in zoom-in-95 duration-100 pointer-events-none"
        >
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
            <span className="font-extrabold text-white truncate max-w-[150px]">{title}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${statusBadgeClass}`}>
              {lang === 'vi' ? statusLabelVi : statusLabelKo}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{startDate} ~ {endDate}</span>
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1 text-[10.5px]">
            <div className="p-1.5 rounded bg-slate-800/80 text-slate-300 font-medium">
              <span>{lang === 'vi' ? 'Ngày theo lịch' : '달력 일수'}: </span>
              <strong className="text-white">{calendarSpanDays}일</strong>
            </div>
            <div className="p-1.5 rounded bg-slate-800/80 text-slate-300 font-medium">
              <span>{lang === 'vi' ? 'Ngày làm việc' : '실근무일'}: </span>
              <strong className="text-blue-400">{plannedWorkingDays}일</strong>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-400">{lang === 'vi' ? 'Kế hoạch' : '예정'}: {clampedPlanned}%</span>
            <span className="text-emerald-400">{lang === 'vi' ? 'Thực tế' : '실제'}: {clampedActual}%</span>
          </div>

          {hasConflict && (
            <div className="pt-1 text-[10px] text-amber-300 flex items-center gap-1 font-bold">
              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
              <span>{lang === 'vi' ? 'Có trùng lịch 작업자' : '작업자 일정 충돌'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
