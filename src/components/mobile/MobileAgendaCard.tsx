import React from 'react';
import { useI18n } from '../../hooks/useI18n';

export interface MobileAgendaCardProps {
  type: 'PROJECT' | 'TASK';
  title: string;
  projectName?: string;
  startDate?: string;
  endDate?: string;
  assignees?: { id?: string; worker_id?: string; worker_name?: string; name?: string }[];
  actualProgress: number;
  plannedProgress?: number;
  scheduleState?: string;
  completionConfirmed?: boolean | number;
  taskGroupTitle?: string;
  onClick?: () => void;
  testId?: string;
}

export const MobileAgendaCard: React.FC<MobileAgendaCardProps> = ({
  type,
  title,
  projectName,
  startDate,
  endDate,
  assignees = [],
  actualProgress,
  plannedProgress,
  scheduleState,
  completionConfirmed,
  taskGroupTitle,
  onClick,
  testId,
}) => {
  const { lang } = useI18n();
  const isCompleted = Number(completionConfirmed) === 1 || actualProgress >= 100 || scheduleState === 'COMPLETED';

  let statusBadgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
  let statusText = lang === 'ko' ? '진행 중' : 'Đang thực hiện';

  if (isCompleted) {
    statusBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
    statusText = lang === 'ko' ? '완료' : 'Hoàn thành';
  } else if (scheduleState === 'OVERDUE') {
    statusBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200';
    statusText = lang === 'ko' ? '기한 경과' : 'Quá hạn';
  } else if (actualProgress === 0) {
    statusBadgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
    statusText = lang === 'ko' ? '예정' : 'Dự kiến';
  }

  const assigneeNames = assignees
    .map((a) => a.name || a.worker_name || '')
    .filter(Boolean)
    .join(', ');

  return (
    <div
      data-testid={testId || `mobile-agenda-card-${type.toLowerCase()}`}
      data-progress-source="actual_progress"
      data-actual-progress={actualProgress}
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm active:bg-slate-50 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          {type === 'TASK' && (projectName || taskGroupTitle) && (
            <div className="text-[11px] font-medium text-slate-500 truncate mb-0.5">
              {projectName} {taskGroupTitle ? `• ${taskGroupTitle}` : ''}
            </div>
          )}
          <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
            {title}
          </h4>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeColor}`}
        >
          {statusText}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5">
        <span>
          {startDate || ''} {endDate ? `~ ${endDate}` : ''}
        </span>
        {assigneeNames && (
          <span className="truncate max-w-[140px] text-right font-medium text-slate-600">
            {assigneeNames}
          </span>
        )}
      </div>

      {/* Progress Metric Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            {lang === 'ko' ? '실제 진행률' : 'Tiến độ thực tế'}
          </span>
          <span className="font-bold text-blue-700" data-testid="agenda-card-progress-text">
            {actualProgress}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
          <div
            className={`h-full transition-all duration-300 ${
              isCompleted ? 'bg-emerald-500' : 'bg-blue-600'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, actualProgress))}%` }}
          />
        </div>
      </div>
    </div>
  );
};
