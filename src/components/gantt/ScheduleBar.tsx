// src/components/gantt/ScheduleBar.tsx
import React, { useRef, useState, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';

export type ScheduleBarStatus = 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'COMPLETION_REVIEW' | 'UNKNOWN';

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
  isMobile?: boolean;
  interactionMode?: 'CLICKABLE' | 'PASS_THROUGH';
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ScheduleBar: React.FC<ScheduleBarProps> = ({
  title,
  startDate,
  endDate,
  calendarSpanDays,
  plannedWorkingDays: _plannedWorkingDays,
  plannedProgress,
  actualProgress,
  status,
  hasConflict = false,
  isMobile = false,
  interactionMode = 'CLICKABLE',
  onClick,
  className = '',
  style,
}) => {
  const { lang } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState<number>(() => calendarSpanDays * 36);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setBarWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setBarWidth(rect.width);
    }

    return () => {
      observer.disconnect();
    };
  }, [calendarSpanDays]);

  // Status Styling Configuration (indigo for IN_PROGRESS to contrast with blue today cell)
  let baseColorClass = 'bg-slate-300 border-slate-500 text-slate-900';
  let progressFillClass = 'bg-slate-600';
  let statusLabelKo = '예정';
  let statusLabelVi = 'Sắp tới';

  if (status === 'COMPLETED') {
    baseColorClass = 'bg-emerald-200 border-emerald-500 text-emerald-950';
    progressFillClass = 'bg-emerald-600';
    statusLabelKo = '완료';
    statusLabelVi = 'Hoàn thành';
  } else if (status === 'DELAYED') {
    baseColorClass = 'bg-rose-200 border-rose-500 text-rose-950';
    progressFillClass = 'bg-rose-600';
    statusLabelKo = '지연';
    statusLabelVi = 'Trễ hạn';
  } else if (status === 'IN_PROGRESS') {
    baseColorClass = 'bg-indigo-200 border-indigo-500 text-indigo-950';
    progressFillClass = 'bg-indigo-600';
    statusLabelKo = '진행 중';
    statusLabelVi = 'Đang làm';
  } else if (status === 'UNKNOWN') {
    baseColorClass = 'bg-slate-200 border-slate-400 text-slate-700';
    progressFillClass = 'bg-slate-500';
    statusLabelKo = '상태 미정';
    statusLabelVi = 'Chưa xác định';
  }

  const clampedActual = Math.min(100, Math.max(0, actualProgress));
  const clampedPlanned = Math.min(100, Math.max(0, plannedProgress));

  const statusText = lang === 'vi' ? statusLabelVi : statusLabelKo;
  const ariaLabel = `${title}, ${startDate} ~ ${endDate}, ${lang === 'vi' ? 'KH' : '예정'} ${clampedPlanned}%, ${lang === 'vi' ? 'TT' : '실제'} ${clampedActual}%, ${statusText}`;

  const trackHeightClass = isMobile ? 'h-[18px]' : 'h-5';

  const isPassThrough = interactionMode === 'PASS_THROUGH';
  const pointerClass = isPassThrough ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer';

  return (
    <div
      ref={barRef}
      data-testid={isMobile ? 'mobile-gantt-schedule-bar' : 'gantt-schedule-bar'}
      {...(!isPassThrough ? { role: 'button', tabIndex: 0, 'aria-label': ariaLabel } : { 'aria-hidden': true })}
      {...(!isPassThrough
        ? {
            onClick: (e) => {
              e.stopPropagation();
              onClick?.();
            },
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClick?.();
              }
            },
          }
        : {})}
      className={`relative group my-auto w-full min-w-0 ${pointerClass} focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 rounded-md ${className}`}
      style={style}
    >
      {/* Outer Continuous Bar Track (Pure Visual Bar) */}
      <div
        data-testid={isMobile ? 'mobile-gantt-schedule-track' : 'gantt-schedule-track'}
        className={`w-full min-w-0 ${trackHeightClass} rounded-md border text-xs font-bold relative overflow-hidden transition-all duration-150 shadow-none flex items-center select-none ${baseColorClass} ${isPassThrough ? 'pointer-events-none' : 'hover:brightness-95'}`}
      >
        {/* Actual Progress Overlay Fill */}
        {clampedActual > 0 && (
          <div
            data-testid="gantt-bar-actual-overlay"
            style={{ width: `${clampedActual}%` }}
            className={`absolute top-0 bottom-0 left-0 z-1 transition-all duration-300 ${progressFillClass}`}
          />
        )}

        {/* Planned Progress Marker Line */}
        {clampedPlanned > 0 && clampedPlanned < 100 && (
          <div
            data-testid="gantt-bar-planned-marker"
            style={{ left: `${clampedPlanned}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900/70 z-2"
          />
        )}

        {/* Conflict Warning Indicator */}
        {hasConflict && (
          <div className="absolute right-1 z-5 flex items-center justify-center pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-ping" />
          </div>
        )}
      </div>
    </div>
  );
};
