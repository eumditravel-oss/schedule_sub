// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryCode } from '../../types';

interface WorkerDayCellBackgroundProps {
  dateStr: string;
  worker?: Partial<Worker> | null;
  dayStatus?: WorkDayStatus | null;
  isToday?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const WorkerDayCellBackground: React.FC<WorkerDayCellBackgroundProps> = ({
  dateStr,
  worker,
  dayStatus,
  isToday,
  className = '',
  style,
  onClick,
  children,
}) => {
  const dayType = dayStatus?.day_type || 'WORKDAY';
  const isWorking = dayStatus ? dayStatus.is_working_day : true;
  const countryCode: CountryCode = worker?.country_code || dayStatus?.country_code || 'KR';
  const offReason = dayStatus?.label_ko || (isWorking ? '정상 근무' : '휴무');

  // Background color classes
  let bgClass = 'bg-white';
  if (dayType === 'WEEKLY_OFF') {
    bgClass = 'bg-slate-100/70 text-slate-500';
  } else if (dayType === 'PUBLIC_HOLIDAY') {
    bgClass = countryCode === 'VN' ? 'bg-amber-100/80 text-amber-900' : 'bg-rose-100/80 text-rose-900';
  } else if (dayType === 'LEAVE') {
    bgClass = 'bg-violet-100/80 text-violet-900';
  } else if (dayType === 'MANUAL_OFF') {
    bgClass = 'bg-orange-100/80 text-orange-900';
  } else if (dayType === 'WORK_OVERRIDE') {
    bgClass = 'bg-cyan-50/80 text-cyan-900 font-semibold';
  }

  const todayStyle = isToday ? 'ring-2 ring-blue-500 ring-inset' : '';

  // Hatch Pattern Gradient for non-working days
  let hatchPatternStyle: React.CSSProperties | undefined;
  if (!isWorking && dayType !== 'WORK_OVERRIDE') {
    let strokeColor = 'rgba(100, 116, 139, 0.25)'; // slate for WEEKLY_OFF
    if (dayType === 'PUBLIC_HOLIDAY') {
      strokeColor = countryCode === 'VN' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(249, 115, 22, 0.35)';
    } else if (dayType === 'LEAVE') {
      strokeColor = 'rgba(139, 92, 246, 0.35)';
    } else if (dayType === 'MANUAL_OFF') {
      strokeColor = 'rgba(234, 88, 12, 0.35)';
    }

    hatchPatternStyle = {
      backgroundImage: `repeating-linear-gradient(135deg, ${strokeColor} 0px, ${strokeColor} 4px, transparent 4px, transparent 8px)`,
    };
  }

  const ariaLabel = `${dateStr} ${worker?.name || ''} - ${offReason} (${isWorking ? '근무' : '휴무'})`;

  return (
    <div
      data-worker-day-type={dayType}
      data-worker-is-working={isWorking ? 'true' : 'false'}
      data-worker-off-reason={offReason}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      className={`relative border-r border-slate-200 transition select-none ${bgClass} ${todayStyle} ${className}`}
    >
      {/* Layer 0: Base Cell Content / Background */}
      <div className="absolute inset-0 z-0" />

      {/* Layer 10: ScheduleBar & Cell Inner Children */}
      <div className="relative z-10 h-full w-full">{children}</div>

      {/* Layer 20: Pattern Overlay (Repeats over ScheduleBar for visibility) */}
      {hatchPatternStyle && (
        <div
          data-testid="worker-off-hatch-overlay"
          style={hatchPatternStyle}
          className="absolute inset-0 z-20 pointer-events-none opacity-30"
        />
      )}
    </div>
  );
};
